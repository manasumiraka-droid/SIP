import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import {
  buildConfirmationNotification,
  createActivation,
  handleWebhook,
  listTelegramDeliveryFailures,
  runTelegramNotifications,
} from "../apps/worker/src/telegram";

let runtime: Miniflare;
let db: D1Database;
const environment = () => ({
  DB: db,
  ORGANIZATION_ID: "a",
  TELEGRAM_WEBHOOK_SECRET: "synthetic-webhook-secret",
});
async function executeSql(sql: string) {
  for (const statement of sql
    .replace(/^--.*$/gm, "")
    .trim()
    .split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|PRAGMA|$))/iu)
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
  ])
    await executeSql(readFileSync(`migrations/${migration}`, "utf8"));
  await executeSql(`
    INSERT INTO organizations(id,name,timezone,created_at,updated_at) VALUES('a','Synthetic','Asia/Makassar','now','now');
    INSERT INTO users(id,organization_id,email,display_name,status,created_at,updated_at) VALUES('admin','a','admin@example.invalid','Admin','active','now','now');
    INSERT INTO service_fields(id,organization_id,code,name,created_at,updated_at) VALUES('field','a','field','Field','now','now');
    INSERT INTO service_roles(id,organization_id,field_id,code,name,criticality,created_at,updated_at) VALUES('role','a','field','role','Role','critical','now','now');
    INSERT INTO servants(id,organization_id,display_name,status,created_at,updated_at) VALUES('servant','a','Pelayan Sintetis','active','now','now');
    INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES('approver','a','role','admin','now','now');
    INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES('capability','a','servant','role','active','admin','now','now','now');
    INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at) VALUES('service','a','2027-01-01T08:00:00Z','2027-01-01T09:00:00Z','2027-01-01T10:00:00Z','Synthetic','scheduled','now','now');
    INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,created_at,updated_at) VALUES('assignment','a','service','role','servant','awaiting_confirmation','now','now');
  `);
});
afterAll(async () => runtime?.dispose());

function webhook(update: unknown, secret = "synthetic-webhook-secret") {
  return handleWebhook(
    new Request("https://app.example.invalid/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": secret,
      },
      body: JSON.stringify(update),
    }),
    environment(),
  );
}

describe("Telegram Phase 2", () => {
  it("rejects forged webhook secrets and consumes activation once", async () => {
    expect((await webhook({ update_id: 1 }, "forged")).status).toBe(401);
    const activation = await createActivation(
      db,
      "a",
      "servant",
      "admin",
      "request-activation",
      "activation-key-0001",
    );
    expect(activation.code).toMatch(/^[A-Z2-9]{10}$/u);
    expect(Date.parse(activation.expiresAt) - Date.now()).toBeLessThanOrEqual(
      15 * 60_000,
    );
    expect(
      (
        await webhook({
          update_id: 2,
          message: {
            chat: { id: 99881, type: "private" },
            from: { id: 99881 },
            text: `/start ${activation.code}`,
          },
        })
      ).status,
    ).toBe(200);
    expect(
      await db
        .prepare("SELECT telegram_user_id FROM servants WHERE id='servant'")
        .first("telegram_user_id"),
    ).toBe("99881");
    await webhook({
      update_id: 2,
      message: {
        chat: { id: 771, type: "private" },
        from: { id: 771 },
        text: `/start ${activation.code}`,
      },
    });
    expect(
      await db
        .prepare("SELECT telegram_user_id FROM servants WHERE id='servant'")
        .first("telegram_user_id"),
    ).toBe("99881");
  });

  it("accepts only the linked actor and makes callback replay a no-op", async () => {
    const prepared = await buildConfirmationNotification(
      new Date(Date.now() + 60_000).toISOString(),
    );
    for (const grant of prepared.grants)
      await db
        .prepare(
          "INSERT INTO telegram_callback_grants(id,organization_id,servant_id,assignment_id,action,nonce_hash,expires_at,created_at) VALUES(?,'a','servant','assignment',?,?,?,'now')",
        )
        .bind(grant.id, grant.action, grant.nonceHash, grant.expiresAt)
        .run();
    const payload = JSON.parse(prepared.payloadJson) as {
      replyMarkup: { inline_keyboard: Array<Array<{ callback_data: string }>> };
    };
    const callbackData =
      payload.replyMarkup.inline_keyboard[0]?.[0]?.callback_data;
    expect(callbackData).toBeTruthy();
    await webhook({
      update_id: 3,
      callback_query: { from: { id: 1122 }, data: callbackData },
    });
    expect(
      await db
        .prepare("SELECT status FROM assignments WHERE id='assignment'")
        .first("status"),
    ).toBe("awaiting_confirmation");
    await webhook({
      update_id: 4,
      callback_query: { from: { id: 99881 }, data: callbackData },
    });
    expect(
      await db
        .prepare("SELECT status FROM assignments WHERE id='assignment'")
        .first("status"),
    ).toBe("accepted");
    await webhook({
      update_id: 5,
      callback_query: { from: { id: 99881 }, data: callbackData },
    });
    expect(
      await db
        .prepare("SELECT COUNT(*) count FROM telegram_callback_receipts")
        .first("count"),
    ).toBe(1);
  });

  it("rejects expired and forged callback nonces", async () => {
    await executeSql(`
      INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at) VALUES('service-two','a','2027-02-01T08:00:00Z','2027-02-01T09:00:00Z','2027-02-01T10:00:00Z','Synthetic','scheduled','now','now');
      INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,created_at,updated_at) VALUES('assignment-two','a','service-two','role','servant','awaiting_confirmation','now','now');
    `);
    const prepared = await buildConfirmationNotification(
      new Date(Date.now() - 1_000).toISOString(),
    );
    const grant = prepared.grants[0];
    if (!grant) throw new Error("Synthetic grant missing");
    await db
      .prepare(
        "INSERT INTO telegram_callback_grants(id,organization_id,servant_id,assignment_id,action,nonce_hash,expires_at,created_at) VALUES(?,'a','servant','assignment-two',?,?,?,'now')",
      )
      .bind(grant.id, grant.action, grant.nonceHash, grant.expiresAt)
      .run();
    const payload = JSON.parse(prepared.payloadJson) as {
      replyMarkup: {
        inline_keyboard: Array<Array<{ callback_data: string }>>;
      };
    };
    const callbackData =
      payload.replyMarkup.inline_keyboard[0]?.[0]?.callback_data ?? "";
    await webhook({
      update_id: 6,
      callback_query: { from: { id: 99881 }, data: `${callbackData}forged` },
    });
    await webhook({
      update_id: 7,
      callback_query: { from: { id: 99881 }, data: callbackData },
    });
    expect(
      await db
        .prepare("SELECT status FROM assignments WHERE id='assignment-two'")
        .first("status"),
    ).toBe("awaiting_confirmation");
  });

  it("retries transient delivery at most three times with one intent", async () => {
    await executeSql(`
      INSERT INTO servants(id,organization_id,display_name,status,telegram_chat_id,telegram_user_id,created_at,updated_at) VALUES('retry-servant','a','Pelayan Retry','active','88771','88771','now','now');
      INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,created_at,updated_at) VALUES('retry-capability','a','retry-servant','role','active','admin','now','now','now');
      INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,created_at,updated_at) VALUES('retry-service','a','2027-03-01T08:00:00Z','2027-03-01T09:00:00Z','2027-03-01T10:00:00Z','Synthetic','scheduled','now','now');
      INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,status,created_at,updated_at) VALUES('retry-assignment','a','retry-service','role','retry-servant','awaiting_confirmation','now','now');
    `);
    await db
      .prepare(
        "INSERT INTO telegram_notification_intents(id,organization_id,servant_id,assignment_id,event_type,idempotency_key,due_at,payload_json,created_at,updated_at) VALUES('notice','a','retry-servant','retry-assignment','critical_reminder','same-logical-message','2000-01-01T00:00:00Z','{\"text\":\"Pengingat sintetis\"}','now','now')",
      )
      .run();
    const sender = {
      send: vi.fn(async () => ({
        ok: false as const,
        transient: true,
        category: "network_error",
      })),
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await db
        .prepare(
          "UPDATE telegram_notification_intents SET due_at='2000-01-01T00:00:00Z' WHERE id='notice'",
        )
        .run();
      await runTelegramNotifications(environment(), sender);
    }
    const result = await db
      .prepare(
        "SELECT status,attempt_count FROM telegram_notification_intents WHERE id='notice'",
      )
      .first<{ status: string; attempt_count: number }>();
    expect(result).toEqual({ status: "failed", attempt_count: 3 });
    expect(sender.send).toHaveBeenCalledTimes(3);
    const failures = await listTelegramDeliveryFailures(
      db,
      {
        id: "admin",
        organizationId: "a",
        displayName: "Admin",
        status: "active",
        roles: ["admin"],
        scopes: [],
      },
      20,
      "request-delivery-failures",
    );
    expect(failures).toEqual([
      expect.objectContaining({
        servantName: "Pelayan Retry",
        attemptCount: 3,
        errorCategory: "network_error",
      }),
    ]);
  });
});
