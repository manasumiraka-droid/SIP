import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import { createApp } from "../apps/worker/src/app";
import { findActor, getTimezone } from "../apps/worker/src/repository";

let runtime: Miniflare;
let db: D1Database;
async function migrate(path: string) {
  const sql = readFileSync(path, "utf8")
    .replace(/^--.*$/gm, "")
    .trim();
  for (const statement of sql
    .split(/;\s*(?=(?:CREATE|INSERT|DROP|PRAGMA|$))/i)
    .map((value) => value.trim())
    .filter(Boolean))
    await db.prepare(statement).run();
}
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
  ])
    await migrate(`migrations/${name}`);
  await db
    .prepare(
      "INSERT INTO organizations(id,name,created_at,updated_at) VALUES('a','Synthetic','now','now')",
    )
    .run();
  for (const [id, role] of [
    ["root", "super_admin"],
    ["coord", "worship_coordinator"],
  ]) {
    await db
      .prepare(
        "INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES(?,'a',?,?, 'active','now','now')",
      )
      .bind(id, `${id}@example.invalid`, id)
      .run();
    await db
      .prepare(
        "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES(?,'a',?,?,?,'now','now','now')",
      )
      .bind(`grant-${id}`, id, role, id)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO service_fields(id,organization_id,code,name,created_at,updated_at) VALUES('field-a','a','music','Music','now','now')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO service_roles(id,organization_id,field_id,code,name,created_at,updated_at) VALUES('role-a','a','field-a','music','Music','now','now')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO servants(id,organization_id,display_name,created_at,updated_at) VALUES('servant-a','a','Synthetic Servant','now','now'),('servant-no-cap','a','No Capability','now','now')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES('approver-a','a','role-a','root','now','now')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES('cap-a','a','servant-a','role-a','active','root','now','now','now')",
    )
    .run();
}, 30000);
afterAll(async () => runtime?.dispose());

async function request(
  path: string,
  method: string,
  body: unknown,
  email = "root@example.invalid",
  key = crypto.randomUUID(),
) {
  const app = createApp({
    verify: async () => email,
    findActor,
    timezone: getTimezone,
    audit: async () => {},
  });
  return app.request(
    path,
    {
      method,
      headers: {
        "Cf-Access-Jwt-Assertion": "synthetic",
        "Content-Type": "application/json",
        Origin: "https://app.example.invalid",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    },
    {
      DB: db,
      ORGANIZATION_ID: "a",
      APP_ORIGIN: "https://app.example.invalid",
      ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
      ACCESS_AUDIENCE: "synthetic",
      ENVIRONMENT: "local",
      AUTH_LIMITER: { limit: async () => ({ success: true }) },
      MUTATION_LIMITER: { limit: async () => ({ success: true }) },
    },
  );
}

describe("schedule mutations", () => {
  it("creates operational catalog and servant availability atomically", async () => {
    const fieldResponse = await request("/api/v1/fields", "POST", {
      code: "hospitality",
      name: "Hospitality",
    });
    expect(fieldResponse.status).toBe(201);
    const fieldId = ((await fieldResponse.json()) as { data: { id: string } })
      .data.id;
    const roleResponse = await request("/api/v1/service-roles", "POST", {
      fieldId,
      code: "greeter",
      name: "Greeter",
      slotsRequired: 2,
      criticality: "normal",
    });
    expect(roleResponse.status).toBe(201);
    const servantKey = crypto.randomUUID();
    const servantInput = {
      displayName: "Synthetic New Servant",
      isBackup: true,
    };
    const servantResponse = await request(
      "/api/v1/servants",
      "POST",
      servantInput,
      undefined,
      servantKey,
    );
    const replay = await request(
      "/api/v1/servants",
      "POST",
      servantInput,
      undefined,
      servantKey,
    );
    expect([servantResponse.status, replay.status]).toEqual([201, 201]);
    const servantId = (
      (await servantResponse.json()) as { data: { id: string } }
    ).data.id;
    expect(
      (
        await request("/api/v1/availability-blocks", "POST", {
          servantId,
          startsAt: "2027-02-01T00:00:00Z",
          endsAt: "2027-02-02T00:00:00Z",
          type: "unavailable",
          notePrivate: "Synthetic private note",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          "/api/v1/servants",
          "POST",
          servantInput,
          "coord@example.invalid",
        )
      ).status,
    ).toBe(403);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) count FROM audit_logs WHERE entity_id=? AND action='servant.create'",
        )
        .bind(servantId)
        .first("count"),
    ).toBe(1);
  });
  it("requires a designated capability approver and activates coordinator scope", async () => {
    const roleResponse = await request("/api/v1/service-roles", "POST", {
      fieldId: "field-a",
      code: "vocal-test",
      name: "Vocal Test",
    });
    const serviceRoleId = (
      (await roleResponse.json()) as { data: { id: string } }
    ).data.id;
    const servantResponse = await request("/api/v1/servants", "POST", {
      displayName: "Capability Subject",
    });
    const servantId = (
      (await servantResponse.json()) as { data: { id: string } }
    ).data.id;
    expect(
      (
        await request("/api/v1/servant-capabilities", "POST", {
          servantId,
          serviceRoleId,
          status: "active",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/v1/capability-approvers", "POST", {
          serviceRoleId,
          userId: "root",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request("/api/v1/servant-capabilities", "POST", {
          servantId,
          serviceRoleId,
          status: "active",
          monthlyAssignmentLimit: 2,
        })
      ).status,
    ).toBe(201);
    const service = await request("/api/v1/services", "POST", {
      assemblyAt: "2027-03-10T08:00:00Z",
      startsAt: "2027-03-10T09:00:00Z",
      endsAt: "2027-03-10T10:00:00Z",
      location: "Synthetic",
    });
    const serviceId = ((await service.json()) as { data: { id: string } }).data
      .id;
    expect(
      (
        await request("/api/v1/coordinator-scopes", "POST", {
          userId: "coord",
          type: "service",
          scopeId: serviceId,
          startsAt: "2026-01-01T00:00:00Z",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          `/api/v1/services/${serviceId}/status`,
          "PATCH",
          { status: "scheduled", version: 1 },
          "coord@example.invalid",
        )
      ).status,
    ).toBe(200);
  });
  it("lists organization services with readiness counts", async () => {
    const response = await request(
      "/api/v1/services?limit=20",
      "GET",
      undefined,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: Array<{ assignmentCount: number; confirmedCount: number }>;
    };
    expect(
      payload.data.every(
        (service) => service.assignmentCount >= service.confirmedCount,
      ),
    ).toBe(true);
  });
  it("creates idempotently and records one atomic audit", async () => {
    const key = crypto.randomUUID();
    const input = {
      assemblyAt: "2026-09-10T08:00:00Z",
      startsAt: "2026-09-10T09:00:00Z",
      endsAt: "2026-09-10T10:00:00Z",
      location: " Synthetic Hall ",
    };
    const first = await request(
      "/api/v1/services",
      "POST",
      input,
      undefined,
      key,
    );
    const second = await request(
      "/api/v1/services",
      "POST",
      input,
      undefined,
      key,
    );
    expect([first.status, second.status]).toEqual([201, 201]);
    const id = ((await first.json()) as { data: { id: string } }).data.id;
    expect(
      await db
        .prepare("SELECT COUNT(*) count FROM worship_services WHERE id=?")
        .bind(id)
        .first("count"),
    ).toBe(1);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) count FROM audit_logs WHERE action='service.create' AND entity_id=?",
        )
        .bind(id)
        .first("count"),
    ).toBe(1);
  });
  it("rejects unscoped coordinator and stale versions", async () => {
    const created = await request("/api/v1/services", "POST", {
      assemblyAt: "2026-10-10T08:00:00Z",
      startsAt: "2026-10-10T09:00:00Z",
      endsAt: "2026-10-10T10:00:00Z",
      location: "Synthetic",
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    expect(
      (
        await request(
          `/api/v1/services/${id}/status`,
          "PATCH",
          { status: "scheduled", version: 1 },
          "coord@example.invalid",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/api/v1/services/${id}/status`, "PATCH", {
          status: "scheduled",
          version: 99,
        })
      ).status,
    ).toBe(409);
  });
  it("rolls back mutation and receipt when audit fails", async () => {
    const created = await request("/api/v1/services", "POST", {
      assemblyAt: "2026-11-10T08:00:00Z",
      startsAt: "2026-11-10T09:00:00Z",
      endsAt: "2026-11-10T10:00:00Z",
      location: "Synthetic",
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    await db
      .prepare(
        "CREATE TRIGGER fail_service_audit BEFORE INSERT ON audit_logs WHEN NEW.action='service.status.change' BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
      )
      .run();
    const key = crypto.randomUUID();
    try {
      expect(
        (
          await request(
            `/api/v1/services/${id}/status`,
            "PATCH",
            { status: "scheduled", version: 1 },
            undefined,
            key,
          )
        ).status,
      ).toBe(500);
      expect(
        await db
          .prepare("SELECT version FROM worship_services WHERE id=?")
          .bind(id)
          .first("version"),
      ).toBe(1);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) count FROM worship_service_status_changes WHERE idempotency_key=?",
          )
          .bind(key)
          .first("count"),
      ).toBe(0);
    } finally {
      await db.prepare("DROP TRIGGER fail_service_audit").run();
    }
  });
  it("creates assignments idempotently and enforces capability and scope", async () => {
    const created = await request("/api/v1/services", "POST", {
      assemblyAt: "2027-01-10T08:00:00Z",
      startsAt: "2027-01-10T09:00:00Z",
      endsAt: "2027-01-10T10:00:00Z",
      location: "Synthetic",
    });
    const serviceId = ((await created.json()) as { data: { id: string } }).data
      .id;
    const key = crypto.randomUUID();
    const input = {
      serviceId,
      serviceRoleId: "role-a",
      servantId: "servant-a",
    };
    const first = await request(
      "/api/v1/assignments",
      "POST",
      input,
      undefined,
      key,
    );
    const second = await request(
      "/api/v1/assignments",
      "POST",
      input,
      undefined,
      key,
    );
    expect([first.status, second.status]).toEqual([201, 201]);
    const assignmentId = ((await first.json()) as { data: { id: string } }).data
      .id;
    expect(
      (
        await request(`/api/v1/assignments/${assignmentId}/status`, "PATCH", {
          status: "awaiting_confirmation",
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/v1/assignments", "POST", {
          ...input,
          servantId: "servant-no-cap",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/api/v1/assignments",
          "POST",
          input,
          "coord@example.invalid",
        )
      ).status,
    ).toBe(403);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) count FROM audit_logs WHERE entity_type='assignment' AND entity_id=?",
        )
        .bind(assignmentId)
        .first("count"),
    ).toBe(2);
  });
});
