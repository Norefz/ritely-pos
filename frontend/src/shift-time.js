const WINDOWS = {
  shift_1: { start: 7 * 60, end: 15 * 60, label: "07.00–15.00" },
  shift_2: { start: 15 * 60, end: 22 * 60, label: "15.00–22.00" },
};

export function shiftWindow(shiftType) {
  return WINDOWS[shiftType] || null;
}

export function wibMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

export function canOpenShift(shiftType) {
  const window = shiftWindow(shiftType);
  const now = wibMinutesNow();
  return Boolean(window && now >= window.start && now < window.end);
}

export function canCloseShift(shiftType) {
  const window = shiftWindow(shiftType);
  return Boolean(window && wibMinutesNow() >= window.end);
}
