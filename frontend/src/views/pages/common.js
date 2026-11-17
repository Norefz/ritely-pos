import { escape, money, date } from "../../state.js";
export const heading = (title, subtitle) => ({
  view: "template",
  borderless: true,
  height: 88,
  css: "page-heading",
  template: `<h1>${escape(title)}</h1><p>${escape(subtitle)}</p>`,
});
export const button = (label, click, primary = false) => ({
  view: "button",
  value: label,
  css: primary ? "webix_primary" : "",
  autowidth: true,
  click,
});
export const table = (columns, data, extra = {}) => ({
  view: "datatable",
  css: "data-table",
  columns: columns.map((c) =>
    c.template || c.format ? c : { ...c, template: (row) => escape(row[c.id]) },
  ),
  data,
  rowHeight: 48,
  headerRowHeight: 44,
  scrollX: true,
  minHeight: 200,
  on: {
    onAfterLoad() {
      if (!this.count()) this.showOverlay("Belum ada data.");
    },
  },
  ...extra,
});
export function editor(title, elements, values, save) {
  const dialogWidth = Math.min(680, window.innerWidth - 32);
  const win = webix.ui({
    view: "window",
    modal: true,
    position: "center",
    width: dialogWidth,
    head: title,
    body: {
      view: "form",
      id: "editorForm",
      width: dialogWidth - 48,
      padding: 24,
      elementsConfig: {
        labelPosition: "top",
        width: Math.max(200, dialogWidth - 96),
      },
      elements: [
        ...elements,
        {
          cols: [
            button("Batal", () => win.close()),
            button(
              "Simpan",
              function () {
                const form = $$("editorForm");
                if (!form.validate()) return;
                const result = save(form.getValues(), form);
                if (result && typeof result.then === "function") {
                  const saveButton = this;
                  saveButton.disable();
                  saveButton.setValue("Menyimpan…");
                  result
                    .then((saved) => {
                      if (saved !== false) win.close();
                    })
                    .catch(() => {
                      webix.message({
                        type: "error",
                        text: "Perubahan gagal disimpan. Periksa koneksi backend.",
                      });
                    })
                    .finally(() => {
                      if (!win.$destructed) {
                        saveButton.enable();
                        saveButton.setValue("Simpan");
                      }
                    });
                  return;
                }
                if (result !== false) win.close();
              },
              true,
            ),
          ],
        },
      ],
    },
  });
  $$("editorForm").setValues(values);
  win.show();
}
export function receipt(sale) {
  const online = sale.payment_method === "online";
  const isPaid = sale.payment_status === "paid";
  const total = money(sale.total);
  const cashLine = online
    ? `<p>Metode pembayaran <b>Midtrans Sandbox</b></p><p>Status <b>${escape(isPaid ? "Lunas" : sale.payment_status || "Pending")}</b></p>`
    : `<p>Metode pembayaran <b>Tunai</b></p><p>Uang diterima <b>${money(sale.cash)}</b></p><p>Kembalian <b>${money(sale.change ?? (sale.cash - sale.total))}</b></p>`;
  webix
    .ui({
      view: "window",
      modal: true,
      position: "center",
      width: Math.min(450, innerWidth - 24),
      head: "Struk transaksi",
      body: {
        rows: [
          {
            view: "template",
            autoheight: true,
            css: "receipt",
            template: `<h2>ritely.</h2><p>${escape(sale.id || sale.receipt_number)}<br>${date(sale.created_at)}</p>${sale.items.map((i) => `<p>${escape(i.name)} × ${i.quantity}<b>${money(i.price * i.quantity)}</b></p>`).join("")}<hr><h3>Total <b>${total}</b></h3>${cashLine}`,
          },
          {
            ...button("Tutup", function () {
              this.getTopParentView().close();
            }),
            autowidth: false,
          },
        ],
      },
    })
    .show();
}
