import { state } from "../../demo.js";
export const menus = {
  manager: [
    ["dashboard", "Ringkasan"],
    ["products", "Produk"],
    ["categories", "Kategori"],
    ["stock", "Stok"],
    ["transactions", "Transaksi"],
    ["shifts", "Shift kasir"],
    ["reports", "Laporan"],
    ["users", "Akun kasir"],
  ],
  cashier: [
    ["pos", "Kasir"],
    ["transactions", "Transaksi saya"],
    ["shifts", "Shift saya"],
  ],
};
const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  products: '<path d="m12 3 9 5v8l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5"/>',
  categories: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3Z"/>',
  stock: '<path d="M4 21V8l8-5 8 5v13 M2 21h20 M8 21v-9h8v9 M8 16h8"/>',
  transactions: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z M9 7h6 M9 11h6 M9 15h3"/>',
  shifts: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  reports: '<path d="M4 3v17h17 M8 16v-5 M13 16V6 M18 16V9"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3 M16 5a3 3 0 0 1 0 6 M18 15a5 5 0 0 1 3 5"/>',
  pos: '<path d="M3 3h2l3 12h10l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'
};
const icon = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]}</svg>`;
export function sidebar(role, navigate) {
  return {
    id: "sidebar", width: 248, css: "sidebar",
    rows: [
      {view:"template",borderless:true,height:130,css:"brand",template:'<div class="brand-surface"><img src="./assets/images/ritely-logo.png" alt="Ritely" width="184" height="92"></div>'},
      {view:"template",borderless:true,height:88,css:"workspace",template:'<div class="workspace-name">Toko utama</div><div class="workspace-detail"><span class="register-dot"></span>Register 01 <span>·</span> Asia/Jakarta</div>'},
      {view:"template",borderless:true,height:32,css:"nav-caption",template:'Ruang kerja'},
      {view:"list",id:"navigation",borderless:true,select:true,autoheight:true,type:{height:48},
        template: item => `<div class="nav-link">${icon(item.id)}<span>${item.value}</span><span class="nav-current" aria-hidden="true"></span></div>`,
        data: menus[role].map(([id,value])=>({id,value})),on:{onAfterSelect:navigate}},
      {},
      {view:"template",id:"sidebarProfile",borderless:true,height:100,css:"sidebar-profile",template:()=>`<div class="profile-inner"><div class="profile-avatar">${state.role==='manager'?'M':'K'}</div><div><strong>${state.role==='manager'?'Manajer':'Kasir'}</strong><span>Ruang kerja demo</span></div><span class="profile-indicator" aria-hidden="true"></span></div>`}
    ]
  };
}
