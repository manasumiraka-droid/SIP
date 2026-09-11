# Dokumentasi Implementasi Fitur Pelayanan, Jabatan, dan Peran Pelayanan (SPI v1.2)

Dokumen ini merangkum secara lengkap implementasi teknis, aturan gerejawi, skema basis data, antarmuka pengguna (UI), dan pengujian otomatis untuk fitur **Pengelolaan Pelayanan dan Jabatan Gerejawi** pada Sistem Pelayanan Ibadah (SPI) sesuai PRD v1.2 poin 3.2.

---

## 1. Ikhtisar Role & Hak Akses (PRD v1.2 Poin 3.2)

| Role Sistem           | Deskripsi & Hak Akses                                                                  |  Akses Menu Pelayanan  |
| :-------------------- | :------------------------------------------------------------------------------------- | :--------------------: |
| `super_admin`         | Akses penuh atas seluruh modul organisasi, konfigurasi sistem, dan data master gereja. |     **CRUD Penuh**     |
| `admin`               | Pengelolaan data operasional jemaat, pelayan, peran, jadwal, dan pelaporan.            |     **CRUD Penuh**     |
| `worship_coordinator` | Pembuatan draf jadwal, koordinasi liturgi, persetujuan jadwal, eskalasi insiden.       | Read Only di Penugasan |
| `field_coordinator`   | Penugasan pelayan per bidang musik/multimedia/kolektan, monitoring tim.                | Read Only di Penugasan |
| `servant`             | Konfirmasi kehadiran jadwal pribadi, presensi, pelaporan kendala pribadi.              |           -            |
| `public_viewer`       | Melihat warta jadwal ibadah publik.                                                    |           -            |

---

## 2. Jabatan Gerejawi & Aturan Kelayakan Peran Pelayanan

### A. Klasifikasi Jabatan (`title`)

Setiap pelayan jemaat terdaftar memiliki salah satu dari 3 jabatan gerejawi:

1. **Penatua**: Pemimpin rohani & majelis jemaat.
2. **Diaken**: Pelayan meja, kolektan, persembahan, dan pelayanan umum majelis.
3. **Staff**: Tenaga pendukung operasional gereja non-majelis.

### B. Aturan Penugasan (Ecclesiastical Rules)

- **Penatua & Diaken**: Memiliki hak dan kapabilitas penuh untuk mengambil **seluruh peran pelayanan** dalam ibadah raya maupun ibadah kategorial (_Pelayan Firman, Pelayan Mimbar 2, Kolektan & Pelayan Pintu, Pelayan Persembahan, Pemain Keyboard/Piano, Kantoria, Operator Multimedia, Operator Sound System_).
- **Staff**: Terbatas secara ketat **hanya** pada peran:
  1. **Operator Multimedia**
  2. **Operator Sound System**
  3. **Kantoria**

> [!IMPORTANT]
> Aturan kelayakan jabatan ditegakkan pada dua lapis (_defense in depth_):
>
> 1. **Lapis UI**: Dropdown pemilihan pelayan pada modal jadwal (`ServiceDetailModal.tsx`) menampilkan badge jabatan `[Penatua]`, `[Diaken]`, `[Staff]` dan otomatis menonaktifkan (`disabled`) opsi Staff jika peran yang dipilih bukan Operator atau Kantoria.
> 2. **Lapis Backend & Database**: Endpoint penugasan `/api/v1/services/:id/assignments` memvalidasi jabatan pelayan dan melempar error status `422 VALIDATION_FAILED` jika Staff ditugaskan pada peran di luar batasannya.

---

## 3. Daftar Peran Pelayanan Standar

| Peran Pelayanan                | Kode Sistem           | Bidang Pelayanan       | Kelayakan Jabatan       | Default Slot |
| :----------------------------- | :-------------------- | :--------------------- | :---------------------- | :----------: |
| **Pelayan Firman**             | `preacher`            | Firman dan Liturgi     | Penatua & Diaken        |   1 orang    |
| **Pelayan Mimbar 2**           | `mimbar_2`            | Firman dan Liturgi     | Penatua & Diaken        |   1 orang    |
| **Kolektan dan Pelayan Pintu** | `pintu_kolektan`      | Kolektan dan Penyambut | Penatua & Diaken        |   2 orang    |
| **Pelayan Persembahan**        | `persembahan`         | Kolektan dan Penyambut | Penatua & Diaken        |   2 orang    |
| **Pemain Keyboard/Piano**      | `pianist`             | Musik dan Pujian       | Penatua & Diaken        |   1 orang    |
| **Kantoria**                   | `kantoria`            | Musik dan Pujian       | Penatua, Diaken & Staff |   2 orang    |
| **Operator Multimedia**        | `operator_multimedia` | Multimedia dan Sound   | Penatua, Diaken & Staff |   1 orang    |
| **Operator Sound System**      | `operator_sound`      | Multimedia dan Sound   | Penatua, Diaken & Staff |   1 orang    |

---

## 4. Arsitektur & Endpoint API

### A. Endpoint Pelayan (`/api/v1/servants`)

- `GET /api/v1/servants`: Mengambil daftar pelayan jemaat dengan filter status, pencarian nama/telepon, dan informasi jabatan.
- `POST /api/v1/servants`: Menambah pelayan baru (`displayName`, `email`, `phoneNumber`, `title`, `serviceRoleIds`).
- `PUT /api/v1/servants/:id`: Memperbarui data pelayan, nomor telepon, jabatan, atau peran terdaftar.
- `DELETE /api/v1/servants/:id`: Menonaktifkan (soft delete) data pelayan.

### B. Endpoint Peran Pelayanan (`/api/v1/service-roles`)

- `GET /api/v1/service-roles`: Mengambil seluruh jenis peran pelayanan beserta kuota default dan bidang pelayanan.
- `POST /api/v1/service-roles`: Mendaftarkan peran pelayanan baru.
- `PUT /api/v1/service-roles/:id`: Mengubah nama peran, kuota, atau bidang.
- `DELETE /api/v1/service-roles/:id`: Menonaktifkan jenis peran pelayanan.

---

## 5. Bukti Pengujian & Deployment

- **Test Suite Otomatis (`tests/servant-management.test.ts`)**:
  - 8/8 test unit & integrasi lolos pengujian (CRUD pelayan, kapabilitas otomatis berdasarkan jabatan, pemblokiran penugasan ilegal Staff, promosi jabatan).
- **Quality Gates**:
  - `Prettier`: Formatted 100%.
  - `ESLint`: 0 warnings, 0 errors.
  - `TypeScript`: Clean.
  - `Vitest`: 21 test files / 178 tests passed.
- **Live Preview URL**:
  `https://spi-api-preview.manasumiraka.workers.dev/?key=czF0v2bxLESFCfZlrqFkkPdw8NusLjTrInPSxCKErJo`
