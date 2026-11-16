import { state } from "./state.js";
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
  catalogRequest,
  stockOpnamesRequest,
  salesRequest,
} from "./api.js";
import { loadPaymentConfig } from "./payments.js";
let current = "dashboard";
let shiftSyncTimer = null;
let syncingShifts = false;
const factories = {
  dashboard: () => dashboard(navigate),
  products: () => products(refresh),
  categories: () => categories(refresh),
  stock: () => stock(refresh),
  pos: () => pos(refresh),
  transactions: () => transactions(refresh),
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
  const finishLogout = () => {
    // Tutup sesi lokal langsung; request keepalive mencabut token di backend
    // tanpa menahan perpindahan kembali ke halaman login.
    logoutRequest().catch(() => {});
    history.replaceState(null, "", location.pathname);
    window.location.reload();
  };
  if (state.cart.length) {
    webix
      .confirm("Keranjang saat ini akan dikosongkan. Keluar dari akun?")
      .then(finishLogout)
      .catch(() => {});
    return;
  }
  finishLogout();
}
function mountApplication() {
  const defaultRoute = state.role === "cashier" ? "shifts" : "dashboard";
  current = defaultRoute;
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
            id: "dataStatus",
            height: 42,
            css: "data-status-banner",
            borderless: true,
            template: "Memuat katalog, shift, dan stock opname…",
          },
          { view: "layout", id: "contentHost", rows: [] },
        ],
      },
    ],
  });
  navigate(
    menus[state.role].some(([id]) => id === location.hash.slice(1))
      ? location.hash.slice(1)
      : defaultRoute,
  );
  if (shiftSyncTimer) clearInterval(shiftSyncTimer);
  shiftSyncTimer = setInterval(syncShiftSnapshot, 15000);
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
      login((user) => {
        state.currentUser = user;
        state.role = user.role;
        clearOperationalData();
        $$("loginScreen").destructor();
        mountApplication();
        void hydrateApplicationData();
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
    state.shiftLoadError = true;
  }
}

async function hydrateCatalog() {
  try {
    const catalog = await catalogRequest();
    state.categories = catalog.categories.map((category) => ({
      id: category.id,
      name: category.name,
      active: category.is_active,
    }));
    state.products = catalog.products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category_id,
      price: Number(product.selling_price),
      stock: product.stock,
      physicalStock: product.physical_stock,
      minimum: product.minimum_stock,
      active: product.is_active,
      imageUrl: product.image_url || "",
    }));
    state.catalogLoadError = false;
  } catch {
    state.categories = [];
    state.products = [];
    state.catalogLoadError = true;
  }
}

async function hydrateStockOpnames() {
  if (state.role !== "manager") {
    state.stockOpnames = [];
    state.stockOpnameLoadError = false;
    return;
  }
  try {
    const result = await stockOpnamesRequest();
    state.stockOpnames = result.opnames || [];
    state.stockOpnameLoadError = false;
  } catch {
    state.stockOpnames = [];
    state.stockOpnameLoadError = true;
  }
}

async function hydrateSales() {
  try {
    const result = await salesRequest();
    state.sales = result.sales || [];
    state.salesLoadError = false;
  } catch {
    state.sales = [];
    state.salesLoadError = true;
  }
}

function clearOperationalData() {
  state.shift = null;
  state.shifts = [];
  state.categories = [];
  state.products = [];
  state.stockOpnames = [];
  state.sales = [];
}

async function hydrateApplicationData() {
  await Promise.all([
    hydrateShifts(),
    hydrateCatalog(),
    hydrateStockOpnames(),
    hydrateSales(),
    loadPaymentConfig(),
  ]);

  const status = $$("dataStatus");
  if (status) {
    status.define(
      "template",
      state.catalogLoadError
        ? "Katalog gagal dimuat dari backend · Periksa koneksi, lalu muat ulang halaman."
        : `Katalog, shift, stok, dan transaksi terhubung ke backend · Pembayaran online ${state.paymentOnlineEnabled ? "Midtrans Sandbox siap" : "belum dikonfigurasi"}.`,
    );
    status.refresh();
  }
  if ($$("contentHost")) refresh();
}

async function syncShiftSnapshot() {
  if (syncingShifts || !hasAccessToken()) return;
  syncingShifts = true;
  const previous = JSON.stringify([
    state.shift,
    state.shifts,
    state.shiftLoadError,
    state.products,
    state.categories,
    state.stockOpnames,
    state.catalogLoadError,
    state.stockOpnameLoadError,
  ]);
  try {
    await hydrateShifts();
    await Promise.all([hydrateCatalog(), hydrateStockOpnames()]);
    const currentSnapshot = JSON.stringify([
      state.shift,
      state.shifts,
      state.shiftLoadError,
      state.products,
      state.categories,
      state.stockOpnames,
      state.catalogLoadError,
      state.stockOpnameLoadError,
    ]);
    if (previous !== currentSnapshot && $$("contentHost")) refresh();
  } finally {
    syncingShifts = false;
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
    clearOperationalData();
    mountApplication();
    void hydrateApplicationData();
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
