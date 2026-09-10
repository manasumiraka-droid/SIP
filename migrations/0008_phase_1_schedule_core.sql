-- Phase 1 schedule core. This migration is additive: Phase 0 identity/audit rows remain untouched.
CREATE TABLE service_fields (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 64), name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,code), UNIQUE(organization_id,id)
);
CREATE TABLE service_roles (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), field_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 64), name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  slots_required INTEGER NOT NULL DEFAULT 1 CHECK(slots_required BETWEEN 1 AND 99), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,field_id) REFERENCES service_fields(organization_id,id), UNIQUE(organization_id,code), UNIQUE(organization_id,id)
);
CREATE TABLE servants (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), user_id TEXT,
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 120), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','pending_review')),
  telegram_chat_id TEXT, is_backup INTEGER NOT NULL DEFAULT 0 CHECK(is_backup IN (0,1)), administrative_note TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,user_id) REFERENCES users(organization_id,id), UNIQUE(organization_id,id), UNIQUE(organization_id,user_id), UNIQUE(organization_id,telegram_chat_id)
);
CREATE TABLE servant_capabilities (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), servant_id TEXT NOT NULL, service_role_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','pending_approval')), approved_by TEXT, approved_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id), FOREIGN KEY(organization_id,service_role_id) REFERENCES service_roles(organization_id,id),
  FOREIGN KEY(organization_id,approved_by) REFERENCES users(organization_id,id),
  CHECK((status='active' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status<>'active'), UNIQUE(organization_id,servant_id,service_role_id)
);
CREATE TABLE capability_approvers (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), service_role_id TEXT NOT NULL, user_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,service_role_id) REFERENCES service_roles(organization_id,id), FOREIGN KEY(organization_id,user_id) REFERENCES users(organization_id,id), UNIQUE(organization_id,service_role_id,user_id)
);
CREATE TABLE availability_blocks (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), servant_id TEXT NOT NULL,
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL CHECK(ends_at>starts_at), note_private TEXT, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id), UNIQUE(organization_id,id)
);
CREATE TABLE worship_services (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  starts_at TEXT NOT NULL, assembly_at TEXT NOT NULL CHECK(assembly_at<=starts_at), ends_at TEXT NOT NULL CHECK(ends_at>starts_at), location TEXT NOT NULL CHECK(length(trim(location)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','completed','postponed','cancelled')), theme TEXT, notes TEXT, cancellation_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK((status<>'cancelled') OR cancellation_reason IS NOT NULL), UNIQUE(organization_id,id)
);
CREATE TABLE assignments (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), worship_service_id TEXT NOT NULL, service_role_id TEXT NOT NULL, servant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_confirmation','accepted','unavailable','needs_replacement','reassigned','absent','completed','cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,worship_service_id) REFERENCES worship_services(organization_id,id), FOREIGN KEY(organization_id,service_role_id) REFERENCES service_roles(organization_id,id), FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id), UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX assignments_active_slot ON assignments(organization_id,worship_service_id,service_role_id,servant_id) WHERE status NOT IN ('cancelled','reassigned');
CREATE INDEX services_org_time ON worship_services(organization_id,starts_at,id);
CREATE INDEX assignments_org_servant_status ON assignments(organization_id,servant_id,status,id);
CREATE INDEX availability_org_servant_time ON availability_blocks(organization_id,servant_id,starts_at,ends_at);
