import { state } from "./demo.js";
import { sidebar, menus } from "./views/layout/sidebar.js";
import { navbar } from "./views/layout/navbar.js";
import { dashboard } from "./views/pages/dashboard.js";
import { products, categories } from "./views/pages/product.js";
import { stock } from "./views/pages/stock.js";
import { pos } from "./views/pages/pos.js";
import { transactions } from "./views/pages/transactions.js";
import { shifts } from "./views/pages/shifts.js";
import { myShifts } from "./views/pages/my-shifts.js";
import { reports } from "./views/pages/reports.js";
import { users } from "./views/pages/users.js";
import { audit } from "./views/pages/audit.js";
import { login } from "./views/pages/login.js";
import {
  ApiError,
  clearAccessToken,
  currentUserRequest,
  hasAccessToken,
  logoutRequest,
  shiftsRequest,
} from "./api.js";
let current = "dashboard";
const factories = {
  dashboard: () => dashboard(navigate),
  products: () => products(refresh),
  categories: () => categories(refresh),
  stock: () => stock(refresh),
  pos: () => pos(refresh),
  transactions,
  shifts: () =>
    state.role === "cashier" ? myShifts(refresh) : shifts(refresh),
  reports,
  users: () => users(refresh),
  audit,
};
function refresh() {
  const host = $$("contentHost");
  const oldPage = host.getChildViews()[0];
  if (oldPage) host.removeView(oldPage);
  host.addView({ padding: 24, margin: 16, ...factories[current]() });
  requestAnimationFrame(() => {
    const page = host.getChildViews()[0];
    if (page?.scrollTo) page.scrollTo(0, 0);
  });
  $$("pageTitle").setValue(
    menus[state.role].find(([id]) => id === current)?.[1] || "Ritely",
  );
}
function navigate(id) {
  if (!menus[state.role].some(([key]) => key === id)) return;
  current = id;
  refresh();
  if ($$("navigation").getSelectedId() !== id) $$("navigation").select(id);
  history.replaceState(null, "", "#" + id);
  if (innerWidth < 900) $$("sidebar").hide();
}
function logout() {
  const finishLogout = async () => {
    try {
      await logoutRequest();
    } catch {
      // Hapus token lokal juga jika backend sementara tidak dapat dijangkau.
    }
    history.replaceState(null, "", location.pathname);
    window.location.reload();
  };
  if (state.cart.length) {
    webix
      .confirm("Keranjang demo akan dikosongkan. Keluar dari akun?")
      .then(finishLogout)
      .catch(() => {});
    return;
  }
  finishLogout();
}
function mountApplication() {
  document.getElementById("app").replaceChildren();
  webix.ui({
    container: "app",
    id: "shell",
    cols: [
      sidebar(state.role, navigate),
      {
        rows: [
          navbar(state.role, logout),
          {
            view: "template",
            height: 42,
            css: "demo-banner",
            borderless: true,
            template: state.shiftLoadError
              ? "Shift gagal dimuat dari backend · Periksa koneksi, lalu muat ulang halaman."
              : "Login dan shift terhubung ke backend · Data produk, stok, dan transaksi masih demo.",
          },
          { view: "layout", id: "contentHost", rows: [] },
        ],
      },
    ],
  });
  navigate(
    menus[state.role].some(([id]) => id === location.hash.slice(1))
      ? location.hash.slice(1)
      : "dashboard",
  );
  const resize = () => {
    const shell = $$("shell");
    shell.define("width", innerWidth);
    shell.define("height", innerHeight);
    shell.resize();
  };
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("hashchange", () =>
    navigate(location.hash.slice(1)),
  );
}

function mountLogin() {
  document.getElementById("app").replaceChildren();
  webix.ui({
    container: "app",
    id: "loginScreen",
    rows: [
      login(async (user) => {
        state.currentUser = user;
        state.role = user.role;
        await hydrateShifts();
        $$("loginScreen").destructor();
        mountApplication();
      }),
    ],
  });
}

async function hydrateShifts() {
  try {
    const snapshot = await shiftsRequest();
    state.shift = snapshot.open_shift || null;
    state.shifts = snapshot.shifts || [];
    state.shiftLoadError = false;
  } catch {
    state.shift = null;
    state.shifts = [];
    state.shiftLoadError = true;
  }
}

function mountSessionRecovery(error) {
  const message =
    error instanceof ApiError && error.status === 0
      ? "Backend belum dapat dijangkau. Sesi tetap disimpan; coba lagi setelah backend berjalan."
      : "Sesi belum dapat diverifikasi. Periksa koneksi backend dan database, lalu coba lagi.";
  const root = document.getElementById("app");
  root.innerHTML = `
    <main class="session-recovery" role="alert">
      <section class="session-recovery-card">
        <h1>Memulihkan sesi</h1>
        <p>${message}</p>
        <div class="session-recovery-actions">
          <button type="button" data-act="retry">Coba lagi</button>
          <button type="button" data-act="login">Keluar dan masuk lagi</button>
        </div>
      </section>
    </main>`;
  root.querySelector('[data-act="retry"]').addEventListener("click", initializeApp);
  root.querySelector('[data-act="login"]').addEventListener("click", () => {
    clearAccessToken();
    state.currentUser = null;
    state.role = "manager";
    mountLogin();
  });
}

async function initializeApp() {
  if (!hasAccessToken()) return mountLogin();
  document.getElementById("app").innerHTML =
    '<p class="boot" role="status">Memulihkan sesi…</p>';
  try {
    const user = await currentUserRequest();
    state.currentUser = user;
    state.role = user.role;
    await hydrateShifts();
    mountApplication();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAccessToken();
      state.currentUser = null;
      state.role = "manager";
      mountLogin();
      return;
    }
    mountSessionRecovery(error);
  }
}

if (!window.webix) {
  document.getElementById("app").innerHTML =
    '<p class="boot">Webix belum dapat dimuat. Periksa koneksi internet lalu muat ulang halaman.</p>';
} else webix.ready(initializeApp);
