begin;

insert into permissions(id,code,description) values
  ('attendance.record','attendance.record','Mencatat kehadiran dan check-in penugasan ibadah'),
  ('notes.manage','notes.manage','Membuat dan mengelola catatan pelayanan serta evaluasi'),
  ('reports.read','reports.read','Membaca rekapitulasi, analitik, dan laporan kinerja pelayanan'),
  ('reports.export','reports.export','Mengekspor laporan data pelayanan ke format CSV')
on conflict (id) do nothing;

insert into role_permissions (role_id, permission_id) values
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
  ('servant','reports.read')
on conflict (role_id, permission_id) do nothing;

create table if not exists attendance_records (
  id text primary key,
  organization_id text not null references organizations(id),
  service_id text not null,
  assignment_id text not null,
  servant_id text not null,
  status text not null check(status in ('present','late','absent','replaced')),
  checkin_time text,
  notes text,
  recorded_by text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(organization_id,service_id) references worship_services(organization_id,id),
  foreign key(organization_id,assignment_id) references assignments(organization_id,id),
  foreign key(organization_id,servant_id) references servants(organization_id,id),
  foreign key(organization_id,recorded_by) references users(organization_id,id),
  unique(organization_id,assignment_id),
  unique(organization_id,id)
);

create index if not exists attendance_records_service on attendance_records(organization_id, service_id, status);
create index if not exists attendance_records_servant on attendance_records(organization_id, servant_id, status);

create table if not exists service_notes (
  id text primary key,
  organization_id text not null references organizations(id),
  service_id text,
  servant_id text,
  category text not null check(category in ('operational','subject_visible','restricted')),
  title text not null check(length(trim(title)) between 1 and 160),
  content text not null check(length(trim(content)) >= 1),
  created_by text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(organization_id,service_id) references worship_services(organization_id,id),
  foreign key(organization_id,servant_id) references servants(organization_id,id),
  foreign key(organization_id,created_by) references users(organization_id,id),
  unique(organization_id,id)
);

create index if not exists service_notes_category on service_notes(organization_id, category, created_at);
create index if not exists service_notes_service on service_notes(organization_id, service_id);
create index if not exists service_notes_servant on service_notes(organization_id, servant_id);

create table if not exists service_notes_acl (
  id text primary key,
  organization_id text not null references organizations(id),
  note_id text not null,
  user_id text not null,
  granted_by text not null,
  created_at text not null,
  foreign key(organization_id,note_id) references service_notes(organization_id,id) on delete cascade,
  foreign key(organization_id,user_id) references users(organization_id,id),
  foreign key(organization_id,granted_by) references users(organization_id,id),
  unique(organization_id,note_id,user_id)
);

commit;
