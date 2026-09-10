-- Durable request receipts and atomic guards for role replacement.
CREATE TABLE role_changes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  roles_json TEXT NOT NULL CHECK(json_valid(roles_json)),
  expected_version INTEGER NOT NULL,
  actual_version INTEGER NOT NULL,
  actor_authorized INTEGER NOT NULL,
  target_exists INTEGER NOT NULL,
  preserves_admin INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT role_actor_authorized CHECK(actor_authorized = 1),
  CONSTRAINT role_target_exists CHECK(target_exists = 1),
  CONSTRAINT role_version_matches CHECK(expected_version = actual_version),
  CONSTRAINT role_preserves_admin CHECK(preserves_admin = 1),
  UNIQUE(organization_id,actor_id,idempotency_key),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,user_id) REFERENCES users(organization_id,id)
);
CREATE INDEX role_changes_retention ON role_changes(created_at);
