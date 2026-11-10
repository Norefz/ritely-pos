/* ---------- Halaman Log audit ----------
   Riwayat aktivitas belum tersedia sampai backend tersambung, jadi halaman ini
   menampilkan kerangka (filter, kolom tabel, keadaan kosong) dan daftar
   aktivitas yang akan dicatat. Semua kontrol sengaja dinonaktifkan. */

const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  server: svg(
    '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  ),
  receipt: svg(
    '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M10 8h4M10 12h4"/>',
  ),
  swap: svg('<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  box: svg(
    '<path d="M12 2.5l8.5 4.7v9.6L12 21.5l-8.5-4.7V7.2z"/><path d="M3.8 7.2 12 12l8.2-4.8M12 12v9.5"/>',
  ),
};

const FILTERS = ["Semua", "Transaksi", "Stok", "Shift", "Produk"];
const COLUMNS = [
  ["Waktu", "au-c-time"],
  ["Pengguna", "au-c-user"],
  ["Aktivitas", "au-c-act"],
  ["Objek", ""],
  ["Detail", "au-c-detail"],
];
const PLANNED = [
  {
    icon: "receipt",
    tone: "blue",
    title: "Transaksi & void",
    text: "Pembuatan transaksi, pembayaran, dan pembatalan (void) beserta alasannya.",
  },
  {
    icon: "swap",
    tone: "green",
    title: "Perubahan stok",
    text: "Setiap penyesuaian stok dengan jumlah perubahan dan alasan yang dapat ditelusuri.",
  },
  {
    icon: "clock",
    tone: "amber",
    title: "Shift kasir",
    text: "Pembukaan, penutupan normal, dan penutupan paksa oleh Manajer.",
  },
  {
    icon: "box",
    tone: "purple",
    title: "Produk & harga",
    text: "Penambahan, perubahan harga, dan penonaktifan produk.",
  },
];

function shell() {
  return `
    <div class="pd-head">
      <div><h1>Log audit</h1><p>Riwayat aktivitas akan tersedia setelah backend tersambung.</p></div>
      <span class="au-wait"><span></span>Menunggu backend</span>
    </div>
    <section class="pd-card pd-filters au-off" aria-disabled="true">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari aktivitas atau pengguna" aria-label="Cari aktivitas" disabled /></label>
      <div class="pd-chips">${FILTERS.map(
        (f, i) =>
          `<button type="button" class="pd-chip${i ? "" : " on"}" disabled>${f}</button>`,
      ).join("")}</div>
    </section>
    <section class="pd-card">
      <div class="pd-scroll">
        <table class="pd-table au-table">
          <thead><tr>${COLUMNS.map(([label, cls]) => `<th class="${cls}">${label}</th>`).join("")}</tr></thead>
        </table>
      </div>
      <div class="au-empty">
        <i>${icons.server}</i>
        <b>Belum ada riwayat aktivitas</b>
        <p>Log audit akan terisi otomatis setelah backend tersambung. Perubahan penting akan tercatat lengkap dengan waktu dan pelakunya.</p>
      </div>
    </section>
    <div class="au-caption">Aktivitas yang akan dicatat</div>
    <div class="au-grid">${PLANNED.map(
      (p) =>
        `<div class="au-feat"><i class="${p.tone}">${icons[p.icon]}</i><b>${p.title}</b><p>${p.text}</p></div>`,
    ).join("")}</div>`;
}

export function audit() {
  return {
    view: "template",
    css: "product-page",
    borderless: true,
    template: shell,
  };
}
