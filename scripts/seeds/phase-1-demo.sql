-- Synthetic local-only data. Never use this file for preview or production.
PRAGMA foreign_keys = ON;
INSERT OR IGNORE INTO organizations(id,name,timezone,settings_json,version,created_at,updated_at) VALUES('local-demo','Jemaat Demo Lokal','Asia/Makassar','{}',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO users(id,organization_id,email,display_name,status,version,created_at,updated_at) VALUES('demo-admin','local-demo','demo-admin@example.invalid','Maria Demo','active',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,version,created_at,updated_at) VALUES('demo-admin-role','local-demo','demo-admin','super_admin','demo-admin','2026-09-09T00:00:00Z',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO service_fields(id,organization_id,code,name,active,version,created_at,updated_at) VALUES
 ('demo-field-word','local-demo','word','Firman dan Liturgi',1,1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-field-media','local-demo','media','Multimedia',1,1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO service_roles(id,organization_id,field_id,code,name,slots_required,active,version,created_at,updated_at) VALUES
 ('demo-role-preacher','local-demo','demo-field-word','preacher','Pelayan Firman',1,1,1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-role-mc','local-demo','demo-field-word','mc','MC',1,1,1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-role-operator','local-demo','demo-field-media','operator','Operator Multimedia',1,1,1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO servants(id,organization_id,display_name,status,is_backup,version,created_at,updated_at) VALUES
 ('demo-servant-johan','local-demo','Johan Demo','active',0,1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-servant-rina','local-demo','Rina Demo','active',1,1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO capability_approvers(id,organization_id,service_role_id,user_id,active,created_at,updated_at) VALUES
 ('demo-approver-preacher','local-demo','demo-role-preacher','demo-admin',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-approver-mc','local-demo','demo-role-mc','demo-admin',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-approver-operator','local-demo','demo-role-operator','demo-admin',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,version,created_at,updated_at) VALUES
 ('demo-cap-johan-operator','local-demo','demo-servant-johan','demo-role-operator','active','demo-admin','2026-09-09T00:00:00Z',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-cap-rina-mc','local-demo','demo-servant-rina','demo-role-mc','active','demo-admin','2026-09-09T00:00:00Z',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT OR IGNORE INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,theme,version,created_at,updated_at) VALUES
 ('demo-service-sunday','local-demo','2026-09-14T08:00:00Z','2026-09-14T09:00:00Z','2026-09-14T11:00:00Z','Ruang Utama','scheduled','Ibadah Minggu Raya',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'),
 ('demo-service-midweek','local-demo','2026-09-17T10:30:00Z','2026-09-17T11:00:00Z','2026-09-17T12:30:00Z','Kapel','draft','Doa Tengah Minggu',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z');
INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,version,created_at,updated_at)
 SELECT 'demo-assignment-operator','local-demo','demo-service-sunday','demo-role-operator','demo-servant-johan','awaiting_confirmation',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'
 WHERE NOT EXISTS(SELECT 1 FROM assignments WHERE organization_id='local-demo' AND id='demo-assignment-operator');
INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,version,created_at,updated_at)
 SELECT 'demo-assignment-mc','local-demo','demo-service-sunday','demo-role-mc','demo-servant-rina','accepted',1,'2026-09-09T00:00:00Z','2026-09-09T00:00:00Z'
 WHERE NOT EXISTS(SELECT 1 FROM assignments WHERE organization_id='local-demo' AND id='demo-assignment-mc');
INSERT OR IGNORE INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES('demo-seed-audit','local-demo','system',NULL,'local.demo.seed','organization','local-demo','local-demo-seed','{}','2026-09-09T00:00:00Z');
