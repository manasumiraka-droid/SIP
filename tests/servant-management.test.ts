import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import {
  createField,
  createServant,
  createServiceRole,
  deleteServant,
  deleteServiceRole,
  listServants,
  listServiceRoles,
  updateServant,
  updateServiceRole,
} from "../apps/worker/src/operations-repository";
import { createAssignment } from "../apps/worker/src/assignment-repository";
import type { Actor } from "../packages/domain/src/access";

let runtime: Miniflare;
let db: D1Database;

async function migrate(path: string) {
  const sql = readFileSync(path, "utf8")
    .replace(/^--.*$/gm, "")
    .trim();
  for (const statement of sql
    .split(/;\s*(?=(?:CREATE|INSERT|DROP|PRAGMA|$))/i)
    .map((value) => value.trim())
    .filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

const orgId = "org-test-servant";
const adminActor: Actor = {
  id: "u-admin",
  organizationId: orgId,
  displayName: "Admin Gereja",
  status: "active",
  roles: ["admin"],
  scopes: [],
};

const coordActor: Actor = {
  id: "u-coord",
  organizationId: orgId,
  displayName: "Koordinator Ibadah",
  status: "active",
  roles: ["worship_coordinator"],
  scopes: [
    {
      type: "service",
      id: "ws-1",
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: null,
    },
  ],
};

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("test"); } }',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-08",
      cf: false,
    }),
  );
  db = await runtime.getD1Database("DB");

  for (const name of [
    "0001_identity.sql",
    "0002_role_changes.sql",
    "0003_user_creations.sql",
    "0004_account_status_changes.sql",
    "0005_bootstrap_state.sql",
    "0006_audit_retention_holds.sql",
    "0007_foundation_review_hardening.sql",
    "0008_phase_1_schedule_core.sql",
    "0009_schedule_mutations.sql",
    "0010_assignment_mutations.sql",
    "0011_phase_1_model_completion.sql",
    "0012_assignment_load_guard.sql",
    "0013_schedule_imports.sql",
    "0014_import_resolution_receipts.sql",
    "0015_import_rollback_receipts.sql",
    "0016_import_link_receipts.sql",
    "0017_import_pending_receipts.sql",
    "0018_import_review_controls.sql",
    "0019_telegram_notifications.sql",
    "0020_telegram_callback_safety.sql",
    "0021_telegram_activation_idempotency.sql",
    "0022_telegram_emergency_idempotency.sql",
    "0023_remote_trigger_compatibility.sql",
    "0024_replacement_incidents.sql",
    "0025_attendance_and_performance.sql",
    "0026_servant_phone_and_title.sql",
  ]) {
    await migrate(`migrations/${name}`);
  }

  // Seed baseline organization and admin user
  await db
    .prepare(
      "INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,'Gereja Test','now','now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES(?,'org-test-servant','admin@test.invalid','Admin','active','now','now')",
    )
    .bind(adminActor.id)
    .run();

  await db
    .prepare(
      "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES('ur-admin',?,'u-admin','admin','u-admin','now','now','now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES(?,'org-test-servant','coord@test.invalid','Coord','active','now','now')",
    )
    .bind(coordActor.id)
    .run();

  await db
    .prepare(
      "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES('ur-coord',?,'u-coord','worship_coordinator','u-admin','now','now','now')",
    )
    .bind(orgId)
    .run();

  // Create a worship service first
  await db
    .prepare(
      "INSERT INTO worship_services(id,organization_id,starts_at,assembly_at,ends_at,location,status,theme,created_at,updated_at) VALUES('ws-1',?,'2026-09-20T09:00:00Z','2026-09-20T08:15:00Z','2026-09-20T11:00:00Z','Gedung Utama','scheduled','Ibadah Minggu','now','now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO coordinator_scopes(id,organization_id,user_id,scope_type,scope_id,starts_at,created_at,updated_at) VALUES('cs-1',?,'u-coord','service','ws-1','2026-01-01T00:00:00Z','now','now')",
    )
    .bind(orgId)
    .run();

  // Create fields
  await createField(
    db,
    adminActor,
    { code: "liturgi", name: "Firman & Liturgi" },
    "key-f1",
    "req-1",
  );
  await createField(
    db,
    adminActor,
    { code: "multimedia", name: "Multimedia & Sound" },
    "key-f2",
    "req-2",
  );

  const fields = (
    await db
      .prepare("SELECT id, code FROM service_fields WHERE organization_id = ?")
      .bind(orgId)
      .all<{ id: string; code: string }>()
  ).results;
  const fLiturgi = fields.find((f) => f.code === "liturgi")?.id ?? "";
  const fMedia = fields.find((f) => f.code === "multimedia")?.id ?? "";

  // Create 2 service roles: Pelayan Firman and Operator Multimedia
  await createServiceRole(
    db,
    adminActor,
    {
      fieldId: fLiturgi,
      code: "preacher",
      name: "Pelayan Firman",
      slotsRequired: 1,
      criticality: "critical",
    },
    "key-sr1",
    "req-3",
  );

  await createServiceRole(
    db,
    adminActor,
    {
      fieldId: fMedia,
      code: "operator_multimedia",
      name: "Operator Multimedia",
      slotsRequired: 1,
      criticality: "normal",
    },
    "key-sr2",
    "req-4",
  );

  // Designate capability approver
  const roles = (
    await db
      .prepare("SELECT id FROM service_roles WHERE organization_id = ?")
      .bind(orgId)
      .all<{ id: string }>()
  ).results;
  for (const r of roles) {
    await db
      .prepare(
        "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES(?,?,?,'u-admin','now','now')",
      )
      .bind(crypto.randomUUID(), orgId, r.id);
  }
});

afterAll(async () => {
  await runtime?.dispose();
});

describe("Servant & Service Role Management", () => {
  it("creates a servant with Penatua title and phone number, granting all capabilities", async () => {
    const res = await createServant(
      db,
      adminActor,
      {
        displayName: "Penatua Budi",
        phoneNumber: "0812-1111-2222",
        title: "Penatua",
        isBackup: false,
      },
      "key-create-budi",
      "req-budi",
    );
    expect(res.id).toBeDefined();

    const servants = (await listServants(db, adminActor, 10)) as Array<{
      id: string;
      displayName: string;
      phoneNumber: string;
      title: string;
      status: string;
    }>;
    const budi = servants.find((s) => s.displayName === "Penatua Budi");
    expect(budi).toBeDefined();
    expect(budi?.phoneNumber).toBe("0812-1111-2222");
    expect(budi?.title).toBe("Penatua");
    expect(budi?.status).toBe("active");

    // Check capabilities
    const caps = (
      await db
        .prepare(
          "SELECT count(*) as count FROM servant_capabilities WHERE organization_id = ? AND servant_id = ?",
        )
        .bind(orgId, res.id)
        .first<{ count: number }>()
    )?.count;
    // Penatua gets all 2 active roles
    expect(caps).toBe(2);
  });

  it("creates a servant with Staff title, granting only Operator/Kantoria capabilities", async () => {
    const res = await createServant(
      db,
      adminActor,
      {
        displayName: "Staff Johan",
        phoneNumber: "0813-9999-8888",
        title: "Staff",
        isBackup: false,
      },
      "key-create-johan",
      "req-johan",
    );
    expect(res.id).toBeDefined();

    const servants = (await listServants(db, adminActor, 10)) as Array<{
      id: string;
      displayName: string;
      title: string;
    }>;
    const johan = servants.find((s) => s.displayName === "Staff Johan");
    expect(johan?.title).toBe("Staff");

    // Staff only gets operator_multimedia (not preacher)
    const caps = (
      await db
        .prepare(
          `SELECT sr.code FROM servant_capabilities sc
           JOIN service_roles sr ON sr.id = sc.service_role_id
           WHERE sc.organization_id = ? AND sc.servant_id = ?`,
        )
        .bind(orgId, res.id)
        .all<{ code: string }>()
    ).results;

    expect(caps.length).toBe(1);
    expect(caps[0]?.code).toBe("operator_multimedia");
  });

  it("blocks Staff from being assigned to non-operator/non-kantoria role (preacher)", async () => {
    const roles = (await listServiceRoles(db, orgId, 10)) as Array<{
      id: string;
      code: string;
      name: string;
    }>;
    const rPreacher = roles.find((r) => r.code === "preacher")?.id ?? "";
    const servants = (await listServants(db, adminActor, 10)) as Array<{
      id: string;
      displayName: string;
    }>;
    const johan = servants.find((s) => s.displayName === "Staff Johan");
    expect(johan).toBeDefined();
    if (!johan) return;

    await expect(
      createAssignment(
        db,
        coordActor,
        {
          serviceId: "ws-1",
          serviceRoleId: rPreacher,
          servantId: johan.id,
          slotNumber: 1,
        },
        "key-assign-illegal-staff",
        "req-illegal",
      ),
    ).rejects.toThrow(
      "Staff hanya dapat ditugaskan untuk peran Operator dan Kantoria",
    );
  });

  it("allows Staff to be assigned to Operator Multimedia", async () => {
    const roles = (await listServiceRoles(db, orgId, 10)) as Array<{
      id: string;
      code: string;
      name: string;
    }>;
    const rOperator =
      roles.find((r) => r.code === "operator_multimedia")?.id ?? "";
    const servants = (await listServants(db, adminActor, 10)) as Array<{
      id: string;
      displayName: string;
    }>;
    const johan = servants.find((s) => s.displayName === "Staff Johan");
    expect(johan).toBeDefined();
    if (!johan) return;

    const assign = await createAssignment(
      db,
      coordActor,
      {
        serviceId: "ws-1",
        serviceRoleId: rOperator,
        servantId: johan.id,
        slotNumber: 1,
      },
      "key-assign-legal-staff",
      "req-legal",
    );
    expect(assign.id).toBeDefined();
  });

  it("allows Penatua to be assigned to Pelayan Firman", async () => {
    const roles = (await listServiceRoles(db, orgId, 10)) as Array<{
      id: string;
      code: string;
      name: string;
    }>;
    const rPreacher = roles.find((r) => r.code === "preacher")?.id ?? "";
    const servants = (await listServants(db, adminActor, 10)) as Array<{
      id: string;
      displayName: string;
    }>;
    const budi = servants.find((s) => s.displayName === "Penatua Budi");
    expect(budi).toBeDefined();
    if (!budi) return;

    const assign = await createAssignment(
      db,
      coordActor,
      {
        serviceId: "ws-1",
        serviceRoleId: rPreacher,
        servantId: budi.id,
        slotNumber: 1,
      },
      "key-assign-budi-preacher",
      "req-budi-preacher",
    );
    expect(assign.id).toBeDefined();
  });

  it("updates servant details and changes title from Staff to Diaken, expanding capabilities", async () => {
    const servants = (await listServants(db, adminActor, 10)) as Array<{
      id: string;
      displayName: string;
    }>;
    const johan = servants.find((s) => s.displayName === "Staff Johan");
    expect(johan).toBeDefined();
    if (!johan) return;

    await updateServant(
      db,
      adminActor,
      johan.id,
      {
        displayName: "Diaken Johan",
        phoneNumber: "0813-0000-1111",
        title: "Diaken",
      },
      "key-update-johan",
      "req-update-johan",
    );

    const updated = await db
      .prepare(
        "SELECT display_name, phone_number, title FROM servants WHERE id = ?",
      )
      .bind(johan.id)
      .first<{ display_name: string; phone_number: string; title: string }>();
    expect(updated?.display_name).toBe("Diaken Johan");
    expect(updated?.phone_number).toBe("0813-0000-1111");
    expect(updated?.title).toBe("Diaken");

    // Capabilities now expanded to all roles
    const caps = (
      await db
        .prepare(
          "SELECT count(*) as count FROM servant_capabilities WHERE organization_id = ? AND servant_id = ?",
        )
        .bind(orgId, johan.id)
        .first<{ count: number }>()
    )?.count;
    expect(caps).toBe(2);
  });

  it("soft-deletes a servant by setting status to inactive", async () => {
    const servants = (await listServants(db, adminActor, 10)) as Array<{
      id: string;
      displayName: string;
    }>;
    const budi = servants.find((s) => s.displayName === "Penatua Budi");
    expect(budi).toBeDefined();
    if (!budi) return;

    await deleteServant(db, adminActor, budi.id, "req-delete-budi");

    const row = await db
      .prepare("SELECT status FROM servants WHERE id = ?")
      .bind(budi.id)
      .first<{ status: string }>();
    expect(row?.status).toBe("inactive");
  });

  it("supports CRUD for service roles", async () => {
    const fields = (
      await db
        .prepare(
          "SELECT id FROM service_fields WHERE organization_id = ? LIMIT 1",
        )
        .bind(orgId)
        .first<{ id: string }>()
    )?.id;
    expect(fields).toBeDefined();
    if (!fields) return;

    // Create
    const created = await createServiceRole(
      db,
      adminActor,
      {
        fieldId: fields,
        code: "kantoria",
        name: "Kantoria Pujian",
        slotsRequired: 2,
        criticality: "normal",
      },
      "key-sr-kantoria",
      "req-sr-kantoria",
    );
    expect(created.id).toBeDefined();

    // Update
    await updateServiceRole(
      db,
      adminActor,
      created.id,
      {
        name: "Kantoria",
        slotsRequired: 3,
      },
      "req-update-kantoria",
    );

    const updated = await db
      .prepare("SELECT name, slots_required FROM service_roles WHERE id = ?")
      .bind(created.id)
      .first<{ name: string; slots_required: number }>();
    expect(updated?.name).toBe("Kantoria");
    expect(updated?.slots_required).toBe(3);

    // Delete (soft delete -> active = 0)
    await deleteServiceRole(db, adminActor, created.id, "req-del-kantoria");
    const deleted = await db
      .prepare("SELECT active FROM service_roles WHERE id = ?")
      .bind(created.id)
      .first<{ active: number }>();
    expect(deleted?.active).toBe(0);
  });
});
