# Status akun — Fase 0

Super Admin dapat mengubah akun menjadi `active`, `inactive`, atau `suspended` melalui `PATCH /api/v1/users/{id}/status`. Permintaan membutuhkan `Idempotency-Key`, `Origin` yang sesuai, version pada body, dan `If-Match` bila header itu dikirim. Respons sukses mengembalikan status dan version baru tanpa email.

Perubahan dijalankan dalam satu D1 batch: otorisasi pelaku dibaca ulang, keberadaan dan version target diperiksa, perlindungan Super Admin aktif terakhir ditegakkan, audit dibuat, lalu akun diperbarui. Constraint pada `account_status_changes` membatalkan seluruh transaksi bila salah satu guard gagal. Replay dengan key dan payload yang sama mengembalikan hasil awal; penggunaan key untuk payload lain menghasilkan konflik.

Akun `inactive` dan `suspended` ditolak middleware autentikasi pada request berikutnya walaupun assertion Cloudflare Access masih berlaku. UI selalu meminta konfirmasi dan menampilkan status dengan teks serta ikon. Status akun tidak mengubah allowlist atau policy Cloudflare Access; pencabutan di kedua lapisan tetap tanggung jawab operator.
