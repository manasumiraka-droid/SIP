-- Phase 3: Incident & Urgent Replacement Workflow
INSERT INTO permissions(id,code,description) VALUES
 ('incident.read_manage','incident.read_manage','Membaca dan mengelola insiden pelayanan'),
 ('replacement.manage','replacement.manage','Mengelola alur dan pengesahan pengganti');

INSERT INTO role_permissions VALUES
 ('super_admin','incident.read_manage'),
 ('super_admin','replacement.manage'),
 ('admin','incident.read_manage'),
 ('admin','replacement.manage'),
 ('worship_coordinator','incident.read_manage'),
 ('worship_coordinator','replacement.manage'),
 ('field_coordinator','incident.read_manage'),
 ('field_coordinator','replacement.manage'),
 ('servant','incident.read_manage'),
 ('servant','replacement.manage');

CREATE TABLE replacement_cases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  service_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  service_role_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','escalated_manual','cancelled')),
  urgency TEXT NOT NULL DEFAULT 'standard' CHECK(urgency IN ('standard','critical')),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 255),
  resolved_assignment_id TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,service_id) REFERENCES worship_services(organization_id,id),
  FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id),
  FOREIGN KEY(organization_id,service_role_id) REFERENCES service_roles(organization_id,id),
  FOREIGN KEY(organization_id,resolved_assignment_id) REFERENCES assignments(organization_id,id),
  FOREIGN KEY(organization_id,resolved_by) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id),
  UNIQUE(organization_id,id)
);

CREATE UNIQUE INDEX replacement_cases_one_open
ON replacement_cases(organization_id, assignment_id)
WHERE status='open';

CREATE INDEX replacement_cases_lookup
ON replacement_cases(organization_id, status, urgency, created_at);

CREATE INDEX replacement_cases_service
ON replacement_cases(organization_id, service_id, status);

CREATE TABLE replacement_resolutions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,case_id) REFERENCES replacement_cases(organization_id,id),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
  UNIQUE(organization_id,actor_id,idempotency_key)
);
