import { state, escape } from "../../state.js";
import { cashierAvatarSrc } from "../cashier-avatar.js";
export const menus={
manager:[["dashboard","Dasbor"],["reports","Laporan"],["transactions","Transaksi"],["products","Produk"],["stock","Stok"],["shifts","Shift"],["users","Pengguna"],["audit","Log audit"]],
cashier:[["shifts","Shift saya"],["pos","Kasir"],["transactions","Transaksi saya"],["stock","Stok"]]
};
const paths={dashboard:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',products:'<path d="m12 3 9 5v8l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v8"/>',stock:'<path d="M4 6h16M4 12h16M4 18h16"/>',transactions:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z M9 7h6 M9 11h6 M9 15h3"/>',shifts:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',reports:'<path d="M4 3v17h17 M8 16v-5 M13 16V6 M18 16V9"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3 M18 9h4 M20 7v4"/>',audit:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z M9 8h6 M9 12h6 M9 16h4"/>',pos:'<path d="M3 3h2l3 12h10l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'};
const icon=id=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]||paths.dashboard}</svg>`;
export function sidebar(role, navigate) {
  return {
    id: "sidebar",
    width: 252,
    css: "sidebar",
    rows: [
      {
        view: "template",
        id: "sidebarBrand",
        borderless: true,
        height: 96,
        css: "brand",
        template: '<div class="brand-inner"><img class="brand-mark" src="./assets/images/ritely-cart-icon.png" alt=""><img class="brand-wordmark" src="./assets/images/ritely-wordmark.png" alt="Ritely"><button type="button" class="sidebar-collapse" aria-label="Ciutkan navigasi" title="Ciutkan navigasi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button></div>',
        on: {
          onAfterRender() {
            const button = this.$view.querySelector(".sidebar-collapse");
            button?.addEventListener("click", () => {
              const sidebarView = $$("sidebar");
              const collapsed = !sidebarView.$view.classList.contains("sidebar-collapsed");
              sidebarView.$view.classList.toggle("sidebar-collapsed", collapsed);
              sidebarView.define("width", collapsed ? 92 : 252);
              collapsed ? $$("sidebarWorkspace").hide() : $$("sidebarWorkspace").show();
              collapsed ? $$("sidebarCaption").hide() : $$("sidebarCaption").show();
              sidebarView.resize();
              $$("shell").resize();
              button.setAttribute("aria-label", collapsed ? "Perluas navigasi" : "Ciutkan navigasi");
              button.title = collapsed ? "Perluas navigasi" : "Ciutkan navigasi";
            });
          },
        },
      },
      {
        view: "template",
        id: "sidebarWorkspace",
        borderless: true,
        height: 78,
        css: "workspace",
        template: '<div class="workspace-name">Toko utama</div><div class="workspace-detail">Register 01 · Asia/Jakarta</div>',
      },
      {
        view: "template",
        id: "sidebarCaption",
        borderless: true,
        height: 32,
        css: "nav-caption",
        template: role === "manager" ? "Manajemen" : "Ruang kerja",
      },
      {
        view: "list",
        id: "navigation",
        borderless: true,
        select: true,
        autoheight: true,
        type: { height: 50 },
        template: (item) => `<div class="nav-link" title="${item.value}">${icon(item.id)}<span>${item.value}</span></div>`,
        data: menus[role].map(([id, value]) => ({ id, value })),
        on: { onAfterSelect: navigate },
      },
      {},
      {
        view: "template",
        id: "sidebarProfile",
        borderless: true,
        height: 84,
        css: "sidebar-profile",
        template: () => `<div class="profile-inner"><div class="profile-avatar">${state.role === "manager" ? "M" : `<img src="${cashierAvatarSrc(state.currentUser)}" alt="">`}</div><div><strong>${escape(state.currentUser?.name || (state.role === "manager" ? "Manajer" : "Kasir"))}</strong><span>${state.role === "manager" ? "Manajer" : "Kasir"}</span></div></div>`,
      },
    ],
  };
}
