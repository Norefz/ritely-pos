/* ---------- Halaman Login (FE demo) ----------
   Satu form untuk Manajer dan Admin: keduanya digabung menjadi satu role
   "manager" (SRS: role Admin terpisah tidak termasuk MVP).
   Ini hanya validasi sisi browser untuk mode demo. Saat backend tersambung,
   ganti isi `authenticate` dengan panggilan API. */

export const LOGIN_ROLE = "manager";
const DEMO_PASSWORD = "ritely123";
const ACCOUNTS = { manajer: DEMO_PASSWORD, admin: DEMO_PASSWORD };

const authenticate = (username, password) =>
  Object.hasOwn(ACCOUNTS, username) && ACCOUNTS[username] === password;

const svg = (path) =>
  `<svg class="lg-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  cart: svg(
    '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2.5l2.2 10.5h10.3L20 8H6.5"/>',
  ),
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
        <div class="lg-brand"><i>${icons.cart}</i>Ritely</div>
        <div class="lg-pitch">
          <h1>Kelola toko Anda dari satu tempat.</h1>
          <ul>${FEATURES.map((f) => `<li>${icons.check}${f}</li>`).join("")}</ul>
        </div>
        <p class="lg-foot">Toko utama · Register 01 · Asia/Jakarta</p>
      </aside>
      <main class="lg-main">
        <div class="lg-card">
          <span class="lg-role">Untuk Manajer dan Admin</span>
          <h2>Masuk ke Ritely</h2>
          <p class="lg-sub">Gunakan akun manajemen untuk membuka dasbor, produk, stok, dan laporan.</p>
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
          <div class="lg-demo">
            <div>${icons.info}<span>Mode demo · akun contoh <b>manajer</b> atau <b>admin</b>, kata sandi <b>${DEMO_PASSWORD}</b></span></div>
            <button type="button" class="lg-fill" data-act="fill">Isi otomatis</button>
          </div>
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
    } else if (el.dataset.act === "fill") {
      field("username").value = "manajer";
      field("password").value = DEMO_PASSWORD;
      showError(root, "");
      field("password").focus();
    }
  });
  root.addEventListener("input", () => showError(root, ""));
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = field("username").value.trim().toLowerCase();
    const password = field("password").value;
    if (!username || !password)
      return showError(root, "Isi username dan kata sandi.");
    if (!authenticate(username, password)) {
      showError(root, "Username atau kata sandi salah.");
      field("password").value = "";
      field("password").focus();
      return;
    }
    onSuccess(LOGIN_ROLE, { username });
  });
}

/* Pemakaian:
   webix.ui(login((role, user) => { state.role = role; ...mulai aplikasi... }));
   `role` selalu "manager" untuk akun manajer maupun admin. */
export function login(onSuccess = () => {}) {
  return {
    view: "template",
    css: "login-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        bind(this.$view, onSuccess);
        this.$view.querySelector('input[name="username"]')?.focus();
      },
    },
  };
}
