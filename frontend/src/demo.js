// Data simulasi frontend. Tidak tersambung ke akun, database, atau pembayaran.
export const state = {
  role: "manager",
  currentUser: null,
  shift: null,
  shifts: [],
  cart: [],
  sales: [],
  movements: [],
  categories: [
    { id: "c1", name: "Minuman" },
    { id: "c2", name: "Makanan" },
    { id: "c3", name: "Kebutuhan rumah" },
  ],
  users: [
    {
      id: "u1",
      name: "Dina Pratiwi",
      username: "dina",
      assigned_shift: "shift_1",
      active: true,
    },
    {
      id: "u2",
      name: "Raka Putra",
      username: "raka",
      assigned_shift: "shift_2",
      active: true,
    },
  ],
  products: [
    {
      id: "p1",
      sku: "MNM-001",
      name: "Air mineral 600 ml",
      category: "c1",
      price: 4000,
      stock: 48,
      minimum: 10,
      active: true,
    },
    {
      id: "p2",
      sku: "MNM-002",
      name: "Teh melati 350 ml",
      category: "c1",
      price: 5500,
      stock: 24,
      minimum: 8,
      active: true,
    },
    {
      id: "p3",
      sku: "MNM-003",
      name: "Susu UHT cokelat 250 ml",
      category: "c1",
      price: 7000,
      stock: 6,
      minimum: 10,
      active: true,
    },
    {
      id: "p4",
      sku: "MKN-001",
      name: "Roti gandum",
      category: "c2",
      price: 18000,
      stock: 12,
      minimum: 5,
      active: true,
    },
    {
      id: "p5",
      sku: "MKN-002",
      name: "Biskuit kelapa 300 g",
      category: "c2",
      price: 12000,
      stock: 18,
      minimum: 5,
      active: true,
    },
    {
      id: "p6",
      sku: "MKN-003",
      name: "Mi instan goreng",
      category: "c2",
      price: 3500,
      stock: 60,
      minimum: 15,
      active: true,
    },
    {
      id: "p7",
      sku: "RMH-001",
      name: "Tisu wajah 200 lembar",
      category: "c3",
      price: 15000,
      stock: 4,
      minimum: 5,
      active: true,
    },
    {
      id: "p8",
      sku: "RMH-002",
      name: "Sabun cuci piring 750 ml",
      category: "c3",
      price: 16500,
      stock: 16,
      minimum: 5,
      active: true,
    },
  ],
};
export const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export const date = (value) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const total = () =>
  state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
export const completed = () =>
  state.sales.filter(
    (s) => s.status === "completed" && s.payment_status === "paid",
  );
export const categoryName = (id) =>
  state.categories.find((c) => c.id === id)?.name || "Tanpa kategori";
export const uid = () => crypto.randomUUID();
