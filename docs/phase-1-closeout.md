# Closeout Fase 1 — Jadwal inti

Tanggal closeout implementasi lokal: 9 September 2026.

## Cakupan selesai

- State machine ibadah dan assignment, termasuk penundaan/pembatalan beserta cascade assignment.
- Model bidang, peran pelayanan, profil pelayan, capability dan approver, availability, ibadah, assignment, serta scope koordinator.
- Guard tenant, capability aktif, availability, benturan rentang assembly–selesai, slot aktif unik, dan batas beban bulanan.
- API berbasis permission/scope dengan validasi, idempotensi, optimistic concurrency, recheck aktor, audit atomik, dan redaksi field privat.
- Kalender berbasis D1, detail ringkas, dan formulir pembuatan ibadah yang responsif untuk ponsel. Kontrol Fase 0 tetap dapat diakses dari menu `Lainnya`.
- Data demonstrasi sintetis dan jalur autentikasi demo yang hanya aktif pada konfigurasi localhost eksplisit.

## Migrasi dan verifikasi

Migrasi Fase 1 adalah `0008`–`0012`; migrasi Fase 0 tidak diubah. Format, lint, typecheck, unit/integration test, build web dan Worker dry-run, secret scan, dependency audit, serta sembilan browser test lulus pada closeout. Override `sharp` mengunci versi yang tidak memiliki temuan audit tinggi pada saat pemeriksaan.

## Menjalankan demo lokal

Jalankan `npm ci`, `npm run db:migrate:local`, dan `npm run db:seed:local`. Setelah itu jalankan `npm run dev:api:demo` dan `npm run dev` pada dua terminal, lalu buka `http://localhost:5173` dan pilih Kalender. Seluruh data seed bersifat dummy dan tersimpan pada D1 lokal Wrangler; tidak ada resource cloud atau data produksi yang digunakan.

## Batas dan gerbang manusia

Closeout ini menyatakan implementasi lokal Fase 1 selesai, bukan persetujuan production. Pemilik produk masih perlu memvalidasi istilah gerejawi, kewenangan koordinator, transisi status, dan pengalaman ponsel. Review keamanan independen, konfigurasi preview, backup/restore, monitoring, serta approval deployment juga tetap terbuka.

Fase berikutnya adalah Fase 1b. Pekerjaannya dimulai pada task Codex terpisah sesuai `AI_RULES_SPI.md`, diawali spike parser XLSX dan threat model impor sebelum wizard atau commit data dibangun.
