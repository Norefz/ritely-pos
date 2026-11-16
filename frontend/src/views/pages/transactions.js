import { state, money, date, escape } from "../../state.js";
import { receipt } from "./common.js";
import { cancelSaleRequest, salesRequest } from "../../api.js";
import { continueSalePayment } from "../../payments.js";

/* ---------- Riwayat transaksi: konfigurasi & helper ---------- */
const PAGE_SIZE = 10;
// Filter bertahan selama sesi, termasuk saat refresh() membangun ulang halaman.
const view = { q: "", status: "all", page: 1 };

const STATUS = {
  completed: { label: "Selesai", cls: "good" },
  pending: { label: "Menunggu pembayaran", cls: "warning" },
  voided: { label: "Dibatalkan", cls: "empty" },
  expired: { label: "Kedaluwarsa", cls: "empty" },
};
const FILTERS = [
  ["all", "Semua"],
  ["completed", "Selesai"],
  ["pending", "Pending"],
  ["voided", "Dibatalkan"],
  ["expired", "Kedaluwarsa"],
];

const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  receipt: svg(
    '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M10 8h4M10 12h4"/>',
  ),
  wallet: svg(
    '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3M17 14h.01"/>',
  ),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};

const isManager = () => state.role === "manager";
// Manajer melihat seluruh transaksi; Kasir hanya transaksinya sendiri.
const visible = () =>
  [...state.sales]
    .filter((s) => isManager() || s.cashier_id === state.currentUser?.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
const statusOf = (s) => STATUS[s.status] || { label: s.status, cls: "" };
const columns = () => (isManager() ? 8 : 7);

function filtered(all) {
  const q = view.q.trim().toLowerCase();
  return all.filter(
    (s) =>
      (view.status === "all" || s.status === view.status) &&
      (!q ||
        (s.id + " " + s.items.map((i) => i.name).join(" "))
          .toLowerCase()
          .includes(q)),
  );
}
function pageItems(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur - 1, cur, cur + 1]);
  if (cur <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (cur >= total - 2)
    [total - 3, total - 2, total - 1].forEach((n) => set.add(n));
  const nums = [...set]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/* ---------- Potongan HTML ---------- */
function chipsHtml(all) {
  return FILTERS.map(([value, label]) => {
    const count =
      value === "all"
        ? all.length
        : all.filter((s) => s.status === value).length;
    return `<button type="button" class="pd-chip${view.status === value ? " on" : ""}" data-act="status" data-value="${value}" aria-pressed="${view.status === value}">${value === "pending" ? '<span class="pd-dot"></span>' : ""}${label} <i>${count}</i></button>`;
  }).join("");
}
function rowHtml(s) {
  const first = s.items[0];
  const more = s.items.length - 1;
  const st = statusOf(s);
  const online = s.payment_method !== "cash";
  const pending = s.status === "pending";
  return `<tr class="tx-row" data-id="${escape(String(s.id))}">
    <td><div class="tx-code"><i class="tx-ico">${icons.receipt}</i><b>${escape(s.id)}</b></div></td>
    <td>${escape(date(s.created_at))}</td>
    ${isManager() ? `<td>${escape(s.cashier)}</td>` : ""}
    <td class="tx-item">${first ? `${escape(first.name)} ×${first.quantity}` : "—"}${more > 0 ? `<small>+${more} lainnya</small>` : ""}</td>
    <td><span class="tx-method${online ? " online" : ""}">${icons.wallet}${online ? "Online" : "Tunai"}</span></td>
    <td class="pd-r tx-total">${money(s.total)}</td>
    <td><span class="stock-tag ${st.cls}">${escape(st.label)}</span></td>
    <td class="pd-act">${pending && online ? `<div class="tx-actions"><button type="button" class="pd-edit" data-act="continue" data-id="${escape(String(s.sale_id))}" aria-label="Lanjutkan pembayaran ${escape(s.id)}">Lanjutkan pembayaran</button><button type="button" class="pd-edit tx-cancel" data-act="cancel" data-id="${escape(String(s.sale_id))}" aria-label="Batalkan pesanan ${escape(s.id)}">Batalkan pesanan</button></div>` : `<button type="button" class="pd-edit" data-act="open" data-id="${escape(String(s.id))}" aria-label="Lihat struk ${escape(s.id)}">${icons.receipt}Lihat struk</button>`}</td>
  </tr>`;
}
function listHtml(rows, hasAny) {
  if (rows.length) return rows.map(rowHtml).join("");
  return hasAny
    ? `<tr><td colspan="${columns()}" class="pd-empty">Tidak ada transaksi yang cocok dengan pencarian atau filter ini.</td></tr>`
    : `<tr><td colspan="${columns()}" class="tx-empty"><i>${icons.receipt}</i><b>Belum ada transaksi</b><p>Selesaikan penjualan di menu Kasir. Setiap transaksi yang berhasil akan muncul di sini beserta strukturnya.</p></td></tr>`;
}
function footHtml(total, pages, from, to) {
  const text = total
    ? `Menampilkan ${from}–${to} dari ${total} transaksi`
    : "Menampilkan 0 transaksi";
  if (pages < 2) return `<span>${text}</span>`;
  const btn = (label, inner, page, disabled, on) =>
    `<button type="button" class="pd-pg${on ? " on" : ""}" data-act="page" data-page="${page}" aria-label="${label}"${on ? ' aria-current="page"' : ""}${disabled ? " disabled" : ""}>${inner}</button>`;
  const nums = pageItems(view.page, pages)
    .map((n) =>
      n === "…"
        ? '<span class="pd-gap">…</span>'
        : btn(`Halaman ${n}`, n, n, false, n === view.page),
    )
    .join("");
  return `<span>${text}</span>
    <nav class="pd-pager" aria-label="Halaman riwayat transaksi">
      ${btn("Halaman sebelumnya", icons.prev, view.page - 1, view.page === 1)}
      ${nums}
      ${btn("Halaman berikutnya", icons.next, view.page + 1, view.page === pages)}
    </nav>`;
}

function shell() {
  return `
    <div class="pd-head">
      <div><h1>Riwayat transaksi</h1><p>Transaksi tersimpan di database. Pembayaran online baru selesai setelah status Midtrans terverifikasi.</p></div>
      <span class="pd-pill"><span class="pd-pill-dot tx-dot"></span>${isManager() ? "Semua transaksi" : "Hanya transaksi saya"}</span>
    </div>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari nomor struk atau produk" value="${escape(view.q)}" aria-label="Cari transaksi" autocomplete="off" /></label>
      <div class="pd-chips" data-part="chips" role="group" aria-label="Filter status transaksi"></div>
    </section>
    <section class="pd-card">
      <div class="pd-scroll">
        <table class="pd-table tx-table">
          <thead><tr>
            <th class="tx-c-code">Nomor struk</th><th class="tx-c-time">Waktu (WIB)</th>
            ${isManager() ? '<th class="tx-c-cashier">Kasir</th>' : ""}
            <th>Item</th><th class="tx-c-method">Metode</th><th class="tx-c-total pd-r">Total</th>
            <th class="tx-c-status">Status</th><th class="tx-c-act"><span class="pd-sr">Aksi</span></th>
          </tr></thead>
          <tbody data-part="list"></tbody>
        </table>
      </div>
      <div class="pd-foot" data-part="foot"></div>
    </section>
    <p class="pd-note">${icons.info}Klik baris mana saja untuk membuka struk.</p>`;
}

// Mengisi ulang bagian yang berubah tanpa merender ulang kolom pencarian (fokus tetap).
function paint(root) {
  const all = visible();
  const rows = filtered(all);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), pages);
  const start = (view.page - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const set = (part, html) => {
    const el = root.querySelector(`[data-part="${part}"]`);
    if (el) el.innerHTML = html;
  };
  set("chips", chipsHtml(all));
  set("list", listHtml(slice, all.length > 0));
  set("foot", footHtml(rows.length, pages, start + 1, start + slice.length));
}

function bind(root, refresh) {
  if (root._txBound) return;
  root._txBound = true;
  root.addEventListener("click", (e) => {
    const page = e.target.closest('[data-act="page"], [data-act="status"]');
    if (page && !page.disabled) {
      if (page.dataset.act === "status") {
        view.status = page.dataset.value;
        view.page = 1;
      } else view.page = +page.dataset.page;
      paint(root);
      return;
    }
    const continueButton = e.target.closest('[data-act="continue"]');
    if (continueButton) {
      const sale = state.sales.find((item) => item.sale_id === continueButton.dataset.id);
      if (sale) void continueSalePayment(sale, refresh);
      return;
    }
    const cancelButton = e.target.closest('[data-act="cancel"]');
    if (cancelButton) {
      const sale = state.sales.find((item) => item.sale_id === cancelButton.dataset.id);
      if (!sale) return;
      void webix.confirm("Batalkan pesanan ini? Sesi pembayaran Midtrans juga akan dibatalkan.")
        .then(async () => {
          cancelButton.disabled = true;
          try {
            const result = await cancelSaleRequest(sale.sale_id);
            const index = state.sales.findIndex((item) => item.sale_id === result.sale.sale_id);
            if (index >= 0) state.sales[index] = result.sale;
            refresh();
            if (result.cancelled) {
              webix.message("Pesanan berhasil dibatalkan.");
            } else if (result.sale.status === "completed") {
              webix.message({ type: "error", text: "Pembayaran sudah berhasil, pesanan tidak dapat dibatalkan." });
            } else {
              webix.message({ type: "error", text: "Pesanan belum dapat dibatalkan. Status pembayaran diperbarui." });
            }
          } catch (error) {
            cancelButton.disabled = false;
            webix.message({ type: "error", text: error?.message || "Pesanan gagal dibatalkan. Coba lagi." });
          }
        })
        .catch(() => {});
      return;
    }
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const sale = state.sales.find((s) => String(s.id) === row.dataset.id);
    if (sale) receipt(sale);
  });
  root.addEventListener("input", (e) => {
    if (!e.target.matches(".pd-search input")) return;
    view.q = e.target.value;
    view.page = 1;
    paint(root);
  });
}

export function transactions(refresh = () => {}) {
  let statusSyncTimer = null;
  let statusSyncBusy = false;
  let destroyed = false;

  const syncSalesSnapshot = async (root) => {
    if (statusSyncBusy || destroyed) return;
    statusSyncBusy = true;
    try {
      const previous = new Map(state.sales.map((sale) => [sale.sale_id, `${sale.status}:${sale.payment_status}`]));
      const response = await salesRequest();
      if (destroyed) return;
      state.sales = response.sales;
      const changed = previous.size !== response.sales.length
        || response.sales.some((sale) => previous.get(sale.sale_id) !== `${sale.status}:${sale.payment_status}`);
      if (changed && !destroyed) {
        paint(root);
        refresh();
      }
    } catch {
      // Keep the stored rows visible and retry on the next refresh interval.
    } finally {
      statusSyncBusy = false;
    }
  };

  return {
    view: "template",
    css: "product-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        destroyed = false;
        if (statusSyncTimer) clearInterval(statusSyncTimer);
        paint(this.$view);
        bind(this.$view, refresh);
        void syncSalesSnapshot(this.$view);
        statusSyncTimer = setInterval(() => void syncSalesSnapshot(this.$view), 15000);
      },
      onDestruct() {
        destroyed = true;
        if (statusSyncTimer) clearInterval(statusSyncTimer);
      },
    },
  };
}
