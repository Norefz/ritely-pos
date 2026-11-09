# Backend Ritely POS

Kerangka backend Flask dengan pemisahan MVC dan Service Layer. Folder ini belum berisi implementasi endpoint atau aturan bisnis.

- `app/controllers`: route Flask dan penanganan request/response.
- `app/services`: aturan bisnis, orkestrasi transaksi, dan query MongoDB per fitur.
- `app/models`: representasi dan validasi bentuk data aplikasi.
- `app/integrations`: adapter layanan eksternal, termasuk Midtrans.
- `app/middleware`: autentikasi, otorisasi, dan penanganan error lintas endpoint.
- `app/config`: konfigurasi aplikasi berdasarkan environment.
- `app/database`: koneksi MongoDB, index, dan seeder CLI.

