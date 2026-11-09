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
export function shifts(refresh) {
  function close(reason = "") {
    if (state.cart.length) {
      webix.message({
        type: "error",
        text: "Selesaikan atau kosongkan keranjang terlebih dahulu.",
      });
      return false;
    }
    Object.assign(state.shift, {
      status: "closed",
      closed_at: new Date().toISOString(),
      reason,
    });
    state.shift = null;
    refresh();
  }
  return {
    rows: [
      heading(
        "Shift kasir",
        "Mode demo: pembukaan dan penutupan bebas waktu. Hanya satu shift terbuka.",
      ),
      {
        view: "template",
        height: 110,
        css: "shift-summary",
        template: `<h2>${state.shift ? "Shift demo sedang berjalan" : "Belum ada shift terbuka"}</h2><p>${state.shift ? "Dina Pratiwi · Dibuka " + date(state.shift.opened_at) : "Shift 1: 07.00–15.00 WIB · Shift 2: 15.00–22.00 WIB"}</p>`,
      },
      {
        view: "toolbar",
        cols: [
          {},
          ...(state.shift
            ? [
                button(
                  state.role === "manager"
                    ? "Tutup paksa demo"
                    : "Tutup shift demo",
                  () => {
                    if (state.role === "manager")
                      editor(
                        "Penutupan paksa",
                        [
                          {
                            view: "textarea",
                            name: "reason",
                            label: "Alasan penutupan",
                            required: true,
                          },
                        ],
                        {},
                        (v) => {
                          if (!v.reason.trim()) return false;
                          return close(v.reason);
                        },
                      );
                    else
                      webix
                        .confirm("Tutup shift demo ini?")
                        .then(() => close())
                        .catch(() => {});
                  },
                  true,
                ),
              ]
            : state.role === "cashier"
              ? [
                  button(
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
                ]
              : []),
        ],
      },
      table(
        [
          { id: "cashier", header: "Kasir", fillspace: 1, minWidth: 150 },
          { id: "opened_at", header: "Dibuka (WIB)", width: 200, format: date },
          {
            id: "closed_at",
            header: "Ditutup (WIB)",
            width: 200,
            template: (o) => (o.closed_at ? date(o.closed_at) : "—"),
          },
          { id: "status", header: "Status", width: 95 },
          {
            id: "sales",
            header: "Total penjualan",
            width: 155,
            template: (o) =>
              money(
                completed()
                  .filter((s) => s.shift_id === o.id)
                  .reduce((n, s) => n + s.total, 0),
              ),
          },
        ],
        state.shifts,
      ),
    ],
  };
}
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
export function users(refresh) {
  function edit(user = { active: true, assigned_shift: "shift_1" }) {
    editor(
      user.id ? "Ubah akun kasir demo" : "Tambah akun kasir demo",
      [
        { view: "text", name: "name", label: "Nama", required: true },
        { view: "text", name: "username", label: "Username", required: true },
        {
          view: "richselect",
          name: "assigned_shift",
          label: "Penugasan shift",
          options: [
            { id: "shift_1", value: "Shift 1 · 07.00–15.00" },
            { id: "shift_2", value: "Shift 2 · 15.00–22.00" },
          ],
        },
        {
          view: "checkbox",
          name: "active",
          labelRight: "Akun aktif",
          labelWidth: 0,
        },
      ],
      user,
      (v) => {
        if (
          !v.name.trim() ||
          !v.username.trim() ||
          state.users.some((u) => u.username === v.username && u.id !== user.id)
        ) {
          webix.message({
            type: "error",
            text: "Isi nama dan username yang unik.",
          });
          return false;
        }
        const value = { ...v, id: user.id || uid(), active: !!+v.active };
        if (user.id) Object.assign(user, value);
        else state.users.push(value);
        refresh();
      },
    );
  }
  return {
    rows: [
      heading(
        "Akun kasir",
        "Data profil contoh. Tidak membuat akun login atau menyimpan password.",
      ),
      {
        view: "toolbar",
        cols: [{}, button("Tambah akun demo", () => edit(), true)],
      },
      table(
        [
          { id: "name", header: "Nama kasir", fillspace: 1, minWidth: 180 },
          { id: "username", header: "Username", width: 150 },
          {
            id: "assigned_shift",
            header: "Penugasan",
            width: 180,
            template: (o) =>
              o.assigned_shift === "shift_1"
                ? "07.00–15.00 WIB"
                : "15.00–22.00 WIB",
          },
          {
            id: "active",
            header: "Status",
            width: 100,
            template: (o) => (o.active ? "Aktif" : "Nonaktif"),
          },
          {
            id: "edit",
            header: "",
            width: 90,
            template: '<button class="row-action">Ubah</button>',
          },
        ],
        state.users,
        {
          onClick: {
            "row-action": (_, id) =>
              edit(state.users.find((u) => u.id === id.row)),
          },
        },
      ),
    ],
  };
}
