import { state, money, completed, categoryName } from "../../demo.js";
import { heading, table, button } from "./common.js";
export function dashboard(navigate) {
  const sales = completed(),
    revenue = sales.reduce((s, r) => s + r.total, 0),
    low = state.products.filter((p) => p.active && p.stock <= p.minimum);
  return {
    rows: [
      heading(
        "Operasional, dalam satu pandangan.",
        "Pantau penjualan dan persediaan toko dari tempat yang sama.",
      ),
      {
        view: "template",
        height: 126,
        borderless: true,
        css: "metrics",
        template: `<div><span>Total penjualan demo</span><strong>${money(revenue)}</strong><small>Transaksi completed dan paid</small></div><div><span>Transaksi selesai</span><strong>${sales.length}</strong><small>Sejak halaman dibuka</small></div><div><span>Produk perlu restok</span><strong>${low.length}</strong><small>Stok pada atau di bawah minimum</small></div>`,
      },
      {
        view: "toolbar",
        css: "section-toolbar",
        cols: [
          { view: "label", label: "Perlu perhatian" },
          {},
          button("Kelola stok", () => navigate("stock")),
        ],
      },
      table(
        [
          { id: "name", header: "Produk", fillspace: 2, minWidth: 180 },
          {
            id: "category",
            header: "Kategori",
            width: 160,
            template: (o) => categoryName(o.category),
          },
          { id: "stock", header: "Stok tersedia", width: 120, css: "numeric" },
          { id: "minimum", header: "Minimum", width: 110, css: "numeric" },
        ],
        low,
      ),
      {
        view: "template",
        height: 94,
        borderless: true,
        css: "shift-summary",
        template: `<strong>${state.shift ? "Shift sedang berjalan" : "Register siap digunakan"}</strong><p>${state.shift ? "Dina Pratiwi · Shift demo aktif." : "Belum ada shift terbuka. Pilih peran Kasir untuk mencoba alur penjualan."}</p>`,
      },
    ],
  };
}
