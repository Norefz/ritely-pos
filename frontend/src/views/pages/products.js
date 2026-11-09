import { state, money, categoryName, uid, escape } from "../../demo.js";
import { heading, table, button, editor } from "./common.js";
export function products(refresh) {
  function edit(
    product = { active: true, stock: 0, minimum: 5, category: "c1" },
  ) {
    editor(
      product.id ? "Ubah produk" : "Tambah produk",
      [
        { view: "text", name: "name", label: "Nama produk", required: true },
        { view: "text", name: "sku", label: "SKU unik", required: true },
        {
          view: "richselect",
          name: "category",
          label: "Kategori",
          options: state.categories.map((c) => ({ id: c.id, value: c.name })),
          required: true,
        },
        {
          view: "text",
          name: "price",
          label: "Harga jual (Rp)",
          type: "number",
          required: true,
        },
        {
          view: "text",
          name: "minimum",
          label: "Batas stok minimum",
          type: "number",
          required: true,
        },
        {
          view: "checkbox",
          name: "active",
          labelRight: "Produk aktif",
          labelWidth: 0,
        },
      ],
      product,
      (v) => {
        if (
          !v.name.trim() ||
          !v.sku.trim() ||
          !Number.isFinite(+v.price) ||
          +v.price < 0 ||
          !Number.isInteger(+v.minimum) ||
          +v.minimum < 0
        ) {
          webix.message({
            type: "error",
            text: "Isi nama, SKU, harga dan batas stok dengan benar.",
          });
          return false;
        }
        if (
          state.products.some((p) => p.sku === v.sku && p.id !== product.id)
        ) {
          webix.message({ type: "error", text: "SKU sudah dipakai." });
          return false;
        }
        const value = {
          ...product,
          ...v,
          id: product.id || uid(),
          price: +v.price,
          minimum: +v.minimum,
          stock: product.stock || 0,
          active: !!+v.active,
        };
        if (product.id) Object.assign(product, value);
        else state.products.push(value);
        refresh();
      },
    );
  }
  return {
    rows: [
      heading("Produk", "Kelola katalog, harga jual, dan ketersediaan produk."),
      {
        view: "toolbar",
        cols: [
          {
            view: "search",
            placeholder: "Cari nama atau SKU",
            on: {
              onTimedKeyPress() {
                const q = this.getValue().toLowerCase();
                $$("productTable").filter((p) =>
                  (p.name + " " + p.sku).toLowerCase().includes(q),
                );
              },
            },
          },
          {},
          button("Tambah produk", () => edit(), true),
        ],
      },
      table(
        [
          { id: "sku", header: "SKU", width: 125 },
          { id: "name", header: "Produk", fillspace: 2, minWidth: 200 },
          {
            id: "category",
            header: "Kategori",
            width: 170,
            template: (o) => escape(categoryName(o.category)),
          },
          {
            id: "price",
            header: "Harga jual",
            width: 135,
            format: money,
            css: "numeric",
          },
          { id: "stock", header: "Stok", width: 80, css: "numeric" },
          {
            id: "active",
            header: "Status",
            width: 100,
            template: (o) => (o.active ? "Aktif" : "Nonaktif"),
          },
          {
            id: "edit",
            header: "",
            width: 75,
            template: '<button class="row-action">Ubah</button>',
          },
        ],
        state.products,
        {
          id: "productTable",
          onClick: {
            "row-action": (_, id) =>
              edit(state.products.find((p) => p.id === id.row)),
          },
        },
      ),
    ],
  };
}
export function categories(refresh) {
  return {
    rows: [
      heading(
        "Kategori",
        "Susun produk agar mudah ditemukan saat bertransaksi.",
      ),
      {
        view: "toolbar",
        cols: [
          {},
          button(
            "Tambah kategori",
            () =>
              editor(
                "Kategori baru",
                [
                  {
                    view: "text",
                    name: "name",
                    label: "Nama kategori",
                    required: true,
                  },
                ],
                {},
                (v) => {
                  const name = v.name.trim();
                  if (
                    !name ||
                    state.categories.some(
                      (c) => c.name.toLowerCase() === name.toLowerCase(),
                    )
                  ) {
                    webix.message({
                      type: "error",
                      text: "Nama kategori kosong atau sudah digunakan.",
                    });
                    return false;
                  }
                  state.categories.push({ id: uid(), name });
                  refresh();
                },
              ),
            true,
          ),
        ],
      },
      table(
        [
          { id: "name", header: "Nama kategori", fillspace: 1 },
          {
            id: "count",
            header: "Jumlah produk",
            width: 160,
            template: (c) =>
              state.products.filter((p) => p.category === c.id).length,
          },
        ],
        state.categories,
      ),
    ],
  };
}
export function stock(refresh) {
  return {
    rows: [
      heading(
        "Persediaan",
        "Catat penyesuaian stok dengan alasan yang dapat ditelusuri.",
      ),
      table(
        [
          { id: "name", header: "Produk", fillspace: 1, minWidth: 200 },
          { id: "stock", header: "Stok tersedia", width: 140 },
          { id: "minimum", header: "Minimum", width: 120 },
          {
            id: "action",
            header: "",
            width: 145,
            template: '<button class="row-action">Sesuaikan stok</button>',
          },
        ],
        state.products,
        {
          onClick: {
            "row-action": (_, id) => {
              const p = state.products.find((p) => p.id === id.row);
              editor(
                "Sesuaikan stok",
                [
                  {
                    view: "text",
                    name: "stock",
                    label: "Stok akhir",
                    type: "number",
                    required: true,
                  },
                  {
                    view: "textarea",
                    name: "reason",
                    label: "Alasan penyesuaian",
                    required: true,
                  },
                ],
                p,
                (v) => {
                  if (
                    !Number.isInteger(+v.stock) ||
                    +v.stock < 0 ||
                    !v.reason.trim()
                  ) {
                    webix.message({
                      type: "error",
                      text: "Stok harus bilangan bulat ≥ 0 dan alasan wajib diisi.",
                    });
                    return false;
                  }
                  state.movements.push({
                    id: uid(),
                    name: p.name,
                    quantity: +v.stock - p.stock,
                    reason: v.reason,
                  });
                  p.stock = +v.stock;
                  refresh();
                },
              );
            },
          },
        },
      ),
      {
        view: "template",
        height: 50,
        borderless: true,
        template: () =>
          `Penyesuaian dalam sesi demo ini: ${state.movements.length}`,
      },
    ],
  };
}
