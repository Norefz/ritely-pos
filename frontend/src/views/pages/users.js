import { escape } from "../../demo.js";
import { ApiError, apiRequest } from "../../api.js";
import { cashierAvatarSrc } from "../cashier-avatar.js";

const PAGE_SIZE = 10;
const view = { q: "", status: "all", page: 1 };
const SHIFTS = {
  shift_1: { name: "Shift 1", time: "07.00–15.00", icon: "sun", tone: "a" },
  shift_2: { name: "Shift 2", time: "15.00–22.00", icon: "moon", tone: "b" },
};

let cashierUsers = [];
let loadState = "loading";
let loadError = "";

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

function filtered() {
  const query = view.q.trim().toLowerCase();
  return cashierUsers.filter(
    (user) =>
      (view.status === "all" ||
        (view.status === "active" ? user.is_active : !user.is_active)) &&
      (!query ||
        `${user.name} ${user.username} ${user.employee_id}`
          .toLowerCase()
          .includes(query)),
  );
}

function pageItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2)
    [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));
  const numbers = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const result = [];
  numbers.forEach((page, index) => {
    if (index && page - numbers[index - 1] > 1) result.push("…");
    result.push(page);
  });
  return result;
}

function statsHtml() {
  const active = cashierUsers.filter((user) => user.is_active);
  const keys = Object.keys(SHIFTS);
  const covered = keys.filter((key) =>
    active.some((user) => user.assigned_shift === key),
  );
  const missing = keys.filter((key) => !covered.includes(key));
  return `
    <div class="pd-stat"><span>Total kasir</span><strong>${cashierUsers.length}</strong></div>
    <div class="pd-stat"><span>Aktif</span><strong>${active.length}</strong></div>
    <div class="pd-stat${missing.length ? " warn" : ""}"><span>Shift terisi</span><strong>${covered.length}/${keys.length}</strong></div>`;
}

function chipsHtml() {
  const active = cashierUsers.filter((user) => user.is_active).length;
  const chip = (value, label, count) =>
    `<button type="button" class="pd-chip${view.status === value ? " on" : ""}" data-act="status" data-value="${value}" aria-pressed="${view.status === value}">${label} <i>${count}</i></button>`;
  return (
    chip("all", "Semua", cashierUsers.length) +
    chip("active", "Aktif", active) +
    chip("inactive", "Nonaktif", cashierUsers.length - active)
  );
}

function slotHtml(key) {
  const shift = SHIFTS[key];
  return shift
    ? `<span class="us-slot ${shift.tone}">${icons[shift.icon]}${shift.name} · ${shift.time} WIB</span>`
    : '<span class="us-none">Belum ditugaskan</span>';
}

function rowHtml(user) {
  return `<tr>
    <td><div class="pd-name"><img class="us-avatar" src="${cashierAvatarSrc(user)}" alt="" aria-hidden="true" loading="lazy">
      <div class="us-who"><b>${escape(user.name)}</b><small>Kasir</small></div></div></td>
    <td><span class="us-id">${escape(user.employee_id || "Belum ada")}</span></td>
    <td class="us-handle">@${escape(user.username)}</td>
    <td>${slotHtml(user.assigned_shift)}</td>
    <td><span class="pd-status ${user.is_active ? "on" : "off"}">${user.is_active ? "Aktif" : "Nonaktif"}</span></td>
    <td class="pd-act"><button type="button" class="pd-edit" data-act="edit" data-id="${escape(String(user.id))}" aria-label="Ubah ${escape(user.name)}">${icons.pencil}Ubah</button></td>
  </tr>`;
}

function listHtml(rows) {
  if (loadState === "loading")
    return '<tr><td colspan="6" class="pd-empty" role="status">Memuat akun kasir…</td></tr>';
  if (loadState === "error")
    return `<tr><td colspan="6" class="pd-empty">${escape(loadError || "Daftar kasir gagal dimuat.")} <button type="button" class="pd-edit" data-act="retry">Coba lagi</button></td></tr>`;
  return rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="6" class="pd-empty">${cashierUsers.length ? "Tidak ada akun yang cocok dengan pencarian atau filter ini." : "Belum ada akun kasir."}</td></tr>`;
}

function footHtml(total, pages, from, to) {
  const text = total
    ? `Menampilkan ${from}–${to} dari ${total} akun`
    : "Menampilkan 0 akun";
  if (pages < 2) return `<span>${text}</span>`;
  const button = (label, inner, page, disabled, current) =>
    `<button type="button" class="pd-pg${current ? " on" : ""}" data-act="page" data-page="${page}" aria-label="${label}"${current ? ' aria-current="page"' : ""}${disabled ? " disabled" : ""}>${inner}</button>`;
  const numbers = pageItems(view.page, pages)
    .map((page) =>
      page === "…"
        ? '<span class="pd-gap">…</span>'
        : button(`Halaman ${page}`, page, page, false, page === view.page),
    )
    .join("");
  return `<span>${text}</span>
    <nav class="pd-pager" aria-label="Halaman akun kasir">
      ${button("Halaman sebelumnya", icons.prev, view.page - 1, view.page === 1, false)}
      ${numbers}
      ${button("Halaman berikutnya", icons.next, view.page + 1, view.page === pages, false)}
    </nav>`;
}

function shell() {
  return `
    <div class="pd-head">
      <div><h1>Akun kasir</h1><p>Kelola akun, ID karyawan, dan penugasan shift.</p></div>
      <button type="button" class="pd-add" data-act="add">${icons.plus}Tambah kasir</button>
    </div>
    <section class="pd-card pd-stats" data-part="stats">${statsHtml()}</section>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari nama, username, atau ID karyawan" value="${escape(view.q)}" aria-label="Cari akun kasir" autocomplete="off" /></label>
      <div class="pd-chips" data-part="chips" role="group" aria-label="Filter status akun">${chipsHtml()}</div>
    </section>
    <section class="pd-card">
      <div class="pd-scroll">
        <table class="pd-table us-table">
          <thead><tr>
            <th>Nama kasir</th><th class="us-c-id">ID karyawan</th><th class="us-c-user">Username</th><th class="us-c-slot">Penugasan</th>
            <th class="us-c-status">Status</th><th class="us-c-act"><span class="pd-sr">Aksi</span></th>
          </tr></thead>
          <tbody data-part="list"></tbody>
        </table>
      </div>
      <div class="pd-foot" data-part="foot"></div>
    </section>
    <p class="pd-note">${icons.info}ID karyawan dibuat otomatis. Kata sandi tidak ditampilkan.</p>`;
}

function paint(root) {
  if (!root.isConnected) return;
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), pages);
  const start = (view.page - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const set = (part, html) => {
    const element = root.querySelector(`[data-part="${part}"]`);
    if (element) element.innerHTML = html;
  };
  set("stats", statsHtml());
  set("chips", chipsHtml());
  set("list", listHtml(slice));
  set("foot", footHtml(rows.length, pages, start + 1, start + slice.length));
}

function apiErrorMessage(error) {
  if (!(error instanceof ApiError)) return "Terjadi kesalahan. Coba lagi.";
  if (error.status === 0) return "Tidak dapat terhubung ke backend.";
  if (error.status === 401) return "Sesi login habis. Keluar lalu login kembali.";
  if (error.status === 403) return "Hanya manager yang dapat mengelola akun kasir.";
  if (error.code === "username_taken") return "Username sudah digunakan.";
  if (error.code === "invalid_user") return "Periksa nama, password, dan penugasan shift.";
  if (error.code === "cashier_not_found") return "Akun kasir tidak ditemukan.";
  if (error.code === "database_unavailable") return "Database belum dapat diakses.";
  return "Permintaan gagal. Coba lagi.";
}

async function loadUsers(root) {
  loadState = "loading";
  loadError = "";
  paint(root);
  try {
    const result = await apiRequest("/api/users");
    cashierUsers = result.users
      .filter((user) => user.role === "cashier")
      .map((user) => ({ ...user, is_active: Boolean(user.is_active) }));
    loadState = "ready";
  } catch (error) {
    loadState = "error";
    loadError = apiErrorMessage(error);
  }
  paint(root);
}

function openEditor(root, user = null) {
  const isEditing = Boolean(user);
  const elements = [
    { view: "text", name: "name", label: "Nama", required: true },
    ...(isEditing
      ? [
          {
            view: "text",
            name: "username",
            label: "Username",
            readonly: true,
          },
        ]
      : [
          { view: "text", name: "username", label: "Username", required: true },
          {
            view: "text",
            type: "password",
            name: "password",
            label: "Kata sandi",
            required: true,
          },
        ]),
    {
      view: "richselect",
      name: "assigned_shift",
      label: "Penugasan shift",
      required: true,
      options: [
        { id: "shift_1", value: "Shift 1 · 07.00–15.00" },
        { id: "shift_2", value: "Shift 2 · 15.00–22.00" },
      ],
    },
    ...(isEditing
      ? [
          {
            view: "checkbox",
            name: "is_active",
            labelRight: "Akun aktif",
            labelWidth: 0,
          },
          {
            view: "text",
            type: "password",
            name: "password",
            label: "Kata sandi baru (opsional)",
          },
        ]
      : []),
    {
      cols: [
        {
          view: "button",
          value: "Batal",
          click: () => windowView.close(),
        },
        {
          view: "button",
          id: "cashierEditorSave",
          value: isEditing ? "Simpan perubahan" : "Buat akun",
          css: "webix_primary",
          click: save,
        },
      ],
    },
  ];

  let windowView;
  let form;
  async function save() {
    if (!form.validate()) return;
    const values = form.getValues();
    const saveButton = $$('cashierEditorSave');
    saveButton.disable();
    try {
      if (isEditing) {
        const changes = {
          name: values.name.trim(),
          assigned_shift: values.assigned_shift,
          is_active: values.is_active === true || values.is_active === 1 || values.is_active === "1",
        };
        if (values.password) changes.password = values.password;
        await apiRequest(`/api/users/${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          body: JSON.stringify(changes),
        });
      } else {
        await apiRequest("/api/users", {
          method: "POST",
          body: JSON.stringify({
            name: values.name.trim(),
            username: values.username.trim(),
            password: values.password,
            assigned_shift: values.assigned_shift,
          }),
        });
      }
      windowView.close();
      webix.message({
        type: "success",
        text: isEditing ? "Akun kasir diperbarui." : "Akun kasir berhasil dibuat.",
      });
      await loadUsers(root);
    } catch (error) {
      webix.message({ type: "error", text: apiErrorMessage(error) });
      saveButton.enable();
    }
  }

  windowView = webix.ui({
    view: "window",
    modal: true,
    position: "center",
    width: Math.min(520, window.innerWidth - 24),
    head: isEditing ? "Ubah akun kasir" : "Tambah kasir",
    body: {
      view: "form",
      id: "cashierEditorForm",
      padding: 24,
      elementsConfig: { labelPosition: "top" },
      elements,
    },
  });
  form = $$("cashierEditorForm");
  form.setValues(
    isEditing
      ? {
          name: user.name,
          username: user.username,
          assigned_shift: user.assigned_shift,
          is_active: user.is_active ? 1 : 0,
        }
      : { assigned_shift: "shift_1" },
  );
  windowView.show();
}

function bind(root) {
  if (root._usBound) return;
  root._usBound = true;
  root.addEventListener("click", (event) => {
    const element = event.target.closest("[data-act]");
    if (!element || element.disabled) return;
    const action = element.dataset.act;
    if (action === "add") return openEditor(root);
    if (action === "retry") return loadUsers(root);
    if (action === "edit") {
      const user = cashierUsers.find((item) => String(item.id) === element.dataset.id);
      if (user) openEditor(root, user);
      return;
    }
    if (action === "status") {
      view.status = element.dataset.value;
      view.page = 1;
    } else if (action === "page") {
      view.page = Number(element.dataset.page);
    }
    paint(root);
  });
  root.addEventListener("input", (event) => {
    if (!event.target.matches(".pd-search input")) return;
    view.q = event.target.value;
    view.page = 1;
    paint(root);
  });
}

export function users() {
  return {
    view: "template",
    css: "product-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        const root = this.$view;
        bind(root);
        paint(root);
        loadUsers(root);
      },
    },
  };
}
