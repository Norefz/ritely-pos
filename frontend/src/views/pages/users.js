import { state, money, date, completed, uid } from "../../demo.js";
import { heading, table, button, editor, receipt } from "./common.js";
export function users(refresh) {
  function edit(user = { active: true, assigned_shift: "shift_1" }) {
    editor(
      user.id ? "Ubah akun kasir demo" : "Tambah akun kasir demo",
      [
        { view: "text", name: "name", label: "Nama", required: true },
        { view: "text", name: "username", label: "Username", required: true },
        {
          view: "richselect",
          name: "assigned_shift",
          label: "Penugasan shift",
          options: [
            { id: "shift_1", value: "Shift 1 · 07.00–15.00" },
            { id: "shift_2", value: "Shift 2 · 15.00–22.00" },
          ],
        },
        {
          view: "checkbox",
          name: "active",
          labelRight: "Akun aktif",
          labelWidth: 0,
        },
      ],
      user,
      (v) => {
        if (
          !v.name.trim() ||
          !v.username.trim() ||
          state.users.some((u) => u.username === v.username && u.id !== user.id)
        ) {
          webix.message({
            type: "error",
            text: "Isi nama dan username yang unik.",
          });
          return false;
        }
        const value = { ...v, id: user.id || uid(), active: !!+v.active };
        if (user.id) Object.assign(user, value);
        else state.users.push(value);
        refresh();
      },
    );
  }
  return {
    rows: [
      heading(
        "Akun kasir",
        "Data profil contoh. Tidak membuat akun login atau menyimpan password.",
      ),
      {
        view: "toolbar",
        cols: [{}, button("Tambah akun demo", () => edit(), true)],
      },
      table(
        [
          { id: "name", header: "Nama kasir", fillspace: 1, minWidth: 180 },
          { id: "username", header: "Username", width: 150 },
          {
            id: "assigned_shift",
            header: "Penugasan",
            width: 180,
            template: (o) =>
              o.assigned_shift === "shift_1"
                ? "07.00–15.00 WIB"
                : "15.00–22.00 WIB",
          },
          {
            id: "active",
            header: "Status",
            width: 100,
            template: (o) => (o.active ? "Aktif" : "Nonaktif"),
          },
          {
            id: "edit",
            header: "",
            width: 90,
            template: '<button class="row-action">Ubah</button>',
          },
        ],
        state.users,
        {
          onClick: {
            "row-action": (_, id) =>
              edit(state.users.find((u) => u.id === id.row)),
          },
        },
      ),
    ],
  };
}
