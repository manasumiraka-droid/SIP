# Closeout Fase 3 — Manajemen Insiden dan Penggantian Cepat

Tanggal implementasi: 11 September 2026.  
Status: Selesai di lingkungan lokal dan terverifikasi penuh pada test suite.

Implementasi Fase 3 melengkapi Sistem Pelayanan Ibadah dengan alur respon darurat ketika pelayan berhalangan mendadak, baik dilaporkan mandiri melalui Telegram bot `/darurat` maupun dibuka langsung oleh koordinator/admin pada antarmuka web, sesuai amanat **PRD v1.2 Bagian 5.4, 14, dan 17**.

---

## 1. Hasil & Fitur yang Dibangun

- **Sistem Kasus Penggantian (`replacement_cases`)**:
  - Pelacakan insiden penggantian per penugasan ibadah dengan status: `open`, `resolved`, `escalated_manual`, dan `cancelled`.
  - Tingkat urgensi dinamis: `critical` jika waktu mulai ibadah $\le 60$ menit (dengan tenggat respon 5 menit), atau `standard` jika $> 60$ menit.
  - Batasan integritas database: indeks parsial unik memastikan hanya ada maksimal satu kasus aktif terbuka per penugasan.
- **Rekomendasi Kandidat Deterministik Tanpa AI Spiritual Ranking**:
  - Algoritma pemeringkatan murni operasional yang mematuhi `AI_RULES_SPI.md`:
    1. Prioritas 1: Pelayan dengan penanda tim cadangan (`is_backup = 1`).
    2. Prioritas 2: Beban tugas bulan berjalan terendah (`monthly_assignments_count` terkecil).
    3. Prioritas 3: Urutan abjad nama (`display_name ASC`).
  - Filter kelaikan ketat: kelaikan aktif (`servant_capabilities`), tidak memiliki blok ketersediaan bertabrakan (`availability_blocks`), tidak memiliki tugas bersamaan, dan tidak melebihi batas kuota bulanan.
  - Proteksi Peran Firman: Pelayan Firman (_preacher_) wajib memiliki persetujuan eksplisit dari _designated capability approver_.
- **Transaksi Pengesahan Pengganti Atomik (`resolveIncident`)**:
  - Melakukan transisi penugasan lama ke status `reassigned`.
  - Menempatkan pelayan pengganti pada slot penugasan yang sama.
  - Menandai kasus sebagai `resolved` dan menautkan `resulting_assignment_id`.
  - Mengisolasi penulisan dengan kuitansi idempotensi (`replacement_resolutions`) berbasis `Idempotency-Key` dan SHA-256 payload hash.
- **Integrasi Perintah Telegram Bot `/darurat`**:
  - Pelayan dapat melaporkan ketidakhadiran mendadak langsung dari chat Telegram.
  - Bot secara otomatis membuka `replacement_cases` dan menandai penugasan terkait sebagai `needs_replacement`.
- **Antarmuka Pengguna Mobile-First (360px)**:
  - Indikator visual kartu status kritis (merah berkedip untuk ibadah $\le 1$ jam) dan standar (kuning).
  - Laci pemilihan kandidat (_Candidate Drawer_) dengan tombol kontak WhatsApp darurat langsung (`wa.me/...`).
  - Dialog konfirmasi pengesahan manusia (_human-in-the-loop confirmation_).
  - Checklist SOP Darurat Luring (_Offline Emergency Checklist_) yang tetap dapat diakses saat jaringan internet lambat/mati di gereja.

---

## 2. Bukti & Verifikasi Pengujian

- **Migrasi Basis Data**:
  - Berkas migrasi D1 [migrations/0024_replacement_incidents.sql](file:///d:/Aplikasiku/SPI-SistemPelayananIbadah/migrations/0024_replacement_incidents.sql) berhasil diterapkan.
  - Sinkronisasi skema Supabase PostgreSQL [supabase/migrations/20260910000000_spi_schema.sql](file:///d:/Aplikasiku/SPI-SistemPelayananIbadah/supabase/migrations/20260910000000_spi_schema.sql) terverifikasi identik.
- **Unit Tests**:
  - `tests/incident-domain.test.ts`: 9 kasus uji lulus 100% (state machine transisi kasus, kalkulasi urgensi, determinisme rekomendasi kandidat).
- **Integration Tests**:
  - `tests/incident-integration.test.ts`: 7 skenario lulus 100% (pembuatan kasus idempoten, transaksi pengesahan atomik, penolakan koordinator di luar scope, proteksi approver preacher, eskalasi manual, dan integrasi bot `/darurat`).
- **Pemeriksaan Mutu Kode**:
  - TypeScript Typecheck: Bersih (0 errors).
  - ESLint: Bersih (0 errors, 0 warnings).
  - Format Prettier: Sesuai pedoman gaya kode repositori.
