# Ritely POS — Frontend Webix

Frontend memakai backend untuk login JWT. Data operasional POS lainnya masih berupa simulasi browser dan direset saat reload; halaman frontend bukan sumber otorisasi untuk API.

## Menjalankan

Dari root repository:

```sh
python3 -m http.server 8080 --directory frontend
```

Buka http://localhost:8080. Jalankan backend pada `http://127.0.0.1:5000` dan pastikan `CORS_ALLOWED_ORIGINS` di `backend/.env` mencakup origin frontend. Webix disimpan lokal di `vendor/webix`, sehingga aplikasinya tidak mengunduh library itu saat dibuka. Google Fonts memakai font sans-serif lokal sebagai fallback jika tidak tersedia. Tidak memerlukan npm atau build.

## Struktur

- `src/app.js`: memasang shell sekali, navigasi, dan pergantian halaman.
- `src/views/layout/sidebar.js`: seluruh menu sidebar dan menu sesuai peran.
- `src/views/layout/navbar.js`: navbar bersama.
- `src/views/pages/`: isi halaman; tidak membuat navbar/sidebar sendiri.
- `src/styles/app.css`: warna dan tipografi sesuai SRS.
- `src/api.js`: panggilan API backend dan penyimpanan token selama halaman aktif.
- `src/state.js`: state bersama dan format tampilan.

Halaman Manajer: ringkasan, produk, kategori, stok, transaksi, shift, laporan, akun kasir. Halaman Kasir: katalog/keranjang, transaksi, shift. Shift memakai backend: pembukaan mengikuti assigned shift dan jam WIB, penutupan normal hanya pada/setelah akhir jadwal, tidak ada penutupan otomatis, dan hanya satu shift terbuka per toko. Transaksi tunai, struk, dan data produk/stok lainnya masih berupa simulasi frontend.

Pembayaran online sengaja dinonaktifkan sampai integrasi backend tersedia. Transaksi operasional, validasi transaksi pending saat tutup shift, pending/void, filter laporan periode, dan sinkronisasi data masih perlu implementasi backend lanjutan.

Target utama desktop/laptop. Sidebar bisa disembunyikan pada layar sempit; tabel mempunyai scroll horizontal. Layout kasir membutuhkan ruang untuk katalog dan keranjang berdampingan.

Pola layout mengacu pada dokumentasi resmi Webix: https://docs.webix.com/desktop__building_app_architecture.html
