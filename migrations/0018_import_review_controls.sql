-- Phase 1b completion: reviewed warnings, per-row time overrides, generic action receipts,
-- and durable summaries that allow 30-day staging cleanup.
ALTER TABLE import_rows ADD COLUMN override_starts_at TEXT;
ALTER TABLE import_rows ADD COLUMN warnings_acknowledged_at TEXT;
ALTER TABLE import_rows ADD COLUMN duplicate_service_id TEXT;

CREATE TABLE import_action_receipts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, import_row_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), created_at TEXT NOT NULL,
 UNIQUE(organization_id,actor_id,idempotency_key), FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
 FOREIGN KEY(organization_id,import_row_id) REFERENCES import_rows(organization_id,id)
);

CREATE TABLE import_batch_summaries (
 batch_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
 retained_until TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,batch_id) REFERENCES import_batches(organization_id,id)
);
CREATE INDEX import_batch_summaries_retention ON import_batch_summaries(organization_id,retained_until);
