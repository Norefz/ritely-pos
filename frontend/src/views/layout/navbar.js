import { state, escape } from "../../demo.js";
import { cashierAvatarSrc } from "../cashier-avatar.js";

const jakartaTime = () =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

export function navbar(role, logout) {
  return {
    view: "toolbar",
    id: "navbar",
    css: "navbar",
    height: 72,
    padding: innerWidth < 420 ? 4 : 12,
    cols: [
      {
        view: "button",
        value: "Menu",
        tooltip: "Tampilkan atau sembunyikan menu",
        ariaLabel: "Tampilkan atau sembunyikan menu",
        width: innerWidth < 420 ? 52 : 60,
        click: () => {
          const nav = $$("sidebar");
          nav.isVisible() ? nav.hide() : nav.show();
        },
      },
      {
        view: "label",
        id: "pageTitle",
        label: "Ringkasan",
        width: 120,
      },
      { view: "spacer", gravity: 100 },
      {
        view: "template",
        id: "cashierIdentity",
        css: "cashier-identity",
        borderless: true,
        width: innerWidth < 420 ? 150 : innerWidth < 600 ? 190 : 285,
        hidden: role !== "cashier",
        template: () => {
          const cashier = state.currentUser;
          const name = escape(cashier?.name || "Kasir");
          const id = escape(cashier?.employee_id || "Belum ada");
          const avatar = cashierAvatarSrc(cashier);
          return `<div class="cashier-identity-inner">
            <img class="cashier-avatar" src="${avatar}" alt="Foto profil ${name}">
            <div class="cashier-details"><strong>${name}</strong><span>ID karyawan · ${id}</span></div>
            <div class="cashier-clock"><span>WAKTU</span><strong data-cashier-clock>${jakartaTime()}</strong></div>
          </div>`;
        },
        on: {
          onAfterRender() {
            clearInterval(this._cashierClockTimer);
            const updateClock = () => {
              const clock = this.$view.querySelector("[data-cashier-clock]");
              if (clock) clock.textContent = jakartaTime();
            };
            updateClock();
            this._cashierClockTimer = setInterval(updateClock, 1000);
          },
          onBeforeDestroy() {
            clearInterval(this._cashierClockTimer);
          },
        },
      },
      {
        view: "button",
        id: "logoutButton",
        value: "Keluar",
        tooltip: "Keluar dari akun",
        ariaLabel: "Keluar dari akun",
        width: innerWidth < 420 ? 60 : 76,
        css: "logout-button",
        click: logout,
      },
    ],
  };
}
