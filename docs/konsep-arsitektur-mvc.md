# Konsep Arsitektur MVC Ritely POS

**Status:** Konsep awal berdasarkan SRS Ritely POS v1.16 Consolidated v4.7.1  
**Stack rencana:** Webix, HTML, CSS, JavaScript, Python Flask, MongoDB replica set.

## 1. Tujuan

Arsitektur memisahkan antarmuka, penanganan HTTP, aturan bisnis, dan akses data. Pemisahan ini menjaga agar aturan transaksi, shift, stok, dan pembayaran dijalankan di backend secara konsisten, bukan tersebar di komponen UI atau route.

Alur utamanya:

```text
Webix View → Flask Controller → Service Layer → MongoDB
     ↑               ↓                 ↓
     └──────── response JSON ──────────┘
```

Istilah MVC disesuaikan dengan aplikasi web ini: View berada di frontend Webix, Controller berupa route/handler Flask, dan Model merepresentasikan serta memvalidasi bentuk data. **Service Layer** menjadi tempat utama aturan bisnis sekaligus operasi query MongoDB per fitur. Koneksi MongoDB disediakan terpusat oleh modul `database/`.

## 2. Tanggung jawab lapisan

| Lapisan | Tanggung jawab | Contoh Ritely POS | Yang tidak dikerjakan |
|---|---|---|---|
| **View** | Menampilkan data, menangkap aksi pengguna, validasi kenyamanan, dan mengirim request ke API. | Layar kasir, keranjang, dialog pembayaran, halaman produk, shift, dan laporan. | Menentukan status pembayaran final, menghitung otoritas, atau mengubah stok langsung. |
| **Controller** | Menerima request, memeriksa autentikasi/role dan format input dasar, memanggil service, lalu membentuk HTTP response. | `SalesController.create`, `ShiftController.close`. | Menjalankan rangkaian aturan bisnis atau query MongoDB kompleks. |
| **Service Layer** | Menjalankan aturan bisnis, otorisasi tingkat tindakan, validasi lintas entitas, transaksi database, query MongoDB per fitur, dan orkestrasi integrasi. | `CheckoutService`, `ShiftService`, `PaymentService` menggunakan koneksi database bersama. | Merender UI atau mengelola detail presentasi HTTP. |
| **Model** | Merepresentasikan dan memvalidasi bentuk data aplikasi bila diperlukan. | Struktur dokumen sale, shift, dan produk. | Membuka koneksi database atau menjalankan alur endpoint. |
| **Integrasi eksternal** | Membungkus komunikasi dengan penyedia eksternal agar dapat diverifikasi dan ditangani terpisah. | Klien Midtrans Sandbox untuk membuat sesi, memeriksa status, dan verifikasi notifikasi. | Menandai sale selesai hanya berdasarkan redirect frontend. |

## 3. Struktur direktori yang disarankan

Struktur ini pedoman, bukan keharusan nama folder. Frontend dan backend dapat berada dalam satu repository.

```text
frontend/
  src/
    views/               # tampilan Webix, event UI, dan request ke backend
    styles/              # tema, tipografi, dan penyesuaian CSS terbatas

backend/
  app/
    __init__.py          # application factory dan registrasi blueprint
    config/              # pemuatan konfigurasi environment
    controllers/         # route/handler Flask dan skema request/response
    services/            # aturan bisnis dan operasi MongoDB per fitur
    models/              # struktur dokumen dan validasi bentuk data
    integrations/        # adapter Midtrans
    middleware/          # autentikasi, otorisasi, penanganan error
    database/
      connection.py      # koneksi MongoDB dan pengelolaan session
      indexes.py         # pembuatan index yang diperlukan
      seeders/            # initial_seeder.py dan demo_seeder.py (CLI)
  wsgi.py
```

Route sebaiknya dikelompokkan dalam Flask Blueprint, misalnya `auth`, `products`, `sales`, `shifts`, `reports`, `users`, serta `payments`. Seeder merupakan perintah CLI terpisah, bukan bagian dari request web dan bukan komponen MVC.

Frontend tidak memakai MVC terpisah. View Webix menangani tampilan, event UI, dan request ke backend Flask. Validasi frontend hanya untuk kenyamanan; backend tetap menjadi sumber kebenaran aturan bisnis.

## 4. Contoh alur: checkout tunai

1. View mengirim daftar item dan uang yang diterima ke endpoint penjualan. Harga/total dari browser dianggap data masukan, bukan sumber kebenaran.
2. Controller memvalidasi bentuk request, memastikan sesi pengguna, lalu meneruskan data kepada `CheckoutService`.
3. Service memeriksa role Kasir, shift terbuka milik kasir, batas waktu shift, produk aktif, kuantitas, serta stok terbaru. Harga dan total dihitung ulang dari data backend.
4. Service membuka MongoDB session/transaction. Di dalamnya, service membuat sale pending, memverifikasi kembali shift, mengurangi stok dengan syarat stok mencukupi, membuat `stock_movements`, menandai sale completed/paid dengan `paid_at`, dan menaikkan `shifts.activity_version`.
5. Jika salah satu operasi gagal, seluruh perubahan dibatalkan. Jika berhasil, Controller mengembalikan ringkasan sale/struk; View menampilkan hasil setelah menerima respons sukses backend.

Untuk pembayaran tunai, transaksi dan perubahan stok harus mengikuti ketentuan atomicity di SRS. Implementasi dapat menyesuaikan urutan operasi selama sale, stok, stock movement, dan penjaga shift tetap konsisten dalam satu transaksi database.

## 5. Contoh alur: pembayaran online

1. View meminta pembuatan sesi pembayaran dan menampilkan loading pada aksi pembayaran.
2. Controller meneruskan permintaan ke `PaymentService`; service memvalidasi sale, shift, stok, dan status yang diizinkan.
3. Service menyimpan guard/idempotency dan menggunakan `MidtransClient` di backend. Server Key tidak pernah dikirim ke frontend.
4. Webhook masuk ke endpoint khusus. Controller meneruskan payload ke service; service memverifikasi signature, order ID, nominal, dan relasi ke sale.
5. Hanya konfirmasi provider yang valid yang dapat mengubah status pembayaran. Pemrosesan webhook/retry harus idempotent dan penyelesaian sale beserta perubahan stok/stock movement/shift guard dilakukan atomik.
6. Timeout atau status `unknown` memicu pemeriksaan ulang Order ID yang sama; jangan membuat order baru atau menganggapnya gagal tanpa konfirmasi.
7. Pembayaran sukses setelah POS expired dicatat sebagai pembayaran terlambat untuk rekonsiliasi, tanpa mengubah sale menjadi completed atau mengurangi stok.

## 6. Contoh alur: penutupan shift

1. View mengirim permintaan tutup shift (alasan wajib jika Manajer melakukan penutupan paksa).
2. Controller memastikan pengguna terautentikasi dan meneruskan konteks pengguna ke `ShiftService`.
3. Service memeriksa shift masih open, hak Kasir/Manajer, waktu penutupan normal atau alasan force close, serta memastikan tidak ada sale pending pada shift.
4. Service menjalankan transaksi MongoDB yang mengubah shift menjadi closed, menyimpan `closed_at`, `closed_by`, `close_reason` bila berlaku, menaikkan `activity_version`, dan mencatat audit.
5. Service dan proses pembayaran menulis guard shift yang sama agar perlombaan tutup shift vs pembayaran menghasilkan konflik yang dapat di-retry dan diperiksa ulang.

## 7. Batas transaksi dan konsistensi

- Semua aturan konsistensi yang melibatkan lebih dari satu dokumen dijalankan di Service Layer memakai MongoDB transaction/session.
- Service menggunakan koneksi MongoDB bersama dari `database/` dan meneruskan session yang sama ke semua operasi dalam satu transaksi.
- Gunakan conditional update dan idempotency guard untuk mencegah stok negatif, checkout ganda, sesi pembayaran ganda, serta pemrosesan webhook berulang.
- Jangan memakai lock di memori proses Flask sebagai mekanisme kebenaran lintas worker.
- `shifts.activity_version` adalah penjaga concurrency teknis, bukan angka aktivitas untuk ditampilkan.
- MongoDB harus berjalan sebagai replica set agar transaction tersedia. Single-node replica set hanya target development/demo dan bukan konfigurasi high availability.

## 8. Data dan aturan lintas fitur

MVP memakai tujuh collection aktif: `users`, `master_product`, `categories`, `sales`, `shifts`, `stock_movements`, dan `audit_logs`. Collection `returns` serta alur retur/refund adalah Future Enhancement dan tidak dibuat sebagai bagian MVP.

Aturan lintas fitur yang harus dipusatkan di backend:

- Otorisasi Kasir/Manajer dan status akun aktif.
- Jadwal shift Asia/Jakarta; semua timestamp database disimpan UTC.
- Produk harus aktif dan stok harus mencukupi saat checkout; validasi frontend hanya membantu pengguna.
- Produk dan harga pada item sale disimpan sebagai snapshot agar histori transaksi tidak berubah saat master produk diedit.
- Laporan menghitung Total Penjualan dari sale `completed` dan `paid` berdasarkan `paid_at`; ringkasan shift dihitung dari `sales.shift_id` melalui aggregation.
- Password menggunakan bcrypt; kredensial Midtrans dan URI database berasal dari konfigurasi environment.
- Operasi penting dicatat pada `audit_logs` tanpa menyimpan password, Server Key, atau secret.

## 9. Bentuk kontrak Controller dan Service

Contoh ini bersifat konseptual, bukan API final:

```text
POST /api/sales
  Controller: autentikasi + validasi bentuk request
  Service: hitung harga, validasi shift/stok, checkout atomik
  Response: sale/receipt atau error terstruktur

POST /api/shifts/{shift_id}/close
  Controller: autentikasi + parsing alasan
  Service: validasi hak dan pending sales, tutup atomik, audit
  Response: ringkasan shift atau alasan penolakan

POST /api/payments/midtrans/notification
  Controller: menerima payload provider
  Service: verifikasi, idempotensi, rekonsiliasi, perubahan status atomik
  Response: acknowledgment sesuai kontrak Midtrans
```

Service mengembalikan hasil domain yang jelas atau melempar error aplikasi terdefinisi. Controller menerjemahkannya menjadi status HTTP dan response konsisten; detail exception internal dan secret tidak dikirim ke klien.

## 10. Keputusan yang belum ditetapkan

SRS belum menetapkan nama final aplikasi, platform deployment, bentuk final API, versi Webix, skema response API, dan topologi database produksi. Detail tersebut perlu diputuskan saat desain teknis. Konsep ini tidak mengubah keputusan bisnis SRS dan tidak mengaktifkan fitur Return/Refund.
