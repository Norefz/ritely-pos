import { state, money, date, completed, uid, escape } from "../../demo.js";
import { editor } from "./common.js";

/* ---------- Halaman Shift kasir: konfigurasi & helper ---------- */
const PAGE_SIZE = 10;
const view = { page: 1 }; // halaman riwayat bertahan saat refresh() membangun ulang halaman

const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  lock: svg(
    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ),
  play: svg('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  moon: svg(
    '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  ),
  hist: svg(
    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',
  ),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};

const SCHEDULE = [
  {
    icon: "sun",
    tone: "sun",
    name: "Shift 1",
    time: "07.00–15.00",
    length: "8 jam",
  },
  {
    icon: "moon",
    tone: "moon",
    name: "Shift 2",
    time: "15.00–22.00",
    length: "7 jam",
  },
];

const salesOf = (shift) =>
  completed()
    .filter((s) => s.shift_id === shift.id)
    .reduce((n, s) => n + s.total, 0);

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
function statsHtml() {
  const total = state.shifts.reduce((n, s) => n + salesOf(s), 0);
  return `
    <div class="pd-stat"><i class="pd-stat-icon blue">${svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')}</i><span>Shift terbuka</span><strong>${state.shift ? 1 : 0}</strong></div>
    <div class="pd-stat"><i class="pd-stat-icon green">${svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>')}</i><span>Shift tercatat</span><strong>${state.shifts.length}</strong></div>
    <div class="pd-stat"><i class="pd-stat-icon orange">${svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>')}</i><span>Total penjualan</span><strong>${money(total)}</strong></div>`;
}
function scheduleHtml() {
  return SCHEDULE.map(
    (s) => `<div class="sh-slot">
      <i class="sh-slot-ico ${s.tone}">${icons[s.icon]}</i>
      <div><b>${s.name}</b><span>${s.time} WIB · ${s.length}</span></div>
      <em class="sh-tag">Terjadwal</em></div>`,
  ).join("");
}
function statusHtml() {
  const open = !!state.shift;
  const manager = state.role === "manager";
  const cashier = state.role === "cashier";
  const action = open
    ? `<button type="button" class="sh-btn${manager ? " danger" : " primary"}" data-act="close">${manager ? "Tutup paksa demo" : "Tutup shift demo"}</button>`
    : cashier
      ? `<button type="button" class="sh-btn primary" data-act="open">${icons.play}Buka shift demo</button>`
      : "";
  const title = open ? "Shift demo sedang berjalan" : "Belum ada shift terbuka";
  const sub = open
    ? `${escape(state.shift.cashier || "Dina Pratiwi")} · Dibuka ${escape(date(state.shift.opened_at))}`
    : cashier
      ? "Buka shift untuk mulai mencatat transaksi."
      : "Transaksi kasir baru bisa dicatat setelah seorang kasir membuka shift.";
  const note = open
    ? manager
      ? "Penutupan paksa oleh Manajer wajib disertai alasan dan akan tercatat pada riwayat."
      : "Pastikan keranjang kosong sebelum menutup shift."
    : cashier
      ? "Mode demo: shift dapat dibuka dan ditutup kapan saja."
      : "Shift dibuka oleh kasir dari halaman Kasir. Manajer dapat melakukan penutupan paksa saat shift berjalan.";
  return `
    <div class="sh-state${open ? " open" : ""}">
      <i class="sh-state-ico">${open ? icons.play : icons.lock}</i>
      <div class="sh-state-text"><h2>${title}</h2><p>${sub}</p></div>
      <span class="sh-badge${open ? " good" : ""}"><span></span>${open ? "Berjalan" : "Tutup"}</span>
      ${action}
    </div>
    <div class="sh-caption">Jadwal shift</div>
    <div class="sh-slots">${scheduleHtml()}</div>
    <div class="sh-note">${icons.info}${note}</div>`;
}
function rowHtml(s) {
  const open = s.status === "open";
  return `<tr>
    <td><b class="sh-who">${escape(s.cashier)}</b></td>
    <td>${escape(date(s.opened_at))}</td>
    <td>${s.closed_at ? escape(date(s.closed_at)) : "—"}${s.reason ? `<small class="sh-reason" title="${escape(s.reason)}">Alasan: ${escape(s.reason)}</small>` : ""}</td>
    <td><span class="state-tag${open ? " good" : ""}">${open ? "Terbuka" : "Ditutup"}</span></td>
    <td class="pd-r sh-money">${money(salesOf(s))}</td>
  </tr>`;
}
function historyHtml() {
  const all = [...state.shifts].reverse(); // terbaru di atas
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), pages);
  const start = (view.page - 1) * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);
  const body = all.length
    ? `<div class="pd-scroll"><table class="pd-table sh-table">
        <thead><tr><th>Kasir</th><th class="sh-c-time">Dibuka (WIB)</th><th class="sh-c-closed">Ditutup (WIB)</th>
        <th class="sh-c-status">Status</th><th class="sh-c-money pd-r">Total penjualan</th></tr></thead>
        <tbody>${slice.map(rowHtml).join("")}</tbody></table></div>`
    : `<div class="sh-empty"><i>${icons.hist}</i><b>Belum ada riwayat shift</b>
        <p>Shift yang dibuka dan ditutup kasir akan tercatat di sini.</p></div>`;
  let foot = "";
  if (pages > 1) {
    const btn = (label, inner, page, disabled, on) =>
      `<button type="button" class="pd-pg${on ? " on" : ""}" data-act="page" data-page="${page}" aria-label="${label}"${on ? ' aria-current="page"' : ""}${disabled ? " disabled" : ""}>${inner}</button>`;
    const nums = pageItems(view.page, pages)
      .map((n) =>
        n === "…"
          ? '<span class="pd-gap">…</span>'
          : btn(`Halaman ${n}`, n, n, false, n === view.page),
      )
      .join("");
    foot = `<div class="pd-foot"><span>Menampilkan ${start + 1}–${start + slice.length} dari ${all.length} shift</span>
      <nav class="pd-pager" aria-label="Halaman riwayat shift">
        ${btn("Halaman sebelumnya", icons.prev, view.page - 1, view.page === 1)}${nums}
        ${btn("Halaman berikutnya", icons.next, view.page + 1, view.page === pages)}
      </nav></div>`;
  }
  return `<div class="sh-hist-head"><div><h2>Riwayat shift</h2><p>Catatan pembukaan dan penutupan shift kasir.</p></div>
      <em class="sh-tag">${all.length} shift</em></div>${body}${foot}`;
}

function shell() {
  return `
    <div class="pd-head">
      <div><h1>Shift kasir</h1><p>Mode demo: pembukaan dan penutupan bebas waktu. Hanya satu shift terbuka.</p></div>
    </div>
    <section class="pd-card pd-stats">${statsHtml()}</section>
    <section class="pd-card sh-panel">${statusHtml()}</section>
    <section class="pd-card" data-part="history">${historyHtml()}</section>`;
}

function bind(root, actions) {
  if (root._shBound) return;
  root._shBound = true;
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (act === "page") {
      view.page = +el.dataset.page;
      const part = root.querySelector('[data-part="history"]');
      if (part) part.innerHTML = historyHtml();
    } else if (actions[act]) actions[act]();
  });
}

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
  const actions = {
    open() {
      const s = {
        id: uid(),
        cashier: "Dina Pratiwi",
        status: "open",
        opened_at: new Date().toISOString(),
      };
      state.shift = s;
      state.shifts.push(s);
      view.page = 1;
      refresh();
    },
    close() {
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
  };
  return {
    view: "template",
    css: "product-page shift-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        bind(this.$view, actions);
      },
    },
  };
}
