import { state, money, escape } from "../../demo.js";
import { ApiError, closeShiftRequest, openShiftRequest } from "../../api.js";
import { canCloseShift, canOpenShift, shiftWindow } from "../../shift-time.js";
import { cashierAvatarSrc } from "../cashier-avatar.js";

let scheduleTimer = null;

const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  play: svg('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  moon: svg(
    '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  ),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
  employee: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.7-1.3 1.7-2 3-2s2.3.7 3 2M14 10h4M14 14h4"/>'),
};

const SCHEDULE = {
  shift_1: {
    id: "shift_1",
    icon: "sun",
    tone: "sun",
    name: "Shift 1",
    time: "07.00–15.00",
    length: "8 jam",
  },
  shift_2: {
    id: "shift_2",
    icon: "moon",
    tone: "moon",
    name: "Shift 2",
    time: "15.00–22.00",
    length: "7 jam",
  },
};

const cashier = () => state.currentUser;
const isMine = (shift) => shift.cashier_id === cashier()?.id;
const shiftsForMe = () => state.shifts.filter(isMine);
const myOpenShift = () => (state.shift && isMine(state.shift) ? state.shift : null);
const salesOf = (shift) => Number(shift.sales_total || 0);
const transactionsOf = (shift) => Number(shift.transaction_count || 0);

function localDayKey(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function localDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function localTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(":", ".");
}

function todayLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function todayShifts() {
  const all = [...shiftsForMe()];
  const open = myOpenShift();
  if (open && !all.some((shift) => shift.id === open.id)) all.push(open);
  const today = localDayKey(new Date());
  return all.filter((shift) => localDayKey(shift.opened_at) === today);
}

function scheduleAvailability() {
  const openShift = myOpenShift();
  const assignedShift = cashier()?.assigned_shift;
  return `${openShift?.id || ""}:${openShift ? canCloseShift(openShift.shift_type || openShift.assigned_shift) : false}:${!state.shift && canOpenShift(assignedShift)}`;
}

function shiftError(error) {
  if (!(error instanceof ApiError)) return "Shift gagal diperbarui.";
  if (error.code === "shift_already_open") return "Shift lain masih berjalan di toko.";
  if (error.code === "invalid_shift") return "Akun ini belum mendapat jadwal shift yang valid.";
  if (error.code === "shift_not_open") return "Shift sudah ditutup.";
  if (error.code === "shift_not_ended") return error.message || "Shift belum mencapai waktu penutupan.";
  if (error.code === "outside_shift_window") return error.message || "Belum masuk jam shift Anda.";
  if (error.code === "pending_sales_exist") return "Selesaikan transaksi pending sebelum menutup shift.";
  if (error.code === "database_unavailable") return "Database belum dapat dijangkau.";
  return "Tidak dapat mengubah shift. Periksa koneksi backend.";
}

function todayStatsHtml() {
  const shifts = todayShifts();
  const sales = shifts.reduce((total, shift) => total + salesOf(shift), 0);
  const transactions = shifts.reduce(
    (total, shift) => total + transactionsOf(shift),
    0,
  );
  return `
    <section class="ms-stat"><span>Penjualan saya</span><strong>${money(sales)}</strong><small>Hari ini</small></section>
    <section class="ms-stat"><span>Transaksi</span><strong>${transactions}</strong><small>Hari ini</small></section>`;
}

function scheduleHtml() {
  const assigned = SCHEDULE[cashier()?.assigned_shift];
  if (!assigned) {
    return `<div class="ms-schedule ms-schedule-empty"><i>${icons.info}</i><span>Belum ada jadwal shift yang ditetapkan Manajer.</span></div>`;
  }
  const currentShift = myOpenShift();
  const tag = currentShift
    ? "Sedang berjalan"
    : canOpenShift(assigned.id)
      ? "Jadwal Anda hari ini"
      : "Jadwal kasir";
  return `<div class="ms-schedule">
    <i class="ms-schedule-icon ${assigned.tone}">${icons[assigned.icon]}</i>
    <div><b>${assigned.name}</b><span>${assigned.time} WIB · ${assigned.length}</span></div>
    <em>${tag}</em>
  </div>`;
}

function statusHtml() {
  const openShift = myOpenShift();
  const otherShiftOpen = !openShift && !!state.shift;
  const assignedShift = cashier()?.assigned_shift;
  const closeAllowed = !!openShift && canCloseShift(openShift.shift_type || openShift.assigned_shift);
  const openAllowed = !state.shift && canOpenShift(assignedShift);

  const kicker = openShift
    ? "SHIFT SEDANG BERJALAN"
    : otherShiftOpen
      ? "SHIFT KASIR LAIN BERJALAN"
      : "SHIFT BELUM DIBUKA";
  const profileName = cashier()?.name || "Kasir";
  const name = escape(profileName);
  const avatar = cashierAvatarSrc(cashier());
  const employeeId = escape(cashier()?.employee_id || "Belum ada");
  const identityNote = openShift
    ? `${escape(SCHEDULE[openShift.shift_type || openShift.assigned_shift]?.name || "Shift Anda")} · Dibuka pukul ${localTime(openShift.opened_at)} WIB.`
    : otherShiftOpen
      ? `${escape(state.shift.cashier || "Kasir lain")} masih memiliki shift terbuka.`
      : "";
  const note = openShift
    ? closeAllowed
      ? "Pastikan transaksi sudah selesai sebelum menutup shift."
      : `Tutup shift tersedia mulai pukul ${shiftWindow(openShift.shift_type || openShift.assigned_shift)?.label.split("–")[1] || "—"} WIB.`
    : otherShiftOpen
      ? "Shift hanya dapat dibuka setelah shift yang sedang berjalan ditutup."
      : "Waktu pembukaan dan penutupan shift akan dicatat otomatis ke database.";
  const activeStep = openShift ? (closeAllowed ? 3 : 2) : 1;
  const steps = [
    ["Buka shift", "Mulai sesi kerja Anda"],
    ["Layani transaksi", "Gunakan menu Kasir"],
    ["Tutup shift", "Saat jam kerja selesai"],
  ];

  return `
    <div class="ms-status${openShift ? " is-open" : ""}">
      <div class="ms-profile-avatar" role="img" aria-label="Foto profil ${name}"><img src="${avatar}" alt=""><i></i></div>
      <div class="ms-status-copy">
        <span class="ms-kicker"><i></i>${kicker}</span>
        <h2>${name}</h2>
        <span class="ms-employee-id">${icons.employee}ID ${employeeId}</span>
        ${identityNote ? `<p>${identityNote}</p>` : ""}
      </div>
    </div>
    ${scheduleHtml()}
    <div class="ms-actions">
      <button type="button" class="ms-action primary" data-act="open"${openAllowed ? "" : " disabled"}>${icons.play}Buka shift</button>
      <button type="button" class="ms-action secondary" data-act="close"${closeAllowed ? "" : " disabled"}>Tutup shift</button>
    </div>
    <div class="ms-steps" aria-label="Langkah kerja dalam shift">
      ${steps.map(([title, description], index) => {
        const number = index + 1;
        const stepState = number === activeStep ? "active" : number < activeStep ? "complete" : "";
        return `<div class="ms-step ${stepState}"${number === activeStep ? ' aria-current="step"' : ""}>
          <span>${number}</span><div><b>${title}</b><small>${description}</small></div>
        </div>`;
      }).join("")}
    </div>
    <p class="ms-note">${icons.info}${note}</p>`;
}

function historyHtml() {
  const shifts = [...shiftsForMe()].sort(
    (a, b) => new Date(b.opened_at) - new Date(a.opened_at),
  );
  const rows = shifts.slice(0, 6).map((shift, index) => {
    const open = shift.status === "open";
    const period = `${localTime(shift.opened_at)} – ${open ? "Berjalan" : localTime(shift.closed_at)}`;
    return `<article class="ms-history-row">
      <span class="ms-history-index">${shifts.length - index}</span>
      <div class="ms-history-main"><b>${localDate(shift.opened_at)}</b><small>${period} WIB</small></div>
      <div class="ms-history-result"><b>${money(salesOf(shift))}</b><span class="${open ? "is-open" : ""}">${open ? "Terbuka" : "Ditutup"}</span></div>
    </article>`;
  });
  return `<section class="ms-history">
    <header><h2>Riwayat shift saya</h2><em>${shifts.length} shift</em></header>
    ${rows.length ? `<div class="ms-history-list">${rows.join("")}</div>` : `<div class="ms-history-empty">Belum ada riwayat shift. Shift yang Anda buka akan tercatat di sini.</div>`}
    <p>Hanya shift milik Anda yang ditampilkan.</p>
  </section>`;
}

function shell() {
  return `
    <div class="ms-head">
      <div><h1>Shift saya</h1><p>Buka shift untuk mulai berjualan, tutup shift saat selesai bekerja.</p></div>
      <span class="ms-date">${icons.calendar}${todayLabel()}</span>
    </div>
    <div class="ms-layout">
      <section class="ms-main">${statusHtml()}</section>
      <aside class="ms-aside">
        <div class="ms-stats">${todayStatsHtml()}</div>
        ${historyHtml()}
      </aside>
    </div>`;
}

function bind(root, actions) {
  if (root._msBound) return;
  root._msBound = true;
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    if (!button || button.disabled) return;
    actions[button.dataset.act]?.();
  });
}

export function myShifts(refresh) {
  async function close() {
    const openShift = myOpenShift();
    if (!openShift) {
      webix.message({
        type: "error",
        text: "Kasir hanya bisa menutup shift miliknya sendiri.",
      });
      return;
    }
    try {
      const result = await closeShiftRequest(openShift.id);
      state.shifts = state.shifts.map((shift) =>
        shift.id === result.shift.id ? result.shift : shift,
      );
      state.shift = null;
      refresh();
      webix.message("Shift berhasil ditutup.");
    } catch (error) {
      webix.message({ type: "error", text: shiftError(error) });
    }
  }

  const actions = {
    async open() {
      if (state.shift) {
        webix.message({
          type: "error",
          text: "Shift sebelumnya harus ditutup terlebih dahulu.",
        });
        return;
      }
      if (!canOpenShift(cashier()?.assigned_shift)) {
        webix.message({
          type: "error",
          text: shiftError({ code: "outside_shift_window" }),
        });
        return;
      }
      try {
        const result = await openShiftRequest();
        state.shift = result.shift;
        state.shifts.push(result.shift);
        refresh();
        webix.message("Shift berhasil dibuka.");
      } catch (error) {
        webix.message({ type: "error", text: shiftError(error) });
      }
    },
    close() {
      webix
        .confirm("Tutup shift ini?")
        .then(close)
        .catch(() => {});
    },
  };

  return {
    view: "template",
    css: "product-page my-shift-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        bind(this.$view, actions);
        if (scheduleTimer) clearInterval(scheduleTimer);
        let previous = scheduleAvailability();
        scheduleTimer = setInterval(() => {
          const current = scheduleAvailability();
          if (current !== previous) {
            previous = current;
            refresh();
          }
        }, 15000);
      },
      onDestruct() {
        if (scheduleTimer) clearInterval(scheduleTimer);
        scheduleTimer = null;
      },
    },
  };
}
