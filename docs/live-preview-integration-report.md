# Laporan Integrasi & Uji Live Preview Multi-Role SPI

**Dokumentasi Penyelesaian Integrasi Frontend - Backend - Database**  
**Sistem Pelayanan Ibadah (SPI)**  
_Tanggal: 11 September 2026_  
_Target Lingkungan: Preview Supabase & Cloudflare Worker_  
_Akses Live Preview:_ `https://spi-api-preview.manasumiraka.workers.dev/?key=czF0v2bxLESFCfZlrqFkkPdw8NusLjTrInPSxCKErJo`

---

## 1. Ringkasan Eksekutif

Sesuai permintaan pengujian live run dan evaluasi UX komprehensif, seluruh komponen aplikasi telah diidentifikasi dan disempurnakan sehingga integrasi tiga lapis (**Frontend Web UI**, **Backend Worker API**, dan **Database Supabase Preview**) berfungsi penuh untuk seluruh role pengguna:

1. **Super Administrator**
2. **Koordinator Ibadah** (_Budi Santoso_)
3. **Koordinator Bidang/Multimedia** (_Siti Rahma_)
4. **Pelayan Jemaat** (_Johan Pratama_, _Rina Kurnia_, _Dwi Hartono_)

Penyempurnaan mencakup pengisian data benih (_seed data_) realistis, perbaikan query PostgreSQL/Supabase, penambahan endpoint API penugasan & laporan pribadi, implementasi panel interaktif **Tugas Saya** & **Detail Ibadah**, perbaikan persentase metrik, serta penyediaan fitur **Persona Switcher** di bilah atas (_topbar_) untuk memudahkan pengujian lintas peran secara langsung di peramban.

---

## 2. Identifikasi Kesenjangan UX & Solusi per Role Pengguna

| Role Pengguna                                            | Kesenjangan UX yang Teridentifikasi                                                                                                                                                                                                  | Tindakan Perbaikan & Integrasi                                                                                                                                                                                                                                                          | Status                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Semua Role**                                           | Dashboard Beranda bersifat statis (data mock), tidak mencerminkan data aktual dari database.                                                                                                                                         | Hero Service otomatis mengambil ibadah terdekat berstatus `scheduled`, kartu "Menunggu Konfirmasi" membaca `GET /assignments?status=awaiting_confirmation`, kartu "Insiden Aktif" membaca `GET /incidents?status=open`, dan "Jadwal Terdekat" membaca daftar ibadah riil.               | **Selesai (100% Dinamis)** |
| **Pelayan Jemaat** (_Johan Pratama_, _Rina Kurnia_)      | Tidak ada antarmuka bagi pelayan untuk melihat jadwal tugas pribadinya, tidak ada tombol konfirmasi hadir / lapor berhalangan, serta tab Laporan menampilkan error 403 karena pelayan tidak berhak membaca rekap seluruh organisasi. | Dibuat panel interaktif `<MyTasksPanel>` yang membaca `GET /api/v1/assignments/my`. Pelayan dapat menekan **Konfirmasi Hadir** atau **Berhalangan Hadir** (disertai modal alasan). Dibuat endpoint `GET /api/v1/reports/me` dan tab khusus **Laporan Pelayanan Saya** di panel Laporan. | **Selesai**                |
| **Koordinator Ibadah & Admin** (_Budi Santoso_, _Admin_) | Di tab Kalender, jadwal ibadah tidak dapat diklik untuk melihat rincian slot peran, tidak ada antarmuka untuk menerbitkan jadwal berstatus Draf ke Terjadwal.                                                                        | Diimplementasikan modal kelola `<ServiceDetailModal>` yang menampilkan slot peran ibadah, tombol `+ Tambah Pelayan`, tombol `Buka Presensi`, dan aksi `Terbitkan Jadwal` (`POST /api/v1/worship-services/:id/publish`).                                                                 | **Selesai**                |
| **Koordinator Bidang** (_Siti Rahma_)                    | Perlu memantau kesiapan pelayan di bidangnya dan merespons jika ada insiden pelayan berhalangan mendadak.                                                                                                                            | Tab Insiden menampilkan insiden aktif (kasus penggantian MC Dwi Hartono). Koordinator dapat membuka detail insiden, meninjau rekomendasi pelayan cadangan sesuai kapabilitas, dan melakukan eskalasi.                                                                                   | **Selesai**                |
| **Pengujian Multi-Role**                                 | Tidak ada cara berpindah akun pengujian dengan mudah tanpa menghapus cookie/token autentikasi.                                                                                                                                       | Dibuat dropdown **Persona Preview** di topbar navigasi. Pemilihan persona menginjeksi header `X-Preview-As-Email` ke backend worker, sehingga sistem mengenali pengguna dan hak aksesnya secara instan.                                                                                 | **Selesai**                |

---

## 3. Rincian Teknis Integrasi

### A. Database Seed Data Realistis (`scripts/seed-preview.mjs`)

Dijalankan pada Supabase preview (`spi-preview`):

- **4 Bidang Pelayanan (`service_fields`)**: Firman & Liturgi, Musik & Pujian, Multimedia & Sound, Kolektan & Penyambut.
- **7 Peran Pelayanan (`service_roles`)**: Pelayan Firman, Pemimpin Pujian (MC), Singer, Pianis, Operator Multimedia, Sound System, Pelayan Pintu & Kolektan.
- **6 Akun Pengguna Persona**:
  - `admin.preview@spi-preview.invalid` (Super Admin)
  - `budi.santoso@spi-preview.invalid` (Koordinator Ibadah)
  - `siti.rahma@spi-preview.invalid` (Koordinator Bidang Multimedia)
  - `johan.pratama@spi-preview.invalid` (Pelayan Multimedia & Sound)
  - `rina.kurnia@spi-preview.invalid` (Pelayan Kolektan & Singer)
  - `dwi.hartono@spi-preview.invalid` (Pelayan MC & Pianis)
- **3 Ibadah (`worship_services`)**:
  - `ws-sunday-next` (Minggu 13 Sep 2026, 09.00 WITA) - _Status: scheduled_
  - `ws-midweek-next` (Rabu 16 Sep 2026, 19.00 WITA) - _Status: draft_
  - `ws-sunday-past` (Minggu 6 Sep 2026, 09.00 WITA) - _Status: completed_
- **9 Penugasan Pelayan (`assignments`)**: Status variatif (`awaiting_confirmation`, `accepted`, `unavailable`).
- **1 Kasus Insiden Kritis Penggantian MC (`replacement_cases`)**: MC Dwi Hartono mendadak demam tinggi, memicu alur penggantian darurat.
- **4 Presensi Faktual (`attendance_records`) & Evaluasi Ibadah (`service_notes`)**.

### B. Penyempurnaan Backend Worker (`apps/worker`)

1. **Perbaikan Kompatibilitas Query PostgreSQL/Supabase**:
   - Memperbaiki query rekapitulasi performa (`performance-repository.ts`) dari `ORDER BY totalAssignments` / `ORDER BY count` menjadi `ORDER BY COUNT(a.id) DESC` untuk mencegah kegagalan eksekusi SQL akibat _unquoted case folding_ PostgreSQL.
   - Mengubah query presensi ibadah menjadi `LEFT JOIN attendance_records` agar daftar penugasan tetap muncul di modal presensi kendati belum check-in.
2. **Endpoint Baru**:
   - `GET /api/v1/assignments/my`: Mengambil penugasan milik pengguna aktif yang sedang login.
   - `GET /api/v1/assignments`: Query penugasan berdasarkan filter organisasi / status.
   - `GET /api/v1/reports/me`: Rekapitulasi statistik pelayanan pribadi pelayan (kehadiran, konfirmasi, tugas pengganti, riwayat peran).
3. **Mekanisme Persona Switcher**:
   - Ditambahkan parser header `X-Preview-As-Email` di `apps/worker/src/app.ts` yang aktif secara aman dalam mode preview key.

### C. Penyempurnaan Frontend Web (`apps/web`)

1. **`ProductShell.tsx`**:
   - Dashboard Beranda dinamis membaca jadwal terdekat, daftar tunggu konfirmasi, dan insiden aktif.
   - Integrasi tab navigasi: Beranda, Kalender, Tugas Saya, Insiden, Laporan, Pengguna/Audit.
   - Dropdown Persona Switcher di header.
2. **`MyTasksPanel.tsx`**:
   - Menampilkan penugasan yang akan datang dan yang telah selesai.
   - Tombol **Konfirmasi Hadir** (`POST /api/v1/assignments/:id/confirm`).
   - Tombol & Modal **Berhalangan Hadir** (`POST /api/v1/assignments/:id/decline`) yang otomatis menanyakan alasan ketidakhadiran.
3. **`ServiceDetailModal.tsx`**:
   - Modal kelola rincian jadwal ibadah: melihat kesiapan peran, menambah pelayan, membuka presensi, dan menerbitkan jadwal draf.
4. **`PerformanceReportsPanel.tsx`**:
   - Pemisahan tab yang bersih: **Ringkasan Organisasi**, **Laporan Pelayanan Saya**, dan **Catatan Evaluasi & Pastoral (ACL)**.
   - Normalisasi rasio persentase agar tidak terduplikasi menjadi ribuan persen.

---

## 4. Hasil Verifikasi & Pengujian

1. **Automated Suite Check (`npm run check`)**:
   - `Prettier`: 100% matched formatting.
   - `ESLint`: 0 warnings, 0 errors.
   - `TypeScript` (`tsc --noEmit`): 0 errors.
   - `Vitest Suite`: **20 test files passed, 170 unit & integration tests passed (100% green)**.
   - `Vite Web Build`: Selesai dalam 913ms.
   - `Wrangler Dry-Run`: Berhasil memverifikasi binding D1, rate limiters, dan environment variables.
2. **CI/CD Pipeline Cloudflare**:
   - Workflow GitHub Actions `deploy-preview.yml` (run `34588889685`) berhasil men-deploy worker ke Cloudflare dalam waktu 52 detik.
3. **End-to-End Visual Verification (Playwright)**:
   - Berhasil mengeksekusi navigasi dan interaksi simulasi browser, menghasilkan bukti tangkapan layar untuk seluruh tab dan persona.

---

## 5. Panduan Pengujian Mandiri oleh Pengguna

Untuk menguji langsung di browser:

1. Buka URL:
   ```
   https://spi-api-preview.manasumiraka.workers.dev/?key=czF0v2bxLESFCfZlrqFkkPdw8NusLjTrInPSxCKErJo
   ```
2. **Uji Peran Super Admin / Koordinator**:
   - Perhatikan kartu **Menunggu konfirmasi** (terdapat Johan Pratama dan Rina Kurnia).
   - Perhatikan kartu **Insiden aktif** (Penggantian MC Dwi Hartono).
   - Klik tab **Kalender** -> Klik tombol **Kelola** pada _Doa Tengah Minggu_ -> Terlihat badge Draf dan tombol aksi.
   - Klik tab **Laporan** -> Buka tab **Ringkasan Organisasi** untuk melihat metrik agregat gereja.
3. **Uji Peran Pelayan (Johan Pratama)**:
   - Pilih **Johan Pratama (Pelayan (Multimedia))** pada dropdown _Persona Preview_ di kanan atas.
   - Buka tab **Tugas** -> Terlihat jadwal Ibadah Minggu Raya (13 Sep) dengan status _Menunggu Konfirmasi_.
   - Tekan tombol **Konfirmasi Hadir** atau **Berhalangan Hadir**.
   - Buka tab **Laporan** -> Klik tab **Laporan Pelayanan Saya** -> Terlihat statistik kehadiran pribadi dan peran Operator Multimedia yang dilayani.
4. **Uji Peran Pelayan (Rina Kurnia)**:
   - Pilih **Rina Kurnia (Pelayan (Kolektan))** pada dropdown _Persona Preview_.
   - Buka tab **Tugas** -> Terlihat penugasan sebagai _Pelayan Pintu & Kolektan_.
