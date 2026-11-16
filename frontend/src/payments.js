import {
  continuePaymentRequest,
  paymentConfigRequest,
  refreshPaymentStatusRequest,
} from "./api.js";
import { state } from "./state.js";

let paymentConfig;
let snapPromise;
const paymentWatchers = new Map();

export async function loadPaymentConfig() {
  try {
    const response = await paymentConfigRequest();
    paymentConfig = response.payment;
    state.paymentOnlineEnabled = Boolean(paymentConfig.enabled);
    if (paymentConfig.enabled) void loadSnap().catch(() => {});
  } catch {
    paymentConfig = { enabled: false, client_key: "", script_url: "" };
    state.paymentOnlineEnabled = false;
  }
  return paymentConfig;
}

export function onlinePaymentsEnabled() {
  return Boolean(paymentConfig?.enabled && paymentConfig?.client_key);
}

function loadSnap() {
  if (window.snap) return Promise.resolve(window.snap);
  if (snapPromise) return snapPromise;
  if (!onlinePaymentsEnabled()) return Promise.reject(new Error("payment_unavailable"));
  snapPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const url = new URL(paymentConfig.script_url);
    url.searchParams.set("client_key", paymentConfig.client_key);
    script.src = url.toString();
    script.async = true;
    script.onload = () => window.snap ? resolve(window.snap) : reject(new Error("snap_unavailable"));
    script.onerror = () => reject(new Error("snap_unavailable"));
    document.head.appendChild(script);
  }).catch((error) => {
    snapPromise = null;
    throw error;
  });
  return snapPromise;
}

function mergeSale(updated) {
  const index = state.sales.findIndex((sale) => sale.sale_id === updated.sale_id);
  if (index < 0) state.sales.unshift(updated);
  else state.sales[index] = updated;
  return state.sales.find((sale) => sale.sale_id === updated.sale_id);
}

async function checkStatus(sale, refresh) {
  try {
    const response = await refreshPaymentStatusRequest(sale.sale_id);
    const previous = state.sales.find((row) => row.sale_id === response.sale.sale_id);
    const saved = mergeSale(response.sale);
    const changed = !previous
      || previous.status !== saved.status
      || previous.payment_status !== saved.payment_status
      || previous.payment_reference !== saved.payment_reference;
    if (saved.status === "completed" && !saved._stockApplied) {
      for (const item of saved.items) {
        const product = state.products.find((row) => String(row.id) === String(item.product_id));
        if (product) product.stock = Math.max(0, product.stock - item.quantity);
      }
      saved._stockApplied = true;
    }
    if (changed) refresh?.();
    return saved;
  } catch {
    return sale;
  }
}

function isPaymentFinal(sale) {
  return sale.status === "completed"
    || sale.status === "voided"
    || sale.status === "expired"
    || sale.payment_status === "paid"
    || sale.payment_status === "failed"
    || sale.payment_status === "expired";
}

function watchPaymentStatus(sale, refresh) {
  if (paymentWatchers.has(sale.sale_id)) return;
  const expiresAt = Date.parse(sale.payment_expired_at || "") || Date.now() + 15 * 60 * 1000;
  const startedAt = Date.now();
  const watcher = (async () => {
    let current = sale;
    while (!isPaymentFinal(current) && Date.now() < expiresAt) {
      const elapsed = Date.now() - startedAt;
      const delay = elapsed < 15_000 ? 1_000 : elapsed < 60_000 ? 5_000 : 15_000;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      current = await checkStatus(current, refresh);
      if (current.status === "completed") {
        webix.message("Pembayaran terverifikasi dan transaksi selesai.");
      } else if (current.payment_status === "paid") {
        webix.message({ type: "error", text: "Pembayaran diterima, tetapi transaksi perlu pemeriksaan manager." });
      } else if (current.payment_status === "failed" || current.status === "voided") {
        webix.message({ type: "error", text: "Pembayaran gagal. Transaksi tidak diselesaikan." });
      } else if (current.payment_status === "expired" || current.status === "expired") {
        webix.message({ type: "error", text: "Waktu pembayaran habis. Transaksi tidak diselesaikan." });
      }
    }
  })().finally(() => paymentWatchers.delete(sale.sale_id));
  paymentWatchers.set(sale.sale_id, watcher);
}

export async function openSnapPayment(sale, token, refresh) {
  try {
    const snap = await loadSnap();
    return await new Promise((resolve) => {
      let finished = false;
      const settle = async (message) => {
        if (finished) return;
        finished = true;
        const updated = await checkStatus(sale, refresh);
        if (!isPaymentFinal(updated)) watchPaymentStatus(updated, refresh);
        if (message) webix.message(message(updated));
        resolve(updated);
      };
      snap.pay(token, {
        onSuccess: () => settle((updated) => updated.status === "completed"
          ? "Pembayaran terverifikasi dan transaksi selesai."
          : "Pembayaran diterima Midtrans dan sedang diverifikasi backend."),
        onPending: () => settle(() => "Pembayaran masih menunggu. Status akan diperbarui setelah webhook mengonfirmasi backend."),
        onError: () => settle((updated) => updated.status === "completed"
          ? "Pembayaran terverifikasi dan transaksi selesai."
          : "Pembayaran belum terkonfirmasi. Status transaksi akan diperbarui dari backend."),
        onClose: () => settle((updated) => updated.status === "completed"
          ? "Pembayaran terverifikasi dan transaksi selesai."
          : "Halaman pembayaran ditutup. Transaksi tetap menunggu konfirmasi webhook dari backend."),
      });
    });
  } catch {
    webix.message({ type: "error", text: "Halaman Midtrans Sandbox gagal dibuka. Coba lanjutkan pembayaran dari Riwayat transaksi." });
    return sale;
  }
}

export async function continueSalePayment(sale, refresh) {
  try {
    let saved = await checkStatus(sale, refresh);
    if (saved.status !== "pending" || saved.payment_status === "paid") return saved;
    const result = await continuePaymentRequest(saved.sale_id);
    saved = mergeSale(result.sale);
    if (result.snap_token) return openSnapPayment(saved, result.snap_token, refresh);
    return checkStatus(saved, refresh);
  } catch (error) {
    const message = error?.code === "payment_status_unknown"
      ? "Status pembayaran belum diketahui. Coba periksa kembali beberapa saat lagi."
      : error?.code === "payment_unavailable"
        ? "Pembayaran online belum dikonfigurasi pada backend."
        : "Sesi pembayaran belum dapat dilanjutkan. Periksa koneksi lalu coba lagi.";
    webix.message({ type: "error", text: message });
    return null;
  }
}
