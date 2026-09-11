import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { effectivePermissions, roles } from "../packages/domain/src/access";
it("enforces tenant foreign keys, role uniqueness and append-only audit", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const migration of [
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
    ])
      db.exec(readFileSync(`migrations/${migration}`, "utf8"));
    db.exec(
      "INSERT INTO organizations(id,name,created_at,updated_at) VALUES ('a','Synthetic A','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),('b','Synthetic B','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z')",
    );
    db.exec(
      "INSERT INTO users(id,organization_id,email,display_name,created_at,updated_at) VALUES ('u1','a','one@example.invalid','One','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),('u2','b','two@example.invalid','Two','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z')",
    );
    const grant = db.prepare(
      "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    expect(() =>
      grant.run("bad", "a", "u2", "admin", "u1", "now", "now", "now"),
    ).toThrow();
    db.exec(
      "INSERT INTO service_fields(id,organization_id,code,name,created_at,updated_at) VALUES ('field-a','a','music','Music','now','now')",
    );
    db.exec(
      "INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,created_at,updated_at) VALUES ('service-a','a','2026-09-10T08:00:00Z','2026-09-10T09:00:00Z','2026-09-10T10:00:00Z','Synthetic','now','now')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO coordinator_scopes(id,organization_id,user_id,scope_type,scope_id,starts_at,created_at,updated_at) VALUES ('scope-bad','a','u1','field','not-a-field','2026-09-01T00:00:00Z','now','now')",
      ),
    ).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO coordinator_scopes(id,organization_id,user_id,scope_type,scope_id,starts_at,created_at,updated_at) VALUES ('scope-cross','a','u1','service','service-b','2026-09-01T00:00:00Z','now','now')",
      ),
    ).toThrow();
    db.exec(
      "INSERT INTO coordinator_scopes(id,organization_id,user_id,scope_type,scope_id,starts_at,created_at,updated_at) VALUES ('scope-valid','a','u1','field','field-a','2026-09-01T00:00:00Z','now','now')",
    );
    db.exec(
      "INSERT INTO service_roles(id,organization_id,field_id,code,name,created_at,updated_at) VALUES ('role-a','a','field-a','music','Music','now','now')",
    );
    db.exec(
      "INSERT INTO servants(id,organization_id,display_name,created_at,updated_at) VALUES ('servant-a','a','Synthetic Servant','now','now')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES ('cap-bad','a','servant-a','role-a','active','u1','now','now','now')",
      ),
    ).toThrow();
    db.exec(
      "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES ('approver-a','a','role-a','u1','now','now')",
    );
    db.exec(
      "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES ('cap-a','a','servant-a','role-a','active','u1','now','now','now')",
    );
    db.exec(
      "INSERT INTO availability_blocks(id,organization_id,servant_id,starts_at,ends_at,created_at,updated_at) VALUES ('availability-a','a','servant-a','2026-09-10T08:30:00Z','2026-09-10T09:30:00Z','now','now')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,created_at,updated_at) VALUES ('assignment-bad','a','service-a','role-a','servant-a','now','now')",
      ),
    ).toThrow();
    grant.run("valid", "a", "u1", "admin", "u1", "now", "now", "now");
    expect(() =>
      grant.run("duplicate", "a", "u1", "admin", "u1", "now", "now", "now"),
    ).toThrow();
    expect(() =>
      grant.run(
        "public",
        "a",
        "u1",
        "public_viewer",
        "u1",
        "now",
        "now",
        "now",
      ),
    ).toThrow();
    db.exec(
      "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,created_at) VALUES ('log','a','user','u1','identity.read','user','u1','request','2026-09-08T00:00:00Z')",
    );
    expect(() => db.exec("UPDATE audit_logs SET action='changed'")).toThrow();
    expect(() => db.exec("DELETE FROM audit_logs")).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO audit_retention_holds(audit_log_id,organization_id,reason,decision_owner,review_at,created_at,updated_at) VALUES ('log','b','legal','owner','2030-01-01T00:00:00Z','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z')",
      ),
    ).toThrow();
    for (const role of roles) {
      const stored = db
        .prepare(
          "SELECT permission_id FROM role_permissions WHERE role_id = ? ORDER BY permission_id",
        )
        .all(role)
        .map((row) => row.permission_id);
      expect(
        effectivePermissions({
          id: "u1",
          organizationId: "a",
          displayName: "Test",
          status: "active",
          roles: [role],
          scopes: [],
        }).sort(),
      ).toEqual(stored);
    }
  } finally {
    db.close();
  }
});
