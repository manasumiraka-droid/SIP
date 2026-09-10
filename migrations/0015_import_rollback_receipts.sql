CREATE TABLE import_rollback_receipts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, batch_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(organization_id,actor_id,idempotency_key), FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id), FOREIGN KEY(organization_id,batch_id) REFERENCES import_batches(organization_id,id)
);
