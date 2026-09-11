# RUNBOOK: Panduan Operasional & Pemeliharaan Sistem Pelayanan Ibadah (SPI)

**Versi:** 1.2 (Fase 5: Kesiapan Produksi)  
**Sasaran:** Administrator Sistem, Sekretariat Jemaat, dan Koordinator Pelayanan Ibadah  
**Disiplin Biaya:** Arsitektur Rp0 / Serverless Cloudflare & Supabase Free-Tier

---

## 1. Ringkasan Arsitektur & Prinsip Operasional

Sistem Pelayanan Ibadah (SPI) dibangun dengan arsitektur modern berbasis komputasi _edge_:

- **Frontend**: React 19 + TypeScript + Vite, di-_deploy_ pada Cloudflare Pages.
- **Backend**: Cloudflare Workers + Hono, menangani seluruh validasi otorisasi dan bisnis logika secara _stateless_.
- **Basis Data Utama**: Cloudflare D1 (SQLite terdistribusi di edge) dengan replikasi / paritas PostgreSQL di Supabase.
- **Kanal Notifikasi & Tindakan Cepat**: Telegram Bot Webhook terisolasi dengan verifikasi signature kriptografis.
- **Prinsip Keamanan**: _Deny by default_, kontrol akses multi-peran (RBAC), multi-tenant terisolasi (`organization_id`), dan proteksi audit log _append-only_.

---

## 2. Prosedur Inisialisasi & Onboarding (Bootstrap)

### 2.1 Menyiapkan Lingkungan Baru

1. Pastikan Cloudflare D1 database telah dibuat:
   ```bash
   npx wrangler d1 create spi-production
   ```
2. Terapkan seluruh migrasi basis data berurutan:
   ```bash
   npx wrangler d1 migrations apply DB --remote
   ```
3. Jika menggunakan Supabase PostgreSQL sebagai _read-replica_ atau _backup_:
   ```bash
   node scripts/supabase-migrate.mjs
   ```

### 2.2 Bootstrap Akun Super Admin Pertama

Jalankan skrip _bootstrap_ terisolasi tanpa mencetak kredensial ke layar:

```bash
export SPI_ENVIRONMENT=production
export CLOUDFLARE_ACCOUNT_ID="<account_id>"
export SPI_D1_DATABASE_ID="<database_id>"
export CLOUDFLARE_API_TOKEN="<api_token>"
export SPI_BOOTSTRAP_ORGANIZATION_ID="org-jemaat-pusat"
export SPI_BOOTSTRAP_ORGANIZATION_NAME="Gereja Jemaat Pusat"
export SPI_BOOTSTRAP_TIMEZONE="Asia/Makassar"
export SPI_BOOTSTRAP_USER_ID="u-admin-utama"
export SPI_BOOTSTRAP_USER_NAME="Super Administrator"
export SPI_BOOTSTRAP_EMAIL="admin@gereja.invalid"

node scripts/bootstrap-cloud.mjs production --apply
```

---

## 3. Prosedur Cadangan Rutin & Simulasi Pemulihan (Backup & Disaster Recovery)

Sesuai ketentuan **PRD §11**, pencadangan data wajib dilakukan minimal mingguan dan diverifikasi integritasnya menggunakan _checksum_ SHA-256.

### 3.1 Menjalankan Pencadangan (Backup)

```bash
# Backup untuk organisasi aktif
node scripts/backup-d1.mjs --org org-jemaat-pusat --out backups/backup-mingguan.json
```

- Berkas cadangan yang dihasilkan memuat:
  1. Header manifest versi dan stempel waktu UTC.
  2. Ringkasan jumlah baris tiap tabel.
  3. Hash kriptografis SHA-256 dari seluruh isi data.

### 3.2 Simulasi & Prosedur Pemulihan (Restore Drill)

Sebelum melakukan pemulihan, jalankan uji verifikasi (dry-run):

```bash
# 1. Verifikasi integritas berkas tanpa mengubah database
node scripts/restore-d1.mjs --file backups/backup-mingguan.json --org org-jemaat-pusat

# 2. Eksekusi pemulihan data (setelah konfirmasi matang)
node scripts/restore-d1.mjs --file backups/backup-mingguan.json --org org-jemaat-pusat --confirm
```

> [!WARNING]
> Pemulihan basis data akan merekonstruksi tabel dalam urutan _foreign-key safe_ dan mencatat event audit `backup.restore.executed`. Jangan pernah memulihkan cadangan dari organisasi yang berbeda!

---

## 4. Manajemen Rahasia & Rotasi Kunci (Secret Rotation)

Jika terjadi indikasi kebocoran rahasia atau rotasi rutin tahunan:

### 4.1 Rotasi Token Bot Telegram

1. Dapatkan token bot baru dari `@BotFather` di Telegram.
2. Perbarui Worker Secret di Cloudflare:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   ```
3. Pasang ulang webhook dengan secret signature baru:
   ```bash
   node scripts/configure-telegram-cloud.mjs production
   ```

### 4.2 Rotasi Kunci Cloudflare Access

1. Perbarui _Audience Tag_ (AUD) pada Cloudflare Zero Trust dashboard.
2. Perbarui konfigurasi variabel Worker:
   ```bash
   npx wrangler secret put ACCESS_AUDIENCE
   ```

---

## 5. Penanganan Kedaruratan & SOP Hari H Ibadah (Offline Checklist)

### 5.1 Kondisi Gangguan Internet / Jaringan Mati di Gedung Gereja

Jika terjadi kegagalan koneksi internet pada hari H ibadah:

1. **Gunakan Checklist SOP Darurat Luring**:
   - Koordinator atau admin membuka aplikasi web yang telah memuat _Offline Checklist_ (PWA / cached panel pada tab "Insiden").
   - Dokumen fisik darurat yang memuat nomor kontak pelayan cadangan harus tersedia di meja multimedia/konsistori.
2. **Prosedur Penggantian Manual di Lapangan**:
   - Jika pelayan utama tidak hadir sampai waktu kumpul (H-30 menit):
     1. Hubungi pelayan cadangan sesuai daftar prioritas cadangan (_backup pool_).
     2. Catat penggantian pada lembar kertas presensi manual.
     3. Hubungi koordinator ibadah terkait untuk konfirmasi lisan.
3. **Rekonsiliasi Pasca-Ibadah**:
   - Setelah koneksi internet kembali pulih, admin/koordinator membuka modal **Presensi Ibadah** di aplikasi web.
   - Masukkan status kehadiran (`Hadir`, `Terlambat`, `Absen`, `Diganti`) dan cantumkan catatan kejadian.

---

## 6. Kebijakan Retensi Data & Kepatuhan Privasi (UU PDP & PRD §11)

Aplikasi menerapkan pembersihan data otomatis secara berkala:

| Jenis Data                         | Batas Retensi                     | Tindakan Pembersihan                              |
| ---------------------------------- | --------------------------------- | ------------------------------------------------- |
| **File Mentah Impor Excel**        | Maksimal 24 jam setelah commit    | Otomatis dikosongkan (`{}`)                       |
| **Staging Baris Impor**            | 30 hari setelah batch selesai     | Dihapus dari tabel `import_rows`                  |
| **Batch Impor Telantar**           | 7 hari tanpa review               | Berubah status menjadi `expired`                  |
| **Audit Logs**                     | 5 tahun                           | Dihapus, kecuali memiliki `audit_retention_holds` |
| **Catatan Pembinaan (Restricted)** | Masa aktif pelayan + maks 3 tahun | Ditinjau tahunan oleh Super Admin                 |

Jalankan skrip pembersihan retensi bulanan:

```bash
# Simulasi pembersihan (dry-run)
node scripts/retention-d1.mjs --org org-jemaat-pusat

# Eksekusi pembersihan nyata
node scripts/retention-d1.mjs --org org-jemaat-pusat --apply
```

---

## 7. Daftar Periksa Pra-Rilis Produksi (Production Pre-flight Checklist)

Sebelum melakukan deployment rilis ke produksi, seluruh checklist berikut **WAJIB** bernilai `LULUS`:

- [ ] **Typecheck**: `npm run typecheck` (0 errors).
- [ ] **Linting**: `npm run lint` (0 errors, 0 warnings).
- [ ] **Formatting**: `npm run format:check` (Semua berkas konsisten dengan Prettier).
- [ ] **Suite Pengujian Lengkap**: `npm test` (Seluruh 19 test files dan 160+ unit/integration test lulus 100%).
- [ ] **Uji Matriks Keamanan**: `npx vitest run tests/security-asvs.test.ts` (Lulus skenario RBAC-01..08, TENANT-01, FIELD-01..02, API-01..03, SEC-01..02).
- [ ] **Uji Simulasi Cadangan**: `npx vitest run tests/backup-restore.test.ts` (Lulus verifikasi checksum dan pemulihan bencana).
- [ ] **Pemeriksaan Secret**: `node scripts/scan-secrets.mjs` (Tidak ada kredensial yang bocor di repositori).
- [ ] **Production Build**: `npm run build` (Bundle Vite dan Worker dry-run berhasil dikompilasi).
