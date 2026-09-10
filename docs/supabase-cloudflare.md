# Supabase PostgreSQL + Cloudflare

Target online memakai satu database Supabase terpisah per environment dan satu konfigurasi Hyperdrive per database. Worker terhubung langsung ke PostgreSQL melalui `pg`; frontend tidak menerima URL database, password, service-role key, atau akses tabel.

## Urutan setup

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

Skema mencabut hak `anon` dan `authenticated` pada tabel SPI. Aplikasi tetap memakai Cloudflare Access dan RBAC internal; Supabase Auth/Data API tidak menjadi jalur akses aplikasi pada fase ini.

Referensi resmi: [Cloudflare Hyperdrive dengan Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/), [driver PostgreSQL untuk Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/), dan [opsi koneksi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
