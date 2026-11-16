const STORE_TIME_ZONE = "Asia/Jakarta";
const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const PERIOD_OPTIONS = [
  ["all", "Semua waktu"],
  ["today", "Hari ini"],
  ["week", "Minggu ini"],
  ["month", "Bulan ini"],
];

export function storeDateKey(value) {
  const parts = Object.fromEntries(
    dateParts.formatToParts(value).map(({ type, value: part }) => [type, part]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateForKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shiftDate(key, amount) {
  const date = dateForKey(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function periodBounds(period, now = new Date()) {
  const through = storeDateKey(now);
  if (period === "week") {
    const sinceMonday = (dateForKey(through).getUTCDay() + 6) % 7;
    return { start: shiftDate(through, -sinceMonday), through };
  }
  if (period === "month") return { start: `${through.slice(0, 7)}-01`, through };
  return { start: through, through };
}

export function isInPeriod(value, period, now = new Date()) {
  if (period === "all") return true;
  if (!value) return false;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return false;
  const { start, through } = periodBounds(period, now);
  const key = storeDateKey(timestamp);
  return key >= start && key <= through;
}

export function periodOptionsHtml(selected) {
  return PERIOD_OPTIONS.map(
    ([value, label]) =>
      `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
  ).join("");
}
