import { state, date, escape } from "../../demo.js";
import { ApiError, submitStockOpnameRequest } from "../../api.js";
import { editor } from "./common.js";

const icon = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  count: icon('<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>'),
};

function opnameError(error) {
  if (!(error instanceof ApiError))
    return "Stock opname gagal disimpan. Periksa koneksi backend.";
  if (error.code === "database_unavailable")
    return "Database belum dapat dijangkau. Stok belum diubah.";
  if (error.code === "stock_changed_retry")
    return "Stok berubah saat opname. Muat ulang halaman lalu hitung kembali.";
  if (error.code === "product_not_found")
    return "Produk tidak aktif atau sudah tidak tersedia. Muat ulang halaman.";
  if (error.status === 0)
    return "Backend tidak dapat dijangkau. Periksa koneksi lalu coba lagi.";
  return error.message || "Stock opname gagal disimpan.";
}

function rowHtml(opname) {
  const difference = Number(opname.difference || 0);
  const delta = difference > 0 ? `+${difference}` : String(difference);
  return `<tr>
    <td><div class="so-product"><b>${escape(opname.product_name)}</b><small>${escape(opname.sku)}</small></div></td>
    <td>${escape(opname.submitted_by_name)}</td>
    <td>${opname.system_stock}</td>
    <td>${opname.counted_stock}</td>
    <td><b class="so-difference${difference < 0 ? " negative" : difference > 0 ? " positive" : ""}">${delta}</b></td>
    <td><span class="state-tag good">Selesai</span></td>
    <td>${escape(date(opname.submitted_at))}${opname.note ? `<small class="so-note">Catatan: ${escape(opname.note)}</small>` : ""}</td>
  </tr>`;
}

function shell() {
  const isManager = state.role === "manager";
  const rows = state.stockOpnames.length
    ? state.stockOpnames.map(rowHtml).join("")
    : `<tr><td class="pd-empty" colspan="7">${state.stockOpnameLoadError ? "Riwayat opname gagal dimuat dari backend." : "Belum ada catatan stock opname."}</td></tr>`;
  return `
    <div class="pd-head">
      <div><h1>Stock opname</h1><p>${isManager ? "Pantau hasil penghitungan fisik dan penyesuaian stok." : "Catat jumlah fisik barang untuk langsung menyesuaikan stok sistem."}</p></div>
      ${isManager ? "" : `<button type="button" class="pd-add" data-act="submit">${icons.plus}Catat hasil hitung</button>`}
    </div>
    <section class="pd-card so-intro">${icons.count}<div><b>${isManager ? "Riwayat Stock opname" : "Penyesuaian langsung"}</b><p>${isManager ? "Setiap pengajuan Kasir langsung memperbarui stok dan tercatat sebagai pergerakan penyesuaian." : "Pastikan hitungan fisik benar. Setelah disimpan, stok sistem langsung berubah dan hasilnya masuk ke riwayat."}</p></div></section>
    <section class="pd-card">
      <div class="pd-scroll"><table class="pd-table so-table">
        <thead><tr><th>Produk</th><th>${isManager ? "Dihitung oleh" : "Kasir"}</th><th>Stok awal</th><th>Fisik</th><th>Selisih</th><th>Status</th><th>Waktu</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
}

function bind(root, refresh) {
  if (root._soBound) return;
  root._soBound = true;
  root.addEventListener("click", (event) => {
    const element = event.target.closest('[data-act="submit"]');
    if (element && !element.disabled) submit();
  });

  function submit() {
    const products = state.products.filter((product) => product.active);
    if (!products.length) {
      webix.message({ type: "error", text: "Belum ada produk aktif di database." });
      return;
    }
    editor(
      "Catat hasil stock opname",
      [
        {
          view: "richselect",
          name: "product_id",
          label: "Produk",
          options: products.map((product) => ({
            id: product.id,
            value: `${product.name} · ${product.sku} · Sistem: ${product.stock}`,
          })),
          required: true,
        },
        {
          view: "text",
          name: "counted_stock",
          label: "Jumlah fisik yang dihitung",
          type: "number",
          required: true,
        },
        { view: "textarea", name: "note", label: "Catatan (opsional)" },
      ],
      { product_id: products[0].id, counted_stock: "" },
      async (values) => {
        const counted = Number(values.counted_stock);
        if (!Number.isInteger(counted) || counted < 0) {
          webix.message({ type: "error", text: "Jumlah fisik harus bilangan bulat ≥ 0." });
          return false;
        }
        try {
          const result = await submitStockOpnameRequest({
            product_id: values.product_id,
            counted_stock: counted,
            note: values.note || "",
          });
          state.stockOpnames.unshift(result.opname);
          const product = state.products.find((item) => item.id === result.opname.product_id);
          if (product) product.stock = result.opname.counted_stock;
          refresh();
          webix.message("Stock opname disimpan dan stok langsung disesuaikan.");
        } catch (error) {
          webix.message({ type: "error", text: opnameError(error) });
          return false;
        }
      },
    );
  }
}

export function stockOpnames(refresh) {
  return {
    view: "template",
    css: "product-page stock-opname-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        bind(this.$view, refresh);
      },
    },
  };
}
