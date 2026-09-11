/* global console */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import process from "node:process";

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL is required.");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

const orgId = "spi-preview";
const now = new Date().toISOString();

console.log("Seeding preview database for org:", orgId);

try {
  await client.query("BEGIN");

  // 1. Service Fields
  const fields = [
    { id: "field-word", code: "word", name: "Firman dan Liturgi" },
    { id: "field-music", code: "music", name: "Musik dan Pujian" },
    { id: "field-media", code: "media", name: "Multimedia dan Sound" },
    { id: "field-usher", code: "usher", name: "Kolektan dan Penyambut" },
  ];

  for (const f of fields) {
    await client.query(
      `INSERT INTO service_fields (id, organization_id, code, name, active, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, 1, $5, $5)
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, updated_at = $5`,
      [f.id, orgId, f.code, f.name, now],
    );
  }

  // 2. Service Roles
  const roles = [
    {
      id: "role-preacher",
      fieldId: "field-word",
      code: "preacher",
      name: "Pelayan Firman",
      slots: 1,
    },
    {
      id: "role-mc",
      fieldId: "field-word",
      code: "mc",
      name: "Pemimpin Pujian (MC)",
      slots: 1,
    },
    {
      id: "role-singer",
      fieldId: "field-music",
      code: "singer",
      name: "Penyanyi (Singer)",
      slots: 2,
    },
    {
      id: "role-pianist",
      fieldId: "field-music",
      code: "pianist",
      name: "Pemain Keyboard / Piano",
      slots: 1,
    },
    {
      id: "role-operator",
      fieldId: "field-media",
      code: "operator",
      name: "Operator Multimedia",
      slots: 1,
    },
    {
      id: "role-sound",
      fieldId: "field-media",
      code: "sound",
      name: "Operator Sound System",
      slots: 1,
    },
    {
      id: "role-usher",
      fieldId: "field-usher",
      code: "usher",
      name: "Pelayan Pintu & Kolektan",
      slots: 2,
    },
  ];

  for (const r of roles) {
    await client.query(
      `INSERT INTO service_roles (id, organization_id, field_id, code, name, slots_required, active, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 1, $7, $7)
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, slots_required = EXCLUDED.slots_required, updated_at = $7`,
      [r.id, orgId, r.fieldId, r.code, r.name, r.slots, now],
    );
  }

  // 3. Additional Users for Personas
  const users = [
    {
      id: "preview-coord-worship",
      email: "budi.ibadah@spi-preview.invalid",
      name: "Budi Santoso",
      role: "worship_coordinator",
    },
    {
      id: "preview-coord-media",
      email: "siti.media@spi-preview.invalid",
      name: "Siti Rahma",
      role: "field_coordinator",
    },
    {
      id: "preview-servant-johan",
      email: "johan.pratama@spi-preview.invalid",
      name: "Johan Pratama",
      role: "servant",
    },
    {
      id: "preview-servant-rina",
      email: "rina.kurnia@spi-preview.invalid",
      name: "Rina Kurnia",
      role: "servant",
    },
    {
      id: "preview-servant-dwi",
      email: "dwi.hartono@spi-preview.invalid",
      name: "Dwi Hartono",
      role: "servant",
    },
  ];

  for (const u of users) {
    await client.query(
      `INSERT INTO users (id, organization_id, email, display_name, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 1, $5, $5)
       ON CONFLICT (organization_id, email) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active', updated_at = $5`,
      [u.id, orgId, u.email, u.name, now],
    );

    await client.query(
      `INSERT INTO user_roles (id, organization_id, user_id, role_id, granted_by, granted_at, created_at, updated_at)
       SELECT $1, $2, $3, $4, 'preview-admin', $5, $5, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM user_roles WHERE organization_id = $2 AND user_id = $3 AND role_id = $4 AND revoked_at IS NULL
       )`,
      [randomUUID(), orgId, u.id, u.role, now],
    );
  }

  // Coordinator Scopes
  await client.query(
    `INSERT INTO coordinator_scopes (id, organization_id, user_id, scope_type, scope_id, starts_at, created_at, updated_at)
     SELECT $1, $2, 'preview-coord-media', 'field', 'field-media', $3, $3, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM coordinator_scopes WHERE organization_id = $2 AND user_id = 'preview-coord-media' AND scope_id = 'field-media'
     )`,
    [randomUUID(), orgId, now],
  );

  // 4. Servants
  const servants = [
    {
      id: "servant-johan",
      userId: "preview-servant-johan",
      name: "Johan Pratama",
    },
    { id: "servant-rina", userId: "preview-servant-rina", name: "Rina Kurnia" },
    { id: "servant-dwi", userId: "preview-servant-dwi", name: "Dwi Hartono" },
    { id: "servant-maria", userId: null, name: "Maria Magdalena" },
    { id: "servant-hendra", userId: null, name: "Hendra Wijaya" },
  ];

  for (const s of servants) {
    await client.query(
      `INSERT INTO servants (id, organization_id, user_id, display_name, status, is_backup, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 0, 1, $5, $5)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = $5`,
      [s.id, orgId, s.userId, s.name, now],
    );
  }

  // 5. Servant Capabilities & Approvers
  for (const r of roles) {
    await client.query(
      `INSERT INTO capability_approvers (id, organization_id, service_role_id, user_id, active, created_at, updated_at)
       VALUES ($1, $2, $3, 'preview-admin', 1, $4, $4)
       ON CONFLICT (organization_id, service_role_id, user_id) DO NOTHING`,
      [randomUUID(), orgId, r.id, now],
    );
  }

  const capabilities = [
    { servantId: "servant-johan", roleId: "role-operator" },
    { servantId: "servant-johan", roleId: "role-sound" },
    { servantId: "servant-rina", roleId: "role-usher" },
    { servantId: "servant-rina", roleId: "role-singer" },
    { servantId: "servant-dwi", roleId: "role-mc" },
    { servantId: "servant-dwi", roleId: "role-pianist" },
    { servantId: "servant-maria", roleId: "role-mc" },
    { servantId: "servant-maria", roleId: "role-singer" },
    { servantId: "servant-hendra", roleId: "role-preacher" },
  ];

  for (const c of capabilities) {
    await client.query(
      `INSERT INTO servant_capabilities (id, organization_id, servant_id, service_role_id, status, approved_by, approved_at, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 'preview-admin', $5, 1, $5, $5)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), orgId, c.servantId, c.roleId, now],
    );
  }

  // 6. Worship Services
  const sundayStarts = new Date();
  sundayStarts.setDate(
    sundayStarts.getDate() + ((7 - sundayStarts.getDay()) % 7 || 7),
  ); // Next Sunday
  sundayStarts.setHours(9, 0, 0, 0);
  const sundayAssembly = new Date(sundayStarts.getTime() - 45 * 60 * 1000);
  const sundayEnds = new Date(sundayStarts.getTime() + 120 * 60 * 1000);

  const midweekStarts = new Date(
    sundayStarts.getTime() + 3 * 24 * 60 * 60 * 1000,
  );
  midweekStarts.setHours(19, 0, 0, 0);
  const midweekAssembly = new Date(midweekStarts.getTime() - 30 * 60 * 1000);
  const midweekEnds = new Date(midweekStarts.getTime() + 90 * 60 * 1000);

  const pastSundayStarts = new Date(
    sundayStarts.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const pastSundayAssembly = new Date(
    pastSundayStarts.getTime() - 45 * 60 * 1000,
  );
  const pastSundayEnds = new Date(pastSundayStarts.getTime() + 120 * 60 * 1000);

  const services = [
    {
      id: "ws-sunday-next",
      theme: "Ibadah Minggu Raya",
      location: "Ruang Utama",
      assemblyAt: sundayAssembly.toISOString(),
      startsAt: sundayStarts.toISOString(),
      endsAt: sundayEnds.toISOString(),
      status: "scheduled",
    },
    {
      id: "ws-midweek-next",
      theme: "Doa Tengah Minggu",
      location: "Kapel Ebenhaezer",
      assemblyAt: midweekAssembly.toISOString(),
      startsAt: midweekStarts.toISOString(),
      endsAt: midweekEnds.toISOString(),
      status: "draft",
    },
    {
      id: "ws-sunday-past",
      theme: "Ibadah Minggu Raya Lalu",
      location: "Ruang Utama",
      assemblyAt: pastSundayAssembly.toISOString(),
      startsAt: pastSundayStarts.toISOString(),
      endsAt: pastSundayEnds.toISOString(),
      status: "completed",
    },
  ];

  for (const ws of services) {
    await client.query(
      `INSERT INTO worship_services (id, organization_id, assembly_at, starts_at, ends_at, location, status, theme, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9)
       ON CONFLICT (id) DO UPDATE SET
         theme = EXCLUDED.theme, location = EXCLUDED.location,
         starts_at = EXCLUDED.starts_at, assembly_at = EXCLUDED.assembly_at,
         ends_at = EXCLUDED.ends_at, status = EXCLUDED.status, updated_at = $9`,
      [
        ws.id,
        orgId,
        ws.assemblyAt,
        ws.startsAt,
        ws.endsAt,
        ws.location,
        ws.status,
        ws.theme,
        now,
      ],
    );
  }

  // Also grant scope on upcoming sunday service to worship coordinator
  await client.query(
    `INSERT INTO coordinator_scopes (id, organization_id, user_id, scope_type, scope_id, starts_at, created_at, updated_at)
     SELECT $1, $2, 'preview-coord-worship', 'service', 'ws-sunday-next', $3, $3, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM coordinator_scopes WHERE organization_id = $2 AND user_id = 'preview-coord-worship' AND scope_id = 'ws-sunday-next'
     )`,
    [randomUUID(), orgId, now],
  );

  // 7. Assignments for ws-sunday-next
  const currentAssignments = [
    {
      id: "assign-preacher",
      serviceId: "ws-sunday-next",
      roleId: "role-preacher",
      servantId: "servant-hendra",
      slot: 1,
      status: "accepted",
    },
    {
      id: "assign-mc",
      serviceId: "ws-sunday-next",
      roleId: "role-mc",
      servantId: "servant-dwi",
      slot: 1,
      status: "unavailable",
    },
    {
      id: "assign-operator",
      serviceId: "ws-sunday-next",
      roleId: "role-operator",
      servantId: "servant-johan",
      slot: 1,
      status: "awaiting_confirmation",
    },
    {
      id: "assign-usher",
      serviceId: "ws-sunday-next",
      roleId: "role-usher",
      servantId: "servant-rina",
      slot: 1,
      status: "awaiting_confirmation",
    },
    {
      id: "assign-singer",
      serviceId: "ws-sunday-next",
      roleId: "role-singer",
      servantId: "servant-maria",
      slot: 1,
      status: "accepted",
    },
  ];

  for (const a of currentAssignments) {
    await client.query(
      `INSERT INTO assignments (id, organization_id, worship_service_id, service_role_id, servant_id, slot_number, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = $8`,
      [a.id, orgId, a.serviceId, a.roleId, a.servantId, a.slot, a.status, now],
    );
  }

  // 8. Open Incident / Replacement Case for MC
  await client.query(
    `INSERT INTO replacement_cases (id, organization_id, service_id, assignment_id, service_role_id, status, urgency, reason, created_by, created_at, updated_at)
     VALUES ('inc-mc-sunday', $1, 'ws-sunday-next', 'assign-mc', 'role-mc', 'open', 'critical', 'Dwi Hartono mendadak demam tinggi dan tidak dapat melayani.', 'preview-admin', $2, $2)
     ON CONFLICT (id) DO UPDATE SET status = 'open', updated_at = $2`,
    [orgId, now],
  );

  // 9. Past Sunday Assignments and Attendance Records
  const pastAssignments = [
    {
      id: "past-preacher",
      servantId: "servant-hendra",
      roleId: "role-preacher",
      status: "present",
    },
    {
      id: "past-mc",
      servantId: "servant-maria",
      roleId: "role-mc",
      status: "present",
    },
    {
      id: "past-operator",
      servantId: "servant-johan",
      roleId: "role-operator",
      status: "present",
    },
    {
      id: "past-usher",
      servantId: "servant-rina",
      roleId: "role-usher",
      status: "late",
    },
  ];

  for (const pa of pastAssignments) {
    await client.query(
      `INSERT INTO assignments (id, organization_id, worship_service_id, service_role_id, servant_id, slot_number, status, version, created_at, updated_at)
       VALUES ($1, $2, 'ws-sunday-past', $3, $4, 1, 'completed', 1, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [pa.id, orgId, pa.roleId, pa.servantId, now],
    );

    await client.query(
      `INSERT INTO attendance_records (id, organization_id, service_id, assignment_id, servant_id, status, checkin_time, notes, recorded_by, created_at, updated_at)
       VALUES ($1, $2, 'ws-sunday-past', $3, $4, $5, $6, 'Hadir tepat waktu', 'preview-admin', $6, $6)
       ON CONFLICT (organization_id, assignment_id) DO NOTHING`,
      [randomUUID(), orgId, pa.id, pa.servantId, pa.status, now],
    );
  }

  // 10. Service Note for Past Service
  await client.query(
    `INSERT INTO service_notes (id, organization_id, service_id, servant_id, category, title, content, created_by, created_at, updated_at)
     VALUES ($1, $2, 'ws-sunday-past', 'servant-hendra', 'operational', 'Evaluasi Ibadah Minggu', 'Sound sistem dan multimedia berjalan sangat lancar. Penyambutan jemaat tertib.', 'preview-admin', $3, $3)
     ON CONFLICT (id) DO NOTHING`,
    [randomUUID(), orgId, now],
  );

  await client.query("COMMIT");
  console.log("Successfully seeded preview database!");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Failed to seed preview database:", error);
  process.exit(1);
} finally {
  await client.end();
}
