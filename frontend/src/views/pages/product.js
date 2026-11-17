import { state, money, categoryName, escape } from "../../state.js";
import { heading, table, button, editor } from "./common.js";
import {
  ApiError,
  createCategoryRequest,
  createProductRequest,
  updateProductRequest,
  apiAssetUrl,
} from "../../api.js";
import { productImageStyle } from "../product-images.js";

/* ---------- Halaman Produk: konfigurasi & helper ---------- */
const PAGE_SIZE = 10;
// Status filter bertahan selama sesi, termasuk saat refresh() membangun ulang halaman.
const view = { q: "", category: "all", low: false, page: 1 };
const TONES = ["", "orange", "purple", "green"]; // warna avatar per urutan kategori

const svg = (path) =>
  `<svg class="pd-ico" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  pencil: svg(
    '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  ),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};

// Stok menipis = di bawah batas minimum (FR-24) atau habis.
const lowStock = (p) => p.stock <= 0 || p.stock < p.minimum;

function initials(name) {
  const w = name.trim().split(/\s+/);
  return (
    w.length > 1 ? w[0][0] + w[1][0] : name.trim().slice(0, 2)
  ).toUpperCase();
}
function tone(categoryId) {
  const i = state.categories.findIndex((c) => c.id === categoryId);
  return TONES[(i < 0 ? 0 : i) % TONES.length];
}
function productImageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const separator = result.indexOf(",");
      if (separator < 0) return reject(new Error("Gambar tidak dapat dibaca."));
      resolve({ content_type: file.type, data: result.slice(separator + 1) });
    };
    reader.onerror = () => reject(new Error("Gambar tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
}
function stockTag(p) {
  if (p.stock <= 0) return '<span class="stock-tag empty">Habis</span>';
  return lowStock(p)
    ? '<span class="stock-tag warning">Menipis</span>'
    : '<span class="stock-tag good">Aman</span>';
}
function filtered() {
  const q = view.q.trim().toLowerCase();
  return state.products.filter(
    (p) =>
      (view.category === "all" || p.category === view.category) &&
      (!view.low || lowStock(p)) &&
      (!q || (p.name + " " + p.sku).toLowerCase().includes(q)),
  );
}
function pageItems(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur - 1, cur, cur + 1]);
  if (cur <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (cur >= total - 2)
    [total - 3, total - 2, total - 1].forEach((n) => set.add(n));
  const nums = [...set]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/* ---------- Potongan HTML ---------- */
function statsHtml() {
  const low = state.products.filter(lowStock);
  const active = state.products.filter((p) => p.active).length;
  return `
    <div class="pd-stat"><span>Total produk</span><strong>${state.products.length}</strong></div>
    <div class="pd-stat"><span>Aktif</span><strong>${active}</strong></div>
    <div class="pd-stat warn"><span>Stok menipis</span><strong>${low.length}</strong></div>`;
}
function chipsHtml() {
  const chip = (value, label, count) =>
    `<button type="button" class="pd-chip${view.category === value ? " on" : ""}" data-act="cat" data-value="${escape(String(value))}" aria-pressed="${view.category === value}">${escape(label)} <i>${count}</i></button>`;
  return (
    chip("all", "Semua", state.products.length) +
    state.categories
      .map((c) =>
        chip(
          c.id,
          c.name,
          state.products.filter((p) => p.category === c.id).length,
        ),
      )
      .join("") +
    `<button type="button" class="pd-chip pd-low${view.low ? " on" : ""}" data-act="low" aria-pressed="${view.low}"><span class="pd-dot"></span>Stok menipis</button>`
  );
}
function rowHtml(p) {
  const photoStyle = p.imageUrl ? "" : productImageStyle(p.sku);
  const photo = p.imageUrl
    ? `<img src="${escape(apiAssetUrl(p.imageUrl))}" alt="" loading="lazy" onload="this.parentElement.classList.add('has-image')" onerror="this.remove()">`
    : "";
  const hasPhoto = !!photoStyle || !!photo;
  return `<tr>
    <td class="pd-sku">${escape(p.sku)}</td>
    <td><div class="pd-name"><i class="pd-av ${tone(p.category)}${hasPhoto ? " pd-product-photo" : ""}${photoStyle ? " pd-generated-photo" : ""}"${photoStyle ? ` style="${photoStyle}"` : ""} aria-hidden="true">${photo}${photo ? `<span>${escape(initials(p.name))}</span>` : hasPhoto ? "" : escape(initials(p.name))}</i><b>${escape(p.name)}</b></div></td>
    <td>${escape(categoryName(p.category))}</td>
    <td class="pd-price">${money(p.price)}</td>
    <td><div class="pd-stock"><b>${p.stock}</b>${stockTag(p)}</div></td>
    <td><span class="pd-status ${p.active ? "on" : "off"}">${p.active ? "Aktif" : "Nonaktif"}</span></td>
    <td class="pd-act"><button type="button" class="pd-edit" data-act="edit" data-id="${escape(String(p.id))}" aria-label="Ubah ${escape(p.name)}">${icons.pencil}Ubah</button></td>
  </tr>`;
}

function imageUploadField(product) {
  const existing = product.id ? product.imageUrl : "";
  const preview = existing
    ? `<img class="pd-image-preview" src="${escape(apiAssetUrl(existing))}" alt="Foto ${escape(product.name || "produk saat ini")}" onerror="this.remove()">`
    : "";
  return {
    view: "template",
    autoheight: true,
    borderless: true,
    css: "pd-image-upload-field",
    template: `<label class="pd-image-upload">${preview}<span class="pd-image-upload-copy"><b>Foto produk</b><small>Unggah JPEG, PNG, atau WebP. Maksimal 1 MB.</small></span><input class="pd-image-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Unggah foto produk"></label>`,
  };
}
function listHtml(rows) {
  return rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="7" class="pd-empty">Tidak ada produk yang cocok dengan pencarian atau filter ini.</td></tr>`;
}
function footHtml(total, pages, from, to) {
  const text = total
    ? `Menampilkan ${from}–${to} dari ${total} produk`
    : "Menampilkan 0 produk";
  if (pages < 2) return `<span>${text}</span>`;
  const btn = (act, label, inner, page, disabled, on) =>
    `<button type="button" class="pd-pg${on ? " on" : ""}" data-act="page" data-page="${page}" aria-label="${label}"${on ? ' aria-current="page"' : ""}${disabled ? " disabled" : ""}>${inner}</button>`;
  const nums = pageItems(view.page, pages)
    .map((n) =>
      n === "…"
        ? '<span class="pd-gap">…</span>'
        : btn("page", `Halaman ${n}`, n, n, false, n === view.page),
    )
    .join("");
  return `<span>${text}</span>
    <nav class="pd-pager" aria-label="Halaman produk">
      ${btn("page", "Halaman sebelumnya", icons.prev, view.page - 1, view.page === 1)}
      ${nums}
      ${btn("page", "Halaman berikutnya", icons.next, view.page + 1, view.page === pages)}
    </nav>`;
}

function shell() {
  return `
    <div class="pd-head">
      <div><h1>Produk</h1><p>Kelola katalog, harga jual, dan ketersediaan produk.</p></div>
      <button type="button" class="pd-add" data-act="add">${icons.plus}Tambah produk</button>
    </div>
    <section class="pd-card pd-stats" data-part="stats">${statsHtml()}</section>
    <section class="pd-card pd-filters">
      <label class="pd-search">${icons.search}<input type="search" placeholder="Cari nama atau SKU" value="${escape(view.q)}" aria-label="Cari produk" autocomplete="off" /></label>
      <div class="pd-chips" data-part="chips" role="group" aria-label="Filter kategori">${chipsHtml()}</div>
    </section>
    <section class="pd-card">
      <div class="pd-scroll">
        <table class="pd-table">
          <thead><tr>
            <th class="pd-c-sku">SKU</th><th>Produk</th><th class="pd-c-cat">Kategori</th>
            <th class="pd-c-price pd-r">Harga jual</th><th class="pd-c-stock">Stok</th>
            <th class="pd-c-status">Status</th><th class="pd-c-act"><span class="pd-sr">Aksi</span></th>
          </tr></thead>
          <tbody data-part="list"></tbody>
        </table>
      </div>
      <div class="pd-foot" data-part="foot"></div>
    </section>
    <p class="pd-note">${icons.info}Perubahan harga tidak mengubah histori transaksi.</p>`;
}

function numericField(name, label) {
  return {
    view: "text",
    name,
    label,
    type: "number",
    required: true,
    attributes: { inputmode: "numeric", min: "0", step: "1", pattern: "[0-9]*" },
    on: {
      onKeyPress(code, event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return true;
        if (
          (code >= 48 && code <= 57) ||
          (code >= 96 && code <= 105) ||
          [8, 9, 13, 35, 36, 37, 39, 46].includes(code)
        ) return true;
        return false;
      },
      onTimedKeyPress() {
        const input = this.getInputNode();
        if (!input) return;
        const digits = input.value.replace(/\D/g, "");
        if (input.value !== digits) this.setValue(digits);
      },
    },
  };
}

// Mengisi ulang bagian yang berubah tanpa merender ulang kolom pencarian (fokus tetap).
function paint(root) {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), pages);
  const start = (view.page - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const set = (part, html) => {
    const el = root.querySelector(`[data-part="${part}"]`);
    if (el) el.innerHTML = html;
  };
  set("stats", statsHtml());
  set("chips", chipsHtml());
  set("list", listHtml(slice));
  set("foot", footHtml(rows.length, pages, start + 1, start + slice.length));
}

function bind(root, edit) {
  if (root._pdBound) return;
  root._pdBound = true;
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (act === "add") return edit();
    if (act === "edit")
      return edit(state.products.find((p) => String(p.id) === el.dataset.id));
    if (act === "cat") {
      view.category =
        el.dataset.value === "all"
          ? "all"
          : ((
              state.categories.find((c) => String(c.id) === el.dataset.value) ||
              {}
            ).id ?? "all");
      view.page = 1;
    } else if (act === "low") {
      view.low = !view.low;
      view.page = 1;
    } else if (act === "page") {
      view.page = +el.dataset.page;
    }
    paint(root);
  });
  root.addEventListener("input", (e) => {
    if (!e.target.matches(".pd-search input")) return;
    view.q = e.target.value;
    view.page = 1;
    paint(root);
  });
}

export function products(refresh) {
  function edit(
    product = {
      active: true,
      stock: 0,
      initialStock: 0,
      minimum: 5,
      category: state.categories.find((category) => category.active !== false)?.id,
    },
  ) {
    if (!state.categories.some((category) => category.active !== false)) {
      webix.message({ type: "error", text: "Buat kategori aktif terlebih dahulu." });
      return;
    }
    editor(
      product.id ? "Ubah produk" : "Tambah produk",
      [
        { view: "text", name: "name", label: "Nama produk", required: true },
        { view: "text", name: "sku", label: "SKU unik", required: true },
        {
          view: "richselect",
          name: "category",
          label: "Kategori",
          options: state.categories
            .filter((category) => category.active !== false)
            .map((category) => ({ id: category.id, value: category.name })),
          required: true,
        },
        numericField("price", "Harga jual (Rp)"),
        numericField("minimum", "Batas stok minimum"),
        ...(product.id
          ? []
          : [
              numericField("initialStock", "Stok awal"),
              {
                view: "template",
                autoheight: true,
                borderless: true,
                css: "pd-initial-stock-help",
                template: "Stok awal akan mengisi stok sistem dan stok fisik dengan angka yang sama.",
              },
            ]),
        imageUploadField(product),
        {
          view: "checkbox",
          name: "active",
          labelRight: "Produk aktif",
          labelWidth: 0,
        },
      ],
      product,
      async (v, form) => {
        if (
          !v.name.trim() ||
          !v.sku.trim() ||
          !/^\d+$/.test(String(v.price ?? "")) ||
          !Number.isSafeInteger(Number(v.price)) ||
          !/^\d+$/.test(String(v.minimum ?? "")) ||
          !Number.isSafeInteger(Number(v.minimum)) ||
          (!product.id &&
            (!/^\d+$/.test(String(v.initialStock ?? "")) ||
              !Number.isSafeInteger(Number(v.initialStock))))
        ) {
          webix.message({
            type: "error",
            text: "Isi nama, SKU, harga, batas minimum, dan stok awal dengan benar.",
          });
          return false;
        }
        const file = form.$view.querySelector(".pd-image-file")?.files?.[0];
        if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          webix.message({ type: "error", text: "Gunakan gambar JPEG, PNG, atau WebP." });
          return false;
        }
        if (file && file.size > 1_048_576) {
          webix.message({ type: "error", text: "Ukuran gambar maksimal 1 MB." });
          return false;
        }
        if (
          state.products.some((p) => p.sku === v.sku && p.id !== product.id)
        ) {
          webix.message({ type: "error", text: "SKU sudah dipakai." });
          return false;
        }
        const payload = {
          name: v.name.trim(),
          sku: v.sku.trim(),
          category_id: v.category,
          selling_price: +v.price,
          minimum_stock: +v.minimum,
          is_active: !!+v.active,
        };
        if (!product.id) payload.initial_stock = Number(v.initialStock);
        if (file) {
          try {
            payload.image_data = await productImageData(file);
          } catch {
            webix.message({ type: "error", text: "Gambar gagal dibaca." });
            return false;
          }
        }
        try {
          const result = product.id
            ? await updateProductRequest(product.id, payload)
            : await createProductRequest(payload);
          const saved = result.product;
          const value = {
            id: saved.id,
            sku: saved.sku,
            name: saved.name,
            category: saved.category_id,
            price: Number(saved.selling_price),
            stock: saved.stock,
            physicalStock: saved.physical_stock ?? saved.stock,
            minimum: saved.minimum_stock,
            active: saved.is_active,
            imageUrl: saved.image_url || "",
          };
          if (product.id)
            state.products = state.products.map((item) =>
              item.id === product.id ? value : item,
            );
          else state.products.push(value);
          refresh();
          webix.message(product.id ? "Produk diperbarui." : "Produk ditambahkan.");
        } catch (error) {
          const message = error instanceof ApiError && error.code === "sku_taken"
            ? "SKU sudah dipakai."
            : error instanceof ApiError && error.code === "inactive_category"
              ? error.message
              : error instanceof ApiError && error.code === "database_unavailable"
                ? "Database belum dapat dijangkau."
                : "Produk gagal disimpan. Periksa koneksi backend dan datanya.";
          webix.message({ type: "error", text: message });
          return false;
        }
      },
    );
  }
  return {
    view: "template",
    css: "product-page catalog-page",
    borderless: true,
    template: shell,
    on: {
      onAfterRender() {
        paint(this.$view);
        bind(this.$view, edit);
      },
    },
  };
}
export function categories(refresh) {
  return {
    rows: [
      heading(
        "Kategori",
        "Susun produk agar mudah ditemukan saat bertransaksi.",
      ),
      {
        view: "toolbar",
        cols: [
          {},
          button(
            "Tambah kategori",
            () =>
              editor(
                "Kategori baru",
                [
                  {
                    view: "text",
                    name: "name",
                    label: "Nama kategori",
                    required: true,
                  },
                ],
                {},
              async (v) => {
                  const name = v.name.trim();
                  if (
                  !name ||
                  state.categories.some(
                    (c) => c.name.toLowerCase() === name.toLowerCase(),
                  )
                  ) {
                    webix.message({
                      type: "error",
                      text: "Nama kategori kosong atau sudah digunakan.",
                    });
                    return false;
                  }
                try {
                  const result = await createCategoryRequest({ name });
                  state.categories.push({ ...result.category, active: true });
                  refresh();
                  webix.message("Kategori ditambahkan.");
                } catch (error) {
                  const message = error instanceof ApiError && error.code === "category_name_taken"
                    ? "Nama kategori sudah digunakan."
                    : "Kategori gagal disimpan. Periksa koneksi backend.";
                  webix.message({ type: "error", text: message });
                  return false;
                }
                },
              ),
            true,
          ),
        ],
      },
      table(
        [
          { id: "name", header: "Nama kategori", fillspace: 1 },
          {
            id: "count",
            header: "Jumlah produk",
            width: 160,
            template: (c) =>
              state.products.filter((p) => p.category === c.id).length,
          },
        ],
        state.categories,
      ),
    ],
  };
}
