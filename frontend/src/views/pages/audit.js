import { auditLogsRequest } from "../../api.js";
import { isInPeriod, periodOptionsHtml } from "../../date-period.js";

const PAGE_SIZE = 10;

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  server: svg(
    '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  ),
};

const FILTERS = ["Semua", "Transaksi", "Stok", "Shift", "Produk", "Pengguna"];
const COLUMNS = [
  ["Waktu", "au-c-time"],
  ["Pengguna", "au-c-user"],
  ["Aktivitas", "au-c-act"],
  ["Objek", ""],
  ["Detail", "au-c-detail"],
];
const ACTIONS = {
  sale_created: "Transaksi dibuat",
  sale_completed: "Transaksi selesai",
  sale_cancelled: "Pesanan dibatalkan",
  sale_force_cancelled: "Pesanan dibatalkan",
  system_auto_void: "Transaksi dibatalkan otomatis",
  payment_cancelled: "Pembayaran dibatalkan",
  payment_expired: "Pembayaran kedaluwarsa",
  payment_late_detected: "Pembayaran terlambat terdeteksi",
  payment_reconciliation_required: "Perlu rekonsiliasi pembayaran",
  payment_conflict_unverified: "Status pembayaran perlu diverifikasi",
  payment_session_creating: "Sesi pembayaran dibuat",
  payment_session_created: "Sesi pembayaran siap",
  payment_session_unknown: "Status sesi pembayaran belum diketahui",
  sale_cancellation_confirmed: "Pembatalan dikonfirmasi Midtrans",
  stock_adjusted: "Stok disesuaikan",
  stock_opname_completed: "Stock opname selesai",
  shift_opened: "Shift dibuka",
  shift_closed: "Shift ditutup",
  product_created: "Produk ditambahkan",
  product_updated: "Produk diperbarui",
  category_created: "Kategori ditambahkan",
  category_updated: "Kategori diperbarui",
  user_created: "Pengguna ditambahkan",
  user_updated: "Pengguna diperbarui",
};
const DETAIL_LABELS = {
  payment_method: "Metode",
  total: "Total",
  quantity: "Perubahan stok",
  reason: "Alasan",
  close_reason: "Alasan tutup",
  assigned_shift: "Shift",
  sku: "SKU",
  name: "Nama",
  username: "Username",
  changed_fields: "Kolom diubah",
  system_stock: "Stok sistem",
  new_system_stock: "Stok sistem baru",
  physical_stock: "Stok fisik",
  difference: "Selisih",
  source: "Sumber",
  provider_confirmation: "Konfirmasi Midtrans",
  reason_detail: "Keterangan",
};

const view = { logs: [], query: "", filter: "Semua", period: "all", page: 1, loading: true, error: false };

function categoryOf(log) {
  if (log.entity === "users") return "Pengguna";
  if (log.entity === "shifts") return "Shift";
  if (log.entity === "master_product" || log.entity === "categories") return "Produk";
  if (log.entity === "stock_opnames" || log.action.startsWith("stock_")) return "Stok";
  if (log.entity === "sales" || log.action.startsWith("payment_") || log.action.startsWith("sale_")) return "Transaksi";
  return "Produk";
}

function timestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function detailText(details = {}) {
  return Object.entries(details)
    .filter(([key, value]) => key !== "payment_order_id" && value !== null && value !== "")
    .map(([key, value]) => {
      const label = DETAIL_LABELS[key] || key.replaceAll("_", " ");
      const text = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
      return `${label}: ${text}`;
    })
    .join(" · ") || "—";
}

function periodLogs() {
  return view.logs.filter((log) => isInPeriod(log.created_at, view.period));
}

function selectedLogs() {
  const query = view.query.trim().toLocaleLowerCase("id-ID");
  return periodLogs().filter((log) => {
    if (view.filter !== "Semua" && categoryOf(log) !== view.filter) return false;
    const haystack = [
      log.user_name,
      ACTIONS[log.action] || log.action,
      log.entity,
      log.entity_id,
      detailText(log.details),
    ].join(" ").toLocaleLowerCase("id-ID");
    return !query || haystack.includes(query);
  });
}

function pageItems(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur - 1, cur, cur + 1]);
  if (cur <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (cur >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => set.add(n));
  const values = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const output = [];
  values.forEach((n, index) => {
    if (index && n - values[index - 1] > 1) output.push("…");
    output.push(n);
  });
  return output;
}

function shell() {
  return `
    <div class="pd-head">
      <div><h1>Log audit</h1><p>Riwayat perubahan transaksi, stok, shift, produk, dan pengguna.</p></div>
      <span class="au-wait" data-audit-count><span></span>Memuat aktivitas</span>
    </div>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input data-audit-search type="search" placeholder="Cari aktivitas atau pengguna" aria-label="Cari aktivitas atau pengguna" autocomplete="off" /></label>
      <label class="pd-period"><span>Periode</span><select data-audit-period aria-label="Filter periode log audit">${periodOptionsHtml(view.period)}</select></label>
      <div class="pd-chips" data-audit-filters role="group" aria-label="Filter aktivitas"></div>
    </section>
    <section class="pd-card">
      <div class="pd-scroll"><table class="pd-table au-table">
        <thead><tr>${COLUMNS.map(([label, cls]) => `<th class="${cls}">${label}</th>`).join("")}</tr></thead>
        <tbody data-audit-rows></tbody>
      </table></div>
      <div class="au-empty" data-audit-empty hidden></div>
      <div class="pd-foot" data-audit-pager></div>
    </section>`;
}

function render(root) {
  const periodItems = periodLogs();
  const logs = selectedLogs();
  const pages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), pages);
  const start = (view.page - 1) * PAGE_SIZE;
  const visibleLogs = logs.slice(start, start + PAGE_SIZE);
  const filters = root.querySelector("[data-audit-filters]");
  const rows = root.querySelector("[data-audit-rows]");
  const empty = root.querySelector("[data-audit-empty]");
  const count = root.querySelector("[data-audit-count]");
  const pager = root.querySelector("[data-audit-pager]");
  pager.hidden = !logs.length || view.loading || view.error;
  filters.innerHTML = FILTERS.map(
    (filter) => `<button type="button" class="pd-chip${view.filter === filter ? " on" : ""}" data-audit-filter="${filter}" aria-pressed="${view.filter === filter}">${filter}<i>${filter === "Semua" ? periodItems.length : periodItems.filter((log) => categoryOf(log) === filter).length}</i></button>`,
  ).join("");
  count.innerHTML = `<span></span>${view.loading ? "Memuat aktivitas" : `${periodItems.length} aktivitas`}`;
  count.classList.toggle("au-error", view.error);
  empty.hidden = logs.length > 0;
  rows.innerHTML = visibleLogs.map((log) => {
    const object = log.entity === "sales" ? "Transaksi" :
      log.entity === "master_product" ? "Produk" :
      log.entity === "stock_opnames" ? "Stock opname" :
      log.entity === "categories" ? "Kategori" :
      log.entity === "shifts" ? "Shift" :
      log.entity === "users" ? "Pengguna" : (log.entity || "Aktivitas");
    return `<tr>
      <td>${timestamp(log.created_at)}</td>
      <td>${esc(log.user_name || "Sistem")}</td>
      <td>${esc(ACTIONS[log.action] || log.action.replaceAll("_", " "))}</td>
      <td>${esc(object)}${log.entity_id ? `<small class="au-object-id">${esc(log.entity_id)}</small>` : ""}</td>
      <td>${esc(detailText(log.details))}</td>
    </tr>`;
  }).join("");
  const pageButton = (label, inner, page, disabled, active = false) =>
    `<button type="button" class="pd-pg${active ? " on" : ""}" data-audit-page="${page}" aria-label="${label}"${active ? ' aria-current="page"' : ""}${disabled ? " disabled" : ""}>${inner}</button>`;
  pager.innerHTML = logs.length
    ? `<span>Menampilkan ${start + 1}–${Math.min(start + PAGE_SIZE, logs.length)} dari ${logs.length} aktivitas</span>${pages > 1 ? `<nav class="pd-pager" aria-label="Halaman log audit">${pageButton("Halaman sebelumnya", icons.prev, view.page - 1, view.page === 1)}${pageItems(view.page, pages).map((page) => page === "…" ? '<span class="pd-gap">…</span>' : pageButton(`Halaman ${page}`, page, page, false, page === view.page)).join("")}${pageButton("Halaman berikutnya", icons.next, view.page + 1, view.page === pages)}</nav>` : ""}`
    : "";
  if (view.loading) {
    empty.hidden = false;
    empty.innerHTML = `<i>${icons.server}</i><b>Memuat log aktivitas</b><p>Mengambil riwayat dari database.</p>`;
  } else if (view.error) {
    empty.hidden = false;
    empty.innerHTML = `<i>${icons.server}</i><b>Log aktivitas gagal dimuat</b><p>Periksa koneksi backend, lalu muat ulang halaman.</p>`;
  } else if (!view.logs.length) {
    empty.hidden = false;
    empty.innerHTML = `<i>${icons.server}</i><b>Belum ada riwayat aktivitas</b><p>Aktivitas penting akan tercatat otomatis di sini.</p>`;
  } else if (!periodItems.length) {
    empty.hidden = false;
    empty.innerHTML = `<i>${icons.search}</i><b>Tidak ada aktivitas pada periode ini</b><p>Pilih periode lain untuk melihat log audit.</p>`;
  } else if (!logs.length) {
    empty.hidden = false;
    empty.innerHTML = `<i>${icons.search}</i><b>Tidak ada hasil</b><p>Coba kata kunci lain atau ubah filter aktivitas.</p>`;
  }
}

async function load(root) {
  view.loading = true;
  view.error = false;
  render(root);
  try {
    const response = await auditLogsRequest();
    view.logs = response.logs || [];
  } catch {
    view.logs = [];
    view.error = true;
  } finally {
    view.loading = false;
    render(root);
  }
}

export function audit() {
  return {
    view: "template",
    css: "product-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        const root = this.getNode();
        if (!root || root.dataset.auditBound) return;
        root.dataset.auditBound = "true";
        root.addEventListener("input", (event) => {
          if (event.target.matches("[data-audit-search]")) {
            view.query = event.target.value;
            view.page = 1;
            render(root);
          }
        });
        root.addEventListener("click", (event) => {
          const button = event.target.closest("[data-audit-filter]");
          if (button) {
            view.filter = button.dataset.auditFilter;
            view.page = 1;
            render(root);
            return;
          }
          const page = event.target.closest("[data-audit-page]");
          if (!page || page.disabled) return;
          view.page = Number(page.dataset.auditPage);
          render(root);
        });
        root.addEventListener("change", (event) => {
          if (!event.target.matches("[data-audit-period]")) return;
          view.period = event.target.value;
          view.page = 1;
          render(root);
        });
        void load(root);
      },
    },
  };
}
