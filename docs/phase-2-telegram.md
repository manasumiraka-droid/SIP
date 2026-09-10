# Fase 2 — Telegram (local-safe)

Fase ini menambahkan fondasi Telegram tanpa membuat bot, menyimpan secret, mengirim pesan, atau melakukan deployment.

## Perilaku yang tersedia

- Pengurus dengan izin pengelolaan pelayan dapat membuat kode aktivasi satu kali untuk pelayan aktif melalui `POST /api/v1/servants/:id/telegram-activation`. Kode hanya dikembalikan pada respons tersebut, disimpan sebagai SHA-256 hash, berlaku 15 menit, dan dibatasi lima percobaan.
- Webhook hanya tersedia pada `POST /telegram/webhook`, membutuhkan `Content-Type: application/json` dan header secret Telegram yang cocok secara constant-time. Update yang sama tidak diproses dua kali.
- `/jadwal`, `/tugas`, `/bantuan`, dan `/darurat` diparse defensif. Laporan `/darurat` hanya membuka laporan manual untuk assignment aktif pelapor; tidak menunjuk pengganti otomatis.
- Callback `v1:<grant-id>:<nonce>` diverifikasi terhadap identitas Telegram yang sudah ditautkan, nonce hash, expiry, organisasi, assignment, dan state versi terbaru. Callback lama atau duplikat menjadi no-op.
- Intent notifikasi dipersistenkan dan idempoten. Cron memproses maksimal 25 item, menunda notifikasi non-kritis pada 21.00–06.00 waktu organisasi, dan membatasi retry transient sampai tiga percobaan.

## Batas keselamatan

Pengirim default selalu `delivery_disabled`; tidak ada HTTP call ke Telegram dari local, preview, atau production hanya karena kode ini diterapkan. Pengiriman baru aktif bila `TELEGRAM_BOT_TOKEN` tersedia sebagai secret **dan** `TELEGRAM_DELIVERY_ENABLED=true`. Status gagal terlihat pada `telegram_notification_intents` dengan kategori aman untuk tindak lanjut koordinator. Secret tidak dicantumkan dalam konfigurasi atau contoh environment.

## Keputusan manusia

Pemilik produk menyetujui pada 9 September 2026:

1. Teks pesan dan template tombol yang akan benar-benar dikirim.
2. Kebijakan jam tenang 21.00–06.00 dan pengecualian kritis.
3. Alur tindak lanjut `/darurat`.
4. Rancangan uji akun Telegram sintetis/terbatas di preview.

Persetujuan ini mengesahkan perilaku produk dan rancangan uji. Bot, secret, resource cloud, konfigurasi webhook eksternal, pengiriman nyata, dan deployment tetap belum dilakukan karena kredensial serta target preview belum tersedia di workspace.
