# Backend Ritely POS

Backend Flask dengan pemisahan MVC dan Service Layer.

- `app/controllers`: route Flask dan penanganan request/response.
- `app/services`: aturan bisnis, orkestrasi transaksi, dan query MongoDB per fitur.
- `app/models`: representasi dan validasi bentuk data aplikasi.
- `app/integrations`: adapter layanan eksternal, termasuk Midtrans.
- `app/middleware`: autentikasi, otorisasi, dan penanganan error lintas endpoint.
- `app/config`: konfigurasi aplikasi berdasarkan environment.
- `app/database`: koneksi MongoDB, index, dan seeder CLI.

## MongoDB

Isi `MONGO_URI` pada `backend/.env` setelah URI MongoDB tersedia. File `.env` lokal
diabaikan Git; gunakan `.env.example` sebagai daftar variabel konfigurasi.

Pasang dependensi dan jalankan backend dari folder ini:

```sh
pip install -r requirements.txt
python main.py
```

`http://127.0.0.1:5000/` menampilkan status API. Periksa koneksi database
melalui `GET http://127.0.0.1:5000/api/health/db`.
Endpoint mengembalikan `connected` jika perintah MongoDB `ping` berhasil,
`not_configured` jika `MONGO_URI` masih kosong, atau `disconnected` jika server
tidak dapat dijangkau.

