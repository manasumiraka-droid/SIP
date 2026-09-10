# Closeout Fase 1b — Impor Jadwal Excel

Tanggal: 9 September 2026.

Implementasi lokal Fase 1b selesai dan siap untuk acceptance pemilik produk. Pernyataan ini tidak mencakup deployment preview/production atau approval manusia.

## Hasil

- Admin dapat mengunduh `form-jadwal-ibadah.xlsx` kosong dari homepage atau wizard, mengisi enam kolom resmi, memilih sheet di browser, lalu mengunggah workbook satu kali.
- Worker memverifikasi signature/struktur ZIP, batas 5 MiB/5.000 baris/16 sheet/64 kolom/2.000 karakter per sel/2.000 entri/20 MiB uncompressed, serta menolak macro, encryption, external link, embedded object/media, traversal, dan workbook rusak. Formula dibaca sebagai nilai tanpa dieksekusi.
- Raw byte workbook tidak disimpan. Uploader atau Super Admin organisasi yang sama saja yang dapat membaca batch/staging.
- Mapping dan format tanggal dapat diperbaiki tanpa upload ulang. Default mulai adalah 17.00 WITA; override per baris disimpan dan diaudit.
- Matching nama memakai normalisasi exact, kandidat fuzzy hanya sebagai saran manual, link pelayan aktif, profil `pending_review`, atau pengecualian eksplisit. Capability aktif tetap wajib untuk assignment; profil pending tidak otomatis ditugaskan.
- Preview terpaginasikan menampilkan total valid/warning/error/duplikat/excluded/committed/skipped. Warning wajib diakui sebelum batch `ready`.
- Duplikat default `skip`; pengguna dapat memilih merge hanya untuk slot kosong atau membuat jadwal terpisah. Konflik slot merge menjadi error.
- Commit membuat draf dan assignment dalam satu `D1 batch`, memakai operasi SQL set-based agar batas 5.000 baris tidak menghasilkan ribuan statement. Receipt membuat retry idempoten.
- Super Admin dapat melakukan rollback soft-void selama hasil belum dipublikasikan atau diubah.
- Cron harian meng-expire review yang melewati tujuh hari, menghapus nilai staging saat expiry atau setelah 30 hari, dan menyimpan ringkasan retensi lima tahun.
- `npm run dev` menjalankan web dan API demo bersama agar homepage lokal tidak jatuh ke layar “Layanan belum dapat dihubungi”.

## Bukti lokal

- `npm run check`: lulus; seluruh test Vitest, format, lint, typecheck, web build, dan Worker dry-run lulus.
- `npm run test:browser`: 10 test Chromium lulus, termasuk download template, pilihan sheet, mapping, preview, dan kontrol warning pada viewport ponsel.
- `npm run security:secrets`: lulus.
- `npm audit --audit-level=high`: 0 vulnerability.
- Migrasi D1 lokal `0018_import_review_controls.sql`: berhasil diterapkan.

## Acceptance manusia

1. Buka `http://localhost:5173`, pastikan langsung masuk UI produk.
2. Dari kartu **Impor jadwal**, unduh template dan buka file: hanya header yang boleh terisi.
3. Klik **Lanjutkan impor**, isi/upload salinan template, pilih sheet, periksa mapping, lalu validasi.
4. Tinjau error, warning, nama tidak dikenal, override WITA, dan aksi duplikat.
5. Commit sebagai draf dan pastikan retry tidak membuat data ganda.
6. Super Admin menguji rollback pada data sintetis yang belum diubah/dipublikasikan.

Keputusan pemilik produk: **SETUJUI**, diterima pada 9 September 2026. Fase 1b ditutup untuk lingkup build lokal; deployment preview/production tetap memerlukan gerbang operasionalnya sendiri.
