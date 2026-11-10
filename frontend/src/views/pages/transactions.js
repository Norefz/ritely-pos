import { state, money, date, completed, uid } from "../../demo.js";
import { heading, table, button, editor, receipt } from "./common.js";
export function transactions() {
  return {
    rows: [
      heading(
        "Riwayat transaksi",
        "Penjualan simulasi selama sesi browser ini. Klik baris untuk membuka struk.",
      ),
      table(
        [
          { id: "id", header: "Nomor struk", width: 185 },
          { id: "created_at", header: "Waktu (WIB)", width: 200, format: date },
          { id: "cashier", header: "Kasir", fillspace: 1, minWidth: 140 },
          { id: "total", header: "Total", width: 140, format: money },
          { id: "status", header: "Status", width: 125 },
        ],
        state.sales,
        {
          select: "row",
          on: {
            onItemClick(id) {
              receipt(this.getItem(id.row));
            },
          },
        },
      ),
    ],
  };
}
