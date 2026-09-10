# Fase 1 — Jadwal inti

Status: implementasi lokal selesai pada 9 September 2026. Gerbang validasi manusia dan seluruh kesiapan preview/production tetap terbuka.

## Bounded context dan state machine

Context ini mencakup katalog bidang/peran, pelayan dan capability, ketersediaan, ibadah, penugasan, serta scope koordinator. Ibadah: `draft → scheduled → completed`, atau `scheduled → postponed → scheduled`, dengan pembatalan dari keadaan yang belum final. Penugasan: `draft → awaiting_confirmation → accepted`; penolakan/ketidakhadiran mengarah ke `unavailable`/`needs_replacement`/`absent`, penggantian yang disahkan menjadi `reassigned`, dan semua keadaan aktif dapat dibatalkan sesuai mesin status.

## Migrasi

Migrasi `0008`–`0012` bersifat forward-only dan tidak mengubah migrasi Fase 0. Rangkaian ini menambahkan model jadwal, izin dan receipt mutasi, kelengkapan model, slot aktif unik, serta guard batas beban bulanan.

## Keputusan dan batas increment

- Semua timestamp disimpan UTC; zona organisasi tetap menjadi batas render/API.
- Capability aktif memerlukan approver dan waktu persetujuan; approver eksplisit dicatat pada `capability_approvers`.
- Trigger mencegah penugasan aktif ketika pelayan tidak aktif, capability belum disetujui, availability bertabrakan, atau rentang assembly–end bertumpang tindih.
- `POST /api/v1/services` serta perubahan status ibadah memakai validasi ketat, idempotency receipt, optimistic concurrency, recheck otorisasi dalam transaksi, dan audit atomik. Penundaan mengembalikan assignment aktif ke konfirmasi; pembatalan menutup assignment aktif.
- `POST /api/v1/assignments` serta perubahan status assignment memakai kontrol yang sama. Respons pelayan dibatasi ke assignment miliknya dan hanya transisi `accepted`/`unavailable`; koordinator wajib memiliki scope service/field aktif.
- API berbatas organisasi tersedia untuk bidang, peran pelayanan, profil pelayan, availability, capability/approver, scope koordinator, ibadah, dan assignment. Data administratif/privat disaring menurut policy terpusat.
- Pemilihan kandidat dan penggantian adalah Fase 3, Telegram/notifikasi adalah Fase 2, sedangkan spike parser dan impor Excel adalah Fase 1b sesuai PRD 18.4.
- UI Kalender membaca D1 dan menyediakan formulir ibadah mobile. Kontrol Fase 0 tetap tersedia melalui menu `Lainnya`.
- Vertical slice lokal menggunakan seed sintetis terpisah. Identitas demo hanya diterima oleh Worker pada environment dan origin localhost yang eksplisit; konfigurasi remote tetap memakai Cloudflare Access.

## Verifikasi dan review

Tes negatif migrasi mencakup tenant, scope, slot, benturan, availability, capability, serta batas beban. Unit dan integration test mencakup state transition, replay idempoten, stale version, scope, redaksi field privat, cascade status, dan rollback audit. Format, lint, TypeScript, build Worker/web, secret scan, dependency audit, serta sembilan browser test lokal lulus saat closeout. Rincian penutupan ada di [phase-1-closeout.md](phase-1-closeout.md).
