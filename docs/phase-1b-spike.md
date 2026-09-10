# Fase 1b — Spike XLSX dan threat model

Tanggal: 9 September 2026. Lingkup pengukuran ini hanya build/fixture sintetis dan D1 lokal; tidak ada Queue, R2, database remote, atau deploy yang dibuat.

## Keputusan parser dan batas

Parser yang dipakai adalah `read-excel-file` 9.3.10 melalui entry point universal, dibungkus preflight ZIP sendiri. Library ini bersifat read-only untuk `.xlsx`; aplikasi tidak mengevaluasi formula atau memproses macro. Preflight memverifikasi ZIP/XLSX, menolak encryption flag, macro/VBA, external links, embedded objects/media, traversal name, workbook rusak, lebih dari 16 sheet/2.000 entri ZIP/64 kolom, lebih dari 5.000 baris, sel lebih dari 2.000 karakter, file di atas 5 MiB, atau total ukuran entri ZIP di atas 20 MiB.

`xlsx` npm telah dihapus karena advisory tinggi. `read-excel-file` menambah parser ZIP/XML read-only dan template kosong berhasil dibaca dalam tes lokal serta Worker dry-run. Pemeriksaan akhir `npm audit --audit-level=high` melaporkan 0 vulnerability.

Cloudflare saat ini membatasi isolate Worker pada 128 MB; Workers Free hanya memberi CPU 10 ms per request, sedangkan Paid default 30 dtk (maks. 5 menit). Batas produk 5 MiB/5.000 baris sengaja lebih ketat dari request body platform. Parsing dilakukan pada upload sinkron lokal; tidak ada Queue karena Queue memerlukan enablement/plan yang bukan bagian tugas ini. Bila profiling fixture batas menunjukkan CPU/memori mendekati limit target, batasi batch lebih lanjut atau gunakan antrian yang disetujui pada fase operasional, tanpa mengubah atomic commit D1.

D1 `batch()` bersifat transaksional; commit menyertakan receipt idempoten, hasil, perubahan baris, audit, dan pembuatan draf dalam batch yang sama. D1 membatasi query individual hingga 30 dtk dan operasi tetap memakai CPU/memori Worker; rollback database terjadi bila salah satu statement gagal. 5.000 baris masih perlu diuji pada runtime preview sebelum release.

Sumber resmi: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), dan [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Threat model dan kontrol

| Ancaman                               | Kontrol lokal                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| XLSX palsu, ZIP bomb, path traversal  | Signature/central directory, limit compressed/uncompressed/entry dan nama entry                                            |
| Macro, formula/link, object berbahaya | Tolak VBA/link/object; formula tidak dieksekusi; ekspor mendatang wajib escape formula                                     |
| Upload tanpa izin/CSRF                | Origin sama, autentikasi middleware, Admin/Super Admin saja, rate limiter mutasi                                           |
| IDOR batch/raw values                 | Uploader atau Super Admin dalam organisasi yang sama saja; lainnya 404                                                     |
| Replay/duplikasi commit               | `Idempotency-Key` + hash receipt unik per aktor/organisasi                                                                 |
| Commit parsial/audit hilang           | Satu D1 batch mencakup receipt, rows/results, draf, status batch, audit                                                    |
| PII/raw file berlebihan               | Tidak ada byte file di D1; cron menghapus staging saat expiry atau setelah 30 hari dan mempertahankan ringkasan lima tahun |

## Status

Spike parser, threat control, wizard, commit/rollback, retensi, serta tes negative/integration/browser lokal telah selesai. Profil batas maksimum pada runtime preview dan approval deployment tetap merupakan gerbang operasional terpisah, bukan bagian dari build lokal.

Bukti dan acceptance dicatat di [phase-1b-closeout.md](phase-1b-closeout.md).
