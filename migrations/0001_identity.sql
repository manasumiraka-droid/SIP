PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  timezone TEXT NOT NULL DEFAULT 'Asia/Makassar',
  settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','suspended')),
  last_login_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, email),
  UNIQUE(organization_id, id)
);
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK(code IN ('super_admin','admin','worship_coordinator','field_coordinator','servant','public_viewer')),
  name TEXT NOT NULL,
  system_managed INTEGER NOT NULL DEFAULT 1 CHECK(system_managed = 1)
);
CREATE TABLE permissions (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, description TEXT NOT NULL);
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY(role_id, permission_id)
);
CREATE TABLE user_roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id, user_id) REFERENCES users(organization_id, id),
  FOREIGN KEY(organization_id, granted_by) REFERENCES users(organization_id, id)
);
CREATE UNIQUE INDEX user_roles_active ON user_roles(organization_id, user_id, role_id) WHERE revoked_at IS NULL;
CREATE TABLE coordinator_scopes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('service','field')),
  scope_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT CHECK(ends_at IS NULL OR ends_at > starts_at),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id, user_id) REFERENCES users(organization_id, id)
);
CREATE INDEX scopes_actor ON coordinator_scopes(organization_id,user_id,scope_type,scope_id);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata_redacted_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_redacted_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id)
);
CREATE INDEX audit_org_time ON audit_logs(organization_id,created_at,id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit is append only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit retention requires reviewed maintenance migration'); END;

-- Fixed system catalog, not congregation/development seed data.
INSERT INTO roles(id,code,name) VALUES
 ('super_admin','super_admin','Super Admin'), ('admin','admin','Admin/Sekretariat'),
 ('worship_coordinator','worship_coordinator','Koordinator Ibadah'),
 ('field_coordinator','field_coordinator','Koordinator Bidang'), ('servant','servant','Pelayan'),
 ('public_viewer','public_viewer','Jemaat/publik (nonaktif)');
INSERT INTO permissions(id,code,description) VALUES
 ('user.read','user.read','Membaca identitas sesuai scope'),
 ('user.manage_role','user.manage_role','Mengelola role pengguna'),
 ('organization.read','organization.read','Membaca organisasi sesuai scope'),
 ('organization.update','organization.update','Memperbarui organisasi'),
 ('audit.read','audit.read','Membaca audit sesuai kebijakan');
INSERT INTO role_permissions SELECT 'super_admin',id FROM permissions;
INSERT INTO role_permissions VALUES
 ('admin','user.read'),('admin','organization.read'),('admin','audit.read'),
 ('worship_coordinator','user.read'),('worship_coordinator','organization.read'),
 ('field_coordinator','user.read'),('field_coordinator','organization.read'),('servant','user.read');
CREATE TRIGGER no_public_role BEFORE INSERT ON user_roles WHEN NEW.role_id = 'public_viewer'
 BEGIN SELECT RAISE(ABORT, 'Public access disabled for MVP'); END;
CREATE TRIGGER no_public_role_update BEFORE UPDATE OF role_id ON user_roles WHEN NEW.role_id = 'public_viewer'
 BEGIN SELECT RAISE(ABORT, 'Public access disabled for MVP'); END;
