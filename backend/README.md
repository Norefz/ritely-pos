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

Pasang dependensi dan jalankan aplikasi dari folder ini. Server Flask menyajikan
frontend dan API sekaligus, jadi cukup jalankan satu proses:

```sh
pip install -r requirements.txt
python main.py
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
untuk membuat akun Manajer pertama. Seeder idempotent dan tidak mengubah akun yang
sudah ada. Pembuatan dan perubahan akun Kasir beserta catatan `audit_logs`
memerlukan MongoDB replica set agar transaksi berjalan atomik:

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

