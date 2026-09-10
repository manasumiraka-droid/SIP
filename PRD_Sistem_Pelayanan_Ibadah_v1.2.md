# PRD — Sistem Pelayanan Ibadah

**Versi:** 1.2  
**Status:** Siap untuk pembangunan MVP; keputusan produk Bagian 17 telah dikonfirmasi  
**Target:** Satu jemaat, solo developer, biaya operasional Rp0 selama masih berada dalam kuota gratis layanan

## Riwayat perubahan (v1.1 → v1.2)

- Merinci RBAC sampai tingkat permission, scope data, aturan field sensitif, kontrak API, dan skema database.
- Mengubah model satu `users.role` menjadi user–role many-to-many agar satu pengguna dapat menjalankan lebih dari satu fungsi.
- Menambahkan relasi eksplisit antara akun pengguna dan profil pelayan.
- Menambahkan fitur impor data jadwal kebaktian/ibadah awal dari Excel dengan tahap unggah, pemetaan, validasi, pratinjau, commit atomik, serta laporan hasil.
- Menambahkan endpoint minimum, format error, aturan idempotensi, concurrency control, dan audit keamanan.
- Menambahkan acceptance criteria dan matriks pengujian RBAC/keamanan.
- Menyelesaikan atau memberi rekomendasi atas konflik mengenai pengelolaan peran, autentikasi pelayan, penghapusan data, status penugasan saat jadwal ditunda, hak koordinator bidang, dan impor nama pelayan yang ambigu.
- Menetapkan jam default impor pukul 17.00 WITA (`Asia/Makassar`), approver Pelayan Firman wajib ditunjuk, delimiter nama jamak titik koma, serta kebijakan retensi final.

## 1. Ringkasan produk

Sistem Pelayanan Ibadah adalah aplikasi web mobile-first untuk menyusun jadwal ibadah, mengelola pelayan, mencatat kesediaan, menangani penggantian mendadak dan perubahan jadwal, mengimpor jadwal awal dari Excel, serta mengevaluasi kesiapan pelayanan. Telegram Bot menjadi kanal notifikasi dan tindakan cepat; API aplikasi tetap menjadi sumber kebenaran dan tempat seluruh keputusan otorisasi dilakukan.

Sistem membantu operasional, tetapi tidak menggantikan kewenangan pendeta, majelis, atau koordinator ibadah.

## 2. Sasaran dan batas MVP

### Sasaran

- Semua penugasan, konfirmasi, perubahan, penggantian, dan hasil impor tercatat dalam satu tempat.
- Setiap pengguna hanya dapat melakukan aksi dan membaca data sesuai peran serta cakupan tugasnya.
- Koordinator mengetahui kekosongan petugas sebelum hari ibadah.
- Pelayan dapat menanggapi tugas melalui Telegram dalam beberapa detik.
- Jadwal awal dapat dimigrasikan dari Excel tanpa membuat data ganda atau penugasan yang salah.
- Insiden mendadak memiliki langkah penanganan, daftar cadangan, dan rekam jejak.
- Data kinerja digunakan untuk pemerataan dan pembinaan, bukan pemeringkatan rohani.

### Di luar MVP

- Pembayaran, persembahan digital, dan pencatatan keuangan.
- AI untuk menentukan kelayakan rohani atau menetapkan pelayan tanpa persetujuan manusia.
- Integrasi WhatsApp otomatis berbayar.
- Aplikasi Android/iOS native.
- Halaman publik/non-login. Role `public_viewer` disiapkan untuk fase berikutnya tetapi tidak diaktifkan pada MVP.
- Multi-organisasi aktif. Seluruh data tetap memiliki `organization_id` agar migrasi berikutnya aman.
- Sinkronisasi dua arah dengan Excel. MVP hanya mendukung impor satu arah.

## 3. Pengguna, autentikasi, dan RBAC

### 3.1 Prinsip

- **Deny by default:** akses ditolak jika tidak ada permission eksplisit.
- Otorisasi selalu dilakukan di server pada setiap request dan callback Telegram; penyembunyian tombol di UI bukan kontrol keamanan.
- Permission menentukan tindakan; scope menentukan baris data yang boleh diakses; field policy menentukan kolom sensitif yang boleh ditampilkan.
- Satu pengguna dapat memiliki beberapa role dalam organisasi yang sama. Permission efektif adalah gabungan role, tetapi tetap dibatasi scope dan status akun.
- Role sistem bersifat tetap pada MVP. Super Admin boleh memberikan/mencabut role kepada pengguna, tetapi tidak membuat definisi role atau permission baru.
- Perubahan role, permission assignment, data sensitif, jadwal, impor, dan keputusan pengganti wajib diaudit.
- Pengguna berstatus `suspended` atau `inactive` tidak memperoleh akses meskipun masih memiliki role.

### 3.2 Role dan scope

| Kode role | Nama | Scope default |
|---|---|---|
| `super_admin` | Super Admin | Seluruh data dalam organisasi |
| `admin` | Admin/Sekretariat | Seluruh data operasional organisasi, kecuali catatan pembinaan terbatas |
| `worship_coordinator` | Koordinator Ibadah | Ibadah yang ditugaskan kepadanya; pada kondisi kritis dapat melihat data kontak kandidat yang relevan |
| `field_coordinator` | Koordinator Bidang | Ibadah dan penugasan pada bidang/peran pelayanan yang ditugaskan kepadanya |
| `servant` | Pelayan | Profil sendiri, tugas sendiri, dan detail minimum ibadah terkait tugasnya |
| `public_viewer` | Jemaat/publik | Jadwal yang berstatus dipublikasikan; nonaktif pada MVP |

Seorang koordinator memperoleh scope dari tabel assignment koordinator, bukan hanya dari nama role. Role tanpa assignment scope tidak memberikan akses ke seluruh ibadah atau bidang.

### 3.3 Matriks permission MVP

Legenda: `O` = organisasi, `S` = data dalam scope, `D` = data diri sendiri, `—` = ditolak.

| Permission | Super Admin | Admin | Koord. Ibadah | Koord. Bidang | Pelayan |
|---|---:|---:|---:|---:|---:|
| `organization.read` | O | O | S | S | — |
| `organization.update` | O | — | — | — | — |
| `user.read` | O | O | S | S | D |
| `user.manage_role` | O | — | — | — | — |
| `servant.read` | O | O | S | S | D |
| `servant.create_update` | O | O | — | — | D terbatas |
| `servant.manage_capability` | O | O* | S* | S* | — |
| `service.create_update` | O | O | S | — | — |
| `service.publish` | O | O | S | — | — |
| `service.change_status` | O | O | S | — | — |
| `assignment.read` | O | O | S | S | D |
| `assignment.create_update` | O | O | S | S | — |
| `assignment.respond` | — | — | — | — | D |
| `replacement.manage` | O | O | S | S | D hanya merespons tawaran |
| `attendance.manage` | O | O | S | S | — |
| `incident.read_manage` | O | O | S | S terkait bidang | D hanya laporan sendiri/status minimum |
| `note.operational` | O | O | S | S | D jika ditujukan kepadanya |
| `note.restricted` | O | —** | S** | — | D hanya jika ditandai dapat dilihat subjek |
| `report.organization` | O | O | S/agregat | S/agregat | — |
| `report.self` | D | D | D | D | D |
| `audit.read` | O | O operasional | — | — | — |
| `import.schedule` | O | O | — | — | — |

\* Perubahan kelayakan `preacher` hanya boleh dilakukan Super Admin atau pengguna dengan assignment kewenangan `capability_approver`; admin biasa tidak otomatis boleh menyetujuinya.  
\** Catatan pembinaan terbatas hanya dapat dibaca pembuatnya, Super Admin, dan pengguna yang dicantumkan pada daftar akses catatan. Role koordinator saja tidak cukup.

### 3.4 Field-level access

| Data | Aturan |
|---|---|
| Email, nomor telepon, Telegram ID | Super Admin/Admin; koordinator hanya untuk orang dalam scope dan kebutuhan operasional; pelayan hanya miliknya |
| Alasan berhalangan | Pelayan terkait, Admin, dan koordinator dalam scope; tidak ikut ekspor umum |
| `availability_blocks.note_private` | Pemilik, Super Admin/Admin; koordinator hanya melihat status tidak tersedia tanpa catatan privat |
| Catatan pembinaan/evaluasi | Mengikuti visibility dan ACL catatan; tidak pernah tampil pada daftar pelayan umum |
| Statistik individual | Individu terkait serta pengurus berwenang; laporan organisasi untuk role lain harus agregat |
| Token, kode aktivasi, secret | Tidak pernah dikirim kembali setelah dibuat; log harus disamarkan |

### 3.5 Autentikasi

- Super Admin, Admin, dan koordinator masuk melalui Cloudflare Access dengan email yang diizinkan. API memvalidasi assertion Access dan memetakan email terverifikasi ke `users`.
- Pelayan menggunakan tautan tugas bertoken sekali pakai atau akun Telegram yang sudah ditautkan. Token hanya memberikan capability untuk assignment tertentu, bukan sesi umum tanpa batas.
- Identitas Telegram dipetakan ke satu `user`/`servant`. Callback wajib memeriksa Telegram user ID, assignment target, expiry, nonce, dan status terkini.
- Role dan scope dimuat dari database pada request; cache izin maksimum 5 menit dan harus dapat diinvalidation saat role dicabut.

## 4. Alur utama

1. Super Admin menyiapkan organisasi, pengguna, role assignment, bidang, dan approver kelayakan.
2. Admin membuat atau mengimpor jenis/pola ibadah, jadwal, pelayan, dan penugasan.
3. Admin/koordinator meninjau benturan dan menerbitkan jadwal.
4. Bot mengirim pesan pribadi dengan aksi **Bersedia**, **Berhalangan**, dan **Detail**.
5. Server mengotorisasi respons dan memperbarui assignment secara idempoten.
6. Ketika berhalangan, sistem menawarkan kandidat; koordinator berwenang mengesahkan hasil.
7. Jika ibadah ditunda atau dibatalkan, sistem memperbarui assignment, membatalkan notifikasi usang, dan mengirim pemberitahuan.
8. Seusai ibadah, koordinator menandai ibadah selesai lalu mengisi kehadiran, tugas terlaksana, insiden, dan catatan.

## 5. Kebutuhan fungsional

### 5.1 Jadwal dan penugasan

- Kalender mingguan/bulanan dan daftar mobile.
- Detail ibadah: tanggal, jam mulai, waktu hadir, lokasi, tema, liturgi/link dokumen, catatan.
- Peran pelayanan dapat dikonfigurasi: Pelayan Firman, MC, Pelayan Persembahan, kantoria, musik, operator, multimedia, dan lainnya.
- Status assignment: `draft`, `menunggu_konfirmasi`, `bersedia`, `berhalangan`, `perlu_pengganti`, `ditugaskan_ulang`, `belum_hadir`, `selesai`, `dibatalkan`.
- Benturan diperiksa berdasarkan waktu hadir sampai estimasi selesai, availability, dan assignment aktif.
- Batas tugas bulanan dapat diatur per pelayan/peran.
- Semua write memakai optimistic concurrency (`version`) agar perubahan admin/koordinator tidak saling menimpa.

Status ibadah: `draft`, `terjadwal`, `selesai`, `ditunda`, `dibatalkan`. `draft` ditambahkan agar hasil impor/pratinjau tidak langsung dipublikasikan.

- **Ditunda:** wajib tanggal/jam baru dan alasan. Record ibadah yang sama diperbarui, sedangkan nilai lama disimpan dalam audit log. Assignment aktif kembali ke `menunggu_konfirmasi`; status sebelumnya dicatat pada audit metadata. Pemeriksaan benturan dijalankan ulang.
- **Dibatalkan:** wajib alasan; assignment aktif berubah menjadi `dibatalkan`; notifikasi tertunda dibatalkan.
- **Selesai:** hanya pada/setelah waktu mulai dan membuka pencatatan pasca-ibadah.
- Perubahan detail ibadah terpublikasi memicu notifikasi pembaruan.

### 5.2 Data pelayan dan ketersediaan

- Profil: nama, jabatan, status aktif, kontak Telegram, status cadangan, catatan administratif.
- Kalender berhalangan dan preferensi reguler.
- Kelayakan Pelayan Firman memerlukan approver berwenang.
- Riwayat tugas tidak dihapus. Koreksi dilakukan melalui update tercatat atau penonaktifan.
- Pelayan boleh mengubah nama tampilan dan preferensi miliknya, tetapi tidak role, capability, status aktif, catatan administratif, atau statistik.

### 5.3 Telegram Bot

- Aktivasi memakai kode acak sekali pakai dengan masa berlaku maksimum 15 menit dan maksimal 5 percobaan.
- Callback interaktif memverifikasi signature/secret webhook, identitas Telegram, nonce, expiry, resource scope, dan status terbaru.
- Komando minimum: `/jadwal`, `/tugas`, `/bantuan`, `/darurat`.
- `/darurat` membuka insiden/kasus penggantian yang terkait assignment milik pelapor.
- Jam tenang default 21.00–06.00; notifikasi kritis tetap dikirim.
- Kegagalan pengiriman dicoba ulang maksimum tiga kali dengan idempotency key yang sama.

### 5.4 Penggantian dan insiden

Kandidat disaring berdasarkan capability aktif, availability, benturan, status cadangan, beban, dan prioritas. Rekomendasi tidak otomatis menjadi keputusan.

- Kurang dari 60 menit: status `critical`, batas respons default 5 menit.
- Belum hadir pada waktu kumpul: tandai `belum_hadir`, kirim pengingat, sediakan eskalasi.
- Pelayan Firman berhalangan: hanya kandidat dengan capability `preacher` yang aktif dan disetujui.
- Tidak ada respons: kasus menjadi `eskalasi_manual` dan seluruh koordinator ibadah dalam scope diberi tahu.
- Pengesahan pengganti dilakukan dalam transaksi: assignment lama ditutup, assignment baru dibuat/diaktifkan, dan kasus ditautkan ke assignment hasil.

### 5.5 Catatan, kehadiran, dan laporan

- Catatan memiliki kategori dan visibility: `operational`, `subject_visible`, `restricted`.
- Catatan restricted memakai ACL eksplisit.
- Rekap individu: jumlah tugas, konfirmasi, kehadiran, pembatalan mendadak, cadangan diterima, distribusi peran.
- Rekap organisasi: kelengkapan, tingkat konfirmasi, insiden, peran kosong, pemerataan.
- Grafik garis, batang, dan donat wajib; heatmap kalender opsional.
- Ekspor CSV menerapkan permission, scope, field redaction, dan audit yang sama dengan API layar.

## 6. Impor jadwal awal dari Excel

### 6.1 Cakupan dan format

Admin/Super Admin dapat mengimpor `.xlsx` berukuran maksimum 5 MB dan maksimum 5.000 baris. Sheet default adalah sheet aktif pertama; pengguna dapat memilih sheet lain sebelum validasi.

Kolom sumber wajib:

| Kolom Excel | Target | Aturan |
|---|---|---|
| `Nomor` | `import_rows.source_number` | Wajib; identifier baris sumber, bukan primary key sistem |
| `tanggal` | `worship_services.starts_at` | Wajib; menerima Excel date atau teks tanggal; waktu default 17.00 WITA (`Asia/Makassar`, UTC+08:00) |
| `Tempat Kebaktian/Ibadah` | `worship_services.location` | Wajib; trim spasi dan normalisasi kapitalisasi hanya untuk pencocokan |
| `Pelayan Firman` | assignment role Pelayan Firman | Wajib kecuali baris ditandai untuk diperbaiki |
| `MC` | assignment role MC | Opsional sesuai kebutuhan ibadah |
| `Pelayan Persembahan` | satu atau beberapa assignment | Dapat berisi beberapa nama; pada file historis selalu dipisahkan titik koma (`;`) |

Header dicocokkan case-insensitive setelah spasi berlebih dibuang. UI pemetaan kolom tetap ditampilkan agar variasi header dapat dikoreksi. Karena file historis hanya memuat tanggal, sistem menggabungkannya dengan waktu default **17.00 WITA** memakai zona IANA `Asia/Makassar`. Pratinjau wajib menampilkan tanggal, waktu, dan zona hasil konversi. Admin dapat mengubah waktu per baris sebelum commit jika suatu ibadah merupakan pengecualian; perubahan tersebut wajib tercatat pada hasil impor.

### 6.2 Alur impor

1. **Upload:** file disimpan sementara, dipindai tipe/struktur, dan diberi checksum SHA-256.
2. **Mapping:** sistem menyarankan pemetaan enam kolom dan meminta konfirmasi format tanggal ambigu (`dd/mm/yyyy` atau `mm/dd/yyyy`) serta sheet. Zona impor ditetapkan `Asia/Makassar`, waktu default 17.00 WITA, dan delimiter nama jamak ditetapkan titik koma (`;`); ketiganya ditampilkan sebagai informasi, bukan pilihan bebas untuk impor historis ini.
3. **Parse & normalize:** nilai asli tetap disimpan pada staging; nilai normalisasi dibuat terpisah.
4. **Resolve:** lokasi, role, dan nama pelayan dicocokkan dengan data yang ada.
5. **Preview:** tampilkan jumlah valid, peringatan, error, calon data baru, duplikat, dan benturan.
6. **Correction:** pengguna dapat memperbaiki mapping/resolusi tanpa mengunggah ulang.
7. **Commit:** seluruh baris valid diproses atomik per batch impor. Default-nya, adanya satu error memblokir commit; pengguna dapat mengeluarkan baris error dari batch secara eksplisit.
8. **Report:** sistem menghasilkan ringkasan baris dibuat, dilewati, diperbarui, gagal, serta alasan per baris.

### 6.3 Pencocokan dan konflik data

- Pencocokan pelayan dilakukan berurutan: external reference yang dipilih pengguna, nama normalisasi exact, lalu kandidat fuzzy untuk konfirmasi manual. Sistem tidak pernah otomatis memilih jika ada lebih dari satu kandidat.
- Nama yang belum ditemukan tidak otomatis dijadikan pelayan aktif. Admin memilih: tautkan ke pelayan yang ada, buat profil `pending_review`, atau keluarkan baris.
- Pelayan Firman baru selalu `pending_review` dan assignment tidak dapat dipublikasikan sebelum capability disetujui oleh pengguna yang ditunjuk eksplisit sebagai `capability_approver`. Role Admin tidak memberikan kewenangan persetujuan secara otomatis.
- Kandidat duplikat ibadah ditentukan oleh organisasi + tanggal/jam + lokasi ternormalisasi. Tindakan per baris: `skip`, `merge_assignments`, atau `create_separate`; default `skip`.
- `merge_assignments` hanya menambah slot kosong dan tidak menimpa assignment existing. Konflik nama pada slot yang sudah terisi memerlukan keputusan manual.
- Benturan jadwal dan availability menghasilkan warning yang harus diakui sebelum commit; capability tidak sah dan tanggal/waktu tidak valid merupakan error.
- Mengunggah ulang file dengan checksum dan mapping yang sama menawarkan hasil batch sebelumnya. Request commit memakai `Idempotency-Key` untuk mencegah duplikasi.
- Rollback impor hanya boleh dilakukan sebelum jadwal hasil impor dipublikasikan atau diedit di luar proses impor. Rollback bersifat soft-delete/void dan diaudit.

### 6.4 Keamanan file impor

- File divalidasi berdasarkan signature dan struktur ZIP/XLSX, bukan ekstensi saja; `.xls`, `.csv`, macro-enabled workbook, dan file terenkripsi ditolak pada MVP.
- Formula tidak dieksekusi. Hanya nilai hasil tersimpan yang dibaca; formula eksternal, link, macro, gambar, dan embedded object diabaikan.
- Nilai yang diawali `=`, `+`, `-`, atau `@` harus di-escape ketika laporan diekspor untuk mencegah spreadsheet formula injection.
- Nama file tidak dipakai sebagai path. File sementara menggunakan ID acak, dienkripsi oleh platform, tidak dapat diakses publik, dan dihapus maksimum 24 jam setelah batch selesai/kedaluwarsa.
- Parser memiliki batas jumlah sheet, baris, kolom, panjang sel, dan waktu proses untuk mencegah decompression bomb serta denial of service.
- Hanya uploader dan Super Admin dalam organisasi yang boleh melihat batch serta nilai mentahnya.

## 7. UI/UX MVP

### Prinsip visual

Mobile-first, ringan, tenang, dan jelas. Style menyerupai Apple dengan aksen purple lembut sebagai lambang persekutuan yang utuh, dengan ruang putih cukup dan status kritis yang mudah dikenali.

| Token | Nilai awal | Fungsi |
|---|---:|---|
| Primary | `#6D4CC6` | Aksi utama dan identitas |
| Deep Purple | `#452B83` | Header dan penekanan |
| Soft Lavender | `#F2EEFF` | Latar lembut dan kartu pilihan |
| Accent Lilac | `#BBA7F4` | Grafik dan elemen sekunder |
| Success | `#16846B` | Bersedia/selesai |
| Warning | `#C57A16` | Menunggu/risiko |
| Critical | `#C83F57` | Insiden mendadak |
| Ink | `#231C33` | Teks utama |

### Halaman MVP

- **Beranda:** ibadah berikutnya, tugas belum dikonfirmasi, insiden aktif.
- **Kalender:** daftar mobile dan kalender desktop.
- **Detail ibadah:** kelengkapan peran, kontak sesuai izin, catatan, insiden, status.
- **Tugas saya:** aksi tunggal per kartu dan deep link Telegram.
- **Penggantian/Insiden:** kandidat, alasan, deadline, keputusan, eskalasi.
- **Pelayan:** profil, capability, availability, riwayat, grafik pribadi sesuai izin.
- **Laporan:** filter periode/peran dan ekspor sesuai scope.
- **Impor Jadwal:** wizard Upload → Mapping → Validasi → Pratinjau → Commit → Hasil.
- **Akses ditolak:** tampilkan pesan umum tanpa membocorkan keberadaan resource.

Navigasi ponsel memakai bar bawah: Beranda, Kalender, Tugas, Insiden, Lainnya. Setiap status selalu memakai teks dan ikon, tidak hanya warna. (dapat disesuaikan kemudian)


## 8. Arsitektur dan tech stack

Pilihan MVP: React + Vite + TypeScript, Tailwind/shadcn, Cloudflare Pages, Workers + Hono, D1, Cron Triggers, Telegram webhook, dan GitHub Actions. Parser Excel harus berjalan dengan library yang tidak mengeksekusi formula/macro dan diuji terhadap batas CPU/memori Workers. Jika parsing workbook riil melampaui batas paket, impor diproses bertahap atau menggunakan Queue; keputusan ini wajib dibuktikan lewat spike teknis sebelum Fase 1 selesai.

Cloudflare Access melindungi UI pengurus, tetapi API tetap melakukan authorization berbasis data aplikasi. Access bukan pengganti RBAC.

## 9. Model data inti

Semua tabel domain memiliki `organization_id`, `created_at`, `updated_at`, dan bila dapat diubah memiliki `version`. Foreign key organisasi harus konsisten; resource dari organisasi lain selalu diperlakukan tidak ditemukan.

### 9.1 Identitas dan RBAC

| Tabel | Kolom kunci |
|---|---|
| `organizations` | id, name, timezone, settings_json |
| `users` | id, organization_id, email, display_name, status, last_login_at |
| `servants` | id, organization_id, user_id nullable unique, name, telegram_user_id encrypted, telegram_chat_id encrypted, active, emergency_backup |
| `roles` | id, code unique, name, system_managed |
| `permissions` | id, code unique, description |
| `role_permissions` | role_id, permission_id |
| `user_roles` | user_id, role_id, granted_by, granted_at, revoked_at |
| `coordinator_scopes` | id, user_id, scope_type (`service`,`field`), scope_id, starts_at, ends_at |
| `capability_approvers` | user_id, service_role_id, active |

Tidak ada kolom `users.role`; sumber kebenaran role adalah `user_roles`. Constraint memastikan satu email dan satu Telegram user ID tidak terhubung ke dua identitas aktif dalam organisasi.

### 9.2 Operasional

| Tabel | Kolom kunci |
|---|---|
| `service_roles` | id, organization_id, code, name, field_id, default_required_count, criticality |
| `servant_capabilities` | servant_id, service_role_id, status, approved_by, approved_at |
| `availability_blocks` | id, servant_id, starts_at, ends_at, type, note_private |
| `worship_services` | id, title, starts_at, ends_at, assembly_at, location, status, rescheduled_from_json, status_reason, published_at |
| `assignments` | id, worship_service_id, service_role_id, slot_number, servant_id, status, confirmed_at, source_import_row_id nullable |
| `replacement_cases` | id, assignment_id, priority, status, opened_at, resolved_at, resulting_assignment_id |
| `replacement_offers` | id, replacement_case_id, candidate_id, expires_at, response, responded_at |
| `incidents` | id, worship_service_id, severity, type, reported_by, impact_note, decision, outcome_note, resolved_at, resolved_by |
| `service_notes` | id, subject_type, subject_id, category, visibility, body, created_by |
| `note_acl` | note_id, user_id, access_level |
| `attendance_records` | assignment_id unique, attendance_status, checked_at, checked_by |
| `notification_deliveries` | id, assignment_id, channel, event_type, idempotency_key, status, sent_at |
| `audit_logs` | id, organization_id, actor_type, actor_id, action, entity_type, entity_id, request_id, metadata_redacted_json, created_at |

Constraint penting: unique assignment aktif pada `(worship_service_id, service_role_id, slot_number)`; timestamp UTC; tampilan memakai timezone organisasi; hard-delete dilarang untuk data operasional terpublikasi.

### 9.3 Impor

| Tabel | Kolom kunci |
|---|---|
| `import_batches` | id, organization_id, uploaded_by, original_filename, checksum, sheet_name, mapping_json, date_format, timezone, status, expires_at, committed_at |
| `import_rows` | id, batch_id, row_number, source_number, raw_json, normalized_json, status, proposed_action, error_codes_json, warning_codes_json |
| `import_resolutions` | id, import_row_id, field_name, resolution_type, target_entity_id, resolved_by |
| `import_results` | id, import_row_id, entity_type, entity_id, action, rollback_status |

Status batch: `uploaded`, `validating`, `needs_review`, `ready`, `committing`, `committed`, `failed`, `rolled_back`, `expired`.

## 10. Kontrak API minimum

Base path: `/api/v1`. Semua response membawa `request_id`. Write menerima `Idempotency-Key` untuk operasi yang dapat dipicu ulang dan `If-Match`/`version` untuk update konkuren.

### 10.1 Endpoint

| Method dan path | Permission | Catatan |
|---|---|---|
| `GET /me` | authenticated | Identitas, role, permission efektif, scope ringkas |
| `GET/POST /users` | `user.read` / Super Admin | POST akun pengurus |
| `PUT /users/{id}/roles` | `user.manage_role` | Replace role assignment, wajib audit |
| `GET/POST/PATCH /servants` | sesuai Bagian 3 | Field redaction diterapkan server |
| `PUT /servants/{id}/capabilities` | `servant.manage_capability` | Cek approver untuk role kritis |
| `GET/POST/PATCH /services` | `service.*` | Query otomatis dibatasi scope |
| `POST /services/{id}/publish` | `service.publish` | Validasi kelengkapan/capability |
| `POST /services/{id}/status` | `service.change_status` | Alasan dan version wajib |
| `GET/POST/PATCH /services/{id}/assignments` | `assignment.*` | Cegah slot aktif ganda |
| `POST /assignments/{id}/response` | capability token atau `assignment.respond` | Idempoten |
| `POST /replacement-cases/{id}/approve` | `replacement.manage` | Transaksi atomik |
| `GET/POST/PATCH /incidents` | `incident.read_manage` | Scope-aware |
| `GET/POST /reports/*` | `report.*` | Agregasi/redaction server-side |
| `POST /imports/schedules` | `import.schedule` | Upload XLSX |
| `POST /imports/schedules/{id}/validate` | uploader/Super Admin | Mapping dan opsi parsing |
| `GET /imports/schedules/{id}/preview` | uploader/Super Admin | Pagination; raw value sesuai izin |
| `PUT /imports/schedules/{id}/resolutions` | uploader/Super Admin | Keputusan konflik |
| `POST /imports/schedules/{id}/commit` | `import.schedule` | Idempotency key wajib |
| `POST /imports/schedules/{id}/rollback` | Super Admin | Hanya jika memenuhi Bagian 6.3 |
| `GET /audit-logs` | `audit.read` | Filter, pagination, redaction |

### 10.2 Format error

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Akses tidak diizinkan.",
    "request_id": "req_...",
    "details": []
  }
}
```

Kode minimum: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_FAILED` (422), `CONFLICT` (409), `VERSION_CONFLICT` (409), `RATE_LIMITED` (429). Untuk resource di luar organisasi/scope, gunakan 404 agar keberadaan data tidak bocor. Detail validasi impor boleh menunjuk nomor baris/kolom tetapi tidak menampilkan data pengguna lain.

### 10.3 Aturan API

- Pagination cursor dengan batas maksimum 100 item.
- Filter/sort memakai allowlist; input parameterized, bukan interpolasi SQL.
- Mass assignment dicegah dengan DTO allowlist per endpoint/role.
- Semua tanggal API ISO-8601; disimpan UTC; timezone organisasi dikirim eksplisit pada operasi impor.
- Rate limit khusus login/aktivasi, callback Telegram, impor, ekspor, dan endpoint pencarian pelayan.
- CORS hanya origin aplikasi; cookie bila digunakan harus `Secure`, `HttpOnly`, `SameSite=Lax/Strict`; state-changing browser request memakai CSRF protection.

## 11. Keamanan, privasi, audit, dan retensi

- TLS wajib; secret berada di Worker Secrets; token disimpan dalam bentuk hash bila hanya perlu diverifikasi.
- Data kontak Telegram dienkripsi at rest pada level aplikasi bila dukungan platform memadai; nilai tidak masuk log.
- Audit log mencatat aktor, organisasi, aksi, target, waktu, request ID, hasil, dan metadata yang sudah disamarkan. Audit log append-only dari aplikasi.
- Event minimum yang diaudit: login gagal sensitif, role change, scope change, capability approval, akses/ubah catatan restricted, publish/status jadwal, assignment/pengganti, impor/rollback, ekspor laporan.
- Retensi file mentah impor maksimum 24 jam setelah commit, gagal, atau dibatalkan. Untuk batch yang masih menunggu review, file mentah dapat disimpan paling lama 7 hari, lalu batch menjadi `expired`.
- Data staging hasil parse dan resolusi impor disimpan 30 hari setelah batch selesai, kemudian dihapus. Ringkasan hasil impor yang tidak memuat isi sel mentah disimpan 5 tahun sebagai bagian jejak audit.
- Audit log disimpan 5 tahun sejak event dibuat. Setelah lewat masa tersebut, log dihapus atau dianonimkan melalui proses retensi terjadwal, kecuali sedang diperlukan untuk investigasi insiden atau kewajiban hukum yang terdokumentasi.
- Catatan pembinaan ditinjau minimal setahun sekali dan disimpan selama pelayan aktif ditambah maksimum 3 tahun setelah pelayan tidak aktif. Catatan yang tindak lanjutnya selesai dan tidak lagi memiliki kebutuhan pastoral/operasional harus dihapus lebih awal. Metadata audit perubahan dapat tetap disimpan 5 tahun tanpa mempertahankan isi catatannya.
- Super Admin menjalankan review retensi tahunan dan mencatat dasar perpanjangan bila suatu data perlu disimpan melebihi batas default. Perpanjangan harus memiliki alasan, pemilik keputusan, dan tanggal tinjau berikutnya; tidak boleh berlaku tanpa batas.
- Backup database minimal mingguan pada MVP dengan checklist manual, checksum, akses terbatas, dan uji pemulihan berkala.
- Permintaan koreksi/penghapusan data ditangani admin. Data yang wajib dipertahankan untuk audit tidak dihapus fisik, tetapi dipseudonimkan bila dasar retensinya berakhir.
- Pesan error dan log tidak boleh memuat token, raw assertion, alasan privat, isi catatan restricted, atau seluruh baris Excel.

## 12. Pengujian keamanan dan RBAC

Pengujian berikut wajib ada di CI untuk unit/integration dan diulang sebagai acceptance test pada preview. Setiap endpoint diuji minimal untuk role diizinkan, role dilarang, scope benar, scope lain, organisasi lain, akun suspended, serta field redaction.

| ID | Skenario | Hasil yang diharapkan |
|---|---|---|
| RBAC-01 | Pelayan membaca assignment sendiri | 200, hanya field yang diizinkan |
| RBAC-02 | Pelayan membaca assignment pelayan lain | 404 tanpa kebocoran metadata |
| RBAC-03 | Koordinator bidang membaca bidang lain | 404 |
| RBAC-04 | Koordinator ibadah mengubah ibadah dalam scope | Berhasil dan diaudit |
| RBAC-05 | Koordinator mengubah ibadah di luar scope | 404 |
| RBAC-06 | Admin membaca catatan restricted tanpa ACL | 404/403 sesuai konteks |
| RBAC-07 | Super Admin memberi/mencabut role | Efektif maksimal 5 menit; audit lengkap |
| RBAC-08 | Akun suspended memakai sesi/token lama | 401/403 dan tidak ada perubahan |
| TENANT-01 | ID organisasi A dipakai pada sesi organisasi B | 404; tidak ada data silang |
| FIELD-01 | Koordinator membaca availability privat | Hanya status unavailable; catatan disamarkan |
| FIELD-02 | Ekspor laporan oleh koordinator | Hanya scope dan field yang diizinkan |
| API-01 | Update memakai version lama | 409 `VERSION_CONFLICT` |
| API-02 | Commit/respons dikirim dua kali dengan idempotency key sama | Satu perubahan; response konsisten |
| API-03 | Payload memuat field administratif tersembunyi | Field ditolak, bukan diterapkan |
| BOT-01 | Callback dipalsukan atau signature salah | Ditolak dan dicatat tanpa data sensitif |
| BOT-02 | Callback sah untuk assignment orang lain | Ditolak |
| BOT-03 | Token kedaluwarsa/dipakai ulang | Ditolak tanpa mengubah state |
| IMPORT-01 | File berekstensi XLSX tetapi signature salah | Ditolak |
| IMPORT-02 | Workbook macro/encrypted/bomb/oversized | Ditolak aman |
| IMPORT-03 | Tanggal ambigu | Commit diblokir sampai format dipilih |
| IMPORT-04 | Dua pelayan bernama sama | Tidak auto-link; perlu resolusi |
| IMPORT-05 | Pelayan Firman baru belum disetujui | Jadwal tidak dapat dipublikasikan |
| IMPORT-06 | File/commit sama dikirim ulang | Tidak membuat duplikat |
| IMPORT-07 | Formula berbahaya dan CSV export injection | Formula tidak dieksekusi; output di-escape |
| IMPORT-08 | Uploader membaca batch milik admin lain | Ditolak kecuali Super Admin |
| IMPORT-09 | Rollback setelah jadwal dipublikasikan | Ditolak dengan alasan |
| AUDIT-01 | Role/status/import diubah | Audit lengkap tanpa secret/PII privat |
| SEC-01 | SQL injection, XSS tersimpan, CSRF, IDOR | Tidak berhasil; input/output aman |
| SEC-02 | Rate-limit brute-force kode aktivasi | 429; akun/resource tidak terkunci permanen |

Selain tes di atas: dependency scan, secret scan, static analysis, dan pengujian dependency parser Excel wajib berjalan di CI. Sebelum produksi lakukan peninjauan OWASP ASVS tingkat 1 dan pengujian manual IDOR pada seluruh endpoint ber-ID.

## 13. Deployment dan lingkungan

| Lingkungan | Tujuan | Aturan |
|---|---|---|
| Local | Pengembangan | D1 lokal, data sintetis, bot polling/tunnel |
| Preview | Review dan UAT | DB terpisah, bot tidak mengirim pesan nyata, file impor uji tanpa data produksi |
| Production | Operasional | Pages/Worker/D1 production, webhook, cron, backup |

Pipeline: lint → typecheck → unit/integration test → security scan → build → deploy. Migrasi database eksplisit, tercatat, dapat diuji rollback-nya, dan tidak otomatis dijalankan ke production tanpa review.

## 14. Rencana build

| Fase | Cakupan |
|---|---|
| 0. Fondasi | Schema organisasi/identity/RBAC, middleware authorization, audit, CI/CD, threat model |
| 1. Jadwal inti | Pelayan, capability, ibadah, assignment, availability, benturan, scope koordinator |
| 1b. Impor awal | Spike parser, wizard Excel, staging, resolusi, commit, laporan, rollback terbatas |
| 2. Telegram | Aktivasi, tugas, callback, pengingat, jam tenang, retry |
| 3. Insiden/pengganti | Kasus, tawaran, kritis, eskalasi, transaksi pengesahan |
| 4. Kehadiran/kinerja | Check-in, catatan/ACL, grafik, ekspor aman |
| 5. Penguatan | UAT RBAC, ASVS L1, backup/restore, optimasi, dokumentasi operator/runbook |

## 15. Kriteria penerimaan MVP

- Seluruh endpoint menerapkan permission, scope, status akun, organisasi, dan field-level policy sesuai Bagian 3.
- Super Admin dapat memberi beberapa role dan scope kepada pengguna serta mencabutnya; perubahan diaudit.
- Koordinator bidang tidak dapat membaca atau mengubah data di luar bidangnya.
- Pelayan hanya dapat membaca/merespons tugas sendiri dan tidak dapat melihat alasan privat pelayan lain.
- Admin dapat mengimpor Excel dengan enam kolom yang ditentukan melalui preview dan resolusi konflik sebelum commit.
- Impor ulang/commit ulang tidak membuat ibadah atau assignment ganda.
- Nama ambigu, tanggal ambigu, waktu yang belum tersedia, dan capability Pelayan Firman yang belum sah memblokir publikasi.
- Sistem menandai benturan sebelum publish dan tidak pernah menimpa assignment aktif tanpa keputusan manual.
- Perubahan status ibadah memicu transisi assignment dan notifikasi yang sesuai.
- Pengesahan pengganti tidak dapat membuat dua assignment aktif pada slot yang sama.
- Audit log mencatat tindakan sensitif tanpa menyimpan token atau data privat mentah.
- Semua kasus wajib pada Bagian 12 lulus di preview sebelum go-live.

## 16. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Pelayan belum memakai Telegram | Onboarding; tautan web dan kontak manual |
| Nama pelayan Excel tidak konsisten/duplikat | Staging, normalisasi, resolusi manual, external reference |
| Tanggal Excel ambigu atau serial date berbeda | Pilihan format tanggal eksplisit, waktu default 17.00 WITA, zona `Asia/Makassar`, dan preview |
| File Excel berbahaya/rusak | Signature validation, limit parser, tanpa formula/macro, retensi singkat |
| Impor membuat data ganda | Checksum, idempotency key, duplicate key, preview/merge eksplisit |
| RBAC terlalu kompleks untuk solo developer | Role sistem tetap, permission code terpusat, policy tests data-driven |
| Scope salah menyebabkan kebocoran | Query scope middleware + tes lintas scope/organisasi |
| Kuota Cloudflare terlampaui | Batching, monitoring, spike parser/cron, opsi paid/queue |
| Bot/token disalahgunakan | Secret validation, token pendek/hashed, nonce, audit/rate limit |
| Internet/listrik terganggu | Checklist dan daftar kontak cetak |
| Developer tunggal berhenti | Dokumentasi teknis, runbook, brankas secret bersama |

## 17. Konflik yang ditemukan dan rekomendasi keputusan

| Konflik/ketidakjelasan | Rekomendasi v1.2 | Alasan |
|---|---|---|
| Super Admin “mengelola peran”, tetapi v1.1 hanya memiliki `users.role` | Role sistem tetap; assignment user-role many-to-many | Mendukung pengguna rangkap tugas tanpa membangun custom-role UI yang berisiko |
| Cloudflare Access hanya cocok untuk pengurus, sementara pelayan juga disebut pengguna | Pisahkan autentikasi pengurus dan capability terbatas pelayan/Telegram; keduanya dipetakan ke identitas aplikasi | Menghindari pemberian akses admin kepada seluruh pelayan |
| Koordinator bidang sebelumnya hanya “melihat”, tetapi alur operasional memerlukan tindakan | Izinkan mengelola assignment, kehadiran, penggantian, dan insiden hanya dalam bidangnya; tidak boleh mengubah status/publish ibadah | Cukup operasional tanpa melampaui kewenangan koordinator ibadah |
| Admin memiliki akses operasional luas, tetapi catatan evaluasi disebut terbatas | Catatan restricted memakai ACL; Admin tidak otomatis membaca | Prinsip least privilege dan privasi pembinaan |
| “Riwayat tidak boleh dihapus” versus hak subjek meminta penghapusan | Pertahankan audit wajib, pseudonimkan data ketika retensi berakhir | Menjaga integritas operasional sekaligus prinsip minimisasi data |
| Penundaan v1.1 menyebut ibadah lama tetap ada dan referensi jadwal baru, tetapi juga seolah assignment pindah ke tanggal baru | Gunakan record ibadah yang sama, simpan snapshot perubahan di audit; `rescheduled_to` tidak membuat ibadah kedua | Menghindari dua jadwal/assignment aktif dan menyederhanakan referensi |
| Status awal hanya `terjadwal`, sedangkan impor perlu review sebelum publish | Tambahkan status `draft` | Impor tidak boleh langsung memicu notifikasi/publikasi |
| Excel hanya punya tanggal, sementara sistem butuh jam untuk benturan | Gunakan waktu yang dikonfirmasi pemilik produk: 17.00 WITA (`Asia/Makassar`); pengecualian dapat diedit per baris saat preview | Membuat hasil impor deterministik tanpa menghilangkan penanganan pengecualian |
| `Pelayan Persembahan` dapat berisi lebih dari satu orang tetapi satu sel tidak menentukan format | Gunakan titik koma (`;`) sebagai delimiter tetap karena format historis telah dikonfirmasi konsisten | Membuat parsing deterministik |
| Nama pada Excel bisa sama atau berbeda ejaan | Jangan auto-link hasil fuzzy/ambigu; wajib resolusi manual | Mencegah penugasan ke orang yang salah |
| Pelayan Firman baru dari Excel belum tentu disahkan | Buat sebagai pending review dan blok publish sampai capability disetujui | Selaras dengan kewenangan gerejawi |
| Rollback impor dapat merusak jadwal yang sudah dipakai | Hanya izinkan sebelum publish/edit eksternal; setelahnya koreksi melalui perubahan tercatat | Menjaga audit dan referential integrity |
| Pernyataan biaya Rp0 dapat bertentangan dengan beban parsing/cron | Pertahankan target Rp0, tetapi wajib spike dan anggaran fallback berbayar | Kuota platform bukan jaminan produk |

### Keputusan produk yang telah dikonfirmasi

1. Jadwal historis yang hanya memiliki tanggal memakai waktu default **17.00 WITA**, dengan zona IANA `Asia/Makassar` (UTC+08:00). Pengecualian diperbaiki per baris pada tahap preview.
2. Approver kelayakan Pelayan Firman harus ditunjuk secara eksplisit; Admin tidak otomatis menjadi approver.
3. Beberapa nama dalam kolom `Pelayan Persembahan` selalu dipisahkan dengan titik koma (`;`).
4. Kebijakan retensi default jemaat: file mentah impor maksimal 24 jam setelah selesai atau 7 hari selama menunggu review; staging 30 hari; ringkasan impor dan audit log 5 tahun; catatan pembinaan selama pelayan aktif ditambah maksimal 3 tahun setelah tidak aktif, dengan review tahunan dan penghapusan lebih awal jika tidak lagi diperlukan.

## 18. Pembagian pekerjaan model AI per fase build (hanya panduan tambahan untuk user. User berhak untuk mengubah model fase ke fase).

### 18.1 Kelas model dan aturan penggunaan

Pembagian ini menggunakan model yang tersedia di lingkungan Codex saat dokumen dibuat. Nama model adalah konfigurasi pelaksanaan, bukan dependensi aplikasi; jika model berubah, pemetaan harus dievaluasi ulang berdasarkan kemampuan setara.

| Model | Posisi dalam proyek | Jenis pekerjaan utama | Reasoning default |
|---|---|---|---|
| `gpt-6-astra` | Arsitek/reviewer risiko tinggi | Arsitektur lintas modul, threat model, desain RBAC, investigasi bug kompleks, review keamanan, keputusan trade-off | `high`; `xhigh` hanya untuk risiko kritis |
| `gpt-5.6-sol` | Implementer utama | Implementasi fitur end-to-end, refactor lintas file, integrasi Workers/D1/Telegram, debugging dan pengujian fitur | `medium` atau `high` |
| `gpt-5.6-terra` | Implementer seimbang | CRUD, UI, schema/migration sederhana, test biasa, dokumentasi teknis, perbaikan terlokalisasi | `medium` |
| `gpt-5.6-luna` | Pekerja cepat bervolume | Scaffold, fixture, variasi test mekanis, formatting, rename, data sintetis, dokumentasi repetitif | `low` atau `medium` |

Prinsip routing:

- Mulai dari model termurah yang mampu mengerjakan tugas dengan aman, lalu eskalasi jika ruang lingkup, ketidakpastian, atau damp berubah.
- Model yang menulis kode tidak menjadi satu-satunya reviewer untuk perubahan berisiko tinggi.
- Astra tidak digunakan untuk semua tugas; nilainya paling besar pada keputusan yang mahal bila salah.
- Luna tidak boleh mengambil keputusan otorisasi, data migration production, kriptografi, atau penanganan insiden keamanan.
- Semua hasil AI harus melewati lint, typecheck, test, dan review diff. Kelulusan test tidak menggantikan review kebijakan bisnis.

### 18.2 Fase 0 — Fondasi

| Pekerjaan | Model utama | Reviewer | Catatan |
|---|---|---|---|
| Menguraikan PRD menjadi arsitektur, bounded context, dependency, dan ADR | Astra `high` | Manusia | Tetapkan keputusan yang sulit diubah lebih awal |
| Threat model, trust boundary, matriks RBAC/scope/field policy | Astra `high/xhigh` | Manusia/pemilik produk | Wajib review manual karena dampak kebocoran data |
| Scaffold React, Worker/Hono, konfigurasi lint/typecheck/test | Terra `medium` | Sol | Tugas standar dan mudah diverifikasi |
| Implementasi middleware autentikasi, otorisasi, tenant isolation, audit | Sol `high` | Astra `high` | Wajib negative tests dan review lintas organisasi |
| Schema awal dan migration D1 | Sol `high` | Astra/Manusia | Review constraint, foreign key, index, dan rollback |
| Fixture, factory, seed sintetis, template CI | Luna `medium` | Terra | Dilarang memakai data jemaat produksi |

Gerbang manusia: menyetujui threat model, role/permission, skema identitas, strategi secret, serta migration pertama.

### 18.3 Fase 1 — Jadwal inti

| Pekerjaan | Model utama | Reviewer | Catatan |
|---|---|---|---|
| Desain state machine ibadah dan assignment | Astra `high` | Pemilik produk | Pastikan transisi ditunda/dibatalkan/selesai konsisten |
| CRUD pelayan, role pelayanan, ibadah, availability | Terra `medium` | Sol | Endpoint tetap memakai policy terpusat |
| Mesin benturan jadwal, batas beban, scope koordinator | Sol `high` | Astra | Uji boundary waktu dan timezone WITA |
| UI kalender, detail ibadah, formulir mobile | Terra `medium` | Sol/Manusia | Review aksesibilitas dan alur mobile |
| Unit test kombinatorial status/role/slot | Luna `medium` | Terra | Kasus uji diturunkan dari tabel keputusan yang disetujui Sol/Astra |
| Debugging race condition/dua assignment aktif | Astra `high` | Sol | Fokus transaksi, unique constraint, optimistic concurrency |

Gerbang manusia: memvalidasi istilah gerejawi, kewenangan koordinator, state transition, dan pengalaman penggunaan di ponsel.

### 18.4 Fase 1b — Impor jadwal Excel

| Pekerjaan | Model utama | Reviewer | Catatan |
|---|---|---|---|
| Spike kompatibilitas parser XLSX dengan batas Workers | Sol `high` | Astra | Ukur CPU, memori, ukuran ZIP, dan kegagalan parser |
| Threat model upload, formula injection, decompression bomb | Astra `high` | Manusia | Hasil menjadi acceptance/security tests |
| Wizard upload–mapping–preview–commit | Terra `medium` | Sol | Tidak boleh commit sebelum resolusi error |
| Normalisasi tanggal 17.00 WITA dan delimiter `;` | Sol `medium` | Terra | Uji Excel serial date, leap year, dan `Asia/Makassar` |
| Pencocokan nama exact/fuzzy dan resolusi ambigu | Sol `high` | Astra/Manusia | Fuzzy match hanya menyarankan, tidak auto-link |
| Fixture workbook valid/rusak/ambigu/duplikat | Luna `medium` | Sol | File berbahaya disintesis, bukan diambil dari sumber tidak tepercaya |
| Commit atomik, idempotensi, laporan, rollback terbatas | Sol `high` | Astra | Wajib integration test terhadap retry dan partial failure |

Gerbang manusia: memeriksa sampel hasil impor, resolusi nama ambigu, Pelayan Firman pending, dan waktu pengecualian sebelum commit production.

### 18.5 Fase 2 — Telegram

| Pekerjaan | Model utama | Reviewer | Catatan |
|---|---|---|---|
| Desain aktivasi, capability token, nonce, expiry, replay protection | Astra `high` | Manusia | Jangan membuat skema kriptografi sendiri |
| Webhook, command, callback, deep link, retry delivery | Sol `high` | Astra | Validasi identitas dan state pada server |
| Template pesan dan UI aktivasi | Terra `medium` | Manusia | Bahasa harus jelas dan tidak membuka data sensitif |
| Test matrix callback usang, duplikat, dipalsukan | Luna `medium` | Sol/Astra | Kasus serangan ditentukan reviewer senior |
| Debugging delivery/cron/subrequest | Sol `high` | Astra bila lintas sistem | Gunakan idempotency key dan observability |

Gerbang manusia: menyetujui isi pesan, jam tenang, tindakan `/darurat`, dan uji akun Telegram nyata di preview terbatas.

### 18.6 Fase 3 — Insiden dan pengganti

| Pekerjaan | Model utama | Reviewer | Catatan |
|---|---|---|---|
| State machine kasus penggantian dan eskalasi | Astra `high` | Pemilik produk | Keputusan kandidat tetap pada manusia |
| Filter kandidat, transaksi pengesahan, timeout | Sol `high` | Astra | Jangan membuat pemeringkatan kelayakan rohani |
| UI kasus, daftar kandidat, checklist rencana cadangan | Terra `medium` | Sol/Manusia | Tampilkan alasan rekomendasi faktual |
| Simulasi skenario kritis dan concurrent acceptance | Sol `high` | Astra | Uji dua kandidat menerima bersamaan |
| Fixture dan variasi timeline insiden | Luna `medium` | Terra | Tidak berisi kontak nyata |

Gerbang manusia: semua aturan kandidat Pelayan Firman, eskalasi manual, dan hasil simulasi kondisi kritis.

### 18.7 Fase 4 — Kehadiran dan kinerja

| Pekerjaan | Model utama | Reviewer | Catatan |
|---|---|---|---|
| Definisi metrik dan risiko bias/privasi | Astra `high` | Pemilik produk | Cegah skor rohani dan ranking publik |
| Query agregasi, periode, timezone, ekspor aman | Sol `high` | Astra | Uji field redaction dan formula injection |
| Form check-in, catatan, grafik, filter | Terra `medium` | Sol | Restricted note wajib memakai ACL |
| Test dataset dan snapshot chart | Luna `medium` | Terra | Gunakan data sintetis dengan edge cases |
| Review kebocoran statistik individual | Astra `high` | Manusia | Uji role, scope, ekspor, dan indirect inference |

Gerbang manusia: menyetujui definisi metrik, siapa yang melihat data individu, bahasa evaluasi, dan format laporan.

### 18.8 Fase 5 — Penguatan dan peluncuran

| Pekerjaan | Model utama | Reviewer | Catatan |
|---|---|---|---|
| Menyusun regression suite dari acceptance criteria | Sol `high` | Astra | Prioritaskan alur kritis dan negative authorization |
| Menjalankan perbaikan lint/type/test dan temuan kecil | Terra `medium` | Sol | Satu perubahan terfokus per diff |
| Review keamanan menyeluruh, IDOR, tenant isolation, abuse cases | Astra `xhigh` | Manusia independen | AI membantu review, bukan menjadi pentest independen tunggal |
| Load test plan, fault injection, backup/restore drill | Sol `high` | Astra/Manusia | Restore wajib benar-benar diuji |
| Dokumentasi operator, FAQ, checklist, release notes | Terra `medium`; Luna untuk format | Manusia | Instruksi operasional harus diuji oleh calon operator |
| Go-live checklist dan analisis risiko sisa | Astra `high` | Pemilik produk | Keputusan rilis hanya oleh manusia |

Gerbang manusia: UAT, hasil security review, backup/restore, pemeriksaan migration production, observability, dan keputusan go-live.

### 18.9 Pola kerja per tiket

Setiap tiket AI mengikuti alur berikut:

1. **Klasifikasi risiko:** rendah, sedang, tinggi, atau kritis.
2. **Pilih implementer:** Luna untuk mekanis; Terra untuk terlokalisasi; Sol untuk lintas modul; Astra untuk kompleks/berisiko tinggi.
3. **Tetapkan acceptance test sebelum perubahan:** minimal happy path, failure path, dan authorization path.
4. **Implementasi dalam diff kecil:** satu tujuan yang dapat ditinjau.
5. **Verifikasi otomatis:** format, lint, typecheck, unit/integration test, security scan yang relevan.
6. **Review silang:** risiko tinggi/kritis wajib direview Astra dan manusia; risiko sedang minimal Sol/Terra yang bukan penulis utama.
7. **Catat keputusan:** perubahan arsitektur, keamanan, permission, atau aturan bisnis masuk ADR/audit dokumentasi.

### 18.10 Pekerjaan yang tidak boleh diputuskan AI sendiri (berlaku hanya saat aplikasi sudah pada tahap test run)

- Menyetujui kelayakan Pelayan Firman atau keputusan gerejawi.
- Memberi akses produksi, mengubah role pengguna nyata, atau membuka secret.
- Menjalankan migration production, rollback, penghapusan, atau pemulihan backup tanpa persetujuan manusia.
- Mengimpor data jemaat ke production tanpa preview dan persetujuan Admin/Super Admin.
- Menutup insiden keamanan atau menyatakan sistem aman hanya berdasarkan review AI.
- Menentukan peringkat spiritual, kelayakan rohani, atau tindakan pembinaan seseorang.
