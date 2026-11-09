import { state, money, total, uid } from "../../demo.js";
import { heading, table, button, receipt } from "./common.js";
export function pos(refresh) {
  function add(id) {
    if (!state.shift) {
      webix.message({
        type: "error",
        text: "Buka shift demo terlebih dahulu.",
      });
      return;
    }
    const p = state.products.find((p) => p.id === id),
      item = state.cart.find((i) => i.id === id);
    if ((item?.quantity || 0) >= p.stock) {
      webix.message({ type: "error", text: "Stok tidak mencukupi." });
      return;
    }
    if (item) item.quantity++;
    else state.cart.push({ ...p, quantity: 1 });
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
          items: state.cart.map((i) => ({ ...i })),
          total: total(),
          cash,
          status: "completed",
          payment_status: "paid",
        };
        sale.items.forEach((i) => {
          state.products.find((p) => p.id === i.id).stock -= i.quantity;
        });
        state.sales.push(sale);
        state.cart = [];
        refresh();
        receipt(sale);
      })
      .catch(() => {});
  }
  const cart = {
    width: 340,
    minWidth: 290,
    rows: [
      {
        view: "template",
        height: 52,
        css: "cart-title",
        template: "<h2>Keranjang</h2>",
      },
      table(
        [
          { id: "name", header: "Produk", fillspace: 1, minWidth: 110 },
          { id: "quantity", header: "Qty", width: 45 },
          {
            id: "remove",
            header: "",
            width: 66,
            template:
              '<button class="row-action" aria-label="Kurangi jumlah produk">− 1</button>',
          },
        ],
        state.cart,
        {
          onClick: {
            "row-action": (_, id) => {
              const i = state.cart.find((i) => i.id === id.row);
              if (--i.quantity === 0)
                state.cart = state.cart.filter((c) => c.id !== i.id);
              refresh();
            },
          },
        },
      ),
      {
        view: "template",
        height: 86,
        css: "cart-total",
        template: `<span>Total pembayaran</span><strong>${money(total())}</strong>`,
      },
      {
        view: "text",
        id: "cash",
        label: "Tunai (Rp)",
        labelPosition: "top",
        type: "number",
        placeholder: "Nominal diterima",
        on: {
          onTimedKeyPress() {
            const value = +this.getValue();
            $$("change").setHTML(
              value >= total()
                ? `Kembalian: ${money(value - total())}`
                : "Tunai belum mencukupi",
            );
          },
        },
      },
      {
        view: "template",
        id: "change",
        height: 40,
        borderless: true,
        template: "Masukkan nominal tunai.",
      },
      { ...button("Selesaikan demo tunai", pay, true), autowidth: false },
      { view: "button", value: "Online · belum terhubung", disabled: true },
      {
        view: "template",
        height: 48,
        borderless: true,
        css: "muted",
        template: "Pembayaran online memerlukan backend Midtrans Sandbox.",
      },
    ],
  };
  return {
    rows: [
      heading(
        "Kasir",
        state.shift
          ? "Shift demo aktif · Dina Pratiwi"
          : "Buka shift di menu Shift saya untuk mulai bertransaksi.",
      ),
      {
        cols: [
          {
            minWidth: 260,
            rows: [
              {
                view: "search",
                placeholder: "Cari produk atau SKU",
                on: {
                  onTimedKeyPress() {
                    const q = this.getValue().toLowerCase();
                    $$("catalog").filter((p) =>
                      (p.name + " " + p.sku).toLowerCase().includes(q),
                    );
                  },
                },
              },
              table(
                [
                  { id: "name", header: "Produk", fillspace: 1, minWidth: 160 },
                  { id: "price", header: "Harga", width: 110, format: money },
                  { id: "stock", header: "Stok", width: 60 },
                  {
                    id: "add",
                    header: "",
                    width: 80,
                    template: '<button class="row-action">Tambah</button>',
                  },
                ],
                state.products.filter((p) => p.active),
                {
                  id: "catalog",
                  onClick: { "row-action": (_, id) => add(id.row) },
                },
              ),
            ],
          },
          cart,
        ],
        margin: 16,
      },
    ],
  };
}
