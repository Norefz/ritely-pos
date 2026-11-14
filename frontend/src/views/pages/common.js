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
  const win = webix.ui({
    view: "window",
    modal: true,
    position: "center",
    width: Math.min(520, window.innerWidth - 24),
    head: title,
    body: {
      view: "form",
      id: "editorForm",
      padding: 24,
      elementsConfig: { labelPosition: "top" },
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
                const result = save(form.getValues());
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
  webix
    .ui({
      view: "window",
      modal: true,
      position: "center",
      width: Math.min(450, innerWidth - 24),
      head: "Struk simulasi",
      body: {
        rows: [
          {
            view: "template",
            autoheight: true,
            css: "receipt",
            template: `<h2>ritely.</h2><p>STRUK DEMO — BUKAN BUKTI PEMBAYARAN</p><p>${escape(sale.id)}<br>${date(sale.created_at)}</p>${sale.items.map((i) => `<p>${escape(i.name)} × ${i.quantity}<b>${money(i.price * i.quantity)}</b></p>`).join("")}<hr><h3>Total <b>${money(sale.total)}</b></h3><p>Tunai <b>${money(sale.cash)}</b></p><p>Kembalian <b>${money(sale.cash - sale.total)}</b></p>`,
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
