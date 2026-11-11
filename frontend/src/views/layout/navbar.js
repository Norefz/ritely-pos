import { state, escape } from "../../demo.js";

const jakartaTime = () =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

export function navbar(role, changeRole) {
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
        width: innerWidth < 420 ? 62 : undefined,
      },
      {
        view: "template",
        id: "cashierIdentity",
        css: "cashier-identity",
        borderless: true,
        width: innerWidth < 420 ? 150 : innerWidth < 600 ? 190 : 285,
        hidden: role !== "cashier",
        template: () => {
          const cashier = state.users.find((user) => user.username === "dina");
          const name = escape(cashier?.name || "Kasir");
          const id = escape(cashier?.id || "—");
          return `<div class="cashier-identity-inner">
            <img class="cashier-avatar" src="./assets/images/cashier-dina.svg" alt="Foto profil ${name}">
            <div class="cashier-details"><strong>${name}</strong><span>ID kasir · ${id}</span></div>
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
        view: "select",
        id: "roleSelector",
        label: innerWidth < 600 ? "" : "Demo sebagai",
        labelWidth: innerWidth < 600 ? 0 : 100,
        width: innerWidth < 420 ? 96 : innerWidth < 600 ? 140 : 235,
        value: role,
        options: [
          { id: "manager", value: "Manajer" },
          { id: "cashier", value: "Kasir" },
        ],
        on: { onChange: changeRole },
      },
    ],
  };
}
