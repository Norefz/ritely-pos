# Backend Ritely POS

Backend Flask dengan pemisahan MVC dan Service Layer.

- `app/controllers`: route Flask dan penanganan request/response.
- `app/services`: aturan bisnis, orkestrasi transaksi, dan query MongoDB per fitur.
- `app/models`: representasi dan validasi bentuk data aplikasi.
- `app/integrations`: adapter layanan eksternal, termasuk Midtrans.
- `app/middleware`: autentikasi, otorisasi, dan penanganan error lintas endpoint.
- `app/config.py`: konfigurasi aplikasi berdasarkan environment.
- `app/database`: koneksi MongoDB, index, dan seeder CLI.

## MongoDB

Isi `MONGO_URI` pada `backend/.env` setelah URI MongoDB tersedia. File `.env` lokal
diabaikan Git; gunakan `.env.example` sebagai daftar variabel konfigurasi. Isi
`JWT_SECRET_KEY` dengan secret acak (misalnya hasil
`python -c "import secrets; print(secrets.token_hex(32))"`) dan atur
`JWT_ACCESS_TOKEN_MINUTES` serta `BCRYPT_ROUNDS` sesuai lingkungan deployment.
`CORS_ALLOWED_ORIGINS` membatasi origin frontend (default untuk server lokal
port 8080). Jangan kirim token melalui koneksi HTTP di luar lingkungan development.

Pasang dependensi dan jalankan aplikasi dari root repository. Satu `main.py` di
root memuat aplikasi backend dan menyajikan frontend serta API sekaligus:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r requirements.txt
backend/.venv/bin/python main.py
```

Buka `http://127.0.0.1:5000/` untuk frontend. Periksa koneksi database
melalui `GET http://127.0.0.1:5000/api/health/db`.
Endpoint mengembalikan `connected` jika perintah MongoDB `ping` berhasil,
`not_configured` jika `MONGO_URI` masih kosong, atau `disconnected` jika server
tidak dapat dijangkau.

## Akun pengguna

Collection `users` mengikuti SRS: `_id`, `name`, `username`, `password_hash`,
`role`, `assigned_shift` dan `employee_id` untuk Kasir, `is_active`, dan `created_at`.
`_id` adalah ID internal MongoDB; `employee_id` adalah ID karyawan yang ditampilkan
di UI dengan format `KSR-0001`. Username
memiliki unique index; password disimpan dengan bcrypt. Role yang diizinkan
adalah `manager` dan `cashier`.

Untuk mengisi ID karyawan pada akun Kasir yang sudah ada, jalankan migrasi satu
kali dari folder `backend`:

```sh
python -m app.database.seeders.employee_ids
```

Atur `INITIAL_MANAGER_NAME`, `INITIAL_MANAGER_USERNAME`, dan
`INITIAL_MANAGER_PASSWORD` di `backend/.env`, lalu jalankan dari folder `backend`
untuk membuat akun Manajer pertama sekaligus menyiapkan index database. Seeder
idempotent dan tidak mengubah akun yang sudah ada. Pembuatan index dilakukan saat
setup ini, bukan setiap request. Pembuatan dan perubahan akun Kasir beserta
catatan `audit_logs` memerlukan MongoDB replica set agar transaksi berjalan atomik:

```sh
python -m app.database.seeders.initial
```

Login memakai `POST /api/auth/login` dan menghasilkan access token JWT Bearer.
Kirim token pada header `Authorization: Bearer <token>`. `GET /api/auth/me`
mengembalikan pengguna aktif. `POST /api/auth/logout` mencabut token hingga
masa berlakunya habis; MongoDB menyimpan daftar pencabutan sementara di
`revoked_tokens` dengan TTL index. Manajer dapat melihat akun melalui `GET /api/users`, membuat
akun Kasir melalui `POST /api/users` dengan `name`, `username`, `password`, dan
`assigned_shift` (`shift_1` atau `shift_2`), serta mengubah profil/status Kasir
melalui `PATCH /api/users/<id>`.

## Data awal katalog produk

Seeder katalog menyediakan lima kategori dan 25 produk aktif dengan stok awal
agar halaman Produk Manajer dan halaman Kasir bisa langsung dicoba. Kedua halaman
membaca katalog yang sama dari `GET /api/catalog`; seeder tidak membuat salinan
data di frontend. Produk dibedakan dengan SKU dan aman diperiksa berulang kali:
data SKU yang sudah ada, termasuk harga atau stok yang sudah diubah, tidak ditimpa.

Jalankan dari root repository dalam lingkungan development dan arahkan ke
database yang akan dipakai oleh aplikasi. Untuk database dengan nama standar
`ritely-pos`, sebutkan target secara eksplisit melalui `RITELY_CONFIRM_DATABASE`:

```sh
PYTHONPATH=backend RITELY_ENVIRONMENT=development \
  RITELY_CONFIRM_DATABASE=ritely-pos \
  backend/.venv/bin/python -m app.database.seeders.catalog_products
```

Halaman Produk Manajer menampilkan 10 produk per halaman;
halaman Kasir menampilkan semua produk aktif dan menyediakan filter kategori.

## Shift

Shift tersimpan di collection `shifts`. `GET /api/shifts` mengembalikan shift aktif
dan riwayat (Manajer melihat semua; Kasir hanya riwayatnya sendiri). Kasir membuka
shift dengan `POST /api/shifts/open` dan menutup shift miliknya melalui
`POST /api/shifts/<id>/close`. Manajer dapat menutup shift aktif dari halaman
Shift dengan menyertakan alasan; aksi buka/tutup dicatat pada `audit_logs`.
Index unik pada shift berstatus `open` memastikan hanya satu shift aktif di toko.
Pada mode operasional, kasir hanya dapat membuka shift sesuai penugasannya dan
dalam rentang WIB: Shift 1 07.00–15.00, Shift 2 15.00–22.00 (awal termasuk,
akhir tidak termasuk). Sistem tidak menutup shift otomatis. Kasir dapat menutup
shift sendiri pada atau setelah waktu akhir; Manajer dapat force close kapan saja
dengan alasan. Keduanya ditolak jika shift masih memiliki transaksi `pending`.
Karena itu, kasir berikutnya baru dapat membuka shift setelah shift aktif ditutup.
Penjualan dan jumlah transaksi shift dihitung saat diminta dari transaksi
`completed`/`paid`, bukan disimpan sebagai total manual pada dokumen shift.

Shift dan transaksi POS tersimpan di backend. Pembayaran tunai diselesaikan
langsung saat checkout, sedangkan transaksi online menunggu verifikasi Midtrans
Sandbox sebelum penjualan selesai dan stok dikurangi.

# Midtrans Snap Sandbox

Checkout tunai dan pembayaran online tersimpan di collection `sales`. Online memakai Midtrans Snap Sandbox; pembayaran hanya dianggap lunas setelah status diverifikasi backend melalui webhook atau status API Midtrans. Server Key tidak pernah dikirim ke browser.

Isi konfigurasi berikut di `backend/.env` (jangan commit file `.env`):

```dotenv
MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_CLIENT_KEY=SB-Mid-client-...
MIDTRANS_TIMEOUT_SECONDS=12
```

Ambil kedua key dari **Midtrans Dashboard → Settings → Access Keys → Sandbox**. Environment aplikasi ini menggunakan endpoint Sandbox; jangan masukkan key Production.

Atur **Payment Notification URL** pada pengaturan Midtrans ke:

```text
https://<alamat-backend-publik>/api/payments/midtrans/notification
```

Untuk pengujian lokal `127.0.0.1`, webhook Midtrans tidak dapat menjangkau komputer secara langsung. Gunakan URL HTTPS publik/tunnel yang mengarah ke port backend `5000`, atau deploy backend terlebih dahulu. Setelah mengubah `.env`, restart backend. Di Kasir pilih **Online (Midtrans Sandbox)**; status pembayaran tetap diverifikasi backend dan tidak dipercaya dari redirect browser.

Index collection `sales` akan dibuat otomatis saat checkout pertama. Seeder `catalog_products`/`initial` juga membuat index yang sama.
