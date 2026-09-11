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
  // 2. Service Roles (8 Peran Standar SPI)
  const roles = [
    {
      id: "role-preacher",
      fieldId: "field-word",
      code: "preacher",
      name: "Pelayan Firman",
      slots: 1,
    },
    {
      id: "role-mimbar-2",
      fieldId: "field-word",
      code: "mimbar_2",
      name: "Pelayan Mimbar 2",
      slots: 1,
    },
    {
      id: "role-pintu-kolektan",
      fieldId: "field-usher",
      code: "pintu_kolektan",
      name: "Kolektan dan Pelayan Pintu",
      slots: 2,
    },
    {
      id: "role-persembahan",
      fieldId: "field-usher",
      code: "persembahan",
      name: "Pelayan Persembahan",
      slots: 2,
    },
    {
      id: "role-pianist",
      fieldId: "field-music",
      code: "pianist",
      name: "Pemain Keyboard/Piano",
      slots: 1,
    },
    {
      id: "role-kantoria",
      fieldId: "field-music",
      code: "kantoria",
      name: "Kantoria",
      slots: 2,
    },
    {
      id: "role-operator-media",
      fieldId: "field-media",
      code: "operator_multimedia",
      name: "Operator Multimedia",
      slots: 1,
    },
    {
      id: "role-operator-sound",
      fieldId: "field-media",
      code: "operator_sound",
      name: "Operator Sound System",
      slots: 1,
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

    // Grant user role
    await client.query(
      `INSERT INTO user_roles (id, organization_id, user_id, role_id, granted_by, granted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'preview-admin', $5, $5, $5)
       ON CONFLICT (organization_id, user_id, role_id) WHERE revoked_at IS NULL DO NOTHING`,
      [randomUUID(), orgId, u.id, u.role, now],
    );
  }

  // Also grant super_admin to preview admin user
  await client.query(
    `INSERT INTO user_roles (id, organization_id, user_id, role_id, granted_by, granted_at, created_at, updated_at)
     VALUES ($1, $2, 'preview-admin', 'super_admin', 'preview-admin', $3, $3, $3)
     ON CONFLICT (organization_id, user_id, role_id) WHERE revoked_at IS NULL DO NOTHING`,
    [randomUUID(), orgId, now],
  );

  // Coordinator Scopes
  await client.query(
    `INSERT INTO coordinator_scopes (id, organization_id, user_id, scope_type, scope_id, starts_at, created_at, updated_at)
     SELECT $1, $2, 'preview-coord-media', 'field', 'field-media', $3, $3, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM coordinator_scopes WHERE organization_id = $2 AND user_id = 'preview-coord-media' AND scope_id = 'field-media'
     )`,
    [randomUUID(), orgId, now],
  );

  // 4. Servants (Pelayan Jemaat dengan Jabatan: Diaken, Penatua, Staff)
  const servants = [
    {
      id: "servant-budi",
      userId: "preview-coord-worship",
      name: "Budi Santoso",
      phone: "0812-1111-2222",
      title: "Penatua",
    },
    {
      id: "servant-siti",
      userId: "preview-coord-media",
      name: "Siti Rahma",
      phone: "0813-3333-4444",
      title: "Diaken",
    },
    {
      id: "servant-dwi",
      userId: "preview-servant-dwi",
      name: "Dwi Hartono",
      phone: "0812-9999-0000",
      title: "Penatua",
    },
    {
      id: "servant-rina",
      userId: "preview-servant-rina",
      name: "Rina Kurnia",
      phone: "0813-7777-8888",
      title: "Diaken",
    },
    {
      id: "servant-maria",
      userId: null,
      name: "Maria Magdalena",
      phone: "0812-4444-5555",
      title: "Diaken",
    },
    {
      id: "servant-johan",
      userId: "preview-servant-johan",
      name: "Johan Pratama",
      phone: "0812-5555-6666",
      title: "Staff",
    },
    {
      id: "servant-hendra",
      userId: null,
      name: "Hendra Wijaya",
      phone: "0811-2222-3333",
      title: "Penatua",
    },
  ];

  for (const s of servants) {
    await client.query(
      `INSERT INTO servants (id, organization_id, user_id, display_name, phone_number, title, status, is_backup, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', 0, 1, $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         phone_number = EXCLUDED.phone_number,
         title = EXCLUDED.title,
         updated_at = $7`,
      [s.id, orgId, s.userId, s.name, s.phone, s.title, now],
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

  for (const s of servants) {
    for (const r of roles) {
      const isStaff = s.title === "Staff";
      const isAllowedForStaff =
        r.code.startsWith("operator") ||
        r.code.includes("sound") ||
        r.code.includes("media") ||
        r.code === "kantoria";

      if (!isStaff || isAllowedForStaff) {
        await client.query(
          `INSERT INTO servant_capabilities (id, organization_id, servant_id, service_role_id, status, approved_by, approved_at, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', 'preview-admin', $5, 1, $5, $5)
           ON CONFLICT (organization_id, servant_id, service_role_id) DO NOTHING`,
          [randomUUID(), orgId, s.id, r.id, now],
        );
      }
    }
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
      id: "assign-mimbar",
      serviceId: "ws-sunday-next",
      roleId: "role-mimbar-2",
      servantId: "servant-dwi",
      slot: 1,
      status: "unavailable",
    },
    {
      id: "assign-operator",
      serviceId: "ws-sunday-next",
      roleId: "role-operator-media",
      servantId: "servant-johan",
      slot: 1,
      status: "awaiting_confirmation",
    },
    {
      id: "assign-usher",
      serviceId: "ws-sunday-next",
      roleId: "role-pintu-kolektan",
      servantId: "servant-rina",
      slot: 1,
      status: "awaiting_confirmation",
    },
    {
      id: "assign-kantoria",
      serviceId: "ws-sunday-next",
      roleId: "role-kantoria",
      servantId: "servant-maria",
      slot: 1,
      status: "accepted",
    },
  ];

  for (const a of currentAssignments) {
    await client.query(
      `INSERT INTO assignments (id, organization_id, worship_service_id, service_role_id, servant_id, slot_number, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, service_role_id = EXCLUDED.service_role_id, updated_at = $8`,
      [a.id, orgId, a.serviceId, a.roleId, a.servantId, a.slot, a.status, now],
    );
  }

  // 8. Open Incident / Replacement Case for Pelayan Mimbar 2
  await client.query(
    `INSERT INTO replacement_cases (id, organization_id, service_id, assignment_id, service_role_id, status, urgency, reason, created_by, created_at, updated_at)
     VALUES ('inc-mimbar-sunday', $1, 'ws-sunday-next', 'assign-mimbar', 'role-mimbar-2', 'open', 'critical', 'Dwi Hartono mendadak demam tinggi dan tidak dapat melayani.', 'preview-admin', $2, $2)
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
      id: "past-mimbar",
      servantId: "servant-maria",
      roleId: "role-mimbar-2",
      status: "present",
    },
    {
      id: "past-operator",
      servantId: "servant-johan",
      roleId: "role-operator-media",
      status: "present",
    },
    {
      id: "past-usher",
      servantId: "servant-rina",
      roleId: "role-pintu-kolektan",
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
