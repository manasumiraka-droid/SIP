# Fase 2.5 — Repository dan Cloudflare Readiness

Tanggal: 10 September 2026.

Fase antara ini menutup sementara Fase 2 dan menyiapkan aplikasi untuk preview Cloudflare sebelum Fase 3–4 dimulai. Tidak ada keputusan production atau go-live dalam fase ini.

## Status fase

- Fase 0, 1, dan 1b selesai sesuai closeout masing-masing.
- Implementasi teknis Fase 2 selesai dan regression suite lulus.
- Gate Telegram nyata ditunda sampai preview permanen mempunyai Cloudflare Access, bot uji, dan secret yang disimpan operator.
- Fase 3 dan Fase 4 belum dimulai dan tidak boleh dimulai sebelum aplikasi berhasil run di preview Cloudflare.

## Bukti readiness

- Repository melewati format, lint, typecheck, 82 test, build web, Worker dry-run, browser regression, dependency audit, dan baseline secret scan.
- Akun Cloudflare sementara dibuat setelah persetujuan manusia untuk membuktikan jalur remote, bukan sebagai environment permanen.
- D1 sintetis APAC menerima seluruh migrasi `0001`–`0023` secara remote.
- Worker sementara berhasil dideploy dan menolak request pengurus tanpa Cloudflare Access dengan `UNAUTHENTICATED`.
- Uji remote menemukan parser D1 tidak menerima trigger kompleks di migrasi `0008`; trigger dipisahkan ke `0023` dan seluruh regression suite tetap lulus.

## Repository dan pipeline

- Remote tujuan: `https://github.com/manasumiraka-droid/SIP`.
- Branch awal: `main`.
- CI menjalankan quality gate, audit dependency, secret scan, browser tests, migrasi D1 lokal, dan mengunggah artifact build.
- Workflow preview hanya berjalan manual dan meminta persetujuan eksplisit migrasi preview.
- Setup Telegram bersifat opsional melalui input `configure_telegram`; nilai default `false` memungkinkan aplikasi online lebih dahulu tanpa bot/secret.
- Generator menolak database/namespace lintas-environment yang sama dan memaksa delivery Telegram preview tetap `false`.

## Gerbang menuju deployment preview permanen

Operator manusia perlu menyediakan GitHub Environment `preview`, Cloudflare account/API token dengan scope minimum, D1 preview, Pages project, domain/zone preview, Cloudflare Access application, serta variabel pada runbook. Secret tidak boleh masuk repository atau chat.

Setelah preview dapat diakses dan UAT dasar lulus, Fase 2 dapat dibuka kembali hanya untuk gate akun Telegram nyata. Fase 3–4 baru boleh dimulai setelah status run Cloudflare dicatat dalam dokumen ini.
