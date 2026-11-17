import { state, money, total, uid, escape } from "../../state.js";
import { receipt } from "./common.js";
import { ApiError, apiAssetUrl, createSaleRequest, openShiftRequest } from "../../api.js";
import { loadPaymentConfig, onlinePaymentsEnabled, openSnapPayment } from "../../payments.js";
import { canCloseShift, canOpenShift, shiftWindow } from "../../shift-time.js";
import { productImageStyle } from "../product-images.js";

/* ---------- Kasir (POS): konfigurasi & helper ---------- */
// Filter dan nominal tunai bertahan saat refresh() membangun ulang halaman.
const view = { q: "", category: "all", cash: "", paymentMethod: "cash", submitting: false, confirming: false };
let scheduleTimer = null;
const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  play: svg('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>'),
};

// Aturan "sisa sedikit" POS: stok sama dengan atau di bawah batas minimum.
const isLow = (p) => p.stock <= p.minimum;
const activeProducts = () => state.products.filter((p) => p.active);
const findProduct = (id) => state.products.find((p) => String(p.id) === id);
const inCart = (id) =>
  state.cart.find((i) => String(i.id) === id)?.quantity || 0;
const currentShift = () =>
  state.shift?.cashier_id === state.currentUser?.id ? state.shift : null;
const shiftType = (shift) => shift?.shift_type || shift?.assigned_shift;
const scheduleAvailability = () => {
  const shift = currentShift();
  return `${shift?.id || ""}:${shift ? canCloseShift(shiftType(shift)) : false}:${!state.shift && canOpenShift(state.currentUser?.assigned_shift)}`;
};

function stockTag(p) {
  if (p.stock <= 0) return '<span class="stock-tag empty">Habis</span>';
  return isLow(p)
    ? `<span class="stock-tag warning">Sisa ${p.stock}</span>`
    : `<span class="stock-tag good">Stok ${p.stock}</span>`;
}

/* ---------- Potongan HTML ---------- */
function cardHtml(p) {
  const label = escape(p.name);
  const imageStyle = p.imageUrl ? "" : productImageStyle(p.sku);
  const image = p.imageUrl
    ? `<img src="${escape(apiAssetUrl(p.imageUrl))}" alt="" loading="lazy" onload="this.parentElement.classList.add('has-image')" onerror="this.remove()">`
    : "";
  return `<button type="button" class="ps-card${p.stock <= 0 ? " out" : ""}" data-act="add" data-id="${escape(String(p.id))}" data-cat="${escape(String(p.category))}" data-search="${escape((p.name + " " + p.sku).toLowerCase())}" aria-label="Tambah ${label} ke keranjang">
    <span class="ps-photo${imageStyle ? " ps-generated-photo" : ""}"${imageStyle ? ` style="${imageStyle}"` : ""} aria-hidden="true">${image}</span>
    <strong>${label}</strong>
    <span class="ps-price">${money(p.price)}</span>
    ${stockTag(p)}
    <i class="ps-badge" data-badge hidden></i>
  </button>`;
}
function chipsHtml() {
  const list = activeProducts();
  const chip = (value, name, count) =>
    `<button type="button" class="pd-chip${view.category === value ? " on" : ""}" data-act="cat" data-value="${escape(value)}" aria-pressed="${view.category === value}">${escape(name)} <i>${count}</i></button>`;
  return (
    chip("all", "Semua", list.length) +
    state.categories
      .map((c) =>
        chip(
          String(c.id),
          c.name,
          list.filter((p) => p.category === c.id).length,
        ),
      )
      .join("")
  );
}
function linesHtml() {
  if (!state.cart.length)
    return '<div class="cart-empty">Pilih produk untuk mulai<br>mengisi keranjang.</div>';
  return state.cart
    .map((item) => {
      const id = escape(String(item.id));
      const name = escape(item.name);
      return `<div class="cart-line">
        <div class="cart-product"><strong>${name}</strong><span>${money(item.price)}</span></div>
        <div class="quantity-control">
          <button type="button" data-act="dec" data-id="${id}" aria-label="Kurangi ${name}">−</button>
          <b>${item.quantity}</b>
          <button type="button" data-act="inc" data-id="${id}" aria-label="Tambah ${name}">+</button>
        </div>
        <strong class="line-price">${money(item.price * item.quantity)}</strong>
      </div>`;
    })
    .join("");
}
const sumHtml = () =>
  `<div><span>Subtotal</span><span>${money(total())}</span></div><div><strong>Total</strong><strong>${money(total())}</strong></div>`;

function shell() {
  if (
    view.category !== "all" &&
    !state.categories.some((c) => String(c.id) === view.category)
  )
    view.category = "all";
  const openShift = currentShift();
  const open = !!openShift;
  const otherShift = !!state.shift && !open;
  const shiftEnded = open && canCloseShift(shiftType(openShift));
  const assignedShift = state.currentUser?.assigned_shift;
  const openAllowed = !state.shift && canOpenShift(assignedShift);
  const assignedWindow = shiftWindow(assignedShift);
  const since = open
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(openShift.opened_at))
    : "";
  return `
    <div class="ps-wrap">
      <div class="ps-top">
        <label class="pd-search">${icons.search}<input type="search" placeholder="Cari produk" value="${escape(view.q)}" aria-label="Cari produk" autocomplete="off" /></label>
        <span class="ps-shift${open && !shiftEnded ? " on" : ""}"><span></span>${open ? `${escape(shiftType(openShift).replace("_", " "))} · ${shiftEnded ? "waktu shift berakhir" : `terbuka sejak ${since} WIB`}` : otherShift ? `Shift ${escape(state.shift.cashier)} masih terbuka` : openAllowed ? "Shift belum dibuka" : `Jadwal ${assignedWindow?.label || "—"} WIB`}</span>
        ${shiftEnded ? `<button type="button" class="sh-btn primary" data-act="manage-shift">Tutup shift</button>` : open || otherShift || !openAllowed ? "" : `<button type="button" class="sh-btn primary" data-act="open">${icons.play}Buka shift</button>`}
      </div>
      <div class="ps-main">
        <section class="ps-catalog">
          <div class="pd-chips ps-chips" data-part="chips" role="group" aria-label="Filter kategori">${chipsHtml()}</div>
          <div class="ps-grid" data-part="grid">${activeProducts().map(cardHtml).join("")}</div>
          <div class="ps-none" data-part="none" hidden>Tidak ada produk yang cocok.</div>
        </section>
        <aside class="ps-cart" aria-label="Keranjang">
          <div class="ps-cart-head"><h2>Keranjang</h2><span class="item-count" data-part="count"></span></div>
          <div class="ps-lines" data-part="lines"></div>
          <div class="ps-foot">
            <div class="ps-sum" data-part="sum"></div>
            <div class="ps-label">Metode pembayaran</div>
            <div class="ps-methods">
              <button type="button" class="ps-method${view.paymentMethod === "cash" ? " on" : ""}" data-act="method" data-value="cash" aria-pressed="${view.paymentMethod === "cash"}">Tunai</button>
              <button type="button" class="ps-method${view.paymentMethod === "online" ? " on" : ""}" data-act="method" data-value="online" aria-pressed="${view.paymentMethod === "online"}"${onlinePaymentsEnabled() ? "" : ' disabled title="Midtrans Sandbox belum dikonfigurasi di backend"'}>Online (Midtrans Sandbox)</button>
            </div>
            <label class="ps-cash"${view.paymentMethod === "online" ? " hidden" : ""}><span>Uang diterima</span><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" placeholder="Nominal diterima" value="${escape(view.cash)}" /></label>
            <div class="ps-change" data-part="change" aria-live="polite"${view.paymentMethod === "online" ? " hidden" : ""}></div>
            <p class="ps-online-note"${view.paymentMethod === "cash" ? " hidden" : ""}>Metode pembayaran tersedia mengikuti pengaturan Midtrans Sandbox.</p>
            <button type="button" class="ps-pay" data-act="pay"${view.submitting || view.confirming ? " disabled" : ""}>${view.submitting ? "Menghubungkan…" : view.confirming ? "Menunggu konfirmasi…" : view.paymentMethod === "online" ? `Bayar online ${money(total())}` : `Bayar ${money(total())}`}</button>
          </div>
        </aside>
      </div>
    </div>`;
}

// Semua pembaruan lokal: kolom pencarian dan kartu produk tidak dirender ulang
// (fokus tetap, gambar tidak dimuat ulang).
function paintChange(root) {
  const el = root.querySelector('[data-part="change"]');
  const input = root.querySelector(".ps-cash input");
  if (view.paymentMethod !== "cash") return;
  if (!el || !input) return;
  if (input.value === "") {
    el.className = "ps-change";
    el.textContent = "Kembalian akan terlihat di sini.";
    return;
  }
  const cash = +input.value;
  if (cash >= total()) {
    el.className = "ps-change ok";
    el.innerHTML = `Kembalian <strong>${money(cash - total())}</strong>`;
  } else {
    el.className = "ps-change warn";
    el.textContent = "Masukkan nominal yang cukup.";
  }
}
function paint(root) {
  const set = (part, html) => {
    const el = root.querySelector(`[data-part="${part}"]`);
    if (el) el.innerHTML = html;
  };
  set("lines", linesHtml());
  set("count", `${state.cart.reduce((n, i) => n + i.quantity, 0)} item`);
  set("sum", sumHtml());
  root.querySelectorAll(".ps-method").forEach((button) => {
    const selected = button.dataset.value === view.paymentMethod;
    button.classList.toggle("on", selected);
    button.setAttribute("aria-pressed", String(selected));
    if (button.dataset.value === "online") button.disabled = !onlinePaymentsEnabled();
  });
  const cashInput = root.querySelector(".ps-cash");
  const change = root.querySelector('[data-part="change"]');
  const onlineNote = root.querySelector(".ps-online-note");
  if (cashInput) {
    cashInput.hidden = view.paymentMethod !== "cash";
    const input = cashInput.querySelector("input");
    if (input) input.disabled = view.paymentMethod !== "cash";
  }
  if (change) change.hidden = view.paymentMethod !== "cash";
  if (onlineNote) onlineNote.hidden = view.paymentMethod !== "online";
  const pay = root.querySelector('[data-act="pay"]');
  if (pay) {
    pay.textContent = view.submitting
      ? "Menghubungkan…"
      : view.confirming
        ? "Menunggu konfirmasi…"
        : view.paymentMethod === "online"
        ? `Bayar online ${money(total())}`
        : `Bayar ${money(total())}`;
    pay.disabled = view.submitting || view.confirming || !currentShift() || !state.cart.length || (view.paymentMethod === "online" && !onlinePaymentsEnabled());
    pay.classList.toggle("idle", pay.disabled);
  }
  root.querySelectorAll(".ps-card").forEach((card) => {
    const badge = card.querySelector("[data-badge]");
    const qty = inCart(card.dataset.id);
    badge.hidden = !qty;
    badge.textContent = qty;
  });
  paintChange(root);
}
function applyFilter(root) {
  const q = view.q.trim().toLowerCase();
  let shown = 0;
  root.querySelectorAll(".ps-card").forEach((card) => {
    const ok =
      (view.category === "all" || card.dataset.cat === view.category) &&
      (!q || card.dataset.search.includes(q));
    card.hidden = !ok;
    if (ok) shown++;
  });
  const none = root.querySelector('[data-part="none"]');
  if (none) none.hidden = shown > 0;
  const chips = root.querySelector('[data-part="chips"]');
  if (chips) chips.innerHTML = chipsHtml();
}

function bind(root, actions) {
  if (root._psBound) return;
  root._psBound = true;
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    if (el.dataset.act === "cat") {
      view.category = el.dataset.value;
      applyFilter(root);
    } else if (el.dataset.act === "method") {
      view.paymentMethod = el.dataset.value;
      paint(root);
    } else actions[el.dataset.act]?.(root, el.dataset.id);
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches(".pd-search input")) {
      view.q = e.target.value;
      applyFilter(root);
    } else if (e.target.matches(".ps-cash input")) {
      const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
      if (e.target.value !== digits) e.target.value = digits;
      view.cash = digits;
      paintChange(root);
    }
  });
  root.addEventListener("beforeinput", (e) => {
    if (e.target.matches(".ps-cash input") && e.data && /\D/.test(e.data)
      && e.inputType.startsWith("insert")) {
      e.preventDefault();
    }
  });
}

export function pos(refresh) {
  function add(root, id) {
    if (!currentShift()) {
      webix.message({
        type: "error",
        text: "Buka shift milik Anda melalui menu Shift saya terlebih dahulu.",
      });
      return;
    }
    const p = findProduct(id),
      item = state.cart.find((i) => String(i.id) === id);
    if (!p?.active || (item?.quantity || 0) >= p.stock) {
      webix.message({
        type: "error",
        text: "Stok tidak mencukupi atau produk sudah nonaktif.",
      });
      return;
    }
    if (item) item.quantity++;
    else state.cart.push({ ...p, quantity: 1 });
    paint(root);
  }
  function quantity(root, id, delta) {
    const item = state.cart.find((i) => String(i.id) === id),
      p = findProduct(id);
    if (!item) return;
    if (delta > 0 && item.quantity >= p.stock) {
      webix.message({ type: "error", text: "Stok tidak mencukupi." });
      return;
    }
    item.quantity += delta;
    if (item.quantity < 1)
      state.cart = state.cart.filter((i) => String(i.id) !== id);
    paint(root);
  }
  async function openShift() {
    if (!canOpenShift(state.currentUser?.assigned_shift)) {
      webix.message({ type: "error", text: "Akun ini belum memiliki jadwal shift yang valid." });
      return;
    }
    try {
      const result = await openShiftRequest();
      state.shift = result.shift;
      state.shifts.push(result.shift);
      refresh();
      webix.message("Shift berhasil dibuka.");
    } catch (error) {
      const message = error instanceof ApiError && error.code === "shift_already_open"
        ? "Kasir lain masih memiliki shift yang berjalan."
        : "Shift gagal dibuka. Periksa koneksi backend dan jadwal akun Anda.";
      webix.message({ type: "error", text: message });
    }
  }
  async function pay(root) {
    const cash = +(root.querySelector(".ps-cash input")?.value ?? 0);
    if (
      !currentShift() ||
      !state.cart.length ||
      (view.paymentMethod === "cash" && (!Number.isInteger(cash) || cash < total()))
    ) {
      webix.message({
        type: "error",
        text: view.paymentMethod === "cash"
          ? "Pastikan shift aktif, keranjang terisi, dan tunai mencukupi."
          : "Pastikan shift aktif dan keranjang terisi.",
      });
      return;
    }
    if (view.submitting) return;
    if (view.paymentMethod === "online" && !onlinePaymentsEnabled()) {
      webix.message({ type: "error", text: "Pembayaran online belum dikonfigurasi pada backend." });
      return;
    }
    if (
      state.cart.some((i) => {
        const p = state.products.find((p) => p.id === i.id);
        return !p.active || p.stock < i.quantity;
      })
    ) {
      webix.message({
        type: "error",
        text: "Produk atau stok berubah. Perbarui keranjang.",
      });
      return;
    }
    const method = view.paymentMethod;
    const proceed = async () => {
      if (!currentShift()) {
        webix.message({ type: "error", text: "Shift tidak lagi aktif. Buka shift sebelum membuat transaksi." });
        return;
      }
      view.submitting = true;
      paint(root);
      try {
        const result = await createSaleRequest({
          payment_method: method,
          shift_id: currentShift().id,
          client_request_id: uid(),
          cash_received: method === "cash" ? Math.floor(cash) : undefined,
          items: state.cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
        });
        const sale = result.sale;
        state.sales.unshift(sale);
        state.cart = [];
        view.cash = "";
        view.paymentMethod = "cash";
        refresh();
        if (method === "online") {
          if (result.snap_token) {
            view.submitting = false;
            if (!root.$destructed) paint(root);
            void openSnapPayment(sale, result.snap_token, refresh);
          }
          else webix.message({ type: "error", text: "Sesi pembayaran belum tersedia. Periksa status transaksi di Riwayat transaksi." });
        } else {
          for (const item of sale.items) {
            const product = state.products.find((row) => String(row.id) === String(item.product_id));
            if (product) product.stock = Math.max(0, product.stock - item.quantity);
          }
          receipt(sale);
        }
      } catch (error) {
        const message = error instanceof ApiError && error.code === "insufficient_stock"
          ? "Stok berubah atau tidak mencukupi. Muat ulang katalog dan periksa keranjang."
          : error instanceof ApiError && error.code === "payment_status_unknown"
            ? "Status permintaan Midtrans belum diketahui. Periksa transaksi di Riwayat sebelum mencoba lagi."
            : error instanceof ApiError && error.code === "payment_unavailable"
              ? "Midtrans Sandbox belum dikonfigurasi di backend."
              : error instanceof ApiError && error.message
                ? error.message
                : "Transaksi gagal disimpan. Periksa koneksi backend.";
        webix.message({ type: "error", text: message });
      } finally {
        view.submitting = false;
        if (!root.$destructed) paint(root);
      }
    };
    if (method === "cash") {
      view.confirming = true;
      paint(root);
      webix.confirm("Selesaikan transaksi tunai ini?")
        .then(() => {
          view.confirming = false;
          return proceed();
        })
        .catch(() => {
          view.confirming = false;
          if (!root.$destructed) paint(root);
        });
    } else {
      void proceed();
    }
  }
  const actions = {
    add,
    inc: (root, id) => quantity(root, id, 1),
    dec: (root, id) => quantity(root, id, -1),
    open: openShift,
    "manage-shift": () => { location.hash = "shifts"; },
    pay,
  };
  return {
    view: "template",
    css: "product-page pos-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        const root = this.$view;
        applyFilter(root);
        paint(root);
        bind(root, actions);
        void loadPaymentConfig().then(() => {
          if (!root.$destructed) paint(root);
        });
        if (scheduleTimer) clearInterval(scheduleTimer);
        let previous = scheduleAvailability();
        scheduleTimer = setInterval(() => {
          const current = scheduleAvailability();
          if (current !== previous) {
            previous = current;
            refresh();
          }
        }, 15000);
      },
      onDestruct() {
        if (scheduleTimer) clearInterval(scheduleTimer);
        scheduleTimer = null;
      },
    },
  };
}
