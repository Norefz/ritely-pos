import { state, categoryName, date, escape } from "../../state.js";
import { editor } from "./common.js";
import {
  ApiError,
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
  pencil: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
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
function physicalStock(p) {
  if (Number.isInteger(p.physicalStock)) return p.physicalStock;
  return p.stock;
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
  const id = escape(String(p.id));
  const name = escape(p.name);
  const counted = physicalStock(p);
  return `<tr>
    <td><div class="pd-name"><i class="pd-av ${tone(p.category)}">${escape(initials(p.name))}</i>
      <div class="sk-prod"><b>${escape(p.name)}</b><small>${escape(p.sku)}</small></div></div></td>
    <td>${escape(categoryName(p.category))}</td>
    <td>${levelHtml(p)}</td>
    <td class="sk-physical-value">${counted}</td>
    <td class="sk-min">${p.minimum}</td>
    <td>${stockTag(p)}</td>
    <td class="pd-act"><button type="button" class="pd-edit sk-opname-submit" data-act="opname-product" data-id="${id}" aria-label="Sesuaikan stok ${name}">${icons.pencil}Sesuaikan stok</button></td>
  </tr>`;
}
function listHtml(rows) {
  const columns = 7;
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
  const opnameRows = state.stockOpnames.length
    ? state.stockOpnames.map((opname) => {
        const difference = Number(opname.difference || 0);
        const delta = difference > 0 ? `+${difference}` : String(difference);
        return `<tr>
          <td><div class="so-product"><b>${escape(opname.product_name)}</b><small>${escape(opname.sku)}</small></div></td>
          <td>${escape(opname.submitted_by_name)}</td>
          <td>${opname.system_stock}</td>
          <td>${opname.physical_stock}</td>
          <td><b class="so-difference${difference < 0 ? " negative" : difference > 0 ? " positive" : ""}">${delta}</b></td>
          <td>${escape(date(opname.submitted_at))}</td>
        </tr>`;
      }).join("")
    : `<tr><td class="pd-empty" colspan="6">${state.stockOpnameLoadError ? "Riwayat stock opname gagal dimuat dari backend." : "Belum ada catatan stock opname."}</td></tr>`;
  return `
    <div class="pd-head">
      <div><h1>Stok</h1><p>Pantau persediaan dan catat hasil hitung fisik.</p></div>
      ${isManager ? `<div data-part="pill">${pillHtml()}</div>` : ""}
    </div>
    ${isManager ? "" : `<section class="pd-card so-intro">${icons.info}<div><b>Stock opname</b><p>Hitung jumlah fisik barang. Setelah disimpan, stok sistem langsung disesuaikan.</p></div></section>`}
    <section class="pd-card pd-stats" data-part="stats">${statsHtml()}</section>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari nama atau SKU" value="${escape(view.q)}" aria-label="Cari produk" autocomplete="off" /></label>
      <div class="pd-chips" data-part="chips" role="group" aria-label="Filter status stok">${chipsHtml()}</div>
    </section>
    <section class="pd-card">
      <div class="pd-head stock-section-head"><div><h2>Persediaan produk</h2><p>Jumlah saat ini dibandingkan dengan batas minimum.</p></div></div>
      <div class="pd-scroll">
        <table class="pd-table sk-inventory-table">
          <thead><tr>
            <th class="sk-c-product">Produk</th><th class="sk-c-cat">Kategori</th><th class="sk-c-lvl">Stok sistem</th>
            <th class="sk-c-physical">Stok fisik</th><th class="sk-c-min">Minimum</th>
            <th class="sk-c-status">Status</th><th class="sk-c-act">Aksi</th>
          </tr></thead>
          <tbody data-part="list"></tbody>
        </table>
      </div>
      <div class="pd-foot" data-part="foot"></div>
    </section>
    ${isManager ? `<section class="pd-card">
      <div class="pd-head stock-section-head"><div><h2>Riwayat stock opname</h2><p>Hitungan fisik langsung menyesuaikan stok dan tercatat di sini.</p></div></div>
      <div class="pd-scroll"><table class="pd-table so-table">
        <thead><tr><th>Produk</th><th>Petugas</th><th>Stok sistem</th><th>Stok fisik</th><th>Selisih</th><th>Waktu</th></tr></thead>
        <tbody>${opnameRows}</tbody>
      </table></div>
    </section>` : ""}
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

function openOpname(product, refresh) {
  if (!product) return;
  const systemStock = product.stock;
  const countedStock = physicalStock(product);
  const formatDifference = (nextSystemStock) => {
    const difference = nextSystemStock - countedStock;
    return difference > 0 ? `+${difference}` : String(difference);
  };
  editor(
    `Stock opname · ${product.name}`,
    [
      {
        view: "text",
        name: "system_stock",
        label: "Stok sistem saat ini",
        readonly: true,
      },
      {
        view: "text",
        name: "physical_stock",
        label: "Stok fisik tersimpan",
        readonly: true,
      },
      {
        view: "text",
        name: "new_system_stock",
        label: "Stok sistem baru",
        required: true,
        attributes: { inputmode: "numeric", pattern: "[0-9]*" },
        validate: (value) => /^\d+$/.test(String(value ?? "")),
        on: {
          onAfterRender() {
            const input = this.getInputNode();
            if (!input || input.dataset.digitsOnly === "true") return;
            input.dataset.digitsOnly = "true";
            input.addEventListener("input", () => {
              const sanitized = input.value.replace(/[^0-9]/g, "");
              if (input.value !== sanitized) {
                const cursor = input.selectionStart;
                input.value = sanitized;
                input.setSelectionRange(Math.min(cursor, sanitized.length), Math.min(cursor, sanitized.length));
                this.setValue(sanitized);
              }
            });
          },
          onChange(value) {
            const raw = String(value ?? "").trim();
            const target = Number(raw);
            const differenceField = $$("opnameDifference");
            if (differenceField) {
              differenceField.setValue(
                raw && Number.isSafeInteger(target) && target >= 0
                  ? formatDifference(target)
                  : "—",
              );
            }
          },
        },
      },
      {
        view: "text",
        name: "difference",
        id: "opnameDifference",
        label: "Selisih",
        readonly: true,
      },
    ],
    {
      system_stock: systemStock,
      physical_stock: countedStock,
      new_system_stock: String(systemStock),
      difference: formatDifference(systemStock),
    },
    async (values) => {
      const raw = String(values.new_system_stock ?? "").trim();
      const target = Number(raw);
      if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(target) || target < 0) {
        webix.message({ type: "error", text: "Stok sistem harus bilangan bulat ≥ 0." });
        return false;
      }
      try {
        const result = await submitStockOpnameRequest({
          product_id: product.id,
          system_stock: target,
        });
        if (state.role === "manager") state.stockOpnames.unshift(result.opname);
        const currentProduct = state.products.find(
          (item) => String(item.id) === String(result.opname.product_id),
        );
        if (currentProduct) {
          currentProduct.stock = result.opname.system_stock + result.opname.difference;
          currentProduct.physicalStock = countedStock;
        }
        refresh();
        webix.message(`Stock opname tersimpan. Stok sistem sekarang ${target}.`);
      } catch (error) {
        let message = "Stock opname gagal disimpan.";
        if (error instanceof ApiError) {
          const knownErrors = {
            stock_changed_retry: "Stok berubah dari sesi lain. Muat ulang lalu hitung kembali.",
            database_unavailable: "Database belum dapat dijangkau. Periksa koneksi backend ke MongoDB.",
            unsupported_stock_opname_fields: "Backend lokal masih memakai format lama. Restart backend lalu muat ulang halaman.",
            product_not_found: "Produk sudah tidak tersedia. Muat ulang halaman.",
            invalid_stock_opname: error.message,
            unauthorized: "Sesi login tidak berlaku. Keluar lalu login kembali.",
            forbidden: "Akun ini tidak memiliki akses stock opname.",
            server_unreachable: "Backend tidak dapat dijangkau. Pastikan server lokal masih berjalan.",
          };
          message = knownErrors[error.code]
            || `Stock opname gagal (HTTP ${error.status}${error.code ? ` · ${error.code}` : ""}).`;
        }
        webix.message({ type: "error", text: message });
        return false;
      }
    },
  );
}

function bind(root, refresh) {
  if (root._skBound) return;
  root._skBound = true;
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (act === "opname-product") {
      const product = state.products.find((p) => String(p.id) === el.dataset.id);
      return openOpname(product, refresh);
    }
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
  return {
    view: "template",
    css: "product-page stock-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        paint(this.$view);
        bind(this.$view, refresh);
      },
    },
  };
}
