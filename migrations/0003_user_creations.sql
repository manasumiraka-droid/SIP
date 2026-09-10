CREATE TABLE user_creations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  actor_authorized INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT creation_actor_authorized CHECK(actor_authorized = 1),
  UNIQUE(organization_id, actor_id, idempotency_key),
  FOREIGN KEY(organization_id, actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id, user_id) REFERENCES users(organization_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX user_creations_retention ON user_creations(created_at);
