# Pengelolaan role — increment Fase 0

## Perilaku yang tersedia

Super Admin membuka **Akses pengguna** setelah identitas terverifikasi. Daftar memakai pagination cursor (default 20, maksimum 100), tanpa email/Telegram. Pilih pengguna, centang beberapa role, tinjau, lalu konfirmasi. Pilihan kosong mencabut seluruh role. `public_viewer` tetap ditolak.

`GET /api/v1/users` memberikan daftar organisasi untuk Admin/Super Admin dan identitas sendiri untuk Pelayan. Koordinator tanpa role tambahan belum memperoleh direktori; relasi scope ke profil/tugas harus diselesaikan dalam Fase 1 sebelum pembacaan lintas profil koordinator dibuka.

`PUT /api/v1/users/{id}/roles` memerlukan Super Admin aktif, Origin yang persis sama dengan APP_ORIGIN, Content-Type JSON, Idempotency-Key UUID, serta body strict `{ "roles": ["admin", "servant"], "version": 1 }`. Jika If-Match dikirim, nilainya harus cocok dengan version, misalnya `"1"`. Body maksimum 2 KiB. Input tidak dikenal, role publik dan role duplikat ditolak.

## Transaksi dan perlindungan

Migrasi kedua menambahkan `role_changes` sebagai bukti idempotensi sekaligus guard transaksi. D1 batch berisi guard, audit before/after role, pencabutan grant lama, pemberian grant baru dan kenaikan version. Guard membaca kembali status/role pelaku, keberadaan target dalam organisasi, dan version di dalam transaksi yang sama. Setiap kegagalan membatalkan seluruh batch.

Key yang sama dengan target, role (urutan dinormalisasi), dan version yang sama mengembalikan version hasil sebelumnya. Payload berbeda menghasilkan 409. Respons replay memakai request_id request terkini. Bukti idempotensi dipertahankan selama lima tahun mengikuti audit perubahan role; cleanup perlu maintenance direview bersama retensi audit sebelum produksi. UI mempertahankan key saat hasil jaringan tidak pasti dan pilihan tidak berubah. Version lama menghasilkan 409 VERSION_CONFLICT, dan form meminta muat ulang.

Keputusan konservatif untuk review: pencabutan role Super Admin aktif terakhir diblokir agar jemaat tidak kehilangan pengelola akses. Tidak ada penambahan role, pengguna produksi, maupun kewenangan Pelayan Firman otomatis. Role yang dicabut tetap tersimpan sebagai riwayat revoked_at.

Rate limit mutation adalah 20 permintaan per 60 detik per actor-organisasi menggunakan binding `MUTATION_LIMITER`. Binding yang tidak tersedia membuat write gagal tertutup. Namespace 1001 di konfigurasi hanya konfigurasi lokal; preview/production harus memiliki konfigurasi terpisah yang direview. Batas Cloudflare berlaku per lokasi edge dan tidak digunakan sebagai mekanisme konsistensi database.

Log request hanya berisi request_id, nama operasi dari allowlist, status HTTP dan durasi. URL mentah, query, body, email, token dan catatan tidak dicatat. Audit database menyimpan actor, target, role sebelum/sesudah dan version; kegagalan login tetap tercermin sebagai status HTTP tanpa identitas tidak terverifikasi.

## Verifikasi dan batas

Tes Miniflare memakai D1/workerd lokal dengan fixture sintetis dan kedua migrasi asli. Adapter konversi resmi Miniflare dipakai untuk format opsi pada versi yang sudah dibawa Wrangler; tidak menambahkan simulator produksi. Tes mencakup permission, tenant, CSRF, validasi, rate limit, replay, stale version, pencabutan aktor, concurrency dan rollback akibat kegagalan audit. Tes browser memakai respons API simulasi untuk memeriksa form mobile dan konflik; bukan pengujian Access nyata.

Pembuatan akun pengurus, [status akun](account-status.md), audit viewer, dan prosedur bootstrap kini tersedia. Scope management menunggu target bidang/ibadah Fase 1; profil pelayan/capability approver juga termasuk Fase 1. Konfigurasi preview dapat dihasilkan tetapi belum dijalankan terhadap Cloudflare. Review manusia untuk fondasi dan perubahan akses tetap diperlukan sebelum deployment sesuai PRD 18.2/18.9.

Referensi resmi: [Transaksi batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/) dan [binding rate limit Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), diperiksa 8 September 2026.
