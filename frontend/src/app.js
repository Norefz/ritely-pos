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
function changeRole(role) {
  state.role = role;
  $$("sidebarProfile").refresh();
  const nav = $$("navigation");
  nav.clearAll();
  nav.parse(menus[role].map(([id, value]) => ({ id, value })));
  navigate(menus[role][0][0]);
}
if (!window.webix) {
  document.getElementById("app").innerHTML =
    '<p class="boot">Webix belum dapat dimuat. Periksa koneksi internet lalu muat ulang halaman.</p>';
} else
  webix.ready(() => {
    document.getElementById("app").replaceChildren();
    webix.ui({
      container: "app",
      id: "shell",
      cols: [
        sidebar(state.role, navigate),
        {
          rows: [
            navbar(state.role, changeRole),
            {
              view: "template",
              height: 42,
              css: "demo-banner",
              borderless: true,
              template:
                "Mode demo frontend · Data hanya di memori browser dan akan direset saat halaman dimuat ulang.",
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
  });
