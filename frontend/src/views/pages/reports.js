import { state, money, completed } from "../../demo.js";
import { heading, button } from "./common.js";

const PAGE_SIZE = 10;

const e = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pct = (n, digits = 1) =>
  n.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + "%";
const icon = (paths) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICON_MONEY = icon(
  '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
);
const ICON_RECEIPT = icon(
  '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
);
const ICON_BOX = icon(
  '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
);
const ICON_CALENDAR = icon(
  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
);

// Nama kategori produk. Sesuaikan jika field kategori di state.products berbeda.
function categoryOf(id) {
  const p = state.products.find((x) => x.id === id);
  const c = p && (p.category_name ?? p.category?.name ?? p.category);
  if (typeof c === "string") {
    const category = state.categories.find((item) => item.id === c);
    if (category) return category.name;
  }
  return typeof c === "string" && c ? c : "Tanpa kategori";
}

function exportCsv(list) {
  const csv =
    "Produk,Unit,Total\n" +
    list
      .map(
        (p) =>
          `"${p.name.replace(/"/g, '""').replace(/^[=+@-]/, "'")}",${p.quantity},${p.total}`,
      )
      .join("\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "ritely-laporan-demo.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reports() {
  const sales = completed();
  const units = {};
  sales.forEach((s) =>
    s.items.forEach((i) => {
      units[i.id] ??= { id: i.id, name: i.name, quantity: 0, total: 0 };
      units[i.id].quantity += i.quantity;
      units[i.id].total += i.price * i.quantity;
    }),
  );
  let all = Object.values(units).sort((a, b) => b.quantity - a.quantity);
  const demoOnly = !sales.length;
  if (demoOnly) {
    const sampleUnits = [24, 19, 16, 13, 11, 9, 7, 5];
    all = state.products
      .filter((product) => product.active)
      .map((product, index) => {
        const quantity = sampleUnits[index % sampleUnits.length];
        return {
          id: product.id,
          name: product.name,
          quantity,
          total: product.price * quantity,
        };
      })
      .sort((a, b) => b.quantity - a.quantity);
  }
  const revenue = demoOnly
    ? all.reduce((n, product) => n + product.total, 0)
    : sales.reduce((n, s) => n + s.total, 0);
  const unitCount = all.reduce((n, p) => n + p.quantity, 0);

  // Ringkasan metode pembayaran
  const split = {
    cash: { count: 0, total: 0 },
    online: { count: 0, total: 0 },
  };
  sales.forEach((s) => {
    const k = s.payment_method === "online" ? "online" : "cash";
    split[k].count += 1;
    split[k].total += s.total;
  });
  if (demoOnly) {
    split.cash.count = 52;
    split.online.count = 34;
    split.cash.total = Math.round(revenue * 0.64);
    split.online.total = revenue - split.cash.total;
  }
  const cashPct = revenue ? Math.round((split.cash.total / revenue) * 100) : 0;
  const onlinePct = revenue ? 100 - cashPct : 0;

  // Kontribusi kategori
  const byCategory = {};
  all.forEach((p) => {
    const c = categoryOf(p.id);
    byCategory[c] = (byCategory[c] ?? 0) + p.total;
  });
  const cats = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Ukuran panel dihitung dari jumlah baris agar tidak terpotong
  const top = all.slice(0, PAGE_SIZE);
  const maxQty = top[0]?.quantity || 1;
  const catH = 111 + (cats.length ? 76 * cats.length : 60);
  const payH = 270;
  const leftH = top.length ? 131 + 64 * top.length + 110 : 300;
  const panelsH = Math.max(leftH, payH + 16 + catH);

  const kpiTemplate =
    `<div><i class="kpi-icon" style="background:#e8efff;color:#1d4ed8">${ICON_MONEY}</i><span>Total penjualan</span><strong class="kpi-money">${money(revenue)}</strong></div>` +
    `<div><i class="kpi-icon" style="background:#e3f5eb;color:#197344">${ICON_RECEIPT}</i><span>Transaksi</span><strong>${demoOnly ? 86 : sales.length}</strong></div>` +
    `<div><i class="kpi-icon" style="background:#ffead8;color:#a3471d">${ICON_BOX}</i><span>Unit terjual</span><strong>${unitCount}</strong></div>`;

  let page = 0;
  const renderList = () => {
    const rows = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const listRows = rows
      .map((p, i) => {
        const rank = page * PAGE_SIZE + i;
        return (
          `<div class="rp-row"><span class="rp-rank${rank < 3 ? " top" : ""}">${rank + 1}</span>` +
          `<div class="rp-name"><b>${e(p.name)}</b><small>${e(categoryOf(p.id))}</small></div>` +
          `<div class="rp-unit"><b>${p.quantity}</b><div class="rp-track"><i class="${rank < 3 ? "dark" : ""}" style="width:${Math.max(4, Math.round((p.quantity / maxQty) * 100))}%"></i></div></div>` +
          `<span class="rp-money">${money(p.total)}</span>` +
          `<span class="rp-share">${revenue ? pct((p.total / revenue) * 100) : "-"}</span></div>`
        );
      })
      .join("");
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const pager = `<div class="rp-pagination"><span>Halaman ${page + 1} dari ${pages}</span><div><button class="rp-page-prev" aria-label="Halaman sebelumnya" ${page === 0 ? "disabled" : ""}>‹</button><button class="rp-page-next" aria-label="Halaman berikutnya" ${page >= pages - 1 ? "disabled" : ""}>›</button></div></div>`;
    const listFoot = demoOnly
      ? "Data produk contoh untuk pratinjau. Angka transaksi dan penjualan akan terisi setelah kasir menyelesaikan transaksi."
      : `Kontribusi dihitung terhadap total penjualan ${money(revenue)}.`;
    return (
      `<div class="rp-head"><div><h2>Produk terlaris</h2><span class="rp-sub">Diurutkan berdasarkan unit terjual</span></div><span class="rp-count">${all.length} produk</span></div>` +
      (top.length
        ? `<div class="rp-row rp-th"><span>#</span><span>Produk</span><span>Unit terjual</span><span class="r">Total penjualan</span><span class="r">Kontribusi</span></div>${listRows}<div class="rp-foot">${listFoot}</div>${pager}`
        : `<div class="rp-empty">Belum ada transaksi selesai. Selesaikan checkout dari peran Kasir untuk mengisi laporan.</div>`)
    );
  };

  const stackParts =
    (split.cash.total
      ? `<i class="cash" style="flex:${split.cash.total}"></i>`
      : "") +
    (split.online.total
      ? `<i class="online" style="flex:${split.online.total}"></i>`
      : "");
  const paymentHtml =
    `<div class="rp-head"><div><h2>Metode pembayaran</h2><span class="rp-sub">${demoOnly ? "Ringkasan 86 transaksi contoh" : `Dari ${sales.length} transaksi lunas`}</span></div></div>` +
    `<div class="rp-stack${stackParts ? "" : " empty"}" role="img" aria-label="Tunai ${cashPct} persen, Online ${onlinePct} persen">${stackParts}</div>` +
    `<div class="rp-leg"><span class="sw cash"></span><div><b>Tunai</b><small>${split.cash.count} transaksi</small></div><div class="amt"><b>${money(split.cash.total)}</b><small>${cashPct}%</small></div></div>` +
    `<div class="rp-leg"><span class="sw online"></span><div><b>Online (Midtrans)</b><small>${split.online.count} transaksi</small></div><div class="amt"><b>${money(split.online.total)}</b><small>${onlinePct}%</small></div></div>`;

  const categoryHtml =
    `<div class="rp-head"><div><h2>Kontribusi kategori</h2><span class="rp-sub">Berdasarkan total penjualan</span></div></div>` +
    (cats.length
      ? cats
          .map(([name, total], i) => {
            const share = revenue ? (total / revenue) * 100 : 0;
            return `<div class="rp-cat"><div class="t">${e(name)}<span>${Math.round(share)}%</span></div><div class="rp-track"><i class="${i === 0 ? "dark" : ""}" style="width:${Math.max(2, Math.round(share))}%"></i></div><small>${money(total)}</small></div>`;
          })
          .join("")
      : `<p class="rp-empty">Belum ada data kategori.</p>`);

  const reportActions = {
    width: 128,
    rows: [
      {},
      {
        height: 44,
        ...button("Ekspor CSV", () => exportCsv(all), true),
        width: 128,
        height: 44,
        inputHeight: 44,
        css: "report-export",
      },
      {},
    ],
  };

  return {
    view: "scrollview",
    scroll: "y",
    body: {
      padding: 24,
      margin: 16,
      rows: [
        {
          height: 88,
          cols: [
            heading(
              "Laporan penjualan",
              "Seluruh sesi demo · Dihitung hanya dari transaksi completed dan paid.",
            ),
            {},
            reportActions,
          ],
        },
        {
          view: "template",
          height: 120,
          css: "manager-kpis report-kpis",
          template: kpiTemplate,
        },
        {
          height: panelsH,
          margin: 16,
          cols: [
            {
              view: "template",
              id: "bestSellingList",
              minWidth: 560,
              css: "report-card report-list",
              template: renderList,
              onClick: {
                "rp-page-prev": function () {
                  if (page > 0) {
                    page--;
                    this.setHTML(renderList());
                  }
                },
                "rp-page-next": function () {
                  if (page < Math.ceil(all.length / PAGE_SIZE) - 1) {
                    page++;
                    this.setHTML(renderList());
                  }
                },
              },
            },
            {
              width: 380,
              margin: 16,
              rows: [
                {
                  view: "template",
                  height: payH,
                  css: "report-card",
                  template: paymentHtml,
                },
                {
                  view: "template",
                  height: catH,
                  css: "report-card",
                  template: categoryHtml,
                },
                {},
              ],
            },
          ],
        },
      ],
    },
  };
}
