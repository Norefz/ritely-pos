import { state, money, date, completed, escape } from "../../state.js";
import { table, button } from "./common.js";
const TIME_ZONE = "Asia/Jakarta";
const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
const rangeDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const shortDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});
const weekday = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: TIME_ZONE,
});
function partsMap(formatter, value) {
  return Object.fromEntries(
    formatter.formatToParts(value).map(({ type, value: part }) => [type, part]),
  );
}
function dayKey(value) {
  const parts = partsMap(dateParts, value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function dateForKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}
function shiftDay(key, amount) {
  const day = dateForKey(key);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}
function periodBounds(period, now = new Date()) {
  const today = dayKey(now);
  const [year, month, day] = today.split("-").map(Number);
  if (period === "week") {
    const weekdayIndex = dateForKey(today).getUTCDay();
    const sinceMonday = (weekdayIndex + 6) % 7;
    const start = shiftDay(today, -sinceMonday);
    return { start, end: shiftDay(start, 6), through: today };
  }
  if (period === "month") {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${year}-${String(month).padStart(2, "0")}-01`,
      end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      through: today,
    };
  }
  return { start: today, end: today, through: today };
}
function salesForPeriod(period) {
  const { start, through } = periodBounds(period);
  return completed().filter((sale) => {
    const timestamp = sale.paid_at || sale.created_at;
    return timestamp && dayKey(new Date(timestamp)) >= start && dayKey(new Date(timestamp)) <= through;
  });
}
function periodSubtitle(period) {
  const { start, end, through } = periodBounds(period);
  if (period === "today") return rangeDate.format(dateForKey(through));
  if (period === "week") {
    return `${shortDate.format(dateForKey(start))}–${rangeDate.format(dateForKey(end))}`;
  }
  return `1–${rangeDate.format(dateForKey(through))}`;
}
function chartPoints(period, sales) {
  const counts = new Map();
  sales.forEach((sale) => {
    const timestamp = sale.paid_at || sale.created_at;
    if (!timestamp) return;
    const parts = partsMap(dateTimeParts, new Date(timestamp));
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  if (period === "today") {
    const hours = sales
      .map((sale) => {
        const timestamp = sale.paid_at || sale.created_at;
        return timestamp ? Number(partsMap(dateTimeParts, new Date(timestamp)).hour) : null;
      })
      .filter((hour) => hour !== null);
    const firstHour = Math.min(8, ...(hours.length ? hours : [8]));
    const lastHour = Math.max(17, ...(hours.length ? hours : [17]));
    const today = periodBounds(period).start;
    return Array.from({ length: lastHour - firstHour + 1 }, (_, index) => {
      const hour = firstHour + index;
      const value = sales.filter((sale) => {
        const timestamp = sale.paid_at || sale.created_at;
        if (!timestamp) return false;
        const parts = partsMap(dateTimeParts, new Date(timestamp));
        return `${parts.year}-${parts.month}-${parts.day}` === today && Number(parts.hour) === hour;
      }).length;
      return [`${String(hour).padStart(2, "0")}.00`, value];
    });
  }
  if (period === "week") {
    const { start } = periodBounds(period);
    return Array.from({ length: 7 }, (_, index) => {
      const key = shiftDay(start, index);
      return [weekday.format(dateForKey(key)), counts.get(key) || 0];
    });
  }
  const { start, through } = periodBounds(period);
  const daysInMonth = Number(through.slice(-2));
  const groups = Math.ceil(daysInMonth / 7);
  return Array.from({ length: groups }, (_, index) => {
    const firstDay = index * 7 + 1;
    const lastDay = Math.min(firstDay + 6, daysInMonth);
    let value = 0;
    for (let day = firstDay; day <= lastDay; day += 1) {
      const key = `${start.slice(0, 8)}${String(day).padStart(2, "0")}`;
      value += counts.get(key) || 0;
    }
    return [`${firstDay}–${lastDay}`, value];
  });
}
const e = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function salesChart(period) {
  const points = chartPoints(period, salesForPeriod(period));
  const peak = Math.max(1, ...points.map(([, value]) => value));
  const periodClass = period === "month" ? " is-month" : "";
  return `<div class="chart-bars${periodClass}">${points.map(([label, value]) => `<div class="chart-col"><b>${value}</b><span class="chart-bar${value === peak && value > 0 ? " peak" : ""}" style="height:${Math.max(18, Math.round((value / peak) * 192))}px"></span><small>${label}</small></div>`).join("")}</div>`;
}
function shiftsPanel() {
  if (state.shift)
    return `<div class="running-shift"><div class="shift-line"><strong>${escape(state.shift.cashier)} · Register 01</strong><span class="state-tag good">Terbuka</span></div><p>${state.shift.assigned_shift === "shift_2" ? "Shift 2 · 15.00–22.00" : "Shift 1 · 07.00–15.00"} · sejak ${date(state.shift.opened_at)}</p><button class="force-close" onclick="location.hash='shifts'">Kelola shift</button></div><div class="next-shift"><strong>Shift berjalan</strong><span class="state-tag">Satu kasir aktif</span><p>Penutupan dilakukan dari menu Shift.</p></div>`;
  return '<div class="next-shift"><strong>Belum ada shift yang dibuka</strong><span class="state-tag">Register siap</span><p>Shift 1 · 07.00–15.00 WIB</p></div><div class="next-shift"><strong>Shift 2 · 15.00–22.00</strong><span class="state-tag">Belum mulai</span><p>Menunggu kasir membuka shift.</p></div>';
}
export function dashboard(navigate) {
  let period = "today";
  const low = state.products
    .filter((p) => p.active && p.stock <= p.minimum)
    .slice(0, 4);
  const selectedSales = () => salesForPeriod(period);
  const recentSales = () =>
    [...selectedSales()]
      .sort(
        (a, b) =>
          new Date(b.paid_at || b.created_at) -
          new Date(a.paid_at || a.created_at),
      )
      .slice(0, 10);
  const periodTitle = () =>
    period === "week" ? "minggu ini" : period === "month" ? "bulan ini" : "hari ini";
  const dashboardHeading = () =>
    `<h1>Dasbor ${periodTitle()}</h1><p>${periodSubtitle(period)} · transaksi lunas</p>`;
  const dashboardKpis = () => {
    const sales = selectedSales();
    const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const count = sales.length;
    const avg = count ? Math.round(revenue / count) : 0;
    return `<div class="kpi-sales"><span>Total penjualan</span><strong class="kpi-money">${money(revenue)}</strong></div><div class="kpi-count"><span>Transaksi</span><strong>${count}</strong></div><div class="kpi-average"><span>Rata-rata / transaksi</span><strong class="kpi-money">${money(avg)}</strong></div><div class="kpi-shifts"><span>Shift terbuka</span><strong>${state.shift ? "1 dari 1" : "0 dari 1"}</strong></div>`;
  };
  const updatePeriod = (value) => {
    period = value;
    ["dashboardPeriodHeading", "dashboardKpis", "dashboardChartHeading", "dashboardSalesChart"].forEach((id) => {
      const view = $$(id);
      if (view) view.refresh();
    });
    const salesTable = $$("dashboardRecentSales");
    if (salesTable) {
      salesTable.clearAll();
      salesTable.parse(recentSales());
    }
  };
  return {
    view: "scrollview",
    scroll: "y",
    body: {
      padding: 24,
      margin: 16,
      rows: [
        {
          height: 84,
          cols: [
            {
              view: "template",
              id: "dashboardPeriodHeading",
              borderless: true,
              height: 88,
              css: "page-heading",
              template: dashboardHeading,
            },
            {},
            {
              view: "select",
              id: "dashboardPeriod",
              value: "today",
              options: [
                { id: "today", value: "Hari ini" },
                { id: "week", value: "Minggu ini" },
                { id: "month", value: "Bulan ini" },
              ],
              width: 136,
              height: 44,
              css: "dashboard-period",
              on: { onChange: updatePeriod },
            },
            { width: 16 },
            {
              ...button("Lihat laporan", () => navigate("reports"), true),
              autowidth: false,
              width: 128,
              height: 56,
              css: "dashboard-action report-action",
            },
          ],
        },
        {
          view: "template",
          id: "dashboardKpis",
          height: 120,
          css: "manager-kpis",
          template: dashboardKpis,
        },
        {
          height: 380,
          margin: 16,
          cols: [
            {
              gravity: 1.65,
              css: "dashboard-chart",
              rows: [
                {
                  view: "template",
                  id: "dashboardChartHeading",
                  height: 54,
                  css: "panel-heading",
                  template: () => {
                    const chartTitle = period === "today"
                      ? "Transaksi per jam"
                      : period === "week"
                        ? "Transaksi per hari"
                        : "Transaksi per minggu";
                    return `<h2>${chartTitle}</h2><span>Transaksi lunas · ${periodTitle()}</span>`;
                  },
                },
                {
                  view: "template",
                  id: "dashboardSalesChart",
                  css: "sales-chart",
                  template: () => salesChart(period),
                },
              ],
            },
            {
              gravity: 1,
              css: "dashboard-chart",
              rows: [
                {
                  view: "template",
                  height: 54,
                  css: "panel-heading",
                  template: "<h2>Shift berjalan</h2>",
                },
                { view: "template", css: "shift-panel", template: shiftsPanel },
              ],
            },
          ],
        },
        {
          height: 365,
          margin: 16,
          cols: [
            {
              gravity: 1,
              css: "dashboard-list",
              rows: [
                {
                  view: "template",
                  height: 56,
                  css: "panel-heading",
                  template:
                    '<h2>Stok menipis</h2><a href="#stock">Kelola stok</a>',
                },
                {
                  view: "template",
                  css: "low-stock-list",
                  template: () =>
                    low.length
                      ? low
                          .map(
                            (p) =>
                              `<div><strong>${e(p.name)}</strong><span class="stock-tag ${p.stock === 0 ? "empty" : "warning"}">${p.stock === 0 ? "Habis" : "Sisa " + p.stock}</span></div>`,
                          )
                          .join("")
                      : "<p>Belum ada produk yang perlu direstok.</p>",
                },
              ],
            },
            {
              gravity: 1.5,
              css: "dashboard-list",
              rows: [
                {
                  view: "template",
                  height: 56,
                  css: "panel-heading",
                  template:
                    '<h2>Transaksi terbaru</h2><a href="#transactions">Lihat semua</a>',
                },
                table(
                  [
                    { id: "id", header: "No. struk", width: 155 },
                    { id: "cashier", header: "Kasir", width: 100 },
                    {
                      id: "payment_method",
                      header: "Metode",
                      width: 110,
                      template: (o) =>
                        `<span class="method-tag ${o.payment_method === "cash" ? "good" : "online"}">${o.payment_method === "cash" ? "Tunai" : "Online"}</span>`,
                    },
                    {
                      id: "total",
                      header: { text: "Total", css: "numeric" },
                      fillspace: 1,
                      format: money,
                      css: "numeric",
                    },
                  ],
                  recentSales(),
                  {
                    id: "dashboardRecentSales",
                    height: 300,
                    scrollX: false,
                    scrollY: true,
                  },
                ),
              ],
            },
          ],
        },
      ],
    },
  };
}
