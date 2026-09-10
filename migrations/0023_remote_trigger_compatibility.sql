-- Keep trigger bodies to one statement for Cloudflare D1 remote migration compatibility.
DROP TRIGGER IF EXISTS capability_active_requires_designated_approver_insert;
DROP TRIGGER IF EXISTS capability_active_requires_designated_approver_update;
DROP TRIGGER IF EXISTS coordinator_scope_target_insert;
DROP TRIGGER IF EXISTS coordinator_scope_target_update;
DROP TRIGGER IF EXISTS assignment_integrity_insert;
DROP TRIGGER IF EXISTS assignment_integrity_update;

CREATE TRIGGER capability_active_requires_designated_approver_insert BEFORE INSERT ON servant_capabilities
WHEN NEW.status='active' AND NOT EXISTS(SELECT 1 FROM capability_approvers WHERE organization_id=NEW.organization_id AND service_role_id=NEW.service_role_id AND user_id=NEW.approved_by AND active=1)
BEGIN SELECT RAISE(ABORT,'Capability approver not designated'); END;
CREATE TRIGGER capability_active_requires_designated_approver_update BEFORE UPDATE OF status,approved_by,service_role_id,organization_id ON servant_capabilities
WHEN NEW.status='active' AND NOT EXISTS(SELECT 1 FROM capability_approvers WHERE organization_id=NEW.organization_id AND service_role_id=NEW.service_role_id AND user_id=NEW.approved_by AND active=1)
BEGIN SELECT RAISE(ABORT,'Capability approver not designated'); END;

CREATE TRIGGER coordinator_service_scope_target_insert BEFORE INSERT ON coordinator_scopes
WHEN NEW.scope_type='service' AND NOT EXISTS(SELECT 1 FROM worship_services WHERE organization_id=NEW.organization_id AND id=NEW.scope_id)
BEGIN SELECT RAISE(ABORT,'Coordinator service scope target mismatch'); END;
CREATE TRIGGER coordinator_field_scope_target_insert BEFORE INSERT ON coordinator_scopes
WHEN NEW.scope_type='field' AND NOT EXISTS(SELECT 1 FROM service_fields WHERE organization_id=NEW.organization_id AND id=NEW.scope_id)
BEGIN SELECT RAISE(ABORT,'Coordinator field scope target mismatch'); END;
CREATE TRIGGER coordinator_service_scope_target_update BEFORE UPDATE OF organization_id,scope_type,scope_id ON coordinator_scopes
WHEN NEW.scope_type='service' AND NOT EXISTS(SELECT 1 FROM worship_services WHERE organization_id=NEW.organization_id AND id=NEW.scope_id)
BEGIN SELECT RAISE(ABORT,'Coordinator service scope target mismatch'); END;
CREATE TRIGGER coordinator_field_scope_target_update BEFORE UPDATE OF organization_id,scope_type,scope_id ON coordinator_scopes
WHEN NEW.scope_type='field' AND NOT EXISTS(SELECT 1 FROM service_fields WHERE organization_id=NEW.organization_id AND id=NEW.scope_id)
BEGIN SELECT RAISE(ABORT,'Coordinator field scope target mismatch'); END;

CREATE TRIGGER assignment_servant_active_insert BEFORE INSERT ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND NOT EXISTS(SELECT 1 FROM servants WHERE organization_id=NEW.organization_id AND id=NEW.servant_id AND status='active')
BEGIN SELECT RAISE(ABORT,'Assignment servant inactive'); END;
CREATE TRIGGER assignment_capability_approved_insert BEFORE INSERT ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND NOT EXISTS(SELECT 1 FROM servant_capabilities WHERE organization_id=NEW.organization_id AND servant_id=NEW.servant_id AND service_role_id=NEW.service_role_id AND status='active')
BEGIN SELECT RAISE(ABORT,'Assignment capability unapproved'); END;
CREATE TRIGGER assignment_availability_clear_insert BEFORE INSERT ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND EXISTS(SELECT 1 FROM availability_blocks b JOIN worship_services s ON s.organization_id=NEW.organization_id AND s.id=NEW.worship_service_id WHERE b.organization_id=NEW.organization_id AND b.servant_id=NEW.servant_id AND b.starts_at<s.ends_at AND b.ends_at>s.assembly_at)
BEGIN SELECT RAISE(ABORT,'Assignment availability conflict'); END;
CREATE TRIGGER assignment_schedule_clear_insert BEFORE INSERT ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND EXISTS(SELECT 1 FROM assignments a JOIN worship_services existing ON existing.organization_id=a.organization_id AND existing.id=a.worship_service_id JOIN worship_services proposed ON proposed.organization_id=NEW.organization_id AND proposed.id=NEW.worship_service_id WHERE a.organization_id=NEW.organization_id AND a.servant_id=NEW.servant_id AND a.status NOT IN ('cancelled','reassigned') AND existing.assembly_at<proposed.ends_at AND existing.ends_at>proposed.assembly_at)
BEGIN SELECT RAISE(ABORT,'Assignment schedule conflict'); END;

CREATE TRIGGER assignment_servant_active_update BEFORE UPDATE OF status,servant_id,service_role_id,worship_service_id,organization_id ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND NOT EXISTS(SELECT 1 FROM servants WHERE organization_id=NEW.organization_id AND id=NEW.servant_id AND status='active')
BEGIN SELECT RAISE(ABORT,'Assignment servant inactive'); END;
CREATE TRIGGER assignment_capability_approved_update BEFORE UPDATE OF status,servant_id,service_role_id,worship_service_id,organization_id ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND NOT EXISTS(SELECT 1 FROM servant_capabilities WHERE organization_id=NEW.organization_id AND servant_id=NEW.servant_id AND service_role_id=NEW.service_role_id AND status='active')
BEGIN SELECT RAISE(ABORT,'Assignment capability unapproved'); END;
CREATE TRIGGER assignment_availability_clear_update BEFORE UPDATE OF status,servant_id,service_role_id,worship_service_id,organization_id ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND EXISTS(SELECT 1 FROM availability_blocks b JOIN worship_services s ON s.organization_id=NEW.organization_id AND s.id=NEW.worship_service_id WHERE b.organization_id=NEW.organization_id AND b.servant_id=NEW.servant_id AND b.starts_at<s.ends_at AND b.ends_at>s.assembly_at)
BEGIN SELECT RAISE(ABORT,'Assignment availability conflict'); END;
CREATE TRIGGER assignment_schedule_clear_update BEFORE UPDATE OF status,servant_id,service_role_id,worship_service_id,organization_id ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND EXISTS(SELECT 1 FROM assignments a JOIN worship_services existing ON existing.organization_id=a.organization_id AND existing.id=a.worship_service_id JOIN worship_services proposed ON proposed.organization_id=NEW.organization_id AND proposed.id=NEW.worship_service_id WHERE a.id<>NEW.id AND a.organization_id=NEW.organization_id AND a.servant_id=NEW.servant_id AND a.status NOT IN ('cancelled','reassigned') AND existing.assembly_at<proposed.ends_at AND existing.ends_at>proposed.assembly_at)
BEGIN SELECT RAISE(ABORT,'Assignment schedule conflict'); END;
