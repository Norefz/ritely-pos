import { ApiError, loginRequest, warmBackendRequest } from "../../api.js";

const svg = (path) =>
  `<svg class="lg-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  eye: svg(
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ),
  eyeOff: svg(
    '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  ),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};

const FEATURES = [
  "Katalog produk dan persediaan stok",
  "Shift dan transaksi kasir",
  "Laporan penjualan harian",
];

function shell() {
  return `
    <div class="lg-wrap">
      <aside class="lg-side">
        <div class="lg-brand"><i><img src="./assets/images/ritely-cart-icon.png" alt=""></i><img class="lg-wordmark" src="./assets/images/ritely-wordmark.png" alt="Ritely"></div>
        <div class="lg-pitch">
          <h1>Kelola toko Anda dari satu tempat.</h1>
          <ul>${FEATURES.map((f) => `<li>${icons.check}${f}</li>`).join("")}</ul>
        </div>
        <p class="lg-foot">Toko utama · Register 01 · Asia/Jakarta</p>
      </aside>
      <main class="lg-main">
        <div class="lg-card">
          <span class="lg-role">Untuk Manajer dan Kasir</span>
          <h2>Masuk ke Ritely</h2>
          <p class="lg-sub">Masuk dengan akun Manajer atau Kasir untuk melanjutkan.</p>
          <form class="lg-form" novalidate>
            <div class="lg-error" data-part="error" role="alert" hidden></div>
            <label class="lg-field"><span>Username</span>
              <input name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Masukkan username" />
            </label>
            <label class="lg-field"><span>Kata sandi</span>
              <span class="lg-pass">
                <input name="password" type="password" autocomplete="current-password" placeholder="Masukkan kata sandi" />
                <button type="button" class="lg-eye" data-act="toggle" aria-label="Tampilkan kata sandi" aria-pressed="false">${icons.eye}</button>
              </span>
            </label>
            <button type="submit" class="lg-submit">Masuk</button>
          </form>
          <div class="lg-demo"><div>${icons.info}<span>Gunakan akun yang terdaftar untuk masuk.</span></div></div>
        </div>
      </main>
    </div>`;
}

function showError(root, text) {
  const el = root.querySelector('[data-part="error"]');
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}

function bind(root, onSuccess) {
  if (root._lgBound) return;
  root._lgBound = true;
  const field = (name) => root.querySelector(`input[name="${name}"]`);
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "toggle") {
      const pass = field("password");
      const show = pass.type === "password";
      pass.type = show ? "text" : "password";
      el.setAttribute("aria-pressed", String(show));
      el.setAttribute(
        "aria-label",
        show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi",
      );
      el.innerHTML = show ? icons.eyeOff : icons.eye;
    }
  });
  root.addEventListener("input", () => showError(root, ""));
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = field("username").value.trim().toLowerCase();
    const password = field("password").value;
    if (!username || !password)
      return showError(root, "Isi username dan kata sandi.");
    const submit = root.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Memeriksa…";
    showError(root, "");
    try {
      const user = await loginRequest(username, password);
      await onSuccess(user);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 401
          ? "Username atau kata sandi salah, atau akun tidak aktif."
          : error instanceof ApiError && error.status === 503
            ? "Layanan login belum siap. Periksa konfigurasi backend dan database."
            : "Tidak dapat terhubung ke server. Pastikan backend sedang berjalan.";
      showError(root, message);
      field("password").value = "";
      field("password").focus();
    } finally {
      submit.disabled = false;
      submit.textContent = "Masuk";
    }
  });
}

/* Pemakaian:
   webix.ui(login((user) => { state.role = user.role; ...mulai aplikasi... }));
   User berasal dari respons backend dan memiliki role "manager" atau "cashier". */
export function login(onSuccess = () => {}) {
  return {
    view: "template",
    css: "login-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        bind(this.$view, onSuccess);
        warmBackendRequest().catch(() => {});
        this.$view.querySelector('input[name="username"]')?.focus();
      },
    },
  };
}
