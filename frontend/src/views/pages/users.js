import { state, uid, escape } from "../../demo.js";
import { editor } from "./common.js";

/* ---------- Halaman Akun kasir: konfigurasi & helper ---------- */
const PAGE_SIZE = 10;
// Filter bertahan selama sesi, termasuk saat refresh() membangun ulang halaman.
const view = { q: "", status: "all", page: 1 };
const TONES = ["", "orange", "purple", "green"]; // warna avatar bergantian per akun

const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  pencil: svg(
    '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  ),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  moon: svg(
    '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  ),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};

const SHIFTS = {
  shift_1: { name: "Shift 1", time: "07.00–15.00", icon: "sun", tone: "a" },
  shift_2: { name: "Shift 2", time: "15.00–22.00", icon: "moon", tone: "b" },
};

function initials(name) {
  const w = name.trim().split(/\s+/);
  return (
    w.length > 1 ? w[0][0] + w[1][0] : name.trim().slice(0, 2)
  ).toUpperCase();
}
function tone(user) {
  const i = state.users.indexOf(user);
  return TONES[(i < 0 ? 0 : i) % TONES.length];
}
function filtered() {
  const q = view.q.trim().toLowerCase();
  return state.users.filter(
    (u) =>
      (view.status === "all" ||
        (view.status === "active" ? u.active : !u.active)) &&
      (!q || (u.name + " " + u.username).toLowerCase().includes(q)),
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
function statsHtml() {
  const active = state.users.filter((u) => u.active);
  const keys = Object.keys(SHIFTS);
  const covered = keys.filter((k) =>
    active.some((u) => u.assigned_shift === k),
  );
  const missing = keys
    .filter((k) => !covered.includes(k))
    .map((k) => SHIFTS[k].name);
  return `
    <div class="pd-stat"><span>Total kasir</span><strong>${state.users.length}</strong><small>Profil contoh</small></div>
    <div class="pd-stat"><span>Aktif</span><strong>${active.length}</strong><small>Dapat bertugas di shift</small></div>
    <div class="pd-stat${missing.length ? " warn" : ""}"><span>Shift terisi</span><strong>${covered.length}/${keys.length}</strong>
      <small>${missing.length ? `${escape(missing.join(" dan "))} belum punya kasir aktif` : "Shift 1 dan Shift 2 punya kasir"}</small></div>`;
}
function chipsHtml() {
  const active = state.users.filter((u) => u.active).length;
  const chip = (value, label, count) =>
    `<button type="button" class="pd-chip${view.status === value ? " on" : ""}" data-act="status" data-value="${value}" aria-pressed="${view.status === value}">${label} <i>${count}</i></button>`;
  return (
    chip("all", "Semua", state.users.length) +
    chip("active", "Aktif", active) +
    chip("inactive", "Nonaktif", state.users.length - active)
  );
}
function slotHtml(key) {
  const s = SHIFTS[key];
  return s
    ? `<span class="us-slot ${s.tone}">${icons[s.icon]}${s.name} · ${s.time} WIB</span>`
    : '<span class="us-none">Belum ditugaskan</span>';
}
function rowHtml(u) {
  return `<tr>
    <td><div class="pd-name"><i class="pd-av ${tone(u)}">${escape(initials(u.name))}</i>
      <div class="us-who"><b>${escape(u.name)}</b><small>Kasir</small></div></div></td>
    <td class="us-handle">@${escape(u.username)}</td>
    <td>${slotHtml(u.assigned_shift)}</td>
    <td><span class="pd-status ${u.active ? "on" : "off"}">${u.active ? "Aktif" : "Nonaktif"}</span></td>
    <td class="pd-act"><button type="button" class="pd-edit" data-act="edit" data-id="${escape(String(u.id))}" aria-label="Ubah ${escape(u.name)}">${icons.pencil}Ubah</button></td>
  </tr>`;
}
function listHtml(rows) {
  return rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="5" class="pd-empty">Tidak ada akun yang cocok dengan pencarian atau filter ini.</td></tr>`;
}
function footHtml(total, pages, from, to) {
  const text = total
    ? `Menampilkan ${from}–${to} dari ${total} akun`
    : "Menampilkan 0 akun";
  if (pages < 2) return `<span>${text}</span>`;
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
    <nav class="pd-pager" aria-label="Halaman akun kasir">
      ${btn("Halaman sebelumnya", icons.prev, view.page - 1, view.page === 1)}
      ${nums}
      ${btn("Halaman berikutnya", icons.next, view.page + 1, view.page === pages)}
    </nav>`;
}

function shell() {
  return `
    <div class="pd-head">
      <div><h1>Akun kasir</h1><p>Data profil contoh. Tidak membuat akun login atau menyimpan password.</p></div>
      <button type="button" class="pd-add" data-act="add">${icons.plus}Tambah akun demo</button>
    </div>
    <section class="pd-card pd-stats" data-part="stats">${statsHtml()}</section>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari nama atau username" value="${escape(view.q)}" aria-label="Cari akun kasir" autocomplete="off" /></label>
      <div class="pd-chips" data-part="chips" role="group" aria-label="Filter status akun">${chipsHtml()}</div>
    </section>
    <section class="pd-card">
      <div class="pd-scroll">
        <table class="pd-table us-table">
          <thead><tr>
            <th>Nama kasir</th><th class="us-c-user">Username</th><th class="us-c-slot">Penugasan</th>
            <th class="us-c-status">Status</th><th class="us-c-act"><span class="pd-sr">Aksi</span></th>
          </tr></thead>
          <tbody data-part="list"></tbody>
        </table>
      </div>
      <div class="pd-foot" data-part="foot"></div>
    </section>
    <p class="pd-note">${icons.info}Akun contoh hanya profil; tidak ada login maupun password.</p>`;
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
  set("stats", statsHtml());
  set("chips", chipsHtml());
  set("list", listHtml(slice));
  set("foot", footHtml(rows.length, pages, start + 1, start + slice.length));
}

function bind(root, edit) {
  if (root._usBound) return;
  root._usBound = true;
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (act === "add") return edit();
    if (act === "edit")
      return edit(state.users.find((u) => String(u.id) === el.dataset.id));
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

export function users(refresh) {
  function edit(user = { active: true, assigned_shift: "shift_1" }) {
    editor(
      user.id ? "Ubah akun kasir demo" : "Tambah akun kasir demo",
      [
        { view: "text", name: "name", label: "Nama", required: true },
        { view: "text", name: "username", label: "Username", required: true },
        {
          view: "richselect",
          name: "assigned_shift",
          label: "Penugasan shift",
          options: [
            { id: "shift_1", value: "Shift 1 · 07.00–15.00" },
            { id: "shift_2", value: "Shift 2 · 15.00–22.00" },
          ],
        },
        {
          view: "checkbox",
          name: "active",
          labelRight: "Akun aktif",
          labelWidth: 0,
        },
      ],
      user,
      (v) => {
        if (
          !v.name.trim() ||
          !v.username.trim() ||
          state.users.some((u) => u.username === v.username && u.id !== user.id)
        ) {
          webix.message({
            type: "error",
            text: "Isi nama dan username yang unik.",
          });
          return false;
        }
        const value = { ...v, id: user.id || uid(), active: !!+v.active };
        if (user.id) Object.assign(user, value);
        else state.users.push(value);
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
        bind(this.$view, edit);
      },
    },
  };
}
