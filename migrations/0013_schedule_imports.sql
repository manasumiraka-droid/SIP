-- Phase 1b: local, staged XLSX schedule imports. Raw file bytes are never stored in D1.
INSERT INTO permissions(id,code,description) VALUES ('import.schedule','import.schedule','Mengimpor jadwal awal dari XLSX');
INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','import.schedule');
INSERT INTO role_permissions SELECT 'super_admin','import.schedule' WHERE NOT EXISTS(SELECT 1 FROM role_permissions WHERE role_id='super_admin' AND permission_id='import.schedule');

CREATE TABLE import_batches (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), uploaded_by TEXT NOT NULL,
 original_filename TEXT NOT NULL CHECK(length(original_filename)<=180), checksum TEXT NOT NULL CHECK(length(checksum)=64), sheet_name TEXT,
 mapping_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(mapping_json)), date_format TEXT CHECK(date_format IN ('dmy','mdy')),
 timezone TEXT NOT NULL DEFAULT 'Asia/Makassar', status TEXT NOT NULL CHECK(status IN ('uploaded','validating','needs_review','ready','committing','committed','failed','rolled_back','expired')),
 expires_at TEXT NOT NULL, committed_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,uploaded_by) REFERENCES users(organization_id,id), UNIQUE(organization_id,id)
);
CREATE INDEX import_batches_access ON import_batches(organization_id,uploaded_by,status,created_at);
CREATE TABLE import_rows (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES import_batches(id), organization_id TEXT NOT NULL, row_number INTEGER NOT NULL CHECK(row_number BETWEEN 1 AND 5001), source_number TEXT,
 raw_json TEXT NOT NULL CHECK(json_valid(raw_json)), normalized_json TEXT NOT NULL CHECK(json_valid(normalized_json)), status TEXT NOT NULL CHECK(status IN ('valid','warning','error','excluded','committed','skipped')),
 proposed_action TEXT NOT NULL CHECK(proposed_action IN ('create','skip','merge_assignments','create_separate')), error_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(error_codes_json)), warning_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(warning_codes_json)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(batch_id,row_number), UNIQUE(organization_id,id), FOREIGN KEY(organization_id,batch_id) REFERENCES import_batches(organization_id,id)
);
CREATE INDEX import_rows_preview ON import_rows(batch_id,status,row_number);
CREATE TABLE import_resolutions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, import_row_id TEXT NOT NULL, field_name TEXT NOT NULL CHECK(field_name IN ('preacher','mc','offering','location','duplicate')),
 resolution_type TEXT NOT NULL CHECK(resolution_type IN ('link_existing','create_pending_review','exclude','skip','merge_assignments','create_separate')),
 target_entity_id TEXT, resolved_by TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,import_row_id) REFERENCES import_rows(organization_id,id), FOREIGN KEY(organization_id,resolved_by) REFERENCES users(organization_id,id), UNIQUE(import_row_id,field_name)
);
CREATE TABLE import_results (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, import_row_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('created','skipped','merged','voided')),
 rollback_status TEXT NOT NULL DEFAULT 'available' CHECK(rollback_status IN ('available','voided','blocked')), created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,import_row_id) REFERENCES import_rows(organization_id,id), UNIQUE(import_row_id,entity_type,entity_id)
);
ALTER TABLE assignments ADD COLUMN source_import_row_id TEXT REFERENCES import_rows(id);
CREATE TABLE import_commit_receipts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL, batch_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), created_at TEXT NOT NULL,
 UNIQUE(organization_id,actor_id,idempotency_key), FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id), FOREIGN KEY(organization_id,batch_id) REFERENCES import_batches(organization_id,id)
);
