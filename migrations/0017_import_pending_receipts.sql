CREATE TABLE import_pending_receipts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, import_row_id TEXT NOT NULL,
 field_name TEXT NOT NULL CHECK(field_name IN ('preacher','mc')), servant_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(organization_id,actor_id,idempotency_key), FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
 FOREIGN KEY(organization_id,import_row_id) REFERENCES import_rows(organization_id,id), FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id)
);
