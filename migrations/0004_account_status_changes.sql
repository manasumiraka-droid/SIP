CREATE TABLE account_status_changes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  requested_status TEXT NOT NULL CHECK(requested_status IN ('active','inactive','suspended')),
  expected_version INTEGER NOT NULL,
  actual_version INTEGER NOT NULL,
  actor_authorized INTEGER NOT NULL,
  target_exists INTEGER NOT NULL,
  preserves_admin INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT status_actor_authorized CHECK(actor_authorized = 1),
  CONSTRAINT status_target_exists CHECK(target_exists = 1),
  CONSTRAINT status_version_matches CHECK(expected_version = actual_version),
  CONSTRAINT status_preserves_admin CHECK(preserves_admin = 1),
  UNIQUE(organization_id, actor_id, idempotency_key),
  FOREIGN KEY(organization_id, actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id, user_id) REFERENCES users(organization_id,id)
);
CREATE INDEX account_status_changes_retention ON account_status_changes(created_at);
