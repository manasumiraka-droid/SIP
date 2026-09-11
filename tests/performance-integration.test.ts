import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import {
  createServiceNote,
  exportAttendanceReportCsv,
  getOrganizationReport,
  getServiceAttendance,
  getServiceNoteById,
  getServantPerformanceReport,
  listServiceNotes,
  recordServiceAttendance,
} from "../apps/worker/src/performance-repository";
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

const orgId = "org-perf-test";

const superAdminActor: Actor = {
  id: "u-super",
  organizationId: orgId,
  displayName: "Super Admin",
  status: "active",
  roles: ["super_admin"],
  scopes: [],
};

const adminActor: Actor = {
  id: "u-admin",
  organizationId: orgId,
  displayName: "Admin Gereja",
  status: "active",
  roles: ["admin"],
  scopes: [],
};

const authorCoordActor: Actor = {
  id: "u-author-coord",
  organizationId: orgId,
  displayName: "Koordinator Pembuat",
  status: "active",
  roles: ["worship_coordinator"],
  scopes: [
    {
      type: "service",
      id: "srv-perf-1",
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: null,
    },
  ],
};

const aclGrantedPastorActor: Actor = {
  id: "u-pastor",
  organizationId: orgId,
  displayName: "Pendeta Pembina",
  status: "active",
  roles: ["worship_coordinator"],
  scopes: [],
};

const servantActor: Actor = {
  id: "u-servant-1",
  organizationId: orgId,
  displayName: "Pelayan Budi",
  status: "active",
  roles: ["servant"],
  scopes: [],
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

  // Seed organization
  await db
    .prepare(
      "INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,'Gereja Performa','now','now')",
    )
    .bind(orgId)
    .run();

  // Seed users
  for (const [id, role] of [
    ["u-super", "super_admin"],
    ["u-admin", "admin"],
    ["u-author-coord", "worship_coordinator"],
    ["u-pastor", "worship_coordinator"],
    ["u-servant-1", "servant"],
    ["u-servant-2", "servant"],
  ]) {
    await db
      .prepare(
        "INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,?,'active','now','now')",
      )
      .bind(id, orgId, `${id}@test.invalid`, id)
      .run();
    await db
      .prepare(
        "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES(?,?,?,?, 'u-super','now','now','now')",
      )
      .bind(`ur-${id}`, orgId, id, role)
      .run();
  }

  // Field & Role
  await db
    .prepare(
      "INSERT INTO service_fields(id,organization_id,code,name,created_at,updated_at) VALUES('fld-perf',?,'musik','Bidang Musik','now','now')",
    )
    .bind(orgId)
    .run();
  await db
    .prepare(
      "INSERT INTO service_roles(id,organization_id,field_id,code,name,slots_required,created_at,updated_at) VALUES('role-singer',?,'fld-perf','singer','Penyanyi',2,'now','now')",
    )
    .bind(orgId)
    .run();

  // Approver
  await db
    .prepare(
      "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES('ca-singer',?,'role-singer','u-admin','now','now')",
    )
    .bind(orgId)
    .run();

  // Servants linked to users
  await db
    .prepare(
      "INSERT INTO servants(id,organization_id,user_id,display_name,is_backup,status,created_at,updated_at) VALUES('s1',?,?,'Budi Singer',0,'active','now','now')",
    )
    .bind(orgId, "u-servant-1")
    .run();
  await db
    .prepare(
      "INSERT INTO servants(id,organization_id,user_id,display_name,is_backup,status,created_at,updated_at) VALUES('s2',?,?,'Citra Singer',1,'active','now','now')",
    )
    .bind(orgId, "u-servant-2")
    .run();

  // Capabilities
  for (const s of ["s1", "s2"]) {
    await db
      .prepare(
        "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,'role-singer','active','u-admin','now','now','now')",
      )
      .bind(`cap-${s}`, orgId, s)
      .run();
  }

  // Service srv-perf-1
  await db
    .prepare(
      `INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at)
       VALUES('srv-perf-1',?,'2026-09-15T08:00:00Z','2026-09-15T09:00:00Z','2026-09-15T11:00:00Z','Gedung Utama','completed','now','now')`,
    )
    .bind(orgId)
    .run();

  // Assignments on srv-perf-1 (slots 1 and 2)
  await db
    .prepare(
      `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,slot_number,status,version,created_at,updated_at)
       VALUES('asg-p1',?,'srv-perf-1','role-singer','s1',1,'accepted',1,'now','now')`,
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,slot_number,status,version,created_at,updated_at)
       VALUES('asg-p2',?,'srv-perf-1','role-singer','s2',2,'accepted',1,'now','now')`,
    )
    .bind(orgId)
    .run();
});

afterAll(async () => {
  await runtime?.dispose();
});

describe("Phase 4 Attendance & Performance Integration", () => {
  it("records service attendance and updates assignment statuses atomically", async () => {
    const result = await recordServiceAttendance(
      db,
      authorCoordActor,
      "srv-perf-1",
      {
        items: [
          {
            assignmentId: "asg-p1",
            servantId: "s1",
            status: "present",
            checkinTime: "2026-09-15T08:15:00.000Z",
            notes: "Hadir tepat waktu",
          },
          {
            assignmentId: "asg-p2",
            servantId: "s2",
            status: "late",
            checkinTime: "2026-09-15T08:45:00.000Z",
            notes: "Terlambat karena macet",
          },
        ],
      },
      "req-att-1",
    );

    expect(result.recordedCount).toBe(2);

    // Verify attendance records in DB
    const list = await getServiceAttendance(db, adminActor, "srv-perf-1");
    expect(list.data.length).toBe(2);
    expect(list.data.find((r) => r.servantId === "s1")?.attendanceStatus).toBe(
      "present",
    );
    expect(list.data.find((r) => r.servantId === "s2")?.attendanceStatus).toBe(
      "late",
    );

    // Verify assignment statuses updated to completed
    const asg1 = await db
      .prepare("SELECT status FROM assignments WHERE id = 'asg-p1'")
      .first<{ status: string }>();
    const asg2 = await db
      .prepare("SELECT status FROM assignments WHERE id = 'asg-p2'")
      .first<{ status: string }>();
    expect(asg1?.status).toBe("completed");
    expect(asg2?.status).toBe("completed");
  });

  it("updates attendance idempotently on conflict", async () => {
    // Re-record asg-p2 as absent
    await recordServiceAttendance(
      db,
      adminActor,
      "srv-perf-1",
      {
        items: [
          {
            assignmentId: "asg-p2",
            servantId: "s2",
            status: "absent",
            notes: "Ternyata izin sakit mendadak",
          },
        ],
      },
      "req-att-2",
    );

    const list = await getServiceAttendance(db, adminActor, "srv-perf-1");
    const s2Record = list.data.find((r) => r.servantId === "s2");
    expect(s2Record?.attendanceStatus).toBe("absent");
    expect(s2Record?.notes).toBe("Ternyata izin sakit mendadak");

    // Verify assignment status updated to absent
    const asg2 = await db
      .prepare("SELECT status FROM assignments WHERE id = 'asg-p2'")
      .first<{ status: string }>();
    expect(asg2?.status).toBe("absent");
  });

  describe("Service Notes & ACL (RBAC-06)", () => {
    let restrictedNoteId: string;

    it("creates a restricted note and grants explicit ACL to pastor", async () => {
      const created = await createServiceNote(
        db,
        authorCoordActor,
        {
          category: "restricted",
          title: "Catatan Pembinaan Khusus",
          content: "Perlu bimbingan pastoral intensif mengenai komitmen waktu.",
          servantId: "s2",
          grantedUserIds: ["u-pastor"],
        },
        "req-note-1",
      );

      restrictedNoteId = created.id;
      expect(restrictedNoteId).toBeTruthy();

      // Verify ACL record inserted
      const acl = await db
        .prepare("SELECT user_id FROM service_notes_acl WHERE note_id = ?")
        .bind(restrictedNoteId)
        .all<{ user_id: string }>();
      expect(acl.results?.map((r) => r.user_id)).toContain("u-pastor");
    });

    it("allows author and ACL-granted user to read restricted note", async () => {
      const authorView = await getServiceNoteById(
        db,
        authorCoordActor,
        restrictedNoteId,
      );
      expect(authorView.content).toContain("bimbingan pastoral");

      const pastorView = await getServiceNoteById(
        db,
        aclGrantedPastorActor,
        restrictedNoteId,
      );
      expect(pastorView.content).toContain("bimbingan pastoral");

      const superView = await getServiceNoteById(
        db,
        superAdminActor,
        restrictedNoteId,
      );
      expect(superView.content).toContain("bimbingan pastoral");
    });

    it("STRICTLY DENIES regular admin without ACL from reading restricted note (RBAC-06)", async () => {
      // adminActor has role 'admin', but is NOT in service_notes_acl
      await expect(
        getServiceNoteById(db, adminActor, restrictedNoteId),
      ).rejects.toThrow(/Akses ditolak/u);
    });

    it("filters out restricted notes from listing for unpermitted users", async () => {
      // authorCoordActor sees the restricted note
      const authorList = await listServiceNotes(db, authorCoordActor);
      expect(authorList.data.some((n) => n.id === restrictedNoteId)).toBe(true);

      // adminActor does NOT see the restricted note in list
      const adminList = await listServiceNotes(db, adminActor);
      expect(adminList.data.some((n) => n.id === restrictedNoteId)).toBe(false);

      // pastorActor sees the restricted note
      const pastorList = await listServiceNotes(db, aclGrantedPastorActor);
      expect(pastorList.data.some((n) => n.id === restrictedNoteId)).toBe(true);
    });
  });

  describe("Reports & Analytics", () => {
    it("generates aggregated organization reports accurately", async () => {
      const report = await getOrganizationReport(db, adminActor);

      expect(report.summary.totalServices).toBeGreaterThanOrEqual(1);
      expect(report.summary.completedServices).toBeGreaterThanOrEqual(1);
      expect(report.summary.attendanceBreakdown.present).toBe(1);
      expect(report.summary.attendanceBreakdown.absent).toBe(1);
      expect(report.summary.attendanceRate).toBe(50); // 1 present out of 2 evaluated = 50%
      expect(report.workloadDistribution.servantsCount).toBe(2);
      expect(report.roleBreakdown.length).toBeGreaterThanOrEqual(1);
    });

    it("allows servant to read own report and forbids reading another's", async () => {
      // Servant 1 reads own report
      const ownReport = await getServantPerformanceReport(
        db,
        servantActor,
        "s1",
      );
      expect(ownReport.servantId).toBe("s1");
      expect(ownReport.displayName).toBe("Budi Singer");

      // Servant 1 tries to read Servant 2's report -> 403 Forbidden
      await expect(
        getServantPerformanceReport(db, servantActor, "s2"),
      ).rejects.toThrow(/Akses ditolak/u);
    });

    it("exports attendance report to CSV with formula injection sanitization", async () => {
      // Update servant name to test formula injection safety
      await db
        .prepare("UPDATE servants SET display_name = '=1+1' WHERE id = 's1'")
        .run();

      const csv = await exportAttendanceReportCsv(db, adminActor);

      expect(csv).toContain("Tanggal Ibadah,Lokasi,Peran Pelayanan");
      // S1's display name '=1+1' MUST be prepended with ' and double-quoted
      expect(csv).toContain('"\'=1+1"');

      // Verify audit log recorded for report export
      const audit = await db
        .prepare(
          "SELECT action, entity_id FROM audit_logs WHERE action = 'reports.export'",
        )
        .first<{ action: string; entity_id: string }>();
      expect(audit?.action).toBe("reports.export");
      expect(audit?.entity_id).toBe("attendance_report");
    });
  });
});
