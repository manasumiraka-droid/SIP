-- Complete Phase 1 fields through additive changes only.
ALTER TABLE service_roles ADD COLUMN criticality TEXT NOT NULL DEFAULT 'normal' CHECK(criticality IN ('normal','critical'));
ALTER TABLE servants ADD COLUMN telegram_user_id TEXT;
ALTER TABLE availability_blocks ADD COLUMN block_type TEXT NOT NULL DEFAULT 'unavailable' CHECK(block_type IN ('unavailable','preference'));
ALTER TABLE worship_services ADD COLUMN title TEXT;
ALTER TABLE worship_services ADD COLUMN published_at TEXT;
ALTER TABLE worship_services ADD COLUMN rescheduled_from_json TEXT CHECK(rescheduled_from_json IS NULL OR json_valid(rescheduled_from_json));
ALTER TABLE assignments ADD COLUMN slot_number INTEGER NOT NULL DEFAULT 1 CHECK(slot_number BETWEEN 1 AND 99);
ALTER TABLE assignments ADD COLUMN confirmed_at TEXT;
ALTER TABLE servant_capabilities ADD COLUMN monthly_assignment_limit INTEGER CHECK(monthly_assignment_limit IS NULL OR monthly_assignment_limit BETWEEN 1 AND 99);
CREATE UNIQUE INDEX servants_telegram_user_unique ON servants(organization_id,telegram_user_id) WHERE telegram_user_id IS NOT NULL;
DROP INDEX assignments_active_slot;
CREATE UNIQUE INDEX assignments_active_slot_number ON assignments(organization_id,worship_service_id,service_role_id,slot_number) WHERE status NOT IN ('cancelled','reassigned');

CREATE TABLE operational_mutation_receipts (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  action TEXT NOT NULL, entity_id TEXT NOT NULL, payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), actor_authorized INTEGER NOT NULL,
  created_at TEXT NOT NULL, CONSTRAINT operational_actor_authorized CHECK(actor_authorized=1),
  UNIQUE(organization_id,actor_id,idempotency_key),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id)
);
CREATE INDEX operational_receipts_retention ON operational_mutation_receipts(organization_id,created_at);
