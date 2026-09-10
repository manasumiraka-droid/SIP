-- Phase 2 hardening: enforce callback state checks inside the same atomic batch
-- and rate-limit activation guesses per Telegram identity.
CREATE UNIQUE INDEX telegram_callback_org_id ON telegram_callback_grants(organization_id,id);
CREATE TABLE telegram_callback_receipts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, callback_grant_id TEXT NOT NULL,
 assignment_id TEXT NOT NULL, expected_version INTEGER NOT NULL, actual_version INTEGER NOT NULL,
 actor_matches INTEGER NOT NULL, state_matches INTEGER NOT NULL, created_at TEXT NOT NULL,
 CHECK(expected_version=actual_version), CHECK(actor_matches=1), CHECK(state_matches=1),
 FOREIGN KEY(organization_id,callback_grant_id) REFERENCES telegram_callback_grants(organization_id,id),
 FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id),
 UNIQUE(organization_id,callback_grant_id)
);

CREATE TABLE telegram_activation_attempts (
 organization_id TEXT NOT NULL, telegram_user_id TEXT NOT NULL,
 window_started_at TEXT NOT NULL, attempt_count INTEGER NOT NULL CHECK(attempt_count BETWEEN 1 AND 5),
 updated_at TEXT NOT NULL, PRIMARY KEY(organization_id,telegram_user_id)
);
