import { state, money, date, completed } from "../../demo.js";
import { heading, table, button } from "./common.js";
const hourly = [
  ["08.00", 4],
  ["09.00", 7],
  ["10.00", 9],
  ["11.00", 11],
  ["12.00", 18],
  ["13.00", 15],
  ["14.00", 10],
  ["15.00", 8],
  ["16.00", 12],
  ["17.00", 16],
];
const demoSales = [
  {
    id: "RTL-000086",
    cashier: "Dewi",
    payment_method: "cash",
    total: 41000,
    status: "completed",
    payment_status: "paid",
  },
  {
    id: "RTL-000085",
    cashier: "Dewi",
    payment_method: "online",
    total: 128500,
    status: "completed",
    payment_status: "paid",
  },
  {
    id: "RTL-000084",
    cashier: "Dewi",
    payment_method: "cash",
    total: 23000,
    status: "completed",
    payment_status: "paid",
  },
  {
    id: "RTL-000083",
    cashier: "Dewi",
    payment_method: "cash",
    total: 67500,
    status: "completed",
    payment_status: "paid",
  },
  {
    id: "RTL-000082",
    cashier: "Dewi",
    payment_method: "online",
    total: 15000,
    status: "completed",
    payment_status: "paid",
  },
  ...Array.from({ length: 15 }, (_, index) => {
    const number = 81 - index;
    return {
      id: `RTL-${String(number).padStart(6, "0")}`,
      cashier: index % 2 ? "Dewi" : "Rani",
      payment_method: index % 3 ? "cash" : "online",
      total: [32000, 78500, 12500, 96000, 45000][index % 5],
      status: "completed",
      payment_status: "paid",
    };
  }),
];
const e = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function hourlyChart() {
  const peak = Math.max(...hourly.map(([, value]) => value));
  return `<div class="chart-bars">${hourly.map(([hour, value], i) => `<div class="chart-col"><b>${value}</b><span class="chart-bar ${i === 4 ? "peak" : ""}" style="height:${Math.round((value / peak) * 192)}px"></span><small>${hour}</small></div>`).join("")}</div>`;
}
function shiftsPanel() {
  if (state.shift)
    return `<div class="running-shift"><div class="shift-line"><strong>Dina · Register 01</strong><span class="state-tag good">Terbuka</span></div><p>Shift 1 · sejak ${date(state.shift.opened_at)}</p><button class="force-close" onclick="location.hash='shifts'">Tutup paksa shift</button></div><div class="next-shift"><strong>Shift 2 · 15.00–22.00</strong><span class="state-tag">Belum mulai</span><p>Menunggu kasir membuka shift.</p></div>`;
  return '<div class="next-shift"><strong>Belum ada shift yang dibuka</strong><span class="state-tag">Register siap</span><p>Shift 1 · 07.00–15.00 WIB</p></div><div class="next-shift"><strong>Shift 2 · 15.00–22.00</strong><span class="state-tag">Belum mulai</span><p>Menunggu kasir membuka shift.</p></div>';
}
export function dashboard(navigate) {
  const low = state.products
    .filter((p) => p.active && p.stock <= p.minimum)
    .slice(0, 4);
  const sales = completed();
  const shown = sales.length ? sales : demoSales;
  const revenue = sales.length
    ? sales.reduce((n, s) => n + s.total, 0)
    : 12400000;
  const count = sales.length || 86;
  const avg = Math.round(revenue / count);
  const currentDate = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
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
            heading("Dasbor hari ini", currentDate + " · data contoh"),
            {},
            {
              ...button("Hari ini", () => {}),
              height: 56,
              css: "dashboard-action today-action",
            },
            {
              ...button("Lihat laporan", () => navigate("reports"), true),
              height: 56,
              css: "dashboard-action report-action",
            },
          ],
        },
        {
          view: "template",
          height: 120,
          css: "manager-kpis",
          template: `<div class="kpi-sales"><span>Total penjualan</span><strong class="kpi-money">${money(revenue)}</strong></div><div class="kpi-count"><span>Transaksi</span><strong>${count}</strong></div><div class="kpi-average"><span>Rata-rata / transaksi</span><strong class="kpi-money">${money(avg)}</strong></div><div class="kpi-shifts"><span>Shift terbuka</span><strong>1 dari 2</strong></div>`,
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
                  height: 54,
                  css: "panel-heading",
                  template:
                    "<h2>Transaksi per jam</h2><span>Jumlah transaksi · berdasarkan waktu bayar</span>",
                },
                { view: "template", css: "sales-chart", template: hourlyChart },
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
                  [...shown].reverse(),
                  { height: 300, scrollX: false, scrollY: true },
                ),
              ],
            },
          ],
        },
      ],
    },
  };
}
