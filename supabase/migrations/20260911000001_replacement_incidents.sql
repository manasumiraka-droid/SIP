begin;

create table if not exists replacement_cases (
  id text primary key,
  organization_id text not null,
  service_id text not null,
  assignment_id text not null,
  service_role_id text not null,
  status text not null default 'open' check(status in ('open','resolved','escalated_manual','cancelled')),
  urgency text not null default 'standard' check(urgency in ('standard','critical')),
  reason text not null,
  resolved_assignment_id text,
  resolved_by text,
  resolved_at text,
  created_by text,
  created_at text not null,
  updated_at text not null,
  foreign key(organization_id,service_id) references worship_services(organization_id,id),
  foreign key(organization_id,assignment_id) references assignments(organization_id,id),
  foreign key(organization_id,service_role_id) references service_roles(organization_id,id),
  foreign key(organization_id,resolved_assignment_id) references assignments(organization_id,id),
  foreign key(organization_id,resolved_by) references users(organization_id,id),
  foreign key(organization_id,created_by) references users(organization_id,id),
  unique(organization_id,id)
);

create unique index if not exists replacement_cases_one_open on replacement_cases(organization_id, assignment_id) where status='open';
create index if not exists replacement_cases_lookup on replacement_cases(organization_id, status, urgency, created_at);
create index if not exists replacement_cases_service on replacement_cases(organization_id, service_id, status);

create table if not exists replacement_resolutions (
  id text primary key,
  organization_id text not null,
  case_id text not null,
  actor_id text not null,
  idempotency_key text not null,
  payload_hash text not null check(length(payload_hash)=64),
  created_at text not null,
  foreign key(organization_id,case_id) references replacement_cases(organization_id,id),
  foreign key(organization_id,actor_id) references users(organization_id,id),
  unique(organization_id,actor_id,idempotency_key)
);

insert into permissions(id,code,description) values
  ('incident.read_manage','incident.read_manage','Membaca dan mengelola insiden pelayanan'),
  ('replacement.manage','replacement.manage','Mengelola alur dan pengesahan pengganti')
on conflict (id) do nothing;

insert into role_permissions (role_id, permission_id) values
  ('super_admin','incident.read_manage'),
  ('super_admin','replacement.manage'),
  ('admin','incident.read_manage'),
  ('admin','replacement.manage'),
  ('worship_coordinator','incident.read_manage'),
  ('worship_coordinator','replacement.manage'),
  ('field_coordinator','incident.read_manage'),
  ('field_coordinator','replacement.manage'),
  ('servant','incident.read_manage'),
  ('servant','replacement.manage')
on conflict (role_id, permission_id) do nothing;

commit;
