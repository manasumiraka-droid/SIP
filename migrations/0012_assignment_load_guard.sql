CREATE TRIGGER assignment_monthly_limit_insert BEFORE INSERT ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND EXISTS(
  SELECT 1 FROM servant_capabilities capability
  JOIN worship_services proposed ON proposed.organization_id=NEW.organization_id AND proposed.id=NEW.worship_service_id
  WHERE capability.organization_id=NEW.organization_id AND capability.servant_id=NEW.servant_id
    AND capability.service_role_id=NEW.service_role_id AND capability.monthly_assignment_limit IS NOT NULL
    AND (SELECT COUNT(*) FROM assignments existing JOIN worship_services scheduled ON scheduled.organization_id=existing.organization_id AND scheduled.id=existing.worship_service_id
      WHERE existing.organization_id=NEW.organization_id AND existing.servant_id=NEW.servant_id AND existing.service_role_id=NEW.service_role_id
        AND existing.status NOT IN ('cancelled','reassigned') AND substr(scheduled.starts_at,1,7)=substr(proposed.starts_at,1,7)) >= capability.monthly_assignment_limit
) BEGIN SELECT RAISE(ABORT,'Assignment monthly limit exceeded'); END;

CREATE TRIGGER assignment_monthly_limit_update BEFORE UPDATE OF status,servant_id,service_role_id,worship_service_id ON assignments
WHEN NEW.status NOT IN ('cancelled','reassigned') AND EXISTS(
  SELECT 1 FROM servant_capabilities capability
  JOIN worship_services proposed ON proposed.organization_id=NEW.organization_id AND proposed.id=NEW.worship_service_id
  WHERE capability.organization_id=NEW.organization_id AND capability.servant_id=NEW.servant_id
    AND capability.service_role_id=NEW.service_role_id AND capability.monthly_assignment_limit IS NOT NULL
    AND (SELECT COUNT(*) FROM assignments existing JOIN worship_services scheduled ON scheduled.organization_id=existing.organization_id AND scheduled.id=existing.worship_service_id
      WHERE existing.id<>NEW.id AND existing.organization_id=NEW.organization_id AND existing.servant_id=NEW.servant_id AND existing.service_role_id=NEW.service_role_id
        AND existing.status NOT IN ('cancelled','reassigned') AND substr(scheduled.starts_at,1,7)=substr(proposed.starts_at,1,7)) >= capability.monthly_assignment_limit
) BEGIN SELECT RAISE(ABORT,'Assignment monthly limit exceeded'); END;
