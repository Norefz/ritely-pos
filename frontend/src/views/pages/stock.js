import { state, categoryName, date, escape } from "../../demo.js";
import { editor } from "./common.js";
import {
  ApiError,
  adjustStockRequest,
  submitStockOpnameRequest,
} from "../../api.js";

/* ---------- Halaman Persediaan: konfigurasi & helper ---------- */
const PAGE_SIZE = 10;
// Filter bertahan selama sesi, termasuk saat refresh() membangun ulang halaman.
const view = { q: "", status: "all", page: 1 };
const TONES = ["", "orange", "purple", "green"]; // warna avatar per urutan kategori

const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  pencil: svg(
    '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  ),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
};

// Stok menipis = di bawah batas minimum (FR-24) atau habis.
const lowStock = (p) => p.stock <= 0 || p.stock < p.minimum;

function initials(name) {
  const w = name.trim().split(/\s+/);
  return (
    w.length > 1 ? w[0][0] + w[1][0] : name.trim().slice(0, 2)
  ).toUpperCase();
}
function tone(categoryId) {
  const i = state.categories.findIndex((c) => c.id === categoryId);
  return TONES[(i < 0 ? 0 : i) % TONES.length];
}
function stockTag(p) {
  if (p.stock <= 0) return '<span class="stock-tag empty">Habis</span>';
  return lowStock(p)
    ? '<span class="stock-tag warning">Menipis</span>'
    : '<span class="stock-tag good">Aman</span>';
}
function filtered() {
  const q = view.q.trim().toLowerCase();
  return state.products.filter(
    (p) =>
      (view.status === "all" ||
        (view.status === "low" ? lowStock(p) : !lowStock(p))) &&
      (!q || (p.name + " " + p.sku).toLowerCase().includes(q)),
  );
}
function pageItems(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur - 1, cur, cur + 1]);
  if (cur <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (cur >= total - 2)
    [total - 3, total - 2, total - 1].forEach((n) => set.add(n));
  const nums = [...set]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/* ---------- Potongan HTML ---------- */
function pillHtml() {
  return `<span class="pd-pill"><span class="pd-pill-dot"></span>Stok tersimpan di database</span>`;
}
function statsHtml() {
  const low = state.products.filter(lowStock);
  const units = state.products.reduce((sum, p) => sum + (+p.stock || 0), 0);
  return `
    <div class="pd-stat"><i class="pd-stat-icon blue">${svg('<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>')}</i><span>Total unit stok</span><strong>${units}</strong></div>
    <div class="pd-stat warn"><i class="pd-stat-icon amber">${svg('<path d="M12 3 2.8 20h18.4L12 3zM12 9v5M12 17h.01"/>')}</i><span>Stok menipis</span><strong>${low.length}</strong></div>
    <div class="pd-stat"><i class="pd-stat-icon green">${svg('<path d="M4 7h16M4 12h16M4 17h10"/><path d="m16 16 2 2 4-4"/>')}</i><span>Produk tercatat</span><strong>${state.products.length}</strong></div>`;
}
function chipsHtml() {
  const low = state.products.filter(lowStock).length;
  const chip = (value, label, count, extra = "") =>
    `<button type="button" class="pd-chip${view.status === value ? " on" : ""}" data-act="status" data-value="${value}" aria-pressed="${view.status === value}">${extra}${label} <i>${count}</i></button>`;
  return (
    chip("all", "Semua", state.products.length) +
    chip("ok", "Aman", state.products.length - low) +
    chip("low", "Menipis", low, '<span class="pd-dot"></span>')
  );
}
function levelHtml(p) {
  const max = Math.max(p.stock, p.minimum * 2, 1);
  const fill = Math.max(0, Math.min(100, (p.stock / max) * 100));
  const mark = (p.minimum / max) * 100;
  return `<div class="sk-lvl"><b>${p.stock}</b>
    <div class="sk-bar${lowStock(p) ? " low" : ""}"><i style="width:${fill.toFixed(0)}%"></i>${p.minimum > 0 ? `<u style="left:${mark.toFixed(0)}%"></u>` : ""}</div></div>`;
}
function rowHtml(p) {
  const managerAction = state.role === "manager"
    ? `<td class="pd-act"><button type="button" class="pd-edit" data-act="adjust" data-id="${escape(String(p.id))}" aria-label="Sesuaikan stok ${escape(p.name)}">${icons.pencil}Sesuaikan stok</button></td>`
    : "";
  return `<tr>
    <td><div class="pd-name"><i class="pd-av ${tone(p.category)}">${escape(initials(p.name))}</i>
      <div class="sk-prod"><b>${escape(p.name)}</b><small>${escape(p.sku)}</small></div></div></td>
    <td>${escape(categoryName(p.category))}</td>
    <td>${levelHtml(p)}</td>
    <td class="pd-r sk-min">${p.minimum}</td>
    <td>${stockTag(p)}</td>
    ${managerAction}
  </tr>`;
}
function listHtml(rows) {
  const columns = state.role === "manager" ? 6 : 5;
  return rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="${columns}" class="pd-empty">Tidak ada produk yang cocok dengan pencarian atau filter ini.</td></tr>`;
}
function footHtml(total, pages, from, to) {
  const text = total
    ? `Menampilkan ${from}–${to} dari ${total} produk · ${PAGE_SIZE} per halaman`
    : `Menampilkan 0 produk · ${PAGE_SIZE} per halaman`;
  const btn = (label, inner, page, disabled, on) =>
    `<button type="button" class="pd-pg${on ? " on" : ""}" data-act="page" data-page="${page}" aria-label="${label}"${on ? ' aria-current="page"' : ""}${disabled ? " disabled" : ""}>${inner}</button>`;
  const nums = pageItems(view.page, pages)
    .map((n) =>
      n === "…"
        ? '<span class="pd-gap">…</span>'
        : btn(`Halaman ${n}`, n, n, false, n === view.page),
    )
    .join("");
  return `<span>${text}</span>
    <nav class="pd-pager" aria-label="Halaman persediaan">
      ${btn("Halaman sebelumnya", icons.prev, view.page - 1, view.page === 1)}
      ${nums}
      ${btn("Halaman berikutnya", icons.next, view.page + 1, view.page === pages)}
    </nav>`;
}

function shell() {
  const isManager = state.role === "manager";
  if (!isManager) {
    const opnameRows = state.stockOpnames.length
      ? state.stockOpnames.map((opname) => {
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
        }).join("")
      : `<tr><td class="pd-empty" colspan="7">${state.stockOpnameLoadError ? "Riwayat stock opname gagal dimuat dari backend." : "Belum ada catatan stock opname."}</td></tr>`;
    return `
      <div class="pd-head">
        <div><h1>Stok</h1><p>Catat jumlah fisik barang untuk langsung menyesuaikan stok sistem.</p></div>
        <button type="button" class="pd-add" data-act="opname">${icons.plus}Catat hasil hitung</button>
      </div>
      <section class="pd-card so-intro">${icons.info}<div><b>Penyesuaian langsung</b><p>Pastikan hitungan fisik benar. Setelah disimpan, stok sistem langsung berubah dan hasilnya masuk ke riwayat.</p></div></section>
      <section class="pd-card">
        <div class="pd-scroll"><table class="pd-table so-table">
          <thead><tr><th>Produk</th><th>Kasir</th><th>Stok awal</th><th>Fisik</th><th>Selisih</th><th>Status</th><th>Waktu</th></tr></thead>
          <tbody>${opnameRows}</tbody>
        </table></div>
      </section>`;
  }

  const opnameRows = state.stockOpnames.length
    ? state.stockOpnames.map((opname) => {
        const difference = Number(opname.difference || 0);
        const delta = difference > 0 ? `+${difference}` : String(difference);
        return `<tr>
          <td><div class="so-product"><b>${escape(opname.product_name)}</b><small>${escape(opname.sku)}</small></div></td>
          <td>${escape(opname.submitted_by_name)}</td>
          <td>${opname.system_stock}</td>
          <td>${opname.counted_stock}</td>
          <td><b class="so-difference${difference < 0 ? " negative" : difference > 0 ? " positive" : ""}">${delta}</b></td>
          <td>${escape(date(opname.submitted_at))}${opname.note ? `<small class="so-note">Catatan: ${escape(opname.note)}</small>` : ""}</td>
        </tr>`;
      }).join("")
    : `<tr><td class="pd-empty" colspan="6">${state.stockOpnameLoadError ? "Riwayat stock opname gagal dimuat dari backend." : "Belum ada catatan stock opname."}</td></tr>`;
  return `
    <div class="pd-head">
      <div><h1>Stok</h1><p>${isManager ? "Pantau persediaan dan sesuaikan jumlah stok." : "Lihat persediaan dan catat hasil hitung fisik."}</p></div>
      ${isManager ? "" : `<button type="button" class="pd-add" data-act="opname">${icons.plus}Catat stock opname</button>`}
      <div data-part="pill">${pillHtml()}</div>
    </div>
    <section class="pd-card pd-stats" data-part="stats">${statsHtml()}</section>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari nama atau SKU" value="${escape(view.q)}" aria-label="Cari produk" autocomplete="off" /></label>
      <div class="pd-chips" data-part="chips" role="group" aria-label="Filter status stok">${chipsHtml()}</div>
    </section>
    <section class="pd-card">
      <div class="pd-head stock-section-head"><div><h2>Persediaan produk</h2><p>Jumlah saat ini dibandingkan dengan batas minimum.</p></div></div>
      <div class="pd-scroll">
        <table class="pd-table">
          <thead><tr>
            <th>Produk</th><th class="sk-c-cat">Kategori</th><th class="sk-c-lvl">Stok tersedia</th>
            <th class="sk-c-min pd-r">Minimum</th><th class="sk-c-status">Status</th>
            ${isManager ? '<th class="sk-c-act"><span class="pd-sr">Aksi</span></th>' : ""}
          </tr></thead>
          <tbody data-part="list"></tbody>
        </table>
      </div>
      <div class="pd-foot" data-part="foot"></div>
    </section>
    <section class="pd-card">
      <div class="pd-head stock-section-head"><div><h2>Riwayat stock opname</h2><p>Hitungan fisik langsung menyesuaikan stok dan tercatat di sini.</p></div></div>
      <div class="pd-scroll"><table class="pd-table so-table">
        <thead><tr><th>Produk</th><th>Petugas</th><th>Stok sistem</th><th>Stok fisik</th><th>Selisih</th><th>Waktu</th></tr></thead>
        <tbody>${opnameRows}</tbody>
      </table></div>
    </section>
    <p class="pd-note">${icons.info}Garis penanda pada bar menunjukkan batas stok minimum.</p>`;
}

// Mengisi ulang bagian yang berubah tanpa merender ulang kolom pencarian (fokus tetap).
function paint(root) {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), pages);
  const start = (view.page - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const set = (part, html) => {
    const el = root.querySelector(`[data-part="${part}"]`);
    if (el) el.innerHTML = html;
  };
  set("pill", pillHtml());
  set("stats", statsHtml());
  set("chips", chipsHtml());
  set("list", listHtml(slice));
  set("foot", footHtml(rows.length, pages, start + 1, start + slice.length));
}

function submitOpname(refresh) {
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
        const product = state.products.find(
          (item) => item.id === result.opname.product_id,
        );
        if (product) product.stock = result.opname.counted_stock;
        refresh();
        webix.message("Stock opname tersimpan dan stok langsung disesuaikan.");
      } catch (error) {
        const message = !(error instanceof ApiError)
          ? "Stock opname gagal disimpan. Periksa koneksi backend."
          : error.code === "database_unavailable"
            ? "Database belum dapat dijangkau. Stok belum diubah."
            : error.code === "stock_changed_retry"
              ? "Stok berubah saat opname. Muat ulang halaman lalu hitung kembali."
              : error.code === "product_not_found"
                ? "Produk tidak aktif atau sudah tidak tersedia. Muat ulang halaman."
                : error.status === 0
                  ? "Backend tidak dapat dijangkau. Periksa koneksi lalu coba lagi."
                  : error.message || "Stock opname gagal disimpan.";
        webix.message({ type: "error", text: message });
        return false;
      }
    },
  );
}

function bind(root, adjust, refresh) {
  if (root._skBound) return;
  root._skBound = true;
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (act === "opname" && state.role === "cashier")
      return submitOpname(refresh);
    if (act === "adjust")
      return adjust(state.products.find((p) => String(p.id) === el.dataset.id));
    if (act === "status") {
      view.status = el.dataset.value;
      view.page = 1;
    } else if (act === "page") {
      view.page = +el.dataset.page;
    }
    paint(root);
  });
  root.addEventListener("input", (e) => {
    if (!e.target.matches(".pd-search input")) return;
    view.q = e.target.value;
    view.page = 1;
    paint(root);
  });
}

export function stock(refresh) {
  function adjust(p) {
    if (!p) return;
    editor(
      `Sesuaikan stok · ${p.name}`,
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
      async (v) => {
        if (
          !Number.isInteger(+v.stock) ||
          +v.stock < 0 ||
          !(v.reason || "").trim()
        ) {
          webix.message({
            type: "error",
            text: "Stok harus bilangan bulat ≥ 0 dan alasan wajib diisi.",
          });
          return false;
        }
        try {
          const result = await adjustStockRequest(p.id, +v.stock, v.reason.trim());
          p.stock = result.product.stock;
          refresh();
          webix.message("Penyesuaian stok tersimpan dan tercatat di database.");
        } catch (error) {
          const message = error instanceof ApiError && error.code === "stock_changed_retry"
            ? "Stok berubah dari sesi lain. Muat ulang lalu coba lagi."
            : error instanceof ApiError && error.code === "database_unavailable"
              ? "Database belum dapat dijangkau."
              : "Penyesuaian stok gagal disimpan.";
          webix.message({ type: "error", text: message });
          return false;
        }
      },
    );
  }
  return {
    view: "template",
    css: state.role === "cashier"
      ? "product-page stock-opname-page"
      : "product-page stock-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        paint(this.$view);
        bind(this.$view, adjust, refresh);
      },
    },
  };
}
