import { state, money, date, completed, uid } from "../../demo.js";
import { heading, table, button, editor, receipt } from "./common.js";
export function reports() {
  const rows = completed(),
    units = {};
  rows.forEach((s) =>
    s.items.forEach((i) => {
      units[i.id] ??= { id: i.id, name: i.name, quantity: 0, total: 0 };
      units[i.id].quantity += i.quantity;
      units[i.id].total += i.price * i.quantity;
    }),
  );
  return {
    rows: [
      heading(
        "Laporan penjualan",
        "Seluruh sesi demo · Dihitung hanya dari transaksi completed dan paid.",
      ),
      {
        view: "template",
        height: 126,
        css: "metrics",
        template: `<div><span>Total penjualan</span><strong>${money(rows.reduce((n, s) => n + s.total, 0))}</strong><small>Berdasarkan waktu pembayaran</small></div><div><span>Transaksi</span><strong>${rows.length}</strong><small>Transaksi demo selesai</small></div><div><span>Unit terjual</span><strong>${Object.values(units).reduce((n, p) => n + p.quantity, 0)}</strong><small>Dari seluruh produk</small></div>`,
      },
      {
        view: "toolbar",
        cols: [
          { view: "label", label: "Produk terlaris" },
          {},
          button("Ekspor CSV", () => {
            const csv =
              "Produk,Unit,Total\n" +
              Object.values(units)
                .map(
                  (p) =>
                    `"${p.name.replace(/"/g, '""').replace(/^[=+@-]/, "'")}",${p.quantity},${p.total}`,
                )
                .join("\n");
            const url = URL.createObjectURL(
              new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "ritely-laporan-demo.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }),
        ],
      },
      table(
        [
          { id: "name", header: "Produk", fillspace: 1, minWidth: 200 },
          { id: "quantity", header: "Unit terjual", width: 160 },
          { id: "total", header: "Total penjualan", width: 180, format: money },
        ],
        Object.values(units).sort((a, b) => b.quantity - a.quantity),
      ),
    ],
  };
}
