CREATE TABLE assignment_creations (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, assignment_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), actor_authorized INTEGER NOT NULL,
  created_at TEXT NOT NULL, CONSTRAINT assignment_creation_actor_authorized CHECK(actor_authorized=1),
  UNIQUE(organization_id,actor_id,idempotency_key),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE assignment_status_changes (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, assignment_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, requested_status TEXT NOT NULL, expected_version INTEGER NOT NULL, actual_version INTEGER NOT NULL,
  actor_authorized INTEGER NOT NULL, target_exists INTEGER NOT NULL, created_at TEXT NOT NULL,
  CONSTRAINT assignment_status_version_matches CHECK(expected_version=actual_version),
  CONSTRAINT assignment_status_actor_authorized CHECK(actor_authorized=1), CONSTRAINT assignment_status_target_exists CHECK(target_exists=1),
  UNIQUE(organization_id,actor_id,idempotency_key),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id)
);
CREATE INDEX assignment_creations_retention ON assignment_creations(organization_id,created_at);
CREATE INDEX assignment_status_changes_retention ON assignment_status_changes(organization_id,created_at);
