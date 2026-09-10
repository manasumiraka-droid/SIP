# Pembuatan akun pengurus

Super Admin dapat memilih **Tambah pengurus** pada bagian Akses pengguna. Isi nama tampilan, email akses dan peran awal, kemudian tinjau identitas sebelum mengonfirmasi. Akun dibuat aktif dengan version 1. Minimal satu peran pengurus (Super Admin, Admin, Koordinator Ibadah atau Koordinator Bidang) wajib dipilih; role Pelayan boleh ditambahkan sebagai fungsi rangkap. Akun pelayan tersendiri ditangani pada fase profil/aktivasi pelayan.

Pembuatan akun aplikasi tidak mengirim undangan, menautkan Telegram, membuat profil pelayan, atau mengubah allowlist Cloudflare Access. Email pengurus harus diizinkan secara terpisah melalui Access. Koordinator baru tetap tidak mendapatkan scope hanya karena role diberikan.

## Kontrak API

`POST /api/v1/users` menerima JSON strict:

```json
{
  "displayName": "Nama Pengurus",
  "email": "pengurus@example.invalid",
  "roles": ["admin"]
}
```

Wajib menyertakan Origin sesuai APP_ORIGIN dan Idempotency-Key UUID. Batas body 2 KiB, Content-Type application/json, rate limit mutation yang sama dengan perubahan role. Field organization_id, status, id dan field tambahan ditolak. Nama dinormalisasi NFC/spasi dan dibatasi 120 karakter; email di-trim, diubah menjadi huruf kecil, divalidasi dan dibatasi 254 karakter. Role tidak dikenal, publik, duplikat, atau tanpa peran pengurus ditolak.

Respons berhasil 201 dengan request_id serta `data: { id, version: 1 }`; tidak mengembalikan email. Replay berhasil juga 201 dan mengembalikan ID/version hasil awal, meskipun akun kemudian diedit. Request_id selalu milik request terkini. Email sama dalam organisasi menghasilkan 409 tanpa ID akun lama; organisasi berbeda memiliki namespace email terpisah. Idempotency key berlaku dalam scope endpoint + organisasi + pelaku. Key yang sama dengan payload berbeda menghasilkan 409.

## Konsistensi dan audit

Migrasi `0003_user_creations.sql` menambahkan bukti idempotensi dengan hash SHA-256 payload kanonis, bukan salinan nama/email. Dalam D1 batch yang sama, guard memeriksa ulang bahwa pelaku masih Super Admin aktif, lalu akun, role dan audit dibuat. FK target receipt ditunda hingga commit agar tidak ada receipt tanpa akun. Kegagalan audit/constraint membatalkan seluruh transaksi. Tidak ada perubahan pada migrasi pertama atau kedua.

Audit action `user.create` menyimpan actor, organisasi, target, request ID, timestamp, role awal, status dan version. Nama/email tidak disalin ke metadata audit. Log hanya mencatat nama operasi `users.create`, status HTTP, durasi dan request ID. Receipt mengikuti retensi lima tahun seperti audit, dengan maintenance direview sebelum produksi.

Form menyimpan isian saat gagal, memberi error dekat field, dan meminta tinjau sebelum submit. Saat hasil jaringan tidak pasti, retry dengan isian sama menggunakan key yang sama. UI memberi keterangan terpisah jika email mungkin duplikat atau akses pelaku berubah. Keberhasilan frontend mengharuskan DTO respons lolos validasi.

## Batas saat ini

Ini melengkapi pembuatan akun setelah Super Admin pertama tersedia. Bootstrap organisasi/Super Admin pertama dilakukan melalui skrip operator, bukan UI; [perubahan status](account-status.md) juga tersedia. Pengelolaan scope menunggu target bidang/ibadah Fase 1. Akun nyata dan provisioning cloud belum dijalankan. Review keamanan/manusia sesuai PRD tetap diperlukan sebelum deployment.
