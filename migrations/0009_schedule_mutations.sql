-- Phase 1 mutation permissions and durable atomic request guards.
INSERT INTO permissions(id,code,description) VALUES
 ('service.create_update','service.create_update','Membuat atau memperbarui ibadah'),
 ('service.publish','service.publish','Menerbitkan ibadah'),
 ('service.change_status','service.change_status','Mengubah status ibadah'),
 ('assignment.read','assignment.read','Membaca penugasan sesuai scope'),
 ('assignment.create_update','assignment.create_update','Membuat atau memperbarui penugasan'),
 ('assignment.respond','assignment.respond','Merespons penugasan sendiri'),
 ('servant.read','servant.read','Membaca profil pelayan sesuai scope'),
 ('servant.create_update','servant.create_update','Membuat atau memperbarui profil pelayan'),
 ('servant.manage_capability','servant.manage_capability','Mengelola capability pelayan');
INSERT INTO role_permissions SELECT 'super_admin',id FROM permissions WHERE id LIKE 'service.%' OR id LIKE 'assignment.%' OR id LIKE 'servant.%';
INSERT INTO role_permissions VALUES
 ('admin','service.create_update'),('admin','service.publish'),('admin','service.change_status'),('admin','assignment.read'),('admin','assignment.create_update'),('admin','servant.read'),('admin','servant.create_update'),('admin','servant.manage_capability'),
 ('worship_coordinator','service.create_update'),('worship_coordinator','service.publish'),('worship_coordinator','service.change_status'),('worship_coordinator','assignment.read'),('worship_coordinator','assignment.create_update'),('worship_coordinator','servant.read'),('worship_coordinator','servant.manage_capability'),
 ('field_coordinator','assignment.read'),('field_coordinator','assignment.create_update'),('field_coordinator','servant.read'),('field_coordinator','servant.manage_capability'),
 ('servant','assignment.read'),('servant','assignment.respond'),('servant','servant.read'),('servant','servant.create_update');

CREATE TABLE worship_service_creations (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, worship_service_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), actor_authorized INTEGER NOT NULL,
  created_at TEXT NOT NULL, CONSTRAINT service_creation_actor_authorized CHECK(actor_authorized=1),
  UNIQUE(organization_id,actor_id,idempotency_key),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,worship_service_id) REFERENCES worship_services(organization_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE worship_service_status_changes (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, worship_service_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, requested_status TEXT NOT NULL, expected_version INTEGER NOT NULL, actual_version INTEGER NOT NULL,
  actor_authorized INTEGER NOT NULL, target_exists INTEGER NOT NULL, created_at TEXT NOT NULL,
  CONSTRAINT service_status_version_matches CHECK(expected_version=actual_version),
  CONSTRAINT service_status_actor_authorized CHECK(actor_authorized=1), CONSTRAINT service_status_target_exists CHECK(target_exists=1),
  UNIQUE(organization_id,actor_id,idempotency_key),
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,worship_service_id) REFERENCES worship_services(organization_id,id)
);
CREATE INDEX worship_service_creations_retention ON worship_service_creations(organization_id,created_at);
CREATE INDEX worship_service_status_changes_retention ON worship_service_status_changes(organization_id,created_at);
