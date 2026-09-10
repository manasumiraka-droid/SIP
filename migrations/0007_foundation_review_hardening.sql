-- Findings from the Phase 0 schema review.
CREATE INDEX role_changes_org_retention
  ON role_changes(organization_id,created_at);
CREATE INDEX user_creations_org_retention
  ON user_creations(organization_id,created_at);
CREATE INDEX account_status_changes_org_retention
  ON account_status_changes(organization_id,created_at);

CREATE TRIGGER account_status_requires_transition
BEFORE INSERT ON account_status_changes
WHEN EXISTS(
  SELECT 1 FROM users
  WHERE organization_id=NEW.organization_id
    AND id=NEW.user_id
    AND status=NEW.requested_status
)
BEGIN
  SELECT RAISE(ABORT, 'Account status transition must change status');
END;

CREATE TRIGGER retention_hold_same_organization_insert
BEFORE INSERT ON audit_retention_holds
WHEN NOT EXISTS(
  SELECT 1 FROM audit_logs
  WHERE id=NEW.audit_log_id AND organization_id=NEW.organization_id
)
BEGIN
  SELECT RAISE(ABORT, 'Retention hold audit organization mismatch');
END;

CREATE TRIGGER retention_hold_same_organization_update
BEFORE UPDATE OF audit_log_id,organization_id ON audit_retention_holds
WHEN NOT EXISTS(
  SELECT 1 FROM audit_logs
  WHERE id=NEW.audit_log_id AND organization_id=NEW.organization_id
)
BEGIN
  SELECT RAISE(ABORT, 'Retention hold audit organization mismatch');
END;
