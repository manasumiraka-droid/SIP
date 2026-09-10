# Closeout Fase 2 — Telegram

Tanggal implementasi: 9 September 2026. Verifikasi readiness preview terakhir: 10 September 2026.

Implementasi lokal Fase 2 selesai. Closeout ini tidak menyatakan bahwa bot Telegram, secret, webhook eksternal, resource cloud, preview, atau production sudah dibuat atau diaktifkan.

## Hasil

- Panel pengurus membuat kode aktivasi acak satu kali, berlaku 15 menit, maksimum lima percobaan, dan tidak menampilkan ulang nilai rahasia.
- Permintaan aktivasi memakai rate limit, origin validation, body validation, dan idempotency key. Hanya hash kode yang disimpan.
- Aktivasi hanya menerima private chat serta mengikat identitas dari `message.from.id`; username dan display name tidak digunakan sebagai identitas.
- Webhook memerlukan secret header, content type JSON, batas 32 KiB, dan menduplikasi `update_id` secara aman.
- `/jadwal`, `/tugas`, `/bantuan`, dan `/darurat` tersedia. `/darurat` membuka satu laporan manual per assignment aktif dan tidak menunjuk pengganti.
- Tombol callback memakai ID opak dan nonce acak. Server memeriksa hash nonce, actor Telegram, organisasi, expiry, status assignment, serta version di dalam batch atomik.
- Intent konfirmasi dan pengingat H−24/H−1 dipersistenkan dengan idempotency key. Jam tenang default 21.00–06.00 menunda pesan non-kritis.
- Worker mengklaim delivery secara atomik, memulihkan klaim terputus setelah lima menit, mengikuti `retry_after`, dan berhenti setelah tiga percobaan.
- Assignment atau ibadah yang berubah membatalkan intent usang. Kegagalan delivery dapat dibaca koordinator sesuai scope tanpa chat ID atau isi pesan dan pembacaannya diaudit.
- Adapter Bot API hanya aktif jika secret token tersedia dan `TELEGRAM_DELIVERY_ENABLED=true`; konfigurasi repository tidak mengaktifkannya.

## Bukti lokal

- Migrasi D1 `0019`–`0022` berhasil diterapkan secara lokal.
- Format, ESLint, TypeScript, build web, Worker dry-run, dan secret scan lulus.
- Empat integration test Telegram lulus: forged webhook, aktivasi/replay, actor/nonce/expiry callback, dan retry delivery.
- Live smoke test pada Worker lokal dan browser eksternal lulus: health/API `200`, aktivasi `201`, replay request `409`, forged webhook `401`, empat command `200`, dua `/darurat` tetap menghasilkan satu laporan terbuka, serta callback replay tetap menghasilkan satu receipt dan satu audit.
- Cron lokal dipicu dua kali terhadap data sintetis; jumlah intent tetap satu untuk H−24 dan satu untuk H−1, sehingga tidak terjadi duplikasi.
- Tujuh integration test jadwal lulus setelah integrasi pembatalan notifikasi.
- Sebelas browser test lulus; pengujian terbaru panel aktivasi dan kegagalan delivery juga lulus pada viewport ponsel.
- Regression suite penuh lulus: 11 file test dengan 82 kasus, diikuti build web dan Worker dry-run.
- Sepuluh pengujian skrip operasi lulus, termasuk penolakan delivery nyata di preview, validasi secret tanpa output sensitif, serta penolakan webhook lintas host.
- Baseline secret scan lulus dan `npm audit --audit-level=high` melaporkan nol vulnerability.
- Test run live lokal terakhir mengembalikan health `200` dengan database `available`; seluruh 11 browser test dieksekusi ulang dan lulus.
- Temporary preview account Cloudflare berhasil dibuat setelah persetujuan manusia. D1 sintetis APAC dibuat dan seluruh migrasi `0001`–`0023` berhasil diterapkan secara remote.
- Worker sementara berhasil dideploy ke domain `workers.dev`. Smoke test HTTPS mencapai Worker dan ditolak `UNAUTHENTICATED` secara benar karena akun sementara tidak mempunyai Cloudflare Access; tidak ada bypass autentikasi yang dibuka.
- Uji remote menemukan dan memperbaiki incompatibility parser D1 pada trigger kompleks migrasi `0008`; constraint dipindahkan ke migrasi `0023` sebagai trigger satu-kondisi dan regression suite tetap 82/82.

## Keputusan dan batas operasional

Pemilik produk menyetujui teks pesan/tombol, jam tenang 21.00–06.00, perilaku `/darurat`, dan rancangan uji preview pada 9 September 2026.

Readiness preview kini mencakup route webhook terpisah, penguncian delivery preview ke `false`, pemasangan secret melalui stdin tanpa mencetak nilainya, registrasi webhook dengan validasi HTTPS/same-host, dan workflow manual yang tetap meminta persetujuan migrasi preview. Prosedur operator tercatat di `docs/phase-2-preview-runbook.md`.

Akun Cloudflare sementara bukan environment preview permanen dan akan kedaluwarsa jika tidak diklaim. Ia tidak memiliki Cloudflare Access, Pages production, data nyata, atau secret Telegram. Aktivasi eksternal masih memerlukan bot/token yang dikelola di luar repository, secret webhook, URL preview yang disetujui, dan akun Telegram uji. Karena gate akun Telegram nyata belum dijalankan, Fase 2 belum boleh dinyatakan selesai penuh atau diteruskan ke Fase 3.
