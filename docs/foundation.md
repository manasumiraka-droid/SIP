# Fase 0 — desain dan review

Status: Fase 0 ditutup sebagai baseline pengembangan lokal pada 9 September 2026 atas arahan pemilik proyek. Gerbang manusia independen dan acceptance test preview masih wajib sebelum production.

Fondasi mencakup autentikasi Cloudflare Access, RBAC/tenant isolation, pembuatan akun, multi-role, status akun, audit viewer, health check, bootstrap satu kali, retensi, konfigurasi tiga lingkungan, CI, serta negative tests. Lihat [hasil review](foundation-review.md) dan [operasi](operations.md). Pengelolaan scope koordinator dimulai bersama tabel bidang dan ibadah pada Fase 1 agar target mempunyai referential integrity lintas organisasi, sesuai pembagian Fase 1 pada PRD 18.3.

## Keputusan arsitektur (ADR-0001)

Mengikuti React/Vite/TypeScript, Tailwind, Pages, Hono/Workers, dan D1 yang ditetapkan PRD. Satu package npm privat mengelola direktori apps/packages; belum diperlukan tooling monorepo tambahan. Tidak ada layanan berbayar baru. Identitas pengurus menggunakan JWT RS256 dari Cloudflare Access melalui jose, memvalidasi issuer, audience, expiry dan signature. Header email mandiri tidak dipercaya. Tidak ada cache role/scope, sehingga pencabutan terlihat pada request berikutnya.

Repository menangani SQL parameterized. Domain tidak mengimpor HTTP atau D1. Adapter autentikasi mengambil JWKS hanya dari issuer server yang berformat domain Access. UI membaca DTO tervalidasi dan tidak membuat keputusan otorisasi. Mutasi identitas memakai guard transaksi, optimistic concurrency, idempotensi, rate limit, dan audit D1 batch. Runtime menolak konfigurasi tidak lengkap; generator remote menolak penggunaan database atau namespace rate limit yang sama.

Sumber resmi yang diperiksa 8 September 2026:

- [Validasi JWT Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Hono pada Workers](https://hono.dev/docs/getting-started/cloudflare-workers)

Dependensi runtime: React/React DOM untuk UI; Hono untuk HTTP Workers; jose untuk kriptografi standar Web Crypto; Zod untuk validasi; Lucide untuk ikon. Tailwind/Vite berada pada build frontend dan tidak dibawa ke Worker. Registry melaporkan lisensi MIT untuk paket inti; Wrangler MIT atau Apache-2.0. Versi disimpan dalam lockfile. Kompatibilitas dibuktikan sebatas build dan pengujian lokal, bukan beban produksi. Ukuran bundle tercetak saat build; parser Excel belum dipilih dan spike CPU/memori tetap wajib sebelum Fase 1 selesai.

## Threat model dan trust boundary

| Batas/ancaman                       | Kontrol increment ini                                     | Bukti / pekerjaan berikutnya                                    |
| ----------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Browser memalsukan identitas        | JWT signature/issuer/audience/expiry, email terverifikasi | Tes JWT termasuk key salah dan expired                          |
| Akun dicabut memakai token lama     | Status dan role dari D1 tiap request                      | Tes inactive/suspended/tanpa role                               |
| ID organisasi dari klien            | Organisasi dari konfigurasi; FK komposit                  | Tes policy dan SQL lintas organisasi                            |
| Koordinator memperoleh akses global | Grant per-role dan scope aktif; role tanpa scope ditolak  | Tes bidang, target salah, expiry                                |
| Kebocoran kontak / token            | DTO minimum; error generik; no-store                      | Tes response dan kegagalan audit                                |
| Pemalsuan Origin                    | Origin harus sama dengan konfigurasi                      | Tes origin lain; endpoint write belum tersedia                  |
| Audit diubah                        | Trigger append-only, metadata allowlist                   | Tes update/delete; retensi dry-run, konfirmasi, hold, dan audit |
| SQL injection                       | Bind parameter di repository                              | Review SQL; tambah integration query D1 pada CRUD               |
| Scope target tidak valid            | Belum ada endpoint pembuatan scope                        | Fase 1 wajib FK/trigger target service/field lintas organisasi  |
| Abuse autentikasi / biaya JWKS      | Batas assertion dan rate limit sebelum verifikasi JWT     | Uji binding nyata dan tuning limit pada preview                 |

Audit identitas hanya menyimpan ID internal dan action tetap, tidak email/token. Login gagal tidak disimpan ke D1 agar organisasi tidak disimpulkan dari identitas tidak tepercaya. Log outcome request terstruktur tidak memuat URL, email, assertion, atau IP. Rate limit autentikasi dan mutasi memakai namespace terpisah.

## Skema dan batas migrasi

Migrasi pertama membuat organizations, users, roles, permissions, role_permissions, user_roles, coordinator_scopes, dan audit_logs. Migrasi `0002`–`0007` menambahkan receipt transaksi, status akun, bootstrap singleton, retention hold, index akses retensi, dan constraint hasil review. Katalog role/permission sistem merupakan data aplikasi tetap, bukan seed jemaat. Catalog policy diuji sinkron dengan SQL. `public_viewer` disimpan untuk kompatibilitas tetapi grant-nya diblokir trigger.

Seluruh identity rows yang mutable memiliki version dan timestamps; tabel katalog/relasi immutable serta audit memakai bentuk sesuai PRD. FK komposit mencegah user/grantor/audit actor dari organisasi berbeda. Email case-insensitive unik per organisasi. Scope target bersifat polimorfik: saat tabel bidang/ibadah ditambahkan, migrasi lanjutan wajib melengkapi integritas target sebelum endpoint scope diaktifkan. Link servant-user dan capability_approvers ditambahkan bersama tabel operasional Fase 1.

## Gerbang review manusia dari PRD 18.2

Pemilik produk/manusia perlu meninjau dokumen ini, [hasil review lokal](foundation-review.md), dan migrasi `0001`–`0007` untuk menyetujui threat model, matriks permission/scope, skema identitas, strategi secret, serta migrasi. Belum ada approval production, akun nyata, ataupun provisioning cloud. Review lokal dilakukan oleh agen yang mengimplementasikan perubahan, sehingga belum memenuhi reviewer independen/lintas model pada PRD 18.2 dan 18.9.

## Handoff ke Fase 1

Implementasi lokal Fase 0 tidak memiliki temuan tinggi atau sedang yang terbuka. Ringkasan penutupan tersedia di [closeout Fase 0](phase-0-closeout.md). Pekerjaan produk berikutnya dilakukan pada task Codex terpisah untuk Fase 1. Urutannya adalah:

1. **Bangun domain Fase 1.** Tambahkan bidang dan peran pelayanan, profil pelayan beserta relasi user, capability dan capability approver, availability, ibadah, assignment, state transition, optimistic concurrency, serta deteksi benturan berdasarkan rentang `assembly_at` sampai `ends_at`.
2. **Aktifkan scope koordinator.** Implementasikan pengelolaan scope bersama target bidang/ibadah dan constraint organisasi, lalu ulang negative tests lintas scope dan lintas organisasi.
3. **Lakukan spike impor sebelum Fase 1 ditutup.** Ukur parser XLSX pada Workers untuk batas ukuran, CPU, memori, ZIP berbahaya, formula, workbook terenkripsi, dan jumlah baris. Dokumentasikan keputusan parser/Queue sebelum memulai wizard impor Fase 1b.
4. **Selesaikan gerbang deployment secara paralel.** Hubungkan repository dan preview, jalankan review manusia independen serta acceptance test Cloudflare nyata, lalu siapkan backup/restore dan monitoring sebelum production.

Tidak ada akun nyata, migrasi remote, deployment, atau secret cloud yang dibuat dari workspace ini. Penutupan Fase 0 ini mengizinkan pengembangan Fase 1 dan tidak merupakan persetujuan production.
