# AI CODING RULES — Sistem Pelayanan Ibadah

**Version:** 1.0  
**Applies to:** every AI coding agent, code generator, reviewer, migration author, and automation working in this repository  
**Authoritative product source:** `PRD_Sistem_Pelayanan_Ibadah_v1.2.md`

## 1. Instruction priority and scope

Follow instructions in this order:

1. The user's current explicit instruction.
2. This `AI_RULES.md` file.
3. `PRD_Sistem_Pelayanan_Ibadah_v1.2.md`.
4. Existing repository architecture and conventions.
5. Official documentation for the installed versions of tools and dependencies.

Do not silently reinterpret or expand the product scope. When a requested change conflicts with the PRD or these rules, identify the exact conflict before implementation and propose the smallest compliant resolution. Never invent product requirements, credentials, database records, external integrations, or successful test results.

The MVP is a mobile-first web application for one congregation, with Telegram as the automated notification channel. Keep multi-organization readiness in the data model, but do not build multi-tenant management until requested.

## 2. Required working method

### Efisiensi token dan proses

- Bekerja seoptimal mungkin: gunakan token, tool call, dan langkah kerja secukupnya untuk menyelesaikan tugas dengan benar, aman, dan dapat diverifikasi.
- Jangan sengaja memperpanjang penalaran, mengulang pembacaan/hasil yang sudah tersedia, melakukan polling tanpa perubahan, atau membuat langkah administratif yang tidak memberi nilai pada hasil pengguna.
- Gunakan output ringkas dan fokus pada bukti yang relevan; perluas analisis, pengujian, atau dokumentasi hanya jika risiko, kompleksitas, atau instruksi pengguna memang membutuhkannya.
- Efisiensi tidak boleh dipakai untuk melewati review source terkait, validasi keamanan, pengujian, migrasi, atau pemeriksaan lain yang diwajibkan oleh aturan ini dan PRD.

### Phase task isolation

- Kerjakan setiap fase PRD pada chat/task Codex yang terpisah agar keputusan, perubahan, review, dan bukti verifikasi dapat ditelusuri per fase.
- Jangan memulai pekerjaan fase berikutnya di chat fase yang sedang berjalan. Tutup dan dokumentasikan fase saat ini terlebih dahulu, lalu buat chat/task baru dengan handoff yang merujuk PRD, aturan ini, closeout fase, dan keterbatasan yang masih berlaku.
- Pembuatan chat fase berikutnya bukan bukti bahwa fase saat ini selesai; semua definition of done dan gerbang manusia yang relevan tetap harus dilaporkan dengan jujur.

Before changing code:

1. Read the relevant PRD section, this file, the affected source files, migrations, tests, and configuration.
2. Inspect the current repository state and preserve unrelated user changes.
3. Trace the affected flow from UI to API, authorization, database, Telegram/scheduler, and audit log.
4. State assumptions only when the repository and documentation cannot resolve them.
5. Prefer the smallest complete change that satisfies the acceptance criteria.

During implementation:

- Work in coherent, reviewable increments.
- Update every affected layer; do not leave mock behavior connected to production paths.
- Reuse existing abstractions before creating new ones.
- Keep the application runnable after each completed increment.
- Do not perform broad refactors inside an unrelated feature change.
- Do not replace working infrastructure, libraries, or patterns solely because another option is more familiar.

Before declaring work complete:

- Run the relevant formatter, linter, TypeScript check, tests, and production build.
- Verify the main success path, failure path, authorization boundary, empty state, loading state, and mobile layout.
- Review the final diff for unrelated changes, exposed secrets, debug code, duplicated logic, and incomplete TODOs.
- Report what changed, what was verified, and any real limitation that remains.

Never claim that a feature works without running the checks available for that feature. If a required check cannot run, report the exact blocker.

## 3. Approved architecture

Use the PRD's Cloudflare-first architecture unless the user explicitly approves a change:

| Layer | Approved choice |
|---|---|
| Frontend | React, Vite, TypeScript |
| Styling/components | Tailwind CSS, shadcn/ui, Lucide |
| Charts | Recharts |
| Frontend hosting | Cloudflare Pages |
| Backend/API | Cloudflare Workers with Hono |
| Database | Cloudflare D1 with versioned SQL migrations |
| Scheduled jobs | Cloudflare Workers Cron Triggers |
| Bot | Telegram Bot API using webhook delivery |
| Admin access | Cloudflare Access with server-side identity validation |
| Secrets | Cloudflare Worker Secrets or environment secrets |
| CI/CD | GitHub Actions |

Keep vendor-specific code behind small adapters when practical, especially Telegram delivery, scheduling, storage, and persistence. Do not add Neon, Vercel, Supabase, Firebase, or another overlapping service without a documented requirement and explicit approval.

Maintain three isolated environments: local, preview/test, and production. Never connect local or preview code to the production database, production bot, or production secrets.

## 4. Project structure and boundaries

Use clear boundaries such as:

```text
apps/
  web/             # React application
  worker/          # Hono API, Telegram webhook, scheduled jobs
packages/
  domain/          # framework-independent business rules and types
  validation/      # shared schemas and validated DTOs
  ui/              # reusable presentation components when justified
migrations/        # ordered D1 SQL migrations
docs/              # operational and architectural documentation
```

Adapt this layout only when an existing repository already has a coherent equivalent.

- UI components must not query D1, call Telegram, or implement authorization decisions.
- Route handlers must remain thin: parse, authenticate, authorize, call a service, and map the result.
- Business rules belong in domain/application services and must not depend on React or HTTP objects.
- Database access belongs in repositories/query modules, not scattered through routes and components.
- Telegram handlers and cron jobs must call the same application services used by the API. Do not duplicate state-transition logic.
- Shared types must describe validated application data; do not expose raw database rows throughout the frontend.
- Avoid circular imports, global mutable state, and hidden side effects during module import.

## 5. Clean and maintainable code

- Enable TypeScript strict mode. Do not use `any`, unsafe casts, non-null assertions, or `@ts-ignore` to bypass errors without a documented, narrow reason.
- Use descriptive names based on the church service domain. Avoid vague names such as `data`, `item`, `handleStuff`, or `temp` outside very small scopes.
- Keep functions focused on one responsibility. Extract logic when a function mixes validation, authorization, persistence, and external effects.
- Prefer explicit code over clever abstractions. Do not create a generic framework for a single use case.
- Remove duplication when the same business rule appears in more than one execution path.
- Use constants or configuration for status values, reminder offsets, token expiry, time zone, and limits.
- Write comments for decisions, invariants, or non-obvious constraints. Do not narrate obvious syntax.
- Keep public functions and modules small enough to review. Split files by responsibility, not arbitrary line counts.
- Delete dead code after confirming it is unused. Do not retain commented-out implementations.
- Do not commit generated build output, local databases, logs, editor files, or secrets.
- All user-facing UI text is Bahasa Indonesia. Code, identifiers, tests, schema names, and technical documentation may use English consistently.

## 6. Dependency discipline

- Prefer platform APIs and existing dependencies.
- Add a dependency only when it removes meaningful complexity or security risk.
- Before adding one, verify its maintenance status, license, bundle impact, Cloudflare Workers compatibility, and overlap with installed packages.
- Pin versions through the lockfile. Never edit the lockfile manually.
- Do not perform unrelated major-version upgrades.
- Remove unused packages and imports.
- Do not load large libraries for a small utility that can be implemented safely in a few lines.
- Never use an unmaintained library for authentication, cryptography, validation, or Telegram webhook security.

## 7. Domain invariants

Enforce these rules on the server and, where possible, with database constraints:

- An assignment slot has at most one active servant unless the role explicitly defines multiple slots.
- A servant cannot hold overlapping assignments when attendance windows overlap.
- An inactive servant cannot receive a new active assignment.
- A servant must have an active, approved capability for the assigned role.
- A preaching assignment requires the separately approved preacher capability.
- `accepted` by a replacement candidate does not equal `approved`; a coordinator must finalize the replacement.
- Finalizing a replacement must atomically close the old assignment, activate the replacement, close the replacement case, and invalidate competing offers.
- Expired, cancelled, completed, or superseded messages cannot mutate current state.
- “No response” is never interpreted as “declined” or “unavailable.”
- Cancelling or changing a worship service invalidates all obsolete pending notifications and offers.
- Historical assignments, incidents, attendance, and sensitive notes must not be hard-deleted through normal application flows.
- Every operational row carries `organization_id`, `created_at`, and `updated_at` where applicable.

Model status changes as explicit allowed transitions. Reject invalid transitions with a stable domain error; never silently coerce them.

## 8. Date, time, and scheduling rules

- Store timestamps in UTC. Store the organization's IANA time zone separately and render local time at the boundary.
- Never depend on the browser, Worker, database, or server default time zone.
- Use ISO 8601 at API boundaries.
- Define attendance windows with `assembly_at`, `starts_at`, and, when needed, `ends_at`.
- Calculate schedule conflicts from full time ranges, including required arrival time.
- Cron execution time is not exact. Query due work using a time window and persistent status, not an equality check on the current minute.
- Scheduled jobs must be safe to retry, overlap, and resume after missed executions.
- Use a unique idempotency key for each logical notification, such as assignment + event type + schedule version.

## 9. Database and migration rules

- Every schema change requires a new, ordered SQL migration. Never edit a migration that may already have run in another environment.
- Use foreign keys, unique constraints, check constraints, and indexes to protect domain invariants where D1 supports them.
- Use transactions for multi-record state transitions such as replacement approval and schedule cancellation.
- Never build SQL by concatenating user input. Use parameter binding exclusively.
- Select only needed columns; avoid unbounded list queries.
- All list endpoints require deterministic ordering and pagination or an explicit safe upper bound.
- Add indexes based on actual access paths: organization, service time, assignment status, servant, notification due time, and incident status.
- Avoid N+1 database queries in calendars, dashboards, and reports.
- Treat migrations and seed data separately. Development seeds must never run automatically in production.
- Backward-compatible application changes should be deployed before destructive schema cleanup.
- Do not implement destructive production migrations until backup and restore procedures have been tested.

## 10. API and validation

- Validate every path parameter, query, header, cookie, and request body on the server with explicit schemas.
- Reject unknown or oversized fields where practical.
- Normalize phone-free Telegram identifiers, names, dates, enums, and optional notes before persistence.
- Return consistent error objects with a stable code and safe Bahasa Indonesia message.
- Do not expose stack traces, SQL errors, internal identifiers, secrets, or authorization details to clients.
- Use appropriate HTTP methods and status codes. State-changing operations must never use `GET`.
- Protect mutations against replay and duplicate submissions.
- Set request body limits and safe pagination limits.
- Version external callback payloads and internal event formats when a breaking change is possible.
- Generate CSV exports safely: neutralize cells beginning with `=`, `+`, `-`, or `@` to prevent spreadsheet formula injection.

## 11. Authentication and authorization

Authentication proves identity; authorization determines permission. Enforce both for every protected server action.

- Never trust a role, email, organization ID, servant ID, or permission sent by the browser.
- For admin routes, validate the Cloudflare Access identity/token server-side and map it to an active local user record.
- Check role and organization scope inside the application service before reading or changing data.
- Apply least privilege. A coordinator sees only the fields and service areas required for the assigned responsibility.
- A servant may access only their own tasks, availability, permitted notes, and individual report.
- Public routes may return only explicitly published worship information.
- Authorization must protect object identity, not only page access; requesting another record ID must still be denied.
- Re-check authorization for exports, charts, bulk actions, audit logs, notes, and incident details.
- Session/cookie settings must use `Secure`, `HttpOnly`, and an appropriate `SameSite` policy when cookies are used.
- Never implement home-grown passwords, token signing, or cryptography.

## 12. Telegram integration security and reliability

- Store the bot token only as a production secret. Never send it to the frontend, logs, screenshots, tests, or error reports.
- Configure a secret webhook path/token and validate Telegram's webhook secret header using constant-time comparison where applicable.
- Accept webhook traffic only through the dedicated endpoint and allow only expected HTTP methods/content types.
- Parse Telegram updates defensively; unsupported update types must be ignored safely.
- Associate `telegram_chat_id` with a servant only through a short-lived, single-use activation code generated by the authenticated application.
- Never identify a servant solely from a display name, username, or unverified value in callback data.
- Callback payloads must contain only opaque identifiers or signed short-lived data; re-fetch authoritative state from D1.
- A callback must validate actor ownership, current assignment/offer status, expiry, organization scope, and allowed transition.
- Acknowledge callback queries promptly, then perform bounded work. Move repeated or retryable work into an idempotent service.
- Handle Telegram rate limits and transient failures using bounded exponential backoff and `retry_after` when provided.
- Do not retry permanent failures indefinitely. Mark delivery state and expose it to the coordinator.
- Escape or safely construct Telegram Markdown/HTML. Never insert raw user text into formatted messages.
- Keep message templates centralized and test their buttons, deep links, and expiry behavior.

## 13. Notification and cron reliability

- Persist notification intent before calling Telegram.
- Record at minimum: event type, recipient, assignment/reference, idempotency key, due time, attempt count, delivery status, and last error category.
- Treat external send success separately from servant confirmation. `sent`, `delivered/accepted_by_api`, `read`, and `confirmed` must not be conflated.
- Before every send, re-check that the worship service, assignment, recipient, and reminder remain current.
- Cancel pending reminders after confirmation, replacement, schedule change, completion, or cancellation.
- Retry only transient errors with a strict maximum attempt count and backoff.
- Never send duplicate reminders because two cron invocations overlap.
- Use a dead-letter/failed state visible in the dashboard for messages requiring manual follow-up.
- Batch due work with bounded size to stay inside free-tier and execution limits.
- Do not promise exact delivery time; show scheduled time, attempt status, and failure state accurately.

## 14. Critical incident and replacement safety

- Critical status begins according to configurable organization policy; the PRD default is less than 60 minutes before service.
- Creating an incident must never automatically appoint a replacement.
- Candidate recommendations must be deterministic and explainable from approved capability, availability, conflicts, backup status, and workload.
- Do not infer physical proximity from location tracking. “Present/near venue” must come from explicit check-in or coordinator input.
- A replacement offer must have an expiry. Late acceptance must fail safely and show the current assignment.
- Competing candidates may not become active simultaneously. Use a transaction and uniqueness protection.
- Preacher replacements must be selected only from the approved preacher list.
- The emergency checklist must remain available as a lightweight printable/exportable view when internet service is unreliable.
- Closing an incident requires outcome and actor information; corrections append history rather than erasing it.

## 15. Privacy and sensitive notes

- Collect only data required for scheduling, contact, availability, service history, and authorized pastoral/administrative follow-up.
- Treat contact information, availability, reasons for absence, attendance, incidents, evaluations, and personal performance as private.
- Store absence reasons as optional and restricted. Do not request medical details.
- Give each note an explicit visibility level and enforce it server-side.
- Do not place sensitive text in URLs, Telegram callback data, analytics events, client logs, or general audit metadata.
- Audit access and changes to sensitive notes when feasible, while avoiding copying the note body into the audit record.
- Reports shown to the organization must aggregate or minimize personal data.
- Individual performance must never appear in a public leaderboard.
- Support correction and deactivation workflows without destroying required historical integrity.
- Define and document retention periods before production use; do not keep unnecessary delivery payloads indefinitely.

## 16. Performance and reporting correctness

- Performance metrics support planning, workload balance, appreciation, and coaching. Never calculate spiritual worth, character, or commitment.
- Derive metrics from immutable or auditable facts: assignments, confirmation timestamps, attendance records, replacement cases, and completed service.
- Every metric must define its numerator, denominator, exclusions, time range, and time zone.
- Display sample size with percentages. Do not show a percentage when the denominator is zero.
- Separate excused/unplanned absence when policy requires it; never infer the reason.
- Do not combine “declined in advance” with “late cancellation.”
- Organization charts use aggregates by default. Individual details require authorized access.
- Use stable color meanings and never rely on color alone.
- Verify report queries against known fixtures, including empty periods, cancelled services, replacements, and duplicate-prevention cases.

## 17. Frontend and mobile UX

- Design for a 360 px wide viewport first, then enhance for tablet and desktop.
- Keep primary actions within comfortable thumb reach and use the PRD bottom navigation on mobile.
- Touch targets must be at least 44 by 44 CSS pixels.
- Use semantic HTML, visible keyboard focus, sufficient contrast, accessible labels, and logical heading order.
- Every status uses text plus icon; color alone is insufficient.
- Preserve the PRD color tokens. Critical red is reserved for urgent states and destructive confirmation.
- Forms must retain safe user input after recoverable errors and show errors near the relevant field.
- Require explicit confirmation for destructive or high-impact actions such as cancellation, replacement approval, and sensitive note deletion.
- Provide loading, empty, offline/retry, success, validation, permission-denied, and server-error states.
- Prevent double submission while a mutation is pending, while the server still enforces idempotency.
- Avoid modal chains and dense desktop tables on phones. Use cards or compact lists with progressive disclosure.
- Charts must remain readable without horizontal overflow and include a text/table alternative for exact values.
- Keep JavaScript and image payloads small; lazy-load charts and secondary routes when useful.
- Do not expose internal technical details or raw error messages in the user interface.

## 18. Security baseline

Apply current OWASP principles to every change:

- Prevent broken access control with server-side object and organization checks.
- Prevent injection with schema validation and bound SQL parameters.
- Prevent XSS by relying on React escaping, sanitizing permitted rich content, and avoiding raw HTML.
- Prevent CSRF on cookie-authenticated mutations with SameSite policy plus origin/CSRF validation appropriate to the architecture.
- Set security headers: Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`, and appropriate frame restrictions.
- Restrict CORS to known application origins. Never use wildcard origins with credentials.
- Apply rate limits to activation, webhook, authentication-adjacent, export, and mutation endpoints.
- Do not log secrets, access tokens, cookies, activation codes, full Telegram updates, or private note content.
- Redact sensitive fields from structured logs and error trackers.
- Return generic authentication failures that do not reveal account existence.
- Validate redirects and deep links against an allowlist.
- Do not use `Math.random()` for security tokens. Use Web Crypto secure randomness.
- Use constant-time comparison for secret values where feasible.
- Never store secrets in `.env.example`; include names and safe placeholders only.

## 19. Error handling and observability

- Distinguish validation, authentication, authorization, conflict, not-found, rate-limit, external-service, and internal errors.
- Use structured logs with request/correlation ID, safe actor ID, operation, result, and timing.
- Never swallow errors or use empty `catch` blocks.
- A user-facing failure must provide a safe next action: retry, refresh, contact coordinator, or use manual procedure.
- External-service failures must not corrupt the database state.
- Dashboard health indicators must come from persisted delivery/job state, not assumptions.
- Audit logs record meaningful state changes with actor, timestamp, entity, action, and safe before/after metadata.
- Audit records are append-only through normal application operations.

## 20. Testing requirements

Use a small, high-value test suite appropriate for a solo project.

### Mandatory unit/domain tests

- Assignment overlap detection.
- Allowed and forbidden status transitions.
- Replacement candidate filtering and deterministic ordering.
- Reminder due-time calculation across the organization time zone.
- Metric calculation including zero denominators and cancelled services.

### Mandatory integration tests

- Unauthorized and cross-organization access is rejected.
- Telegram activation code is single-use and expires.
- Telegram callback cannot update another servant's assignment.
- Duplicate webhook/cron delivery does not create duplicate state or notifications.
- Replacement approval is atomic and closes competing offers.
- Stale callbacks and expired offers fail safely.
- SQL input remains parameterized and validation rejects malformed payloads.

### Mandatory end-to-end smoke paths before production

- Admin creates and publishes a service from a mobile viewport.
- Servant confirms from a Telegram-style callback flow.
- Servant reports unavailable and coordinator approves a replacement.
- Critical incident is opened, handled, and closed.
- Authorized user views reports; unauthorized user cannot view individual data.

Do not add snapshot tests for large UI trees or tests that merely repeat implementation. Test observable behavior and domain invariants.

## 21. Git, CI, and deployment

- Keep commits focused and messages descriptive.
- Never force-push, rewrite shared history, delete branches, or discard user changes without explicit instruction.
- Do not commit directly to the production branch when the repository uses pull requests.
- Required CI gates: install from lockfile, lint, TypeScript check, tests, and production build.
- Production deployment uses reviewed environment configuration and secrets.
- Preview deployments use a separate D1 database and a non-production Telegram bot or disabled sending adapter.
- Database migrations are reviewed and applied explicitly. Never run destructive migrations automatically on production.
- Provide rollback steps for releases that change data or external integration behavior.
- Stop deployment if required secrets, migrations, tests, or environment bindings are missing.

## 22. Free-tier and cost controls

- Treat free-tier limits as constraints, not guarantees.
- Record and review Worker invocations, D1 reads/writes, scheduled batches, R2 storage, and Telegram send volume.
- Use bounded queries, batched cron processing, pagination, caching where correct, and compact payloads.
- Do not introduce a paid service, credit-card requirement, metered AI API, SMS, or WhatsApp API without explicit approval.
- Build exports and backup procedures so the project can move providers without losing core data.
- External provider limits and pricing must be verified from current official documentation before architecture or launch decisions.
- Gracefully degrade near service limits; never silently drop reminders or data writes.

## 23. Documentation requirements

Keep these documents current when the affected behavior changes:

- `README.md`: setup, commands, architecture summary, and local run steps.
- `.env.example`: variable names with non-secret placeholders.
- Migration notes: schema purpose, order, and rollback/forward-fix approach.
- Telegram setup: BotFather steps, webhook, secret configuration, test bot, and recovery.
- Operations guide: failed notifications, manual replacement, critical incident fallback, backup, and restore.
- Decision record for any approved departure from the PRD or architecture.

Documentation commands must be copy-pasteable and must not contain real credentials.

## 24. Prohibited practices

An AI coder must never:

- Hardcode secrets, production IDs, admin email addresses, or environment-specific URLs.
- Trust client-provided roles, ownership, organization scope, or status transitions.
- Bypass type, lint, test, migration, or authorization failures to make a build pass.
- Add fake production data, silent fallback success, or placeholder security.
- Use unofficial Telegram or WhatsApp automation that requires session scraping or violates platform rules.
- Make an irreversible assignment or preacher-selection decision without the required human approval.
- Publicly rank servants or expose sensitive notes and absence reasons.
- Use a cron job without idempotency and persisted delivery state.
- Log full request bodies indiscriminately.
- Edit already-applied migrations.
- Mix production and preview data, bots, bindings, or secrets.
- Perform broad dependency upgrades or architectural rewrites during a feature task.
- Mark a task complete while required acceptance criteria or verification remain unmet.

## 25. Definition of done

A change is complete only when:

1. It implements the relevant PRD behavior without unapproved scope expansion.
2. Domain invariants and authorization are enforced server-side.
3. Data changes use reviewed migrations and safe queries.
4. Telegram and scheduled work are idempotent and expose failures.
5. Mobile UI includes accessible loading, empty, success, and error states.
6. Sensitive data is minimized, protected, and absent from unsafe logs.
7. Relevant tests, lint, typecheck, and production build pass.
8. Documentation and configuration examples match the implementation.
9. The final diff contains no secrets, debug artifacts, dead code, or unrelated edits.
10. The implementation can be reviewed, deployed, monitored, and rolled back by following repository documentation.
