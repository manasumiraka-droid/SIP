-- Phase 2 Telegram: all credentials stay in Worker secrets; only hashed
-- activation values and opaque callback nonces are persisted.
CREATE TABLE telegram_activation_codes (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, servant_id TEXT NOT NULL,
 code_hash TEXT NOT NULL CHECK(length(code_hash)=64), expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), consumed_at TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id)
);
CREATE UNIQUE INDEX telegram_activation_active ON telegram_activation_codes(organization_id,servant_id) WHERE consumed_at IS NULL;
CREATE INDEX telegram_activation_lookup ON telegram_activation_codes(code_hash,expires_at);

CREATE TABLE telegram_callback_grants (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, servant_id TEXT NOT NULL, assignment_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('accept','unavailable')), nonce_hash TEXT NOT NULL CHECK(length(nonce_hash)=64),
 expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id),
 FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id),
 UNIQUE(organization_id,nonce_hash)
);
CREATE INDEX telegram_callback_due ON telegram_callback_grants(organization_id,assignment_id,expires_at);

CREATE TABLE telegram_notification_intents (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, servant_id TEXT NOT NULL, assignment_id TEXT,
 event_type TEXT NOT NULL CHECK(event_type IN ('assignment_confirmation','assignment_reminder','critical_reminder')),
 idempotency_key TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted_by_api','failed','cancelled')),
 attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3), last_error_category TEXT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id),
 FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id),
 UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX telegram_notification_due ON telegram_notification_intents(organization_id,status,due_at);

CREATE TABLE telegram_webhook_updates (
 organization_id TEXT NOT NULL, update_id TEXT NOT NULL, received_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,update_id)
);
CREATE TABLE telegram_emergency_reports (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, assignment_id TEXT NOT NULL, servant_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id),
 FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id)
);
CREATE INDEX telegram_emergency_open ON telegram_emergency_reports(organization_id,assignment_id,status);
