-- Phase 4: Attendance and Performance Tracking
INSERT INTO permissions(id,code,description) VALUES
 ('attendance.record','attendance.record','Mencatat kehadiran dan check-in penugasan ibadah'),
 ('notes.manage','notes.manage','Membuat dan mengelola catatan pelayanan serta evaluasi'),
 ('reports.read','reports.read','Membaca rekapitulasi, analitik, dan laporan kinerja pelayanan'),
 ('reports.export','reports.export','Mengekspor laporan data pelayanan ke format CSV');

INSERT INTO role_permissions VALUES
 ('super_admin','attendance.record'),
 ('super_admin','notes.manage'),
 ('super_admin','reports.read'),
 ('super_admin','reports.export'),
 ('admin','attendance.record'),
 ('admin','notes.manage'),
 ('admin','reports.read'),
 ('admin','reports.export'),
 ('worship_coordinator','attendance.record'),
 ('worship_coordinator','notes.manage'),
 ('worship_coordinator','reports.read'),
 ('worship_coordinator','reports.export'),
 ('field_coordinator','attendance.record'),
 ('field_coordinator','notes.manage'),
 ('field_coordinator','reports.read'),
 ('field_coordinator','reports.export'),
 ('servant','reports.read');

CREATE TABLE attendance_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  service_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  servant_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','late','absent','replaced')),
  checkin_time TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,service_id) REFERENCES worship_services(organization_id,id),
  FOREIGN KEY(organization_id,assignment_id) REFERENCES assignments(organization_id,id),
  FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id),
  FOREIGN KEY(organization_id,recorded_by) REFERENCES users(organization_id,id),
  UNIQUE(organization_id,assignment_id),
  UNIQUE(organization_id,id)
);

CREATE INDEX attendance_records_service ON attendance_records(organization_id, service_id, status);
CREATE INDEX attendance_records_servant ON attendance_records(organization_id, servant_id, status);

CREATE TABLE service_notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  service_id TEXT,
  servant_id TEXT,
  category TEXT NOT NULL CHECK(category IN ('operational','subject_visible','restricted')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  content TEXT NOT NULL CHECK(length(trim(content)) >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,service_id) REFERENCES worship_services(organization_id,id),
  FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id),
  FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id),
  UNIQUE(organization_id,id)
);

CREATE INDEX service_notes_category ON service_notes(organization_id, category, created_at);
CREATE INDEX service_notes_service ON service_notes(organization_id, service_id);
CREATE INDEX service_notes_servant ON service_notes(organization_id, servant_id);

CREATE TABLE service_notes_acl (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  note_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,note_id) REFERENCES service_notes(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY(organization_id,user_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,granted_by) REFERENCES users(organization_id,id),
  UNIQUE(organization_id,note_id,user_id)
);
