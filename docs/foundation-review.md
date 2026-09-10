# Review hasil kerja Fase 0 — 8 September 2026

## Ruang lingkup

Review membaca alur UI → API → policy → D1 → audit untuk autentikasi, daftar/pembuatan pengguna, penggantian role, perubahan status, audit viewer, dan health. Review juga memeriksa tujuh migrasi, bootstrap, retensi, konfigurasi environment, CI, secret scan, serta negative tests tenant/status/permission. Workspace belum mempunyai metadata Git, sehingga review dilakukan atas seluruh file sumber saat ini dan bukan diff commit.

## Temuan yang diselesaikan

| Prioritas | Temuan                                                                                                                             | Perbaikan dan bukti                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Tinggi    | Konfigurasi Worker preview tidak mempunyai route `/api/*`, sehingga deployment tidak memberi jalur same-origin yang dapat diuji.   | Generator sekarang mewajibkan route dan zone; workflow memasok variable environment; tes memeriksa config hasil.                    |
| Tinggi    | Perubahan status baru belum menolak permintaan tanpa transisi.                                                                     | Migrasi `0007` menambahkan guard D1; API mengembalikan `INVALID_TRANSITION`; tes integrasi memastikan tidak ada audit/mutasi palsu. |
| Tinggi    | Retention hold dapat mencantumkan organisasi yang berbeda dari audit yang ditahan.                                                 | Trigger insert/update `0007` menegakkan pasangan audit-organisasi; tes migrasi lintas tenant ditambahkan.                           |
| Sedang    | Index receipt retensi hanya diawali timestamp, sedangkan query selalu dibatasi organisasi.                                         | `0007` menambah index `(organization_id, created_at)` pada tiga receipt.                                                            |
| Sedang    | Namespace auth/mutation dapat dipakai ulang dan menggabungkan bucket yang semestinya terpisah.                                     | Generator mewajibkan keempat namespace unik dan mempunyai negative test.                                                            |
| Sedang    | Skrip operator memakai global Node implisit dan menggagalkan lint.                                                                 | Skrip memakai impor `node:crypto` eksplisit dan `globalThis.fetch`; seluruh lint lulus.                                             |
| Sedang    | Bootstrap menerima nama timezone yang tidak didukung sehingga formatter audit di browser dapat gagal.                              | Schema bersama dan input bootstrap memvalidasi timezone IANA; negative test memastikan kegagalan terjadi sebelum akses jaringan.    |
| Sedang    | Kegagalan validasi baris D1 dapat dipetakan sebagai kesalahan request 422 karena memakai error Zod yang sama dengan payload klien. | Adapter repository mengubah kegagalan data tersimpan menjadi error internal generik; payload/query klien tetap memperoleh 422.      |

Tidak ada temuan tinggi atau sedang yang masih terbuka pada implementasi lokal setelah perbaikan tersebut.

## Hasil kebijakan dan keamanan

- JWT hanya dipercaya setelah signature, issuer, audience, dan expiry diverifikasi. Header email tidak menjadi sumber identitas.
- Status, role, permission, scope, dan organisasi dimuat dari D1 pada setiap request. Semua query sensitif dibatasi `organization_id`; payload organisasi dari klien ditolak oleh schema.
- Mutasi memerlukan origin tepat, JSON terbatas, idempotency key, rate limit, dan version. Otorisasi pelaku diperiksa ulang di dalam D1 batch. Kegagalan audit membatalkan receipt serta perubahan data.
- Super Admin aktif terakhir tidak dapat dicabut rolenya atau dinonaktifkan. Akun suspended/inactive dan akun tanpa role ditolak sebelum handler.
- Audit append-only tidak menyimpan email/token. Pembacaan berhalaman memakai cursor `(created_at,id)` agar timestamp yang sama tidak melompati baris. Admin tidak menerima action catatan restricted.
- Bootstrap dan retensi dry-run secara default, memakai parameter binding, konfirmasi environment-spesifik, dan D1 batch. Nilai preview/production dihasilkan terpisah dan file hasil diabaikan Git.

## Verifikasi dan batas

`npm run check`, tes browser, migrasi D1 lokal, secret scan, dan `npm audit --audit-level=high` dijalankan setelah perbaikan. Bukti angka terakhir dicatat di [verifikasi](verification.md).

Review ini belum independen karena dilakukan oleh agen implementasi yang sama. Cloudflare Access nyata, D1 remote, GitHub Actions, route/Pages preview, backup/restore, dan beban produksi tidak dapat diverifikasi tanpa repository serta resource cloud. Semua itu tetap menjadi syarat acceptance preview dan persetujuan manusia; tidak ada klaim siap production.
