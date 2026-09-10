CREATE TABLE bootstrap_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  organization_id TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  initialized_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES organizations(id) DEFERRABLE INITIALLY DEFERRED
);
