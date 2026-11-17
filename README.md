# Ritely POS

Ritely POS adalah aplikasi point of sale berbasis web untuk toko kecil. Aplikasi ini menghubungkan proses kasir, pembayaran, pengelolaan stok, jadwal shift, dan laporan penjualan dalam satu sistem.

**Demo:** [ritely-pos.vercel.app](https://ritely-pos.vercel.app/) · **Pembayaran:** Midtrans Sandbox

## Fitur

### Kasir

- Cari produk, gunakan filter kategori, dan kelola keranjang belanja.
- Proses pembayaran tunai dengan nominal diterima dan perhitungan kembalian.
- Proses pembayaran online melalui Midtrans Snap Sandbox.
- Lihat riwayat transaksi, lanjutkan pembayaran yang masih pending, atau batalkan pesanan.
- Buka shift kapan saja pada branch demo; penutupan tetap mengikuti jadwal kasir.

### Manajer

- Pantau ringkasan penjualan, transaksi, performa produk, dan shift berjalan.
- Kelola produk, kategori, harga, gambar, status aktif, dan stok awal.
- Lihat stok sistem dan stok fisik, lakukan penyesuaian, serta catat stock opname.
- Lihat riwayat transaksi dan status pembayaran.
- Tinjau ketepatan waktu penutupan shift, termasuk penutupan paksa dengan alasan.
- Lihat laporan penjualan dan metode pembayaran berdasarkan periode, lalu ekspor CSV.
- Kelola akun kasir dan tinjau log audit.

### Pembayaran dan pencatatan

- Backend memverifikasi notifikasi Midtrans menggunakan signature key, dan dapat memeriksa status transaksi ke Midtrans untuk rekonsiliasi.
- Transaksi dan perubahan stok disimpan di MongoDB. Stok baru dikurangi ketika transaksi berstatus lunas.
- Aksi penting seperti perubahan katalog, stok, akun, dan shift dicatat di log audit.

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Frontend | JavaScript ES modules, Webix, CSS |
| Backend | Python, Flask, REST API |
| Database | MongoDB, PyMongo |
| Autentikasi | JWT dan bcrypt |
| Pembayaran | Midtrans Snap Sandbox dan webhook |

Backend menggunakan application factory Flask dan memisahkan controller, service, model, integrasi eksternal, serta akses database. Frontend dan API dapat disajikan bersama oleh aplikasi Flask.

## Menjalankan secara lokal

Perlu Python 3 dan MongoDB yang dapat dijangkau dari lingkungan lokal.

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r requirements.txt
cp backend/.env.example backend/.env
```

Isi `backend/.env` dengan `MONGO_URI` dan secret JWT acak. Untuk pembayaran Sandbox, isi juga key Midtrans. Jangan commit `.env` atau key rahasia.

Buat akun manager dari direktori `backend`; username dan password akan diminta di terminal, dan input password disembunyikan:

```sh
cd backend
.venv/bin/flask --app app:create_app create-manager
cd ..
```

> [!TIP]
> Seeder di [panduan backend](backend/README.md) dapat mengisi katalog, riwayat shift, dan transaksi contoh untuk development. Setiap shift contoh memiliki empat transaksi lunas (tunai dan online) serta satu pembatalan; penjualannya minimal Rp200.000 per shift. Data ini mengisi laporan, tetapi tidak mengubah stok atau menghubungi Midtrans. Arahkan seeder hanya ke database development.

Jalankan aplikasi:

```sh
backend/.venv/bin/python main.py
```

Buka <http://127.0.0.1:5000/>. Status koneksi database dapat diperiksa melalui <http://127.0.0.1:5000/api/health/db>.

## Konfigurasi Midtrans

Pembayaran online pada proyek ini menggunakan **Sandbox**, bukan transaksi uang sungguhan. Atur `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, dan `MIDTRANS_SIGNATURE_SECRET_KEY` di `backend/.env`. Untuk menerima notifikasi pembayaran, konfigurasi Payment Notification URL Midtrans ke:

```text
https://<domain-backend>/api/payments/midtrans/notification
```

> [!IMPORTANT]
> Jangan pernah mengirim Server Key atau Signature Secret Key ke frontend atau menyimpannya di repository. Detail konfigurasi, endpoint API, skema database, dan seeder tersedia di [backend/README.md](backend/README.md).

## Struktur repository

```text
backend/       Flask API, business logic, koneksi MongoDB, dan seeder
frontend/      UI kasir dan manajer
Ritely_Logo/   Aset logo
SRS/           Dokumen kebutuhan sistem
main.py        Entry point lokal dan deployment Vercel
```
