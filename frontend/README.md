# Frontend Ritely POS

Kerangka frontend Webix sederhana. Folder ini belum berisi halaman atau alur transaksi.

- `src/views`: tampilan Webix, event UI, dan request ke backend Flask.
- `src/styles`: tema, tipografi, dan styling yang kompatibel dengan Webix.

Frontend tidak memakai MVC terpisah agar tetap sederhana. View mengirim aksi ke endpoint backend; aturan bisnis dan validasi final tetap berada di backend.

