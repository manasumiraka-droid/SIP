import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Supabase PostgreSQL migration", () => {
  const database = new PGlite();

  beforeAll(async () => {
    const migration = readFileSync(
      "supabase/migrations/20260910000000_spi_schema.sql",
      "utf8",
    )
      // Supabase supplies pgcrypto and its API roles. The embedded PostgreSQL
      // validator intentionally has neither, so only those provider statements
      // are removed from this local syntax/constraint test.
      .replace("create extension if not exists pgcrypto;", "")
      .replace(/^revoke .*$/gmu, "");
    await database.exec(migration);
  }, 20_000);

  afterAll(async () => database.close());

  it("creates the complete schema and fixed authorization catalog", async () => {
    const tables = await database.query<{ count: number }>(
      "select count(*)::integer as count from information_schema.tables where table_schema='public'",
    );
    const roles = await database.query<{ count: number }>(
      "select count(*)::integer as count from roles",
    );
    expect(tables.rows[0]?.count).toBeGreaterThanOrEqual(35);
    expect(roles.rows[0]?.count).toBe(6);
  });

  it("keeps audit rows append-only", async () => {
    await database.exec(
      "insert into organizations(id,name,created_at,updated_at) values('org-test','Test','2026-09-10T00:00:00Z','2026-09-10T00:00:00Z')",
    );
    await database.exec(
      "insert into audit_logs(id,organization_id,actor_type,action,entity_type,entity_id,request_id,created_at) values('audit-test','org-test','system','test','organization','org-test','request-test','2026-09-10T00:00:00Z')",
    );
    await expect(
      database.exec(
        "update audit_logs set action='changed' where id='audit-test'",
      ),
    ).rejects.toThrow("Audit is append only");
  });
});
