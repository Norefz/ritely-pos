import { state, money, total, uid, escape } from "../../demo.js";
import { receipt } from "./common.js";
import { ApiError, openShiftRequest } from "../../api.js";

const productImages = {
  "Air mineral 600 ml":
    "https://www.spiresmarket.com/cdn/shop/files/bc2482ea-0b41-49ed-b9e4-7826543c328f_c46380db-a575-422e-85ce-689c25c9327e.jpg?v=1736449123",
  "Teh melati 350 ml":
    "https://www.nongfuspring.com.my/cdn/shop/files/imgi_3_3d2cf06d020d4383b369f41a43cb23e5.png?format=webp&v=1775638029&width=600",
  "Susu UHT cokelat 250 ml":
    "https://cdnprod.mafretailproxy.com/sys-master-root/hf6/h1d/12463115927582/43287_Main.jpg_480Wx480H",
  "Roti gandum":
    "https://kibsecomimgstore.blob.core.windows.net/products/detail/HPL_SDBWHAEPD350LF_20250828171420.jpg",
  "Biskuit kelapa 300 g":
    "https://kuwait.grandhyper.com/image/cache/catalog/products/1/101060026235-1000x1000.jpg",
  "Mi instan goreng":
    "https://down-id.img.susercontent.com/file/1d4a20c87717dada5aec5749911f50a5",
  "Tisu wajah 200 lembar":
    "https://images.cdn.retail.brookshires.com/detail/00011225136566_C1C1.jpeg",
  "Sabun cuci piring 750 ml":
    "https://4.bp.blogspot.com/-jsdWrh0qoY4/UMHl4BlLfkI/AAAAAAAACcw/VoJfCV_wXWc/s1600/12158liquid_soap.jpg",
};

/* ---------- Kasir (POS): konfigurasi & helper ---------- */
// Filter dan nominal tunai bertahan saat refresh() membangun ulang halaman.
const view = { q: "", category: "all", cash: "" };
const TONES = ["", "orange", "purple", "green"]; // warna avatar per urutan kategori

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

function initials(name) {
  const w = name.trim().split(/\s+/);
  return (
    w.length > 1 ? w[0][0] + w[1][0] : name.trim().slice(0, 2)
  ).toUpperCase();
}
function tone(p) {
  const i = state.categories.findIndex((c) => c.id === p.category);
  return TONES[(i < 0 ? 0 : i) % TONES.length];
}
function stockTag(p) {
  if (p.stock <= 0) return '<span class="stock-tag empty">Habis</span>';
  return isLow(p)
    ? `<span class="stock-tag warning">Sisa ${p.stock}</span>`
    : `<span class="stock-tag good">Stok ${p.stock}</span>`;
}

/* ---------- Potongan HTML ---------- */
function cardHtml(p) {
  const img = productImages[p.name];
  const label = escape(p.name);
  return `<button type="button" class="ps-card${p.stock <= 0 ? " out" : ""}" data-act="add" data-id="${escape(String(p.id))}" data-cat="${escape(String(p.category))}" data-search="${escape((p.name + " " + p.sku).toLowerCase())}" aria-label="Tambah ${label} ke keranjang">
    <span class="ps-art ${tone(p)}"><b>${escape(initials(p.name))}</b>${img ? `<img src="${escape(img)}" alt="" loading="lazy" onload="this.classList.add('on')" onerror="this.remove()">` : ""}</span>
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
  const open = !!currentShift();
  const otherShift = !!state.shift && !open;
  const since = open
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(state.shift.opened_at))
    : "";
  return `
    <div class="ps-wrap">
      <div class="ps-top">
        <label class="pd-search">${icons.search}<input type="search" placeholder="Cari produk atau scan barcode" value="${escape(view.q)}" aria-label="Cari produk" autocomplete="off" /></label>
        <span class="ps-shift${open ? " on" : ""}"><span></span>${open ? `${escape(state.shift.assigned_shift.replace("_", " "))} · terbuka sejak ${since} WIB` : otherShift ? `Shift ${escape(state.shift.cashier)} sedang berjalan` : "Shift belum dibuka"}</span>
        ${open || otherShift ? "" : `<button type="button" class="sh-btn primary" data-act="open">${icons.play}Buka shift</button>`}
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
              <button type="button" class="ps-method on" aria-pressed="true">Tunai</button>
              <button type="button" class="ps-method" disabled title="Belum tersedia">Online (Midtrans)</button>
            </div>
            <label class="ps-cash"><span>Uang diterima</span><input type="number" inputmode="numeric" min="0" placeholder="Nominal diterima" value="${escape(view.cash)}" /></label>
            <div class="ps-change" data-part="change" aria-live="polite"></div>
            <button type="button" class="ps-pay" data-act="pay"></button>
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
  const pay = root.querySelector('[data-act="pay"]');
  if (pay) {
    pay.textContent = `Bayar ${money(total())}`;
    pay.classList.toggle("idle", !currentShift() || !state.cart.length);
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
    } else actions[el.dataset.act]?.(root, el.dataset.id);
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches(".pd-search input")) {
      view.q = e.target.value;
      applyFilter(root);
    } else if (e.target.matches(".ps-cash input")) {
      view.cash = e.target.value;
      paintChange(root);
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
  function pay(root) {
    const cash = +(root.querySelector(".ps-cash input")?.value ?? 0);
    if (
      !currentShift() ||
      !state.cart.length ||
      !Number.isFinite(cash) ||
      cash < total()
    ) {
      webix.message({
        type: "error",
        text: "Pastikan shift aktif, keranjang terisi, dan tunai mencukupi.",
      });
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
    webix
      .confirm(
        "Selesaikan penjualan simulasi ini? Tidak ada pembayaran sungguhan.",
      )
      .then(() => {
        const sale = {
          id: "DEMO-" + uid().slice(0, 8),
          created_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
          shift_id: currentShift().id,
          cashier: state.currentUser?.name || "Kasir",
          payment_method: "cash",
          items: state.cart.map((i) => ({ ...i })),
          total: total(),
          cash,
          status: "completed",
          payment_status: "paid",
        };
        sale.items.forEach(
          (i) =>
            (state.products.find((p) => p.id === i.id).stock -= i.quantity),
        );
        state.sales.push(sale);
        state.cart = [];
        view.cash = "";
        refresh();
        receipt(sale);
      })
      .catch(() => {});
  }
  const actions = {
    add,
    inc: (root, id) => quantity(root, id, 1),
    dec: (root, id) => quantity(root, id, -1),
    open: openShift,
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
      },
    },
  };
}
