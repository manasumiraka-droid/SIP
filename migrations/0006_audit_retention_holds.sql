CREATE TABLE audit_retention_holds (
  audit_log_id TEXT PRIMARY KEY REFERENCES audit_logs(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
  decision_owner TEXT NOT NULL CHECK(length(trim(decision_owner)) BETWEEN 1 AND 120),
  review_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX audit_retention_holds_review ON audit_retention_holds(organization_id,review_at);
