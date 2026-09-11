import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import {
  createIncident,
  escalateIncident,
  listIncidents,
  recommendCandidates,
  resolveIncident,
} from "../apps/worker/src/incident-repository";
import {
  handleTelegramCommand,
  type TelegramEnv,
} from "../apps/worker/src/telegram";
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

const orgId = "org-test";
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
      id: "srv-1",
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: null,
    },
    {
      type: "service",
      id: "srv-esc",
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: null,
    },
  ],
};

const unscopedCoordActor: Actor = {
  id: "u-unscoped",
  organizationId: orgId,
  displayName: "Koordinator Luar Scope",
  status: "active",
  roles: ["worship_coordinator"],
  scopes: [
    {
      type: "service",
      id: "srv-other",
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
  ]) {
    await migrate(`migrations/${name}`);
  }

  // Seed organization & users
  await db
    .prepare(
      "INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,'Gereja Test','now','now')",
    )
    .bind(orgId)
    .run();

  for (const [id, role] of [
    ["u-admin", "admin"],
    ["u-coord", "worship_coordinator"],
    ["u-unscoped", "worship_coordinator"],
    ["u-approver", "admin"],
  ]) {
    await db
      .prepare(
        "INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,?,'active','now','now')",
      )
      .bind(id, orgId, `${id}@example.invalid`, id)
      .run();
    await db
      .prepare(
        "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES(?,?,?,?, 'u-admin','now','now','now')",
      )
      .bind(`ur-${id}`, orgId, id, role)
      .run();
  }

  // Seed service field & service roles (mc and preacher)
  await db
    .prepare(
      "INSERT INTO service_fields(id,organization_id,code,name,created_at,updated_at) VALUES('fld-1',?,'ibadah','Bidang Ibadah','now','now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO service_roles(id,organization_id,field_id,code,name,created_at,updated_at) VALUES('role-mc',?,'fld-1','mc','Master of Ceremony','now','now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO service_roles(id,organization_id,field_id,code,name,created_at,updated_at) VALUES('role-preacher',?,'fld-1','preacher','Pelayan Firman','now','now')",
    )
    .bind(orgId)
    .run();

  // Designate capability approver for preacher and mc
  await db
    .prepare(
      "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES('ca-mc',?,'role-mc','u-approver','now','now')",
    )
    .bind(orgId)
    .run();
  await db
    .prepare(
      "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES('ca-preacher',?,'role-preacher','u-approver','now','now')",
    )
    .bind(orgId)
    .run();

  // Seed servants
  // s1: original MC
  // s2: replacement candidate MC (regular, 1 task)
  // s3: replacement candidate MC (backup, 0 tasks)
  // s4: replacement candidate MC (has availability block)
  // s5: preacher candidate (approved)
  for (const [id, name, isBackup, chat] of [
    ["s1", "Budi Asal", 0, "1001"],
    ["s2", "Citra Pengganti Reguler", 0, "1002"],
    ["s3", "Dewi Pengganti Cadangan", 1, "1003"],
    ["s4", "Eko Berhalangan", 1, "1004"],
    ["s5", "Pdt. Samuel Pengkhotbah", 1, "1005"],
  ] as const) {
    await db
      .prepare(
        "INSERT INTO servants(id,organization_id,display_name,is_backup,status,telegram_chat_id,created_at,updated_at) VALUES(?,?,?,?, 'active',?,'now','now')",
      )
      .bind(id, orgId, name, isBackup, chat)
      .run();
  }

  // Seed capabilities
  // s1, s2, s3, s4 have MC capability approved by u-approver
  for (const servantId of ["s1", "s2", "s3", "s4"]) {
    await db
      .prepare(
        "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,'role-mc','active','u-approver','now','now','now')",
      )
      .bind(`cap-${servantId}`, orgId, servantId)
      .run();
  }

  // s5 has preacher capability
  await db
    .prepare(
      "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES('cap-s5',?,'s5','role-preacher','active','u-approver','now','now','now')",
    )
    .bind(orgId)
    .run();

  // Seed service srv-1 (tomorrow at 17:00 WITA)
  await db
    .prepare(
      `INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at)
       VALUES('srv-1',?,'2026-09-14T08:00:00Z','2026-09-14T09:00:00Z','2026-09-14T11:00:00Z','Ruang Utama','scheduled','now','now')`,
    )
    .bind(orgId)
    .run();

  // Seed initial assignment for s1 as MC on srv-1
  await db
    .prepare(
      `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,version,created_at,updated_at)
       VALUES('asg-1',?,'srv-1','role-mc','s1','accepted',1,'now','now')`,
    )
    .bind(orgId)
    .run();

  // Seed availability block for s4 (overlapping with srv-1)
  await db
    .prepare(
      `INSERT INTO availability_blocks(id,organization_id,servant_id,starts_at,ends_at,created_at,updated_at)
       VALUES('blk-s4',?,'s4','2026-09-14T07:00:00Z','2026-09-14T12:00:00Z','now','now')`,
    )
    .bind(orgId)
    .run();
});

afterAll(async () => {
  await runtime.dispose();
});

describe("Phase 3 Incident & Urgent Replacement Workflow", () => {
  it("creates an incident case, marks assignment needs_replacement, and is idempotent", async () => {
    const result1 = await createIncident(
      db,
      adminActor,
      {
        serviceId: "srv-1",
        assignmentId: "asg-1",
        reason: "Sakit mendadak",
      },
      "req-1",
    );

    expect(result1.id).toBeDefined();
    expect(result1.status).toBe("open");

    // Check assignment status is updated to needs_replacement
    const assignment = await db
      .prepare("SELECT status FROM assignments WHERE id = ?")
      .bind("asg-1")
      .first<{ status: string }>();
    expect(assignment?.status).toBe("needs_replacement");

    // Check replacement_cases in db
    const rCase = await db
      .prepare(
        "SELECT status, urgency, reason FROM replacement_cases WHERE id = ?",
      )
      .bind(result1.id)
      .first<{ status: string; urgency: string; reason: string }>();
    expect(rCase?.status).toBe("open");
    expect(rCase?.reason).toBe("Sakit mendadak");

    // Audit log recorded
    const audit = await db
      .prepare(
        "SELECT action, entity_type FROM audit_logs WHERE entity_id = ? AND action = 'incident.create'",
      )
      .bind(result1.id)
      .first<{ action: string; entity_type: string }>();
    expect(audit?.action).toBe("incident.create");

    // Idempotency: calling again returns same open case
    const result2 = await createIncident(
      db,
      adminActor,
      {
        serviceId: "srv-1",
        assignmentId: "asg-1",
        reason: "Sakit mendadak kedua",
      },
      "req-2",
    );
    expect(result2.id).toBe(result1.id);
  });

  it("filters out unavailable candidates and prioritizes backups", async () => {
    const candidates = await recommendCandidates(
      db,
      orgId,
      "srv-1",
      "role-mc",
      "s1", // excluded original servant
    );

    // s4 has availability block -> must NOT be in candidates
    expect(candidates.find((c) => c.servantId === "s4")).toBeUndefined();

    // s3 is backup, s2 is regular -> s3 must come first
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]?.servantId).toBe("s3");
    expect(candidates[0]?.isBackup).toBe(true);
    expect(candidates[0]?.explanation).toContain("Pelayan cadangan prioritas");

    expect(candidates[1]?.servantId).toBe("s2");
    expect(candidates[1]?.isBackup).toBe(false);
  });

  it("resolves an incident atomically, reassigns old slot, and replays idempotently", async () => {
    const list = await listIncidents(db, adminActor, { serviceId: "srv-1" });
    const incidentCase = list.data.find((i) => i.assignmentId === "asg-1");
    expect(incidentCase).toBeDefined();
    if (!incidentCase) return;

    const key = crypto.randomUUID();
    const resolution = await resolveIncident(
      db,
      coordActor,
      incidentCase.id,
      { replacementServantId: "s3" },
      key,
      "req-resolve-1",
    );

    expect(resolution.status).toBe("resolved");
    expect(resolution.newAssignmentId).toBeDefined();

    // Verify old assignment is reassigned
    const oldAsg = await db
      .prepare("SELECT status FROM assignments WHERE id = ?")
      .bind("asg-1")
      .first<{ status: string }>();
    expect(oldAsg?.status).toBe("reassigned");

    // Verify new assignment is accepted
    const newAsg = await db
      .prepare("SELECT servant_id, status FROM assignments WHERE id = ?")
      .bind(resolution.newAssignmentId)
      .first<{ servant_id: string; status: string }>();
    expect(newAsg?.servant_id).toBe("s3");
    expect(newAsg?.status).toBe("accepted");

    // Verify case in db
    const rCase = await db
      .prepare(
        "SELECT status, resolved_assignment_id, resolved_by FROM replacement_cases WHERE id = ?",
      )
      .bind(incidentCase.id)
      .first<{
        status: string;
        resolved_assignment_id: string;
        resolved_by: string;
      }>();
    expect(rCase?.status).toBe("resolved");
    expect(rCase?.resolved_assignment_id).toBe(resolution.newAssignmentId);
    expect(rCase?.resolved_by).toBe("u-coord");

    // Replay idempotency: resolving again with same key returns same response
    const replay = await resolveIncident(
      db,
      coordActor,
      incidentCase.id,
      { replacementServantId: "s3" },
      key,
      "req-resolve-2",
    );
    expect(replay.newAssignmentId).toBe(resolution.newAssignmentId);
  });

  it("rejects unauthorized coordinator from resolving incident", async () => {
    // Create new service srv-auth for test
    await db
      .prepare(
        `INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at)
         VALUES('srv-auth',?,'2026-09-20T08:00:00Z','2026-09-20T09:00:00Z','2026-09-20T11:00:00Z','Ruang Utama','scheduled','now','now')`,
      )
      .bind(orgId)
      .run();

    await db
      .prepare(
        `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,version,created_at,updated_at)
         VALUES('asg-test-auth',?,'srv-auth','role-mc','s1','needs_replacement',1,'now','now')`,
      )
      .bind(orgId)
      .run();

    const newCaseId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO replacement_cases(id,organization_id,service_id,assignment_id,service_role_id,status,urgency,reason,created_by,created_at,updated_at)
         VALUES(?,?,'srv-auth','asg-test-auth','role-mc','open','standard','Test auth','u-admin','now','now')`,
      )
      .bind(newCaseId, orgId)
      .run();

    await expect(
      resolveIncident(
        db,
        unscopedCoordActor, // unscoped for srv-auth
        newCaseId,
        { replacementServantId: "s2" },
        crypto.randomUUID(),
        "req-auth-fail",
      ),
    ).rejects.toThrow(/Akses ditolak/u);
  });

  it("rejects candidate without approved preacher capability for preacher role", async () => {
    // Setup preaching assignment on srv-1 (s5 is preacher, slot 1)
    await db
      .prepare(
        `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,version,created_at,updated_at)
         VALUES('asg-preacher',?,'srv-1','role-preacher','s5','needs_replacement',1,'now','now')`,
      )
      .bind(orgId)
      .run();

    const preacherCaseId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO replacement_cases(id,organization_id,service_id,assignment_id,service_role_id,status,urgency,reason,created_by,created_at,updated_at)
         VALUES(?,?,'srv-1','asg-preacher','role-preacher','open','standard','Pendeta berhalangan','u-admin','now','now')`,
      )
      .bind(preacherCaseId, orgId)
      .run();

    // Try resolving with s2 (who only has MC capability, not preacher)
    await expect(
      resolveIncident(
        db,
        adminActor,
        preacherCaseId,
        { replacementServantId: "s2" },
        crypto.randomUUID(),
        "req-preacher-fail",
      ),
    ).rejects.toThrow(/kelayakan/u);
  });

  it("escalates an incident to manual handling", async () => {
    await db
      .prepare(
        `INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at)
         VALUES('srv-esc',?,'2026-09-27T08:00:00Z','2026-09-27T09:00:00Z','2026-09-27T11:00:00Z','Ruang Utama','scheduled','now','now')`,
      )
      .bind(orgId)
      .run();

    await db
      .prepare(
        `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,version,created_at,updated_at)
         VALUES('asg-esc',?,'srv-esc','role-mc','s1','needs_replacement',1,'now','now')`,
      )
      .bind(orgId)
      .run();

    const caseId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO replacement_cases(id,organization_id,service_id,assignment_id,service_role_id,status,urgency,reason,created_by,created_at,updated_at)
         VALUES(?,?,'srv-esc','asg-esc','role-mc','open','standard','Perlu eskalasi','u-admin','now','now')`,
      )
      .bind(caseId, orgId)
      .run();

    const result = await escalateIncident(
      db,
      coordActor,
      caseId,
      { reason: "Tidak ada kandidat bersedia" },
      "req-esc",
    );

    expect(result.status).toBe("escalated_manual");

    const rCase = await db
      .prepare("SELECT status FROM replacement_cases WHERE id = ?")
      .bind(caseId)
      .first<{ status: string }>();
    expect(rCase?.status).toBe("escalated_manual");
  });

  it("integrates with Telegram /darurat command to create replacement_cases automatically", async () => {
    // Setup service and assignment for s2 on srv-tele
    await db
      .prepare(
        `INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at)
         VALUES('srv-tele',?,'2026-10-04T08:00:00Z','2026-10-04T09:00:00Z','2026-10-04T11:00:00Z','Ruang Utama','scheduled','now','now')`,
      )
      .bind(orgId)
      .run();

    await db
      .prepare(
        `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,version,created_at,updated_at)
         VALUES('asg-darurat',?,'srv-tele','role-mc','s2','accepted',1,'now','now')`,
      )
      .bind(orgId)
      .run();

    const telegramEnv: TelegramEnv = {
      DB: db,
      ORGANIZATION_ID: orgId,
      TELEGRAM_BOT_TOKEN: "mock-token",
      TELEGRAM_WEBHOOK_SECRET: "mock-secret-32-characters-minimum-ok",
      TELEGRAM_DELIVERY_ENABLED: "false",
    };

    // Call /darurat from s2's chat (chatId "1002")
    const reply = await handleTelegramCommand(telegramEnv, "1002", "/darurat");
    expect(reply).toContain("Laporan darurat dicatat");

    // Verify replacement_cases has a record created
    const autoCase = await db
      .prepare(
        "SELECT status, urgency, reason FROM replacement_cases WHERE assignment_id = ? AND status = 'open'",
      )
      .bind("asg-darurat")
      .first<{ status: string; urgency: string; reason: string }>();
    expect(autoCase).toBeDefined();
    expect(autoCase?.status).toBe("open");
    expect(autoCase?.reason).toContain("darurat");

    // Verify assignment updated to needs_replacement
    const asg = await db
      .prepare("SELECT status FROM assignments WHERE id = ?")
      .bind("asg-darurat")
      .first<{ status: string }>();
    expect(asg?.status).toBe("needs_replacement");
  });
});
