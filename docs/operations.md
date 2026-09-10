# Operasi Fase 0

## Isolasi lingkungan

Local memakai `apps/worker/wrangler.jsonc` dan database D1 lokal. Preview serta production memakai konfigurasi yang dibuat ke `.wrangler/generated/` oleh `npm run config:preview` atau `npm run config:production`. Generator menolak database yang sama dan mewajibkan keempat namespace rate limit berbeda di antara kedua lingkungan. Workflow preview mengirim bundle Worker dan artifact Pages setelah migrasi yang disetujui. File hasil, `.dev.vars`, token, audience, dan ID cloud tidak disimpan di Git.

Worker hanya menerima konfigurasi `local`, `preview`, atau `production`, issuer HTTPS pada domain Cloudflare Access, origin aplikasi, audience, organisasi, D1, serta dua binding rate limit. Konfigurasi tidak lengkap gagal tertutup. Rute remote harus berbentuk `host/api/*` pada zone yang ditentukan agar API dan Pages dapat memakai origin yang sama.

## Bootstrap satu kali

Jalankan migrasi yang sudah direview terlebih dahulu. Isi variabel `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SPI_D1_DATABASE_ID`, `SPI_ENVIRONMENT`, serta input `SPI_BOOTSTRAP_*` dari penyimpanan secret operator. Jalankan dry run:

```powershell
npm run bootstrap:preview
```

Sesudah target dan input direview, set `SPI_BOOTSTRAP_CONFIRM=bootstrap-preview`, lalu tambahkan `-- --apply`. Skrip memakai D1 batch berparameter untuk membuat satu organisasi, satu pengguna aktif, role Super Admin, audit awal, dan marker singleton. Bootstrap kedua ditolak. Hash payload memungkinkan operator membedakan kegagalan jaringan setelah commit dari input lain tanpa mencetak nama atau email.

## Audit dan health

`GET /api/v1/audit-logs` tersedia bagi role yang mempunyai `audit.read`, memakai pagination cursor stabil dan filter action terbatas. Admin tidak menerima action `note.restricted.*`; Super Admin dapat melihatnya. Metadata audit mengikuti allowlist produsen event dan tidak memuat email atau isi catatan. `GET /api/v1/health` dilindungi Access dan hanya melaporkan ketersediaan Worker/D1 serta nama lingkungan.

## Retensi

Retensi selalu diawali dry run, dibatasi pada satu organisasi, dan menolak cutoff yang lebih muda dari lima tahun. Baris audit dengan retention hold tidak dihapus. Setelah hasil direview, set konfirmasi persis `retention-<environment>-<timestamp>` lalu jalankan skrip dengan `-- --apply`. D1 batch menghapus receipt lama, melepas trigger append-only hanya selama transaksi, menghapus audit yang memenuhi syarat, menulis audit retensi, dan memasang kembali trigger.

Retensi remote dan bootstrap tidak dijalankan otomatis oleh CI. Backup, restore drill, Cloudflare Access nyata, dan persetujuan manusia tetap menjadi gerbang sebelum production.
