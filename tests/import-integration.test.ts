import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import type { Actor } from "../packages/domain/src/access";
import {
  commitImportBatch,
  createImportBatch,
  createPendingImportServant,
  previewImportBatch,
  reviewImportRow,
  rollbackImportBatch,
  validateImportBatch,
} from "../apps/worker/src/import-repository";
import { runImportRetention } from "../apps/worker/src/import-retention";

let runtime: Miniflare;
let db: D1Database;
const admin: Actor = {
  id: "admin",
  organizationId: "a",
  displayName: "Admin",
  status: "active",
  roles: ["admin"],
  scopes: [],
};
const root: Actor = { ...admin, roles: ["super_admin"] };
const mapping = Object.fromEntries(
  [
    "Nomor",
    "tanggal",
    "Tempat Kebaktian/Ibadah",
    "Pelayan Firman",
    "MC",
    "Pelayan Persembahan",
  ].map((name) => [name, name]),
);
async function migrate(path: string) {
  const sql = readFileSync(path, "utf8")
    .replace(/^--.*$/gm, "")
    .trim();
  for (const statement of sql
    .split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|PRAGMA|$))/i)
    .map((value) => value.trim())
    .filter(Boolean))
    await db.prepare(statement).run();
}
async function makeBatch(number: string, date: string, preacher = "Pelayan A") {
  return createImportBatch(
    db,
    admin,
    `${number}.xlsx`,
    number.padStart(64, "0"),
    {
      sheets: ["Jadwal Ibadah"],
      sheetName: "Jadwal Ibadah",
      headers: Object.keys(mapping),
      rows: [
        {
          Nomor: number,
          tanggal: date,
          "Tempat Kebaktian/Ibadah": `Lokasi ${number}`,
          "Pelayan Firman": preacher,
          MC: "",
          "Pelayan Persembahan": "",
        },
      ],
    },
    mapping,
    crypto.randomUUID(),
  );
}

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
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
    "0023_remote_trigger_compatibility.sql",
    "0026_servant_phone_and_title.sql",
  ])
    await migrate(`migrations/${name}`);
  for (const org of ["a", "b"])
    await db
      .prepare(
        "INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)",
      )
      .bind(org, `Synthetic ${org}`, "now", "now")
      .run();
  for (const id of ["admin", "other"]) {
    const org = id === "other" ? "b" : "a";
    await db
      .prepare(
        "INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,?, 'active','now','now')",
      )
      .bind(id, org, `${id}@example.invalid`, id)
      .run();
    await db
      .prepare(
        "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES(?,?,?,?,?,'now','now','now')",
      )
      .bind(`grant-${id}`, org, id, "admin", id)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO service_fields(id,organization_id,code,name,created_at,updated_at) VALUES('field','a','worship','Worship','now','now')",
    )
    .run();
  for (const [id, name] of [
    ["preacher", "Pelayan Firman"],
    ["mc", "MC"],
    ["offering", "Pelayan Persembahan"],
  ]) {
    await db
      .prepare(
        "INSERT INTO service_roles(id,organization_id,field_id,code,name,created_at,updated_at) VALUES(?,'a','field',?,?, 'now','now')",
      )
      .bind(id, id, name)
      .run();
    await db
      .prepare(
        "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES(?,'a',?,'admin','now','now')",
      )
      .bind(`approver-${id}`, id)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO servants(id,organization_id,display_name,status,created_at,updated_at) VALUES('servant-a','a','Pelayan A','active','now','now')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES('cap-a','a','servant-a','preacher','active','admin','now','now','now')",
    )
    .run();
}, 30000);
afterAll(async () => runtime.dispose());

describe("schedule import workflow", () => {
  it("validates, commits idempotently, reports, and rolls back", async () => {
    const created = await makeBatch("1", "14/09/2026");
    expect(
      (
        await validateImportBatch(
          db,
          admin,
          created.id,
          mapping,
          "dmy",
          "validate",
        )
      ).status,
    ).toBe("ready");
    const key = crypto.randomUUID();
    expect(
      (await commitImportBatch(db, admin, created.id, key, "commit")).replayed,
    ).toBe(false);
    expect(
      (await commitImportBatch(db, admin, created.id, key, "commit")).replayed,
    ).toBe(true);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM worship_services WHERE organization_id='a'",
        )
        .first("n"),
    ).toBe(1);
    expect(
      (
        await rollbackImportBatch(
          db,
          root,
          created.id,
          crypto.randomUUID(),
          "rollback",
        )
      ).status,
    ).toBe("rolled_back");
  });

  it("requires warning acknowledgement and persists an audited WITA override", async () => {
    const created = await makeBatch("2", "15/09/2026");
    const preview = await previewImportBatch(db, admin, created.id, 0, 10);
    const row = preview.data[0];
    if (!row) throw new Error("Synthetic import row missing");
    const rowId = row.id;
    await reviewImportRow(
      db,
      admin,
      created.id,
      rowId,
      { startsAt: "2026-09-15T11:00:00.000Z" },
      crypto.randomUUID(),
      "time",
    );
    expect(
      (
        await validateImportBatch(
          db,
          admin,
          created.id,
          mapping,
          "dmy",
          "validate",
        )
      ).status,
    ).toBe("ready");
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE action='import.row.review' AND entity_id=?",
        )
        .bind(rowId)
        .first("n"),
    ).toBe(1);
  });

  it("creates pending-review servants without assigning them and enforces tenant ownership", async () => {
    const created = await makeBatch("3", "16/09/2026", "Nama Baru");
    await validateImportBatch(
      db,
      admin,
      created.id,
      mapping,
      "dmy",
      "validate",
    );
    const row = (await previewImportBatch(db, admin, created.id, 0, 10))
      .data[0];
    if (!row) throw new Error("Synthetic import row missing");
    const rowId = row.id;
    await createPendingImportServant(
      db,
      admin,
      created.id,
      rowId,
      "preacher",
      crypto.randomUUID(),
      "pending",
    );
    await validateImportBatch(
      db,
      admin,
      created.id,
      mapping,
      "dmy",
      "validate",
    );
    await reviewImportRow(
      db,
      admin,
      created.id,
      rowId,
      { acknowledgeWarnings: true },
      crypto.randomUUID(),
      "ack",
    );
    expect(
      (
        await validateImportBatch(
          db,
          admin,
          created.id,
          mapping,
          "dmy",
          "validate",
        )
      ).status,
    ).toBe("ready");
    await commitImportBatch(
      db,
      admin,
      created.id,
      crypto.randomUUID(),
      "commit",
    );
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM servants WHERE status='pending_review'",
        )
        .first("n"),
    ).toBe(1);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM assignments WHERE source_import_row_id=?",
        )
        .bind(rowId)
        .first("n"),
    ).toBe(0);
    const foreign: Actor = {
      id: "other",
      organizationId: "b",
      displayName: "Other",
      status: "active",
      roles: ["admin"],
      scopes: [],
    };
    await expect(
      previewImportBatch(db, foreign, created.id, 0, 10),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("defaults duplicates to skip and requires explicit warning acknowledgement", async () => {
    await db
      .prepare(
        "INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,version,created_at,updated_at) VALUES('existing','a','2026-09-18T08:30:00.000Z','2026-09-18T09:00:00.000Z','2026-09-18T11:00:00.000Z','Lokasi 5','draft',1,'now','now')",
      )
      .run();
    const created = await makeBatch("5", "18/09/2026");
    expect(
      (
        await validateImportBatch(
          db,
          admin,
          created.id,
          mapping,
          "dmy",
          "validate",
        )
      ).status,
    ).toBe("needs_review");
    const preview = await previewImportBatch(db, admin, created.id, 0, 10);
    const row = preview.data[0];
    if (!row) throw new Error("Synthetic import row missing");
    expect(preview.data[0]).toMatchObject({
      proposed_action: "skip",
      duplicate_service_id: "existing",
    });
    await reviewImportRow(
      db,
      admin,
      created.id,
      row.id,
      { acknowledgeWarnings: true },
      crypto.randomUUID(),
      "ack",
    );
    expect(
      (
        await validateImportBatch(
          db,
          admin,
          created.id,
          mapping,
          "dmy",
          "validate",
        )
      ).status,
    ).toBe("ready");
    await commitImportBatch(
      db,
      admin,
      created.id,
      crypto.randomUUID(),
      "commit",
    );
    expect(
      await db
        .prepare("SELECT COUNT(*) n FROM worship_services WHERE id='existing'")
        .first("n"),
    ).toBe(1);
    expect(
      await db
        .prepare("SELECT action FROM import_results WHERE import_row_id=?")
        .bind(row.id)
        .first("action"),
    ).toBe("skipped");
  });

  it("merges only into vacant assignment slots", async () => {
    await db
      .prepare(
        "INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,version,created_at,updated_at) VALUES('merge-target','a','2026-09-19T08:30:00.000Z','2026-09-19T09:00:00.000Z','2026-09-19T11:00:00.000Z','Lokasi 6','draft',1,'now','now')",
      )
      .run();
    const created = await makeBatch("6", "19/09/2026");
    await validateImportBatch(
      db,
      admin,
      created.id,
      mapping,
      "dmy",
      "validate",
    );
    const row = (await previewImportBatch(db, admin, created.id, 0, 10))
      .data[0];
    if (!row) throw new Error("Synthetic import row missing");
    await reviewImportRow(
      db,
      admin,
      created.id,
      row.id,
      { action: "merge_assignments", acknowledgeWarnings: true },
      crypto.randomUUID(),
      "merge",
    );
    expect(
      (
        await validateImportBatch(
          db,
          admin,
          created.id,
          mapping,
          "dmy",
          "validate",
        )
      ).status,
    ).toBe("ready");
    await commitImportBatch(
      db,
      admin,
      created.id,
      crypto.randomUUID(),
      "commit",
    );
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM assignments WHERE worship_service_id='merge-target'",
        )
        .first("n"),
    ).toBe(1);
    expect(
      await db
        .prepare("SELECT action FROM import_results WHERE import_row_id=?")
        .bind(row.id)
        .first("action"),
    ).toBe("merged");
  });

  it("expires abandoned batches and scrubs terminal staging after 30 days", async () => {
    const created = await makeBatch("4", "17/09/2026");
    await db
      .prepare(
        "UPDATE import_batches SET expires_at='2000-01-01',updated_at='2000-01-01' WHERE id=?",
      )
      .bind(created.id)
      .run();
    const result = await runImportRetention(db);
    expect(result.expired).toBeGreaterThan(0);
    expect(
      await db
        .prepare("SELECT status FROM import_batches WHERE id=?")
        .bind(created.id)
        .first("status"),
    ).toBe("expired");
    expect(
      await db
        .prepare("SELECT raw_json FROM import_rows WHERE batch_id=?")
        .bind(created.id)
        .first("raw_json"),
    ).toBe("{}");
  });
});
