import { state, money, date, completed, uid } from "../../demo.js";
import { heading, table, button, editor, receipt } from "./common.js";
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
