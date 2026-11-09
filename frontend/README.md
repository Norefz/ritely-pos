# Ritely POS — Frontend Webix

Frontend demo tanpa backend, database, autentikasi, atau Midtrans. Seluruh data disimpan di memori browser dan direset saat reload. Pemilih peran hanya untuk pratinjau tampilan; bukan sistem otorisasi.

## Menjalankan

Dari root repository:

```sh
python3 -m http.server 8080 --directory frontend
```

Buka http://localhost:8080. Webix disimpan lokal di `vendor/webix`, sehingga aplikasinya tidak mengunduh library itu saat dibuka. Google Fonts memakai font sans-serif lokal sebagai fallback jika tidak tersedia. Tidak memerlukan npm atau build.

## Struktur

- `src/app.js`: memasang shell sekali, navigasi, dan pergantian halaman.
- `src/views/layout/sidebar.js`: seluruh menu sidebar dan menu sesuai peran.
- `src/views/layout/navbar.js`: navbar bersama.
- `src/views/pages/`: isi halaman; tidak membuat navbar/sidebar sendiri.
- `src/styles/app.css`: warna dan tipografi sesuai SRS.
- `src/demo.js`: data simulasi bersama dan format tampilan.

Halaman Manajer: ringkasan, produk, kategori, stok, transaksi, shift, laporan, akun kasir. Halaman Kasir: katalog/keranjang, transaksi, shift. Tambah/ubah produk, penyesuaian stok, kategori, profil kasir, buka/tutup shift, penjualan tunai simulasi, struk, dan ekspor laporan berjalan di browser. Mulai demo kasir dengan membuka shift dahulu. Transaksi hanya berasal dari simulasi yang benar-benar dilakukan dalam sesi.

Pembayaran online sengaja dinonaktifkan sampai backend tersedia. Login, waktu shift operasional, otorisasi server, transaksi atomik, pending/void, filter laporan periode, dan sinkronisasi data perlu implementasi backend/integrasi lanjutan. Data profil kasir adalah contoh; simulasi penjualan memakai identitas demo Dina.

Target utama desktop/laptop. Sidebar bisa disembunyikan pada layar sempit; tabel mempunyai scroll horizontal. Layout kasir membutuhkan ruang untuk katalog dan keranjang berdampingan.

Pola layout mengacu pada dokumentasi resmi Webix: https://docs.webix.com/desktop__building_app_architecture.html
