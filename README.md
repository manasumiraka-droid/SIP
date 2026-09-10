# Sistem Pelayanan Ibadah

Implementasi lokal Fase 0, Fase 1, Fase 1b, dan bagian teknis Fase 2 berdasarkan PRD v1.2 telah selesai. Aplikasi menyediakan fondasi identitas/RBAC/audit, jadwal inti, impor Excel, serta aktivasi/callback/notifikasi Telegram. Gate akun Telegram nyata ditunda sampai preview Cloudflare permanen tersedia. Ini belum merupakan persetujuan deployment production.

## Menjalankan lokal

Prasyarat: Node.js 24 dan npm. Jalankan dari root proyek:

```powershell
npm ci
npm run db:migrate:local
npm run db:seed:local
```

Jalankan web dan Worker lokal bersama-sama:

```powershell
npm run dev
```

Buka http://localhost:5173. Perintah `dev` menjaga Vite dan Worker demo dalam satu proses induk agar UI tidak tersambung ke web tanpa API. Proxy Vite mengirim assertion demo tetap ke Worker dan aplikasi membaca data sintetis dari D1 lokal. Bypass hanya diterima saat `ENVIRONMENT=local`, origin tepat `http://localhost:5173`, dan email demo dikonfigurasi. Preview sementara memakai kunci acak khusus preview tanpa Cloudflare Zero Trust; production tetap wajib memakai JWT Cloudflare Access. `npm run dev:web` dan `npm run dev:api` tersedia untuk diagnosis terpisah.

Salin variabel runtime awal `.env.example` ke `apps/worker/.dev.vars` untuk pengujian Access terkonfigurasi. Bootstrap cloud memakai skrip operator satu kali dan tidak menyediakan akun bawaan atau UI bootstrap. Jangan memakai akun/data produksi di lokal.

## Verifikasi

```powershell
npm run check
npm audit --audit-level=high
npm run security:secrets
npx playwright install chromium
npm run test:browser
```

`build` membuat frontend ke `dist/web` dan bundle Worker dengan **dry-run**, tanpa deploy. CI menjalankan pemeriksaan format, lint, typecheck, tes domain/API/JWT/migrasi, audit dependensi, build, dan migrasi D1 lokal. Tes SQLite menggunakan runtime Node; uji D1 lokal melengkapi verifikasi migrasi.

## Struktur

- `apps/web`: React/Vite/Tailwind, Bahasa Indonesia, halaman status akses responsif.
- `apps/worker`: Hono, adapter JWT Access, repository SQL, audit, dan adapter PostgreSQL Hyperdrive.
- `packages/domain`: policy murni yang memisahkan permission dan scope.
- `packages/validation`: kontrak Zod untuk identitas dan respons.
- `migrations`: SQL berurutan, terpisah dari seed jemaat.
- `docs`: arsitektur, threat model, migrasi dan status build.

## Batas implementasi

Endpoint tersedia: `GET /api/v1/me`, `GET /api/v1/health`, `GET/POST /api/v1/users`, `PUT /api/v1/users/{id}/roles`, `PATCH /api/v1/users/{id}/status`, dan `GET /api/v1/audit-logs`. Identitas dimuat ulang dari D1 setiap request; email berasal dari JWT terverifikasi dan organisasi dari konfigurasi server. Semua mutasi identitas memakai idempotensi, rate limit, optimistic concurrency, dan audit atomik. Lihat [pengelolaan role](docs/role-management.md), [pembuatan akun](docs/user-creation.md), [status akun](docs/account-status.md), dan [operasi](docs/operations.md).

Schema dan API berbatas organisasi untuk bidang/peran, profil pelayan, capability approver, availability, ibadah, assignment, dan scope koordinator tersedia. Mutasi jadwal utama memakai permission, scope, idempotensi, concurrency, dan audit atomik. Impor Excel Fase 1b menyediakan template kosong, pemilihan sheet, mapping, validasi/matching manual, pratinjau, penanganan duplikat, override waktu, commit draf idempoten, rollback, serta retensi terjadwal. Batas parser dan bukti verifikasi ada di [spike Fase 1b](docs/phase-1b-spike.md) dan [closeout Fase 1b](docs/phase-1b-closeout.md).

Admin dapat mengunduh template kosong [form-jadwal-ibadah.xlsx](apps/web/public/form-jadwal-ibadah.xlsx), mengisinya, lalu mengunggahnya pada wizard impor. Template hanya berisi enam header yang diwajibkan PRD dan tidak memuat data jemaat.

Template deployment preview dan generator konfigurasi terisolasi tersedia. Target online memakai Supabase PostgreSQL melalui Cloudflare Hyperdrive; D1 hanya dipertahankan sebagai emulator tes lokal. Workflow **Deploy preview** dapat membawa Pages, Worker, dan migrasi Supabase lebih dahulu dengan `configure_telegram=false`; pemasangan secret dan webhook Telegram hanya berjalan bila dipilih eksplisit. Lihat [setup Supabase–Cloudflare](docs/supabase-cloudflare.md), [runbook preview Cloudflare](docs/phase-2-preview-runbook.md), dan [closeout Fase 2.5](docs/phase-2.5-repository-cloudflare.md).

Untuk setup preview otomatis, salin `.env.example` menjadi `.env`, isi hanya KEY/URL yang ditandai, jalankan `npm run setup:preview` untuk dry-run lalu `npm run setup:preview -- --apply`.
