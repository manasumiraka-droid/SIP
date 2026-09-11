# Runbook preview terbatas Fase 2 — Telegram

Runbook ini menyiapkan uji akun Telegram nyata di **preview** tanpa mengaktifkan pengiriman pesan keluar. Sesuai PRD §13, `SPI_TELEGRAM_DELIVERY_ENABLED` wajib bernilai `false` di preview dan generator konfigurasi menolak nilai lain.

## Batas kewenangan

- Operator manusia memilih bot dan akun Telegram uji, menyimpan secret, serta menjalankan workflow preview.
- Token bot dan secret webhook hanya disimpan sebagai GitHub Environment secrets atau secret store yang setara. Nilainya tidak ditempel ke source, log, screenshot, tiket, atau chat.
- Workflow ini tidak memberi akses production, tidak menjalankan migrasi production, dan tidak mengimpor data nyata.
- Keputusan go-live tetap milik manusia sesuai PRD §18.10.

## Konfigurasi GitHub Environment `preview`

Secrets yang diperlukan:

- `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID` untuk resource preview saja.
- `SUPABASE_DATABASE_URL` untuk migrasi preview; simpan hanya sebagai secret dan gunakan koneksi langsung/session, bukan transaction pooler.
- `SPI_HYPERDRIVE_ID` dan ID Hyperdrive production pembanding `SPI_PRODUCTION_HYPERDRIVE_ID`; keduanya wajib berbeda.
- `SPI_ACCESS_AUDIENCE`, namespace rate limit preview, serta namespace pembanding production.
- `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_WEBHOOK_SECRET` acak sepanjang sedikitnya 32 karakter.

Variables yang diperlukan:

- `SPI_APP_ORIGIN`, `SPI_ACCESS_ISSUER`, `SPI_ORGANIZATION_ID`, `SPI_ZONE_NAME`, dan `SPI_PAGES_PROJECT`.
- `SPI_WORKER_ROUTE` dengan bentuk `host-preview/api/*`.
- `SPI_TELEGRAM_WEBHOOK_ROUTE` dengan host yang sama dan path tepat `host-preview/telegram/webhook`.
- `SPI_TELEGRAM_WEBHOOK_URL` berupa URL HTTPS yang sama dengan origin preview dan path tepat `/telegram/webhook`.
- `SPI_TELEGRAM_DELIVERY_ENABLED=false`.

Lindungi Environment `preview` dengan required reviewer. Jangan memakai kredensial Cloudflare production.

`SPI_AUTH_MODE` bernilai `preview_key` pada jalur otomatis `npm run setup:preview --apply`: UI dan API memakai kunci acak sekali pakai tanpa Cloudflare Zero Trust, dengan `SPI_PREVIEW_AUTH_EMAIL` sebagai identitas yang dipetakan dan `SPI_PREVIEW_AUTH_KEY_HASH` sebagai hash kunci. `SPI_AUTH_MODE=cloudflare_access` hanya dipakai bila preview permanen memakai Access; saat itu `SPI_ACCESS_ISSUER` dan `SPI_ACCESS_AUDIENCE` wajib diisi. `SPI_DEPLOY_TARGET` bernilai `zone` bila akun memiliki zone aktif, atau `workers_dev` bila setup memakai domain gratis `workers.dev`.

## Pemeriksaan awal (preflight)

Workflow **Deploy preview** menjalankan `npm run preflight:preview` sebelum quality gate dan migrasi. Pemeriksaan ini memastikan seluruh secret/variabel wajib sudah terisi, formatnya benar, dan preview tetap terisolasi dari production (Hyperdrive, namespace rate limit, serta `SPI_TELEGRAM_DELIVERY_ENABLED=false`). Pemeriksaan berhenti lebih awal dengan daftar masalah dan tidak pernah mencetak nilai rahasia.

Operator dapat menjalankan pemeriksaan yang sama lebih dulu dari lokal dengan variabel environment yang sama:

```powershell
npm run preflight:preview
npm run preflight:preview --with-telegram
```

Gunakan varian `--with-telegram` bila `configure_telegram=true`, agar `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_WEBHOOK_SECRET` ikut diperiksa keberadaannya.

## Jalankan dan verifikasi

1. Operator menjalankan workflow **Deploy preview** secara manual dan menyetujui migrasi hanya untuk database preview.
2. Pipeline menjalankan format, lint, typecheck, integration test, security scan, build, migrasi preview, deploy Worker, pemasangan secret Worker, registrasi webhook, lalu deploy Pages.
3. Dari akun Telegram uji, operator mengirim kode aktivasi satu kali melalui private chat. Jangan memakai identitas atau data jemaat nyata.
4. Verifikasi inbound `/jadwal`, `/tugas`, `/bantuan`, `/darurat`, callback valid, callback replay, dan callback dari akun lain. Karena delivery preview nonaktif, tidak boleh ada pesan keluar nyata.
5. Verifikasi audit tidak memuat token, secret, chat ID mentah, atau isi pesan privat. Catat hasil UAT tanpa menyalin rahasia.

Jika webhook salah sasaran, token diduga bocor, atau identitas uji tidak sesuai, hentikan UAT dan rotasi secret melalui secret store. Jangan menyatakan insiden selesai hanya berdasarkan review AI.
