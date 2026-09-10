# Migrasi dan pemulihan

Urutan saat ini: `0001_identity.sql` sampai `0023_remote_trigger_compatibility.sql`. Migrasi `0001`–`0012` membangun fondasi identity/RBAC/audit dan jadwal inti. Migrasi `0013`–`0018` menambahkan workflow impor beserta receipt dan kontrol review. Migrasi `0019`–`0022` menambahkan aktivasi, notifikasi, callback, dan idempotensi Telegram. Migrasi `0023` memasang ulang constraint trigger jadwal sebagai trigger satu-kondisi yang kompatibel dengan parser D1 remote.

Sebelum pernah diterapkan ke preview atau production, `0008_phase_1_schedule_core.sql` ditemukan gagal pada D1 remote dengan `SQLITE_ERROR: incomplete input` karena beberapa trigger kompleks berada dalam file pembuatan tabel. Definisi trigger dipindahkan ke forward migration `0023`; aturan bisnisnya tetap sama. Rangkaian `0001`–`0023` kemudian berhasil diterapkan ke D1 akun sementara Cloudflare dari keadaan kosong. Tidak ada data pengguna nyata maupun seed otomatis.

```powershell
npm run db:migrate:local
```

Wrangler mencatat migrasi yang sudah diterapkan. Ulang perintah tersebut untuk memverifikasi tidak ada migrasi pending. Jangan mengedit migrasi yang sudah dipakai bersama; lakukan forward-fix melalui nomor berikutnya. Pengecualian perubahan `0008` di atas dilakukan sebelum deployment preview/production pertama dan dicatat eksplisit. Untuk lokal yang perlu reset, buat database lokal baru setelah memastikan tidak ada data yang perlu dipertahankan.

Produksi: review manual, export backup berakses terbatas, catat checksum, uji restore ke database terpisah, baru lakukan migrasi yang disetujui. Belum ada binding produksi sehingga perintah produksi sengaja tidak disediakan. Rollback aplikasi menggunakan artifact sebelumnya hanya jika kompatibel dengan schema; kegagalan data ditangani forward-fix atau restore terverifikasi. Jangan menghapus tabel sebagai rollback otomatis.

Audit append-only memiliki trigger yang memblokir update/delete. Retensi lima tahun dijalankan dengan skrip operator berkonfirmasi yang melepas dan memasang trigger dalam satu D1 batch; tidak ada route aplikasi untuk menghapus audit. Lihat [operasi](operations.md). Backup mingguan dan drill restore masih menjadi syarat sebelum go-live.
