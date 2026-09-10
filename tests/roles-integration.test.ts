import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import { createApp } from "../apps/worker/src/app";
import { findActor, getTimezone } from "../apps/worker/src/repository";
import {
  changeAccountStatus,
  changeRoles,
  createUser,
} from "../apps/worker/src/users-service";
import { createdUserResponseSchema } from "../packages/validation/src/users";
import { auditResponseSchema } from "../packages/validation/src/audit";
import type { Actor } from "../packages/domain/src/access";
let runtime: Miniflare;
let db: D1Database;
const admin: Actor = {
  id: "root",
  organizationId: "a",
  displayName: "Synthetic admin",
  status: "active",
  roles: ["super_admin"],
  scopes: [],
};
async function setup() {
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
  for (const path of [
    "migrations/0001_identity.sql",
    "migrations/0002_role_changes.sql",
    "migrations/0003_user_creations.sql",
    "migrations/0004_account_status_changes.sql",
    "migrations/0005_bootstrap_state.sql",
    "migrations/0006_audit_retention_holds.sql",
    "migrations/0007_foundation_review_hardening.sql",
  ]) {
    const sql = readFileSync(path, "utf8")
      .replace(/^--.*$/gm, "")
      .trim();
    const statements = sql
      .split(/;\s*(?=(?:CREATE|INSERT|PRAGMA|$))/i)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await db.prepare(statement).run();
  }
  await db
    .prepare(
      "INSERT INTO organizations(id,name,created_at,updated_at) VALUES ('a','Synthetic A','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),('b','Synthetic B','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z')",
    )
    .run();
  for (const [id, org, role] of [
    ["root", "a", "super_admin"],
    ["target", "a", "servant"],
    ["other", "b", "super_admin"],
    ["office", "a", "admin"],
    ["status-target", "a", "servant"],
    ["audit-denied", "a", "servant"],
  ]) {
    await db
      .prepare(
        "INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,?,'active','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z')",
      )
      .bind(id, org, `${id}@example.invalid`, id)
      .run();
    await db
      .prepare(
        "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES (?,?,?,?,?,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z','2026-09-08T00:00:00Z')",
      )
      .bind(`role-${id}`, org, id, role, id)
      .run();
  }
}
async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    email?: string;
    origin?: string | null;
    key?: string;
    success?: boolean;
  } = {},
) {
  const app = createApp({
    verify: async () => options.email ?? "root@example.invalid",
    findActor,
    timezone: getTimezone,
    audit: async () => {},
  });
  const headers: Record<string, string> = {
    "Cf-Access-Jwt-Assertion": "synthetic",
    "Content-Type": "application/json",
    "Idempotency-Key": options.key ?? crypto.randomUUID(),
  };
  if (options.origin !== null)
    headers.Origin = options.origin ?? "https://app.example.invalid";
  return app.request(
    path,
    {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    {
      DB: db,
      ORGANIZATION_ID: "a",
      APP_ORIGIN: "https://app.example.invalid",
      ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
      ACCESS_AUDIENCE: "synthetic-audience",
      MUTATION_LIMITER: {
        limit: async () => ({ success: options.success ?? true }),
      },
      ENVIRONMENT: "local",
      AUTH_LIMITER: { limit: async () => ({ success: true }) },
    },
  );
}
describe("D1 atomic role management", () => {
  beforeAll(setup, 30000);
  afterAll(async () => {
    await runtime?.dispose();
  });
  beforeEach(async () => {
    await db.prepare("UPDATE users SET status='active' WHERE id='root'").run();
  });
  it("isolates listing, redacts email and paginates", async () => {
    const response = await request("/api/v1/users?limit=1");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("@");
    expect(text).not.toContain("other");
    expect(text).toContain("next_cursor");
  });
  it("rejects forbidden actor and cross-organization target", async () => {
    expect(
      (
        await request("/api/v1/users/target/roles", {
          method: "PUT",
          email: "office@example.invalid",
          body: { roles: ["admin"], version: 1 },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/v1/users/other/roles", {
          method: "PUT",
          body: { roles: ["admin"], version: 1 },
        })
      ).status,
    ).toBe(404);
  });
  it("allows admin organization reads and servant self reads only", async () => {
    expect(
      (await request("/api/v1/users", { email: "office@example.invalid" }))
        .status,
    ).toBe(200);
    const servantResponse = await request("/api/v1/users", {
      email: "target@example.invalid",
    });
    expect(servantResponse.status).toBe(200);
    const payload = await servantResponse.text();
    expect(payload).toContain("target");
    expect(payload).not.toContain("root");
    expect(payload).not.toContain("office");
  });
  it("rejects missing origin, unknown fields, public role and rate limit", async () => {
    const path = "/api/v1/users/target/roles";
    expect(
      (
        await request(path, {
          method: "PUT",
          origin: null,
          body: { roles: ["admin"], version: 1 },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(path, {
          method: "PUT",
          body: { roles: ["admin"], version: 1, organization_id: "b" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(path, {
          method: "PUT",
          body: { roles: ["public_viewer"], version: 1 },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(path, {
          method: "PUT",
          success: false,
          body: { roles: ["admin"], version: 1 },
        })
      ).status,
    ).toBe(429);
  });
  it("replaces multiple roles atomically and replays without duplicate audit", async () => {
    const key = crypto.randomUUID();
    const update = { roles: ["admin", "servant"], version: 1 };
    expect(
      (
        await request("/api/v1/users/target/roles", {
          method: "PUT",
          body: update,
          key,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/v1/users/target/roles", {
          method: "PUT",
          body: update,
          key,
        })
      ).status,
    ).toBe(200);
    const target = await findActor(db, "a", "target@example.invalid");
    expect(target?.roles).toEqual(["admin", "servant"]);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_logs WHERE action='user.roles.replace'",
        )
        .first("count"),
    ).toBe(1);
    expect(
      (
        await request("/api/v1/users/target/roles", {
          method: "PUT",
          body: { roles: ["servant"], version: 1 },
          key,
        })
      ).status,
    ).toBe(409);
  });
  it("rejects stale version and last active super admin removal", async () => {
    expect(
      (
        await request("/api/v1/users/target/roles", {
          method: "PUT",
          body: { roles: [], version: 1 },
        })
      ).status,
    ).toBe(409);
    const response = await request("/api/v1/users/root/roles", {
      method: "PUT",
      body: { roles: ["admin"], version: 1 },
    });
    expect(response.status).toBe(409);
    expect((await findActor(db, "a", "root@example.invalid"))?.roles).toEqual([
      "super_admin",
    ]);
  });
  it("rechecks persisted actor authorization inside transaction", async () => {
    await db
      .prepare("UPDATE users SET status='suspended' WHERE id='root'")
      .run();
    await expect(
      changeRoles(
        db,
        admin,
        "target",
        { roles: [], version: 2 },
        crypto.randomUUID(),
        "req",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows exactly one concurrent version update", async () => {
    const outcomes = await Promise.all([
      request("/api/v1/users/target/roles", {
        method: "PUT",
        body: { roles: ["admin"], version: 2 },
      }),
      request("/api/v1/users/target/roles", {
        method: "PUT",
        body: { roles: ["servant"], version: 2 },
      }),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual([200, 409]);
  });
  it("rolls back receipt, roles and version if audit fails", async () => {
    await db
      .prepare(
        "CREATE TRIGGER fail_role_audit BEFORE INSERT ON audit_logs WHEN NEW.action='user.roles.replace' BEGIN SELECT RAISE(ABORT,'test injected failure'); END",
      )
      .run();
    const key = crypto.randomUUID();
    const response = await request("/api/v1/users/target/roles", {
      method: "PUT",
      body: { roles: ["admin"], version: 3 },
      key,
    });
    expect(response.status).toBe(500);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM role_changes WHERE idempotency_key=?",
        )
        .bind(key)
        .first("count"),
    ).toBe(0);
    expect(
      await db
        .prepare("SELECT version FROM users WHERE id='target'")
        .first("version"),
    ).toBe(3);
    await db.prepare("DROP TRIGGER fail_role_audit").run();
  });
  it("creates normalized account and roles with private data absent from audit", async () => {
    const key = crypto.randomUUID();
    const input = {
      displayName: "  Nama   Pengurus  ",
      email: "  New@Example.invalid ",
      roles: ["admin", "servant"],
    };
    const response = await request("/api/v1/users", {
      method: "POST",
      body: input,
      key,
    });
    expect(response.status).toBe(201);
    const result = createdUserResponseSchema.parse(await response.json());
    const actor = await findActor(db, "a", "new@example.invalid");
    expect(actor).toMatchObject({
      id: result.data.id,
      displayName: "Nama Pengurus",
      status: "active",
      roles: ["admin", "servant"],
      organizationId: "a",
    });
    const audit = await db
      .prepare(
        "SELECT metadata_redacted_json FROM audit_logs WHERE action='user.create' AND entity_id=?",
      )
      .bind(result.data.id)
      .first<string>("metadata_redacted_json");
    expect(audit).toContain("admin");
    expect(audit).not.toContain("Nama");
    expect(audit).not.toContain("@");
    const repeated = await request("/api/v1/users", {
      method: "POST",
      body: { ...input, roles: ["servant", "admin"] },
      key,
    });
    expect(repeated.status).toBe(201);
    expect(createdUserResponseSchema.parse(await repeated.json()).data).toEqual(
      result.data,
    );
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_logs WHERE action='user.create' AND entity_id=?",
        )
        .bind(result.data.id)
        .first("count"),
    ).toBe(1);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: { ...input, displayName: "Different" },
          key,
        })
      ).status,
    ).toBe(409);
  });
  it("prevents duplicate emails case-insensitively without exposing another organization", async () => {
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: {
            displayName: "Duplicate",
            email: "NEW@EXAMPLE.INVALID",
            roles: ["admin"],
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: {
            displayName: "Independent",
            email: "other@example.invalid",
            roles: ["admin"],
          },
        })
      ).status,
    ).toBe(201);
  });
  it("rejects unauthorized creators and tenant mass assignment", async () => {
    const input = {
      displayName: "Forbidden",
      email: "forbidden@example.invalid",
      roles: ["admin"],
    };
    for (const email of ["office@example.invalid", "target@example.invalid"])
      expect(
        (await request("/api/v1/users", { method: "POST", email, body: input }))
          .status,
      ).toBe(403);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: { ...input, organization_id: "b" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: { ...input, status: "active" },
        })
      ).status,
    ).toBe(422);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE email='forbidden@example.invalid'",
        )
        .first("count"),
    ).toBe(0);
  });
  it("validates create fields, CSRF, limits and role choices", async () => {
    const input = {
      displayName: "Valid",
      email: "valid@example.invalid",
      roles: ["admin"],
    };
    for (const body of [
      { ...input, email: "bad" },
      { ...input, displayName: " " },
      { ...input, displayName: "x".repeat(121) },
      { ...input, roles: ["public_viewer"] },
      { ...input, roles: ["servant"] },
      { ...input, roles: ["admin", "admin"] },
    ])
      expect(
        (await request("/api/v1/users", { method: "POST", body })).status,
      ).toBe(422);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: input,
          origin: null,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: input,
          success: false,
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: input,
          key: "invalid",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request("/api/v1/users", {
          method: "POST",
          body: { ...input, displayName: "x".repeat(3000) },
        })
      ).status,
    ).toBe(422);
  });
  it("rechecks creator status within the D1 transaction", async () => {
    await db
      .prepare("UPDATE users SET status='suspended' WHERE id='root'")
      .run();
    await expect(
      createUser(
        db,
        admin,
        {
          displayName: "Blocked",
          email: "blocked@example.invalid",
          roles: ["admin"],
        },
        crypto.randomUUID(),
        "req-create",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE email='blocked@example.invalid'",
        )
        .first("count"),
    ).toBe(0);
  });
  it("replays simultaneous identical creates without duplicate accounts", async () => {
    const key = crypto.randomUUID();
    const input = {
      displayName: "Concurrent",
      email: "concurrent@example.invalid",
      roles: ["admin"],
    };
    const responses = await Promise.all([
      request("/api/v1/users", { method: "POST", body: input, key }),
      request("/api/v1/users", { method: "POST", body: input, key }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const ids = await Promise.all(
      responses.map(
        async (response) =>
          createdUserResponseSchema.parse(await response.json()).data.id,
      ),
    );
    expect(ids[0]).toBe(ids[1]);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE email='concurrent@example.invalid'",
        )
        .first("count"),
    ).toBe(1);
  });
  it("rolls back account, roles and receipt when creation audit fails", async () => {
    await db
      .prepare(
        "CREATE TRIGGER fail_create_audit BEFORE INSERT ON audit_logs WHEN NEW.action='user.create' BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
      )
      .run();
    const key = crypto.randomUUID();
    try {
      const response = await request("/api/v1/users", {
        method: "POST",
        body: {
          displayName: "Rollback",
          email: "rollback@example.invalid",
          roles: ["admin"],
        },
        key,
      });
      expect(response.status).toBe(500);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM users WHERE email='rollback@example.invalid'",
          )
          .first("count"),
      ).toBe(0);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM user_creations WHERE idempotency_key=?",
          )
          .bind(key)
          .first("count"),
      ).toBe(0);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM user_roles ur LEFT JOIN users u ON ur.user_id=u.id WHERE u.id IS NULL",
          )
          .first("count"),
      ).toBe(0);
    } finally {
      await db.prepare("DROP TRIGGER fail_create_audit").run();
    }
  });
  it("changes account status atomically and prevents stale or cross-tenant writes", async () => {
    const key = crypto.randomUUID();
    const response = await request("/api/v1/users/status-target/status", {
      method: "PATCH",
      body: { status: "suspended", version: 1 },
      key,
    });
    expect(response.status).toBe(200);
    expect(
      await db
        .prepare("SELECT status FROM users WHERE id='status-target'")
        .first("status"),
    ).toBe("suspended");
    expect(
      (
        await request("/api/v1/users/status-target/status", {
          method: "PATCH",
          body: { status: "suspended", version: 1 },
          key,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/v1/users/status-target/status", {
          method: "PATCH",
          body: { status: "inactive", version: 1 },
        })
      ).status,
    ).toBe(409);
    const noOp = await request("/api/v1/users/status-target/status", {
      method: "PATCH",
      body: { status: "suspended", version: 2 },
    });
    expect(noOp.status).toBe(409);
    expect(await noOp.json()).toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
    expect(
      (
        await request("/api/v1/users/other/status", {
          method: "PATCH",
          body: { status: "inactive", version: 1 },
        })
      ).status,
    ).toBe(404);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_logs WHERE action='user.status.replace' AND entity_id='status-target'",
        )
        .first("count"),
    ).toBe(1);
  });
  it("protects the last active Super Admin and rechecks actor status", async () => {
    expect(
      (
        await request("/api/v1/users/root/status", {
          method: "PATCH",
          body: { status: "suspended", version: 1 },
        })
      ).status,
    ).toBe(409);
    await db
      .prepare("UPDATE users SET status='suspended' WHERE id='root'")
      .run();
    await expect(
      changeAccountStatus(
        db,
        admin,
        "status-target",
        { status: "active", version: 2 },
        crypto.randomUUID(),
        "status-req",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rolls back status receipt and user update when audit fails", async () => {
    await db.prepare("UPDATE users SET status='active' WHERE id='root'").run();
    await db
      .prepare(
        "CREATE TRIGGER fail_status_audit BEFORE INSERT ON audit_logs WHEN NEW.action='user.status.replace' BEGIN SELECT RAISE(ABORT,'test status audit failure'); END",
      )
      .run();
    const key = crypto.randomUUID();
    try {
      const response = await request("/api/v1/users/status-target/status", {
        method: "PATCH",
        body: { status: "inactive", version: 2 },
        key,
      });
      expect(response.status).toBe(500);
      expect(
        await db
          .prepare("SELECT status,version FROM users WHERE id='status-target'")
          .first(),
      ).toMatchObject({ status: "suspended", version: 2 });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM account_status_changes WHERE idempotency_key=?",
          )
          .bind(key)
          .first("count"),
      ).toBe(0);
    } finally {
      await db.prepare("DROP TRIGGER fail_status_audit").run();
    }
  });
  it("lists audit entries by permission, tenant, filter and stable cursor", async () => {
    const first = await request("/api/v1/audit-logs?limit=1", {
      email: "office@example.invalid",
    });
    expect(first.status).toBe(200);
    const firstPayload = auditResponseSchema.parse(await first.json());
    expect(firstPayload.data).toHaveLength(1);
    expect(firstPayload.next_cursor).toBeTruthy();
    const second = await request(
      `/api/v1/audit-logs?limit=1&cursor=${encodeURIComponent(firstPayload.next_cursor ?? "")}`,
      { email: "office@example.invalid" },
    );
    const secondPayload = auditResponseSchema.parse(await second.json());
    expect(secondPayload.data[0]?.id).not.toBe(firstPayload.data[0]?.id);
    expect(
      (
        await request("/api/v1/audit-logs", {
          email: "audit-denied@example.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/v1/audit-logs?cursor=invalid", {
          email: "office@example.invalid",
        })
      ).status,
    ).toBe(422);
    const filtered = await request("/api/v1/audit-logs?action=user.create", {
      email: "office@example.invalid",
    });
    const filteredText = await filtered.text();
    expect(filteredText).not.toContain("user.roles.replace");
    expect(filteredText).not.toContain("@");
  });
  it("reports protected D1 health without internal identifiers", async () => {
    const response = await request("/api/v1/health");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"environment":"local"');
    expect(text).not.toContain("spi-local");
    expect(text).not.toContain("00000000");
    expect((await request("/api/v1/health?detail=true")).status).toBe(422);
  });
});
