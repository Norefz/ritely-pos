import { state, uid, categoryName, escape } from "../../demo.js";
import { editor } from "./common.js";

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
  return `<span class="pd-pill"><span class="pd-pill-dot"></span>Sesi demo · ${state.movements.length} penyesuaian</span>`;
}
function statsHtml() {
  const low = state.products.filter(lowStock);
  const names = low
    .slice(0, 2)
    .map((p) => p.name)
    .join(", ");
  const more = low.length > 2 ? ` dan ${low.length - 2} lainnya` : "";
  const units = state.products.reduce((sum, p) => sum + (+p.stock || 0), 0);
  const moves = state.movements.length;
  return `
    <div class="pd-stat"><span>Total unit stok</span><strong>${units}</strong><small>Di ${state.products.length} produk</small></div>
    <div class="pd-stat warn"><span>Stok menipis</span><strong>${low.length}</strong>
      <small title="${escape(low.map((p) => p.name).join(", "))}">${low.length ? escape(names + more) : "Semua stok aman"}</small></div>
    <div class="pd-stat"><span>Penyesuaian sesi ini</span><strong>${moves}</strong><small>${moves ? "Tercatat dengan alasan" : "Belum ada perubahan stok"}</small></div>`;
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
  return `<tr>
    <td><div class="pd-name"><i class="pd-av ${tone(p.category)}">${escape(initials(p.name))}</i>
      <div class="sk-prod"><b>${escape(p.name)}</b><small>${escape(p.sku)}</small></div></div></td>
    <td>${escape(categoryName(p.category))}</td>
    <td>${levelHtml(p)}</td>
    <td class="pd-r sk-min">${p.minimum}</td>
    <td>${stockTag(p)}</td>
    <td class="pd-act"><button type="button" class="pd-edit" data-act="adjust" data-id="${escape(String(p.id))}" aria-label="Sesuaikan stok ${escape(p.name)}">${icons.pencil}Sesuaikan stok</button></td>
  </tr>`;
}
function listHtml(rows) {
  return rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="6" class="pd-empty">Tidak ada produk yang cocok dengan pencarian atau filter ini.</td></tr>`;
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
  return `
    <div class="pd-head">
      <div><h1>Persediaan</h1><p>Catat penyesuaian stok dengan alasan yang dapat ditelusuri.</p></div>
      <div data-part="pill">${pillHtml()}</div>
    </div>
    <section class="pd-card pd-stats" data-part="stats">${statsHtml()}</section>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari nama atau SKU" value="${escape(view.q)}" aria-label="Cari produk" autocomplete="off" /></label>
      <div class="pd-chips" data-part="chips" role="group" aria-label="Filter status stok">${chipsHtml()}</div>
    </section>
    <section class="pd-card">
      <div class="pd-scroll">
        <table class="pd-table">
          <thead><tr>
            <th>Produk</th><th class="sk-c-cat">Kategori</th><th class="sk-c-lvl">Stok tersedia</th>
            <th class="sk-c-min pd-r">Minimum</th><th class="sk-c-status">Status</th>
            <th class="sk-c-act"><span class="pd-sr">Aksi</span></th>
          </tr></thead>
          <tbody data-part="list"></tbody>
        </table>
      </div>
      <div class="pd-foot" data-part="foot"></div>
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

function bind(root, adjust) {
  if (root._skBound) return;
  root._skBound = true;
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
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
      (v) => {
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
  }
  return {
    view: "template",
    css: "product-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        paint(this.$view);
        bind(this.$view, adjust);
      },
    },
  };
}
