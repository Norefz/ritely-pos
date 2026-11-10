import { state, money, total, uid, categoryName } from "../../demo.js";
import { heading, editor, receipt, button } from "./common.js";
const colors = ["blue", "orange", "green", "purple"];
const productImages = {
  "Air mineral 600 ml": "https://www.spiresmarket.com/cdn/shop/files/bc2482ea-0b41-49ed-b9e4-7826543c328f_c46380db-a575-422e-85ce-689c25c9327e.jpg?v=1736449123",
  "Teh melati 350 ml": "https://www.nongfuspring.com.my/cdn/shop/files/imgi_3_3d2cf06d020d4383b369f41a43cb23e5.png?format=webp&v=1775638029&width=600",
  "Susu UHT cokelat 250 ml": "https://cdnprod.mafretailproxy.com/sys-master-root/hf6/h1d/12463115927582/43287_Main.jpg_480Wx480H",
  "Roti gandum": "https://kibsecomimgstore.blob.core.windows.net/products/detail/HPL_SDBWHAEPD350LF_20250828171420.jpg",
  "Biskuit kelapa 300 g": "https://kuwait.grandhyper.com/image/cache/catalog/products/1/101060026235-1000x1000.jpg",
  "Mi instan goreng": "https://down-id.img.susercontent.com/file/1d4a20c87717dada5aec5749911f50a5",
  "Tisu wajah 200 lembar": "https://images.cdn.retail.brookshires.com/detail/00011225136566_C1C1.jpeg",
  "Sabun cuci piring 750 ml": "https://4.bp.blogspot.com/-jsdWrh0qoY4/UMHl4BlLfkI/AAAAAAAACcw/VoJfCV_wXWc/s1600/12158liquid_soap.jpg",
};
export function pos(refresh) {
  function add(id) {
    if (!state.shift) {
      webix.message({
        type: "error",
        text: "Buka shift demo melalui menu Shift saya terlebih dahulu.",
      });
      return;
    }
    const p = state.products.find((p) => p.id === id),
      item = state.cart.find((i) => i.id === id);
    if (!p?.active || (item?.quantity || 0) >= p.stock) {
      webix.message({
        type: "error",
        text: "Stok tidak mencukupi atau produk sudah nonaktif.",
      });
      return;
    }
    if (item) item.quantity++;
    else state.cart.push({ ...p, quantity: 1 });
    refresh();
  }
  function quantity(id, delta) {
    const item = state.cart.find((i) => i.id === id),
      p = state.products.find((p) => p.id === id);
    if (!item) return;
    if (delta > 0 && item.quantity >= p.stock) {
      webix.message({ type: "error", text: "Stok tidak mencukupi." });
      return;
    }
    item.quantity += delta;
    if (item.quantity < 1) state.cart = state.cart.filter((i) => i.id !== id);
    refresh();
  }
  function pay() {
    const cash = +$$("cash").getValue();
    if (
      !state.shift ||
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
          shift_id: state.shift.id,
          cashier: "Dina Pratiwi",
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
        refresh();
        receipt(sale);
      })
      .catch(() => {});
  }
  const active = state.products.filter((p) => p.active),
    categories = [{ id: "all", name: "Semua" }, ...state.categories],
    selected = { value: "all", search: "" };
  function setFilter(cat) {
    selected.value = cat;
    $$("productCards").filter(
      (p) =>
        (cat === "all" || p.category === cat) &&
        `${p.name} ${p.sku}`.toLowerCase().includes(selected.search),
    );
  }
  const cardTemplate = (p) =>
    `<div class="product-card"><div class="product-art ${colors[Number(p.id.slice(-1)) % 4]}"><span>${p.name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()}</span>${productImages[p.name] ? `<img src="${productImages[p.name]}" alt="${p.name}" loading="lazy" onerror="this.remove()">` : ""}</div><strong>${p.name}</strong><b>${money(p.price)}</b><span class="stock-tag ${p.stock <= p.minimum ? "warning" : "good"}">${p.stock <= p.minimum ? "Sisa " + p.stock : "Stok " + p.stock}</span></div>`;
  const cartRows = () =>
    state.cart.length
      ? state.cart
          .map(
            (item) =>
              `<div class="cart-line" data-product="${item.id}"><div class="cart-product"><strong>${item.name}</strong><span>${money(item.price)}</span></div><div class="quantity-control"><button class="qty-minus" aria-label="Kurangi">−</button><b>${item.quantity}</b><button class="qty-plus" aria-label="Tambah">+</button></div><strong class="line-price">${money(item.price * item.quantity)}</strong></div>`,
          )
          .join("")
      : '<div class="cart-empty">Pilih produk untuk mulai<br>mengisi keranjang.</div>';
  const basket = {
    view: "template",
    css: "cart-lines",
    height: state.cart.length
      ? Math.min(250, Math.max(92, state.cart.length * 76))
      : 112,
    template: cartRows,
    onClick: {
      "qty-minus": (e) =>
        quantity(e.target.closest("[data-product]").dataset.product, -1),
      "qty-plus": (e) =>
        quantity(e.target.closest("[data-product]").dataset.product, 1),
    },
  };
  return {
    rows: [
      {
        cols: [
          {
            view: "text",
            id: "searchProducts",
            css: "pos-search",
            placeholder: "⌕  Cari produk atau scan barcode",
            on: {
              onTimedKeyPress() {
                selected.search = this.getValue().toLowerCase();
                setFilter(selected.value);
              },
            },
          },
          {
            view: "template",
            width: 300,
            css: state.shift ? "shift-pill active" : "shift-pill",
            template: state.shift
              ? `<span></span>Shift 1 · terbuka sejak ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(state.shift.opened_at))} WIB`
              : "<span></span>Shift belum dibuka",
          },
        ],
      },
      {
        cols: [
          {
            view: "segmented",
            id: "categoryTabs",
            css: "category-tabs",
            value: "all",
            options: categories.map((c) => ({ id: c.id, value: c.name })),
            on: { onChange: (id) => setFilter(id) },
          },
          {},
          state.shift
            ? {}
            : button(
                "Buka shift demo",
                () => {
                  const s = {
                    id: uid(),
                    cashier: "Dina Pratiwi",
                    status: "open",
                    opened_at: new Date().toISOString(),
                  };
                  state.shift = s;
                  state.shifts.push(s);
                  refresh();
                },
                true,
              ),
        ],
      },
      {
        gravity: 1,
        cols: [
          {
            view: "dataview",
            id: "productCards",
            css: "product-grid",
            select: true,
            scroll: "y",
            type: { width: 225, height: 260 },
            template: cardTemplate,
            data: active,
            on: { onItemClick: (id) => add(id) },
          },
          {
            width: 480,
            rows: [
              {
                view: "template",
                height: 58,
                css: "cart-head",
                template: `<h2>Keranjang</h2><span class="item-count">${state.cart.reduce((n, i) => n + i.quantity, 0)} item</span>`,
              },
              basket,
              {
                view: "template",
                height: 88,
                css: "cart-sum",
                template: `<div><span>Subtotal</span><span>${money(total())}</span></div><div><strong>Total</strong><strong>${money(total())}</strong></div>`,
              },
              {
                view: "template",
                height: 34,
                css: "payment-label",
                template: "Metode pembayaran",
              },
              {
                cols: [
                  {
                    view: "button",
                    value: "Tunai",
                    css: "pay-method selected",
                    disabled: true,
                  },
                  {
                    view: "button",
                    value: "Online (Midtrans)",
                    css: "pay-method",
                    disabled: true,
                  },
                ],
              },
              {
                view: "text",
                id: "cash",
                css: "cash-field",
                label: "Uang diterima",
                labelPosition: "top",
                type: "number",
                placeholder: "Nominal diterima",
                on: {
                  onTimedKeyPress() {
                    const v = +this.getValue();
                    $$("changeDue").setHTML(
                      v >= total()
                        ? `Kembalian <strong>${money(v - total())}</strong>`
                        : "Masukkan nominal yang cukup.",
                    );
                  },
                },
              },
              {
                view: "template",
                id: "changeDue",
                height: 34,
                borderless: true,
                css: "change-due",
                template: "Kembalian akan terlihat di sini.",
              },
              {
                ...button(`Bayar ${money(total())}`, pay, true),
                autowidth: false,
                css: "checkout-button",
                height: 64,
              },
            ],
          },
        ],
        margin: 16,
      },
    ],
  };
}
