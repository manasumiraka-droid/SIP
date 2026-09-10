# Supabase PostgreSQL + Cloudflare

Target online memakai satu database Supabase terpisah per environment dan satu konfigurasi Hyperdrive per database. Worker terhubung langsung ke PostgreSQL melalui `pg`; frontend tidak menerima URL database, password, service-role key, atau akses tabel.

## Urutan setup

### Jalur otomatis — direkomendasikan

Salin `.env.example` menjadi `.env`, lalu ganti tujuh nilai yang semuanya berupa **KEY atau URL**. Nilai organisasi, timezone, nama Pages/Worker/Hyperdrive, route, namespace rate limit, dan konfigurasi GitHub memakai default aman.

```powershell
Copy-Item .env.example .env
npm run setup:preview
npm run setup:preview -- --apply
```

Perintah pertama hanya memvalidasi tanpa koneksi jaringan. Perintah kedua akan menerapkan migrasi Supabase, membuat user database khusus dan Hyperdrive, membuat/menautkan Pages custom domain, mengisi GitHub Environment `preview`, bootstrap Super Admin, lalu menjalankan workflow deploy ke project preview khusus. Skrip tidak mencetak KEY, password, connection string, atau email admin.

`SPI_ADMIN_EMAIL_URL` memakai bentuk `mailto:nama@domain.tld`. Pada preview tanpa Zero Trust, alamat ini menjadi identitas yang dipetakan setelah kunci preview tervalidasi. Kunci acak dibuat otomatis saat `setup:preview -- --apply`, disimpan sebagai secret, dan salinan lokalnya berada di `.preview-login-key` yang diabaikan Git.

### Jalur manual

1. Buat project Supabase preview dan production. Ambil **Direct connection string** dari tombol Connect untuk pembuatan Hyperdrive. Untuk migrasi dari mesin IPv4-only, gunakan Session pooler bila direct IPv6 tidak dapat dijangkau. Jangan gunakan Transaction pooler untuk migrasi.
2. Jalankan migrasi dengan `SUPABASE_DATABASE_URL` di environment proses: `npm run db:migrate:supabase`. URL tidak boleh diberikan sebagai argumen CLI karena dapat masuk shell history.
3. Buat user PostgreSQL khusus Hyperdrive dengan password acak di SQL Editor, lalu beri hak minimum pada schema/tabel SPI. Jangan memakai key `anon` atau `service_role` sebagai password database. Setelah migrasi, contoh grant awalnya adalah `GRANT USAGE ON SCHEMA public TO hyperdrive_user; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hyperdrive_user;`. Trigger dan constraint tetap membatasi operasi berisiko; retensi audit dijalankan terpisah dengan akun operator pemilik schema.
4. Buat Hyperdrive Cloudflare memakai direct connection string user tersebut. Simpan ID hasil sebagai `SPI_HYPERDRIVE_ID`; preview dan production wajib berbeda.
5. Isi GitHub Environment `preview` mengikuti runbook, jalankan workflow **Deploy preview** dengan persetujuan migrasi, lalu bootstrap satu kali.

Contoh perintah operator (nilai rahasia tetap berasal dari environment/secret manager):

```powershell
npm run db:migrate:supabase
npm run config:preview
npm run bootstrap:preview
npm run bootstrap:preview -- --apply
```

Skema mencabut hak `anon` dan `authenticated` pada tabel SPI. Aplikasi tetap memakai RBAC internal; preview sementara memakai kunci aplikasi tanpa Cloudflare Zero Trust, sedangkan production tetap mensyaratkan Access. Supabase Auth/Data API tidak menjadi jalur akses aplikasi pada fase ini.

Referensi resmi: [Cloudflare Hyperdrive dengan Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/), [driver PostgreSQL untuk Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/), dan [opsi koneksi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
