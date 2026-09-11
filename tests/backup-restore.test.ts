import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import {
  backupD1Tables,
  restoreD1Tables,
  verifyBackupChecksum,
  type BackupManifest,
} from "../apps/worker/src/backup-recovery";

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

const orgId = "org-backup-drill";

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

  // Seed baseline data
  await db
    .prepare(
      "INSERT INTO organizations (id, name, timezone, created_at, updated_at) VALUES (?, 'Gereja Pemulihan', 'Asia/Makassar', 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO users (id, organization_id, email, display_name, status, version, created_at, updated_at) VALUES ('u-admin', ?, 'admin@pemulihan.invalid', 'Admin Pemulihan', 'active', 1, 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO user_roles (id, organization_id, user_id, role_id, granted_by, granted_at, version, created_at, updated_at) VALUES ('ur-admin', ?, 'u-admin', 'admin', 'u-admin', 'now', 1, 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO service_fields (id, organization_id, code, name, created_at, updated_at) VALUES ('fld-liturgi', ?, 'liturgi', 'Bidang Liturgi', 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO service_roles (id, organization_id, field_id, code, name, slots_required, created_at, updated_at) VALUES ('role-mc', ?, 'fld-liturgi', 'mc', 'Pemimpin Pujian / MC', 1, 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO servants (id, organization_id, user_id, display_name, status, created_at, updated_at) VALUES ('s-mc', ?, 'u-admin', 'MC Utama', 'active', 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO capability_approvers (id, organization_id, service_role_id, user_id, active, created_at, updated_at) VALUES ('ca-mc', ?, 'role-mc', 'u-admin', 1, 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO servant_capabilities (id, organization_id, servant_id, service_role_id, status, approved_by, approved_at, created_at, updated_at) VALUES ('cap-mc', ?, 's-mc', 'role-mc', 'active', 'u-admin', 'now', 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO worship_services (id, organization_id, starts_at, assembly_at, ends_at, location, status, theme, version, created_at, updated_at) VALUES ('srv-drill-1', ?, '2026-10-04T09:00:00Z', '2026-10-04T08:30:00Z', '2026-10-04T11:00:00Z', 'Gedung Pemulihan', 'scheduled', 'Ibadah Raya', 1, 'now', 'now')",
    )
    .bind(orgId)
    .run();

  await db
    .prepare(
      "INSERT INTO assignments (id, organization_id, worship_service_id, service_role_id, slot_number, servant_id, status, version, created_at, updated_at) VALUES ('asg-drill-1', ?, 'srv-drill-1', 'role-mc', 1, 's-mc', 'accepted', 1, 'now', 'now')",
    )
    .bind(orgId)
    .run();
});

afterAll(async () => {
  await runtime?.dispose();
});

describe("D1 Backup, Integrity Verification & Recovery Drill (PRD §11)", () => {
  let snapshot: BackupManifest;

  it("creates a complete backup manifest with SHA-256 checksum and accurate table counts", async () => {
    snapshot = await backupD1Tables(db, orgId);

    expect(snapshot.version).toBe(1);
    expect(snapshot.organizationId).toBe(orgId);
    expect(snapshot.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.tableCounts.organizations).toBe(1);
    expect(snapshot.tableCounts.users).toBe(1);
    expect(snapshot.tableCounts.worship_services).toBe(1);
    expect(snapshot.tableCounts.assignments).toBe(1);

    const verified = await verifyBackupChecksum(snapshot);
    expect(verified).toBe(true);
  });

  it("detects any tampering or data corruption via SHA-256 checksum validation", async () => {
    // Clone snapshot and tamper with data
    const tampered: BackupManifest = JSON.parse(JSON.stringify(snapshot));
    const firstOrg = tampered.data.organizations?.[0];
    if (firstOrg) {
      firstOrg.name = "Gereja Palsu / Diubah";
    }

    const verified = await verifyBackupChecksum(tampered);
    expect(verified).toBe(false);

    // Attempting to restore tampered backup throws an integrity error
    await expect(restoreD1Tables(db, tampered, orgId)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("prevents restoration into an incompatible organization target", async () => {
    await expect(
      restoreD1Tables(db, snapshot, "different-org-id"),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("simulates catastrophic data loss and successfully restores entire state with foreign keys", async () => {
    // 1. Simulate disaster: delete services and assignments
    await db
      .prepare("DELETE FROM assignments WHERE organization_id = ?")
      .bind(orgId)
      .run();
    await db
      .prepare("DELETE FROM worship_services WHERE organization_id = ?")
      .bind(orgId)
      .run();

    // Verify data was deleted
    const countBefore = await db
      .prepare(
        "SELECT COUNT(*) c FROM worship_services WHERE organization_id = ?",
      )
      .bind(orgId)
      .first<{ c: number }>();
    expect(countBefore?.c).toBe(0);

    // 2. Perform recovery drill
    const report = await restoreD1Tables(db, snapshot, orgId);
    expect(report.totalRowsRestored).toBeGreaterThan(0);
    expect(report.restoredTables).toContain("worship_services");
    expect(report.restoredTables).toContain("assignments");

    // 3. Verify data is fully restored and intact
    const restoredService = await db
      .prepare(
        "SELECT id, theme, location FROM worship_services WHERE organization_id = ?",
      )
      .bind(orgId)
      .first<{ id: string; theme: string; location: string }>();
    expect(restoredService?.id).toBe("srv-drill-1");
    expect(restoredService?.theme).toBe("Ibadah Raya");
    expect(restoredService?.location).toBe("Gedung Pemulihan");

    const restoredAssignment = await db
      .prepare("SELECT id, status FROM assignments WHERE organization_id = ?")
      .bind(orgId)
      .first<{ id: string; status: string }>();
    expect(restoredAssignment?.id).toBe("asg-drill-1");
    expect(restoredAssignment?.status).toBe("accepted");

    // 4. Verify audit trail of restoration
    const auditRestore = await db
      .prepare(
        "SELECT action, entity_type FROM audit_logs WHERE organization_id = ? AND action = 'backup.restore.executed'",
      )
      .bind(orgId)
      .first<{ action: string; entity_type: string }>();
    expect(auditRestore).toBeDefined();
    expect(auditRestore?.entity_type).toBe("organization");
  });
});
