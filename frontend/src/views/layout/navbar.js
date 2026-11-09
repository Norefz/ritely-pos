export function navbar(role, changeRole) {
  return {
    view: "toolbar",
    id: "navbar",
    css: "navbar",
    height: 72,
    padding: 12,
    cols: [
      {
        view: "button",
        value: "Menu",
        tooltip: "Tampilkan atau sembunyikan menu",
        ariaLabel: "Tampilkan atau sembunyikan menu",
        width: 60,
        click: () => {
          const nav = $$("sidebar");
          nav.isVisible() ? nav.hide() : nav.show();
        },
      },
      { view: "label", id: "pageTitle", label: "Ringkasan" },
      {
        view: "select",
        id: "roleSelector",
        label: innerWidth < 600 ? "" : "Demo sebagai",
        labelWidth: innerWidth < 600 ? 0 : 100,
        width: innerWidth < 600 ? 140 : 235,
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
