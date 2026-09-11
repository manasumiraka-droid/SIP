import { ApplicationError } from "../../../packages/domain/src/errors";
import type { Actor } from "../../../packages/domain/src/access";

export type TelegramEnv = {
  DB: D1Database;
  ORGANIZATION_ID: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_DELIVERY_ENABLED?: string;
};
export type TelegramSender = {
  send(
    chatId: string,
    text: string,
    buttons?: unknown,
  ): Promise<
    | { ok: true }
    | {
        ok: false;
        transient: boolean;
        retryAfterSeconds?: number;
        category: string;
      }
  >;
  acknowledge?(callbackQueryId: string): Promise<void>;
};

export type ConfirmationGrant = {
  id: string;
  action: "accept" | "unavailable";
  nonceHash: string;
  expiresAt: string;
};

const encoder = new TextEncoder();
async function digest(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
function equal(left: string, right: string) {
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1)
    difference |=
      (index < left.length ? left.charCodeAt(index) : 0) ^
      (index < right.length ? right.charCodeAt(index) : 0);
  return difference === 0;
}
function activationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

function opaqueNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function buildConfirmationNotification(expiresAt: string) {
  const choices = [
    { action: "accept" as const, label: "Saya bersedia" },
    { action: "unavailable" as const, label: "Saya berhalangan" },
  ];
  const grants: ConfirmationGrant[] = [];
  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> =
    [];
  for (const choice of choices) {
    const id = crypto.randomUUID();
    const nonce = opaqueNonce();
    grants.push({
      id,
      action: choice.action,
      nonceHash: await digest(nonce),
      expiresAt,
    });
    inlineKeyboard.push([
      { text: choice.label, callback_data: `v1:${id}:${nonce}` },
    ]);
  }
  return {
    grants,
    payloadJson: JSON.stringify({
      text: "Anda memiliki tugas ibadah yang menunggu konfirmasi.",
      replyMarkup: { inline_keyboard: inlineKeyboard },
    }),
  };
}
function isQuiet(now: Date, timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 21 || hour < 6;
}
function escapeText(value: string) {
  return value.replace(
    /[<>&]/gu,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[character] ?? character,
  );
}

export async function createActivation(
  db: D1Database,
  organizationId: string,
  servantId: string,
  actorId: string,
  requestId: string,
  idempotencyKey: string,
) {
  const prior = await db
    .prepare(
      "SELECT servant_id FROM telegram_activation_requests WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(organizationId, actorId, idempotencyKey)
    .first<{ servant_id: string }>();
  if (prior) {
    if (prior.servant_id !== servantId)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk pelayan lain.",
      );
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Permintaan aktivasi ini sudah diproses. Buat kode baru bila kode sebelumnya tidak terlihat.",
    );
  }
  const servant = await db
    .prepare(
      "SELECT id FROM servants WHERE organization_id=? AND id=? AND status='active' LIMIT 1",
    )
    .bind(organizationId, servantId)
    .first();
  if (!servant)
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Pelayan aktif tidak ditemukan.",
    );
  const code = activationCode();
  const activationId = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60_000).toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE telegram_activation_codes SET consumed_at=? WHERE organization_id=? AND servant_id=? AND consumed_at IS NULL",
      )
      .bind(now.toISOString(), organizationId, servantId),
    db
      .prepare(
        "INSERT INTO telegram_activation_codes(id,organization_id,servant_id,code_hash,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        activationId,
        organizationId,
        servantId,
        await digest(code),
        expires,
        actorId,
        now.toISOString(),
      ),
    db
      .prepare(
        "INSERT INTO telegram_activation_requests(id,organization_id,actor_id,servant_id,activation_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        actorId,
        servantId,
        activationId,
        idempotencyKey,
        now.toISOString(),
      ),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'telegram.activation.create','servant',?,?,json_object('expires_at',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        actorId,
        servantId,
        requestId,
        expires,
        now.toISOString(),
      ),
  ]);
  return { code, expiresAt: expires, maxAttempts: 5 };
}

export async function listTelegramDeliveryFailures(
  db: D1Database,
  actor: Actor,
  limit: number,
  requestId: string,
) {
  const organizationWide = actor.roles.some(
    (role) => role === "super_admin" || role === "admin",
  );
  const now = new Date().toISOString();
  const failures = (
    await db
      .prepare(
        `SELECT n.id,n.event_type AS eventType,n.attempt_count AS attemptCount,n.last_error_category AS errorCategory,n.due_at AS dueAt,s.display_name AS servantName
         FROM telegram_notification_intents n
         JOIN servants s ON s.organization_id=n.organization_id AND s.id=n.servant_id
         LEFT JOIN assignments a ON a.organization_id=n.organization_id AND a.id=n.assignment_id
         LEFT JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id
         WHERE n.organization_id=? AND n.status='failed' AND (?=1 OR
           EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=n.organization_id AND cs.user_id=? AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?) AND ((cs.scope_type='service' AND cs.scope_id=a.worship_service_id) OR (cs.scope_type='field' AND cs.scope_id=sr.field_id))))
         ORDER BY n.updated_at DESC,n.id DESC LIMIT ?`,
      )
      .bind(
        actor.organizationId,
        organizationWide ? 1 : 0,
        actor.id,
        now,
        now,
        limit,
      )
      .all<{
        id: string;
        eventType: string;
        attemptCount: number;
        errorCategory: string | null;
        dueAt: string;
        servantName: string;
      }>()
  ).results;
  await db
    .prepare(
      "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'telegram.delivery_failures.read','organization',?,?,json_object('result_count',?),?)",
    )
    .bind(
      crypto.randomUUID(),
      actor.organizationId,
      actor.id,
      actor.organizationId,
      requestId,
      failures.length,
      now,
    )
    .run();
  return failures;
}

async function activateFromCode(
  env: TelegramEnv,
  chatId: string,
  code: string,
) {
  const existingAttempt = await env.DB.prepare(
    "SELECT window_started_at,attempt_count FROM telegram_activation_attempts WHERE organization_id=? AND telegram_user_id=? LIMIT 1",
  )
    .bind(env.ORGANIZATION_ID, chatId)
    .first<{ window_started_at: string; attempt_count: number }>();
  const attemptWindowExpired =
    existingAttempt !== null &&
    Date.parse(existingAttempt.window_started_at) + 15 * 60_000 <= Date.now();
  if (
    existingAttempt &&
    !attemptWindowExpired &&
    existingAttempt.attempt_count >= 5
  )
    return "Terlalu banyak percobaan aktivasi. Minta kode baru kepada pengurus.";
  const attemptedAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO telegram_activation_attempts(organization_id,telegram_user_id,window_started_at,attempt_count,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(organization_id,telegram_user_id) DO UPDATE SET window_started_at=CASE WHEN window_started_at<=? THEN excluded.window_started_at ELSE window_started_at END,attempt_count=CASE WHEN window_started_at<=? THEN 1 ELSE MIN(attempt_count+1,5) END,updated_at=excluded.updated_at",
  )
    .bind(
      env.ORGANIZATION_ID,
      chatId,
      attemptedAt,
      attemptedAt,
      new Date(Date.now() - 15 * 60_000).toISOString(),
      new Date(Date.now() - 15 * 60_000).toISOString(),
    )
    .run();
  const hash = await digest(code);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT id,servant_id,code_hash,expires_at,attempts FROM telegram_activation_codes WHERE organization_id=? AND code_hash=? AND consumed_at IS NULL LIMIT 1",
  )
    .bind(env.ORGANIZATION_ID, hash)
    .first<{
      id: string;
      servant_id: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
    }>();
  if (
    !row ||
    !equal(row.code_hash, hash) ||
    row.attempts >= 5 ||
    Date.parse(row.expires_at) <= Date.now()
  )
    return "Kode aktivasi tidak valid atau sudah kedaluwarsa.";
  try {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE telegram_activation_codes SET attempts=attempts+1,consumed_at=? WHERE id=? AND attempts<5 AND consumed_at IS NULL",
      ).bind(now, row.id),
      env.DB.prepare(
        "UPDATE servants SET telegram_chat_id=?,telegram_user_id=?,updated_at=? WHERE organization_id=? AND id=? AND telegram_chat_id IS NULL",
      ).bind(chatId, chatId, now, env.ORGANIZATION_ID, row.servant_id),
      env.DB.prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'system',NULL,'telegram.activation.complete','servant',?,'telegram-webhook','{}',?)",
      ).bind(crypto.randomUUID(), env.ORGANIZATION_ID, row.servant_id, now),
    ]);
  } catch {
    return "Akun Telegram ini sudah terhubung atau kode tidak dapat dipakai.";
  }
  return "Aktivasi berhasil. Gunakan /tugas untuk melihat tugas Anda.";
}

async function commandReply(env: TelegramEnv, chatId: string, command: string) {
  if (command === "/bantuan")
    return "Perintah: /jadwal, /tugas, /bantuan, /darurat.";
  const servant = await env.DB.prepare(
    "SELECT id FROM servants WHERE organization_id=? AND telegram_chat_id=? AND status='active' LIMIT 1",
  )
    .bind(env.ORGANIZATION_ID, chatId)
    .first<{ id: string }>();
  if (!servant)
    return "Aktifkan akun terlebih dahulu melalui tautan dari pengurus.";
  const assignments = await env.DB.prepare(
    "SELECT a.id, sr.name role_name, ws.starts_at, ws.location FROM assignments a JOIN worship_services ws ON ws.organization_id=a.organization_id AND ws.id=a.worship_service_id JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id WHERE a.organization_id=? AND a.servant_id=? AND a.status IN ('awaiting_confirmation','accepted') AND ws.status='scheduled' AND ws.ends_at>? ORDER BY ws.starts_at LIMIT 5",
  )
    .bind(env.ORGANIZATION_ID, servant.id, new Date().toISOString())
    .all<{
      id: string;
      role_name: string;
      starts_at: string;
      location: string;
    }>();
  if (command === "/darurat") {
    const target = assignments.results[0];
    if (!target) return "Tidak ada tugas aktif yang dapat dilaporkan darurat.";
    const assignDetail = await env.DB.prepare(
      "SELECT a.worship_service_id, a.service_role_id, ws.starts_at FROM assignments a JOIN worship_services ws ON ws.organization_id=a.organization_id AND ws.id=a.worship_service_id WHERE a.organization_id=? AND a.id=?",
    )
      .bind(env.ORGANIZATION_ID, target.id)
      .first<{
        worship_service_id: string;
        service_role_id: string;
        starts_at: string;
      }>();
    const nowIso = new Date().toISOString();
    const diffMs = assignDetail
      ? Date.parse(assignDetail.starts_at) - Date.now()
      : 999999999;
    const urgency = diffMs <= 60 * 60 * 1000 ? "critical" : "standard";

    const batchStatements = [
      env.DB.prepare(
        "INSERT OR IGNORE INTO telegram_emergency_reports(id,organization_id,assignment_id,servant_id,created_at) VALUES(?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        env.ORGANIZATION_ID,
        target.id,
        servant.id,
        nowIso,
      ),
    ];
    if (assignDetail) {
      batchStatements.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO replacement_cases(id,organization_id,service_id,assignment_id,service_role_id,status,urgency,reason,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'open',?,'Laporan darurat via Telegram',NULL,?,?)",
        ).bind(
          crypto.randomUUID(),
          env.ORGANIZATION_ID,
          assignDetail.worship_service_id,
          target.id,
          assignDetail.service_role_id,
          urgency,
          nowIso,
          nowIso,
        ),
        env.DB.prepare(
          "UPDATE assignments SET status='needs_replacement', updated_at=? WHERE organization_id=? AND id=? AND status IN ('awaiting_confirmation','accepted')",
        ).bind(nowIso, env.ORGANIZATION_ID, target.id),
      );
    }
    await env.DB.batch(batchStatements);
    return "Laporan darurat dicatat untuk tugas aktif Anda. Koordinator akan menindaklanjuti.";
  }
  if (!assignments.results.length)
    return command === "/jadwal"
      ? "Belum ada jadwal mendatang."
      : "Tidak ada tugas yang menunggu respons.";
  return assignments.results
    .map(
      (item) =>
        `${escapeText(item.role_name)} — ${new Date(item.starts_at).toLocaleString("id-ID", { timeZone: "Asia/Makassar" })}, ${escapeText(item.location)}`,
    )
    .join("\n");
}

export async function handleTelegramCommand(
  env: TelegramEnv,
  chatId: string,
  command: string,
): Promise<string> {
  return commandReply(env, chatId, command);
}

async function handleCallback(
  env: TelegramEnv,
  telegramUserId: string,
  data: string,
) {
  const parsed = /^v1:([0-9a-f-]{36}):([A-Za-z0-9_-]{16,128})$/u.exec(data);
  if (!parsed) return;
  const grantId = parsed[1] ?? "";
  const nonce = parsed[2] ?? "";
  const now = new Date().toISOString();
  const grant = await env.DB.prepare(
    "SELECT g.id,g.servant_id,g.assignment_id,g.action,g.nonce_hash,g.expires_at,a.status,a.version,s.telegram_user_id,ws.status service_status FROM telegram_callback_grants g JOIN assignments a ON a.organization_id=g.organization_id AND a.id=g.assignment_id JOIN worship_services ws ON ws.organization_id=a.organization_id AND ws.id=a.worship_service_id JOIN servants s ON s.organization_id=g.organization_id AND s.id=g.servant_id WHERE g.organization_id=? AND g.id=? AND g.consumed_at IS NULL LIMIT 1",
  )
    .bind(env.ORGANIZATION_ID, grantId)
    .first<{
      id: string;
      servant_id: string;
      assignment_id: string;
      action: "accept" | "unavailable";
      nonce_hash: string;
      expires_at: string;
      status: string;
      version: number;
      telegram_user_id: string | null;
      service_status: string;
    }>();
  if (
    !grant ||
    !equal(grant.nonce_hash, await digest(nonce)) ||
    grant.telegram_user_id !== telegramUserId ||
    Date.parse(grant.expires_at) <= Date.now() ||
    grant.status !== "awaiting_confirmation" ||
    grant.service_status !== "scheduled"
  )
    return;
  const result = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO telegram_callback_receipts(id,organization_id,callback_grant_id,assignment_id,expected_version,actual_version,actor_matches,state_matches,created_at) VALUES(?,?,?,?,?,COALESCE((SELECT version FROM assignments WHERE organization_id=? AND id=?),-1),EXISTS(SELECT 1 FROM telegram_callback_grants g JOIN servants s ON s.organization_id=g.organization_id AND s.id=g.servant_id WHERE g.organization_id=? AND g.id=? AND s.telegram_user_id=?),EXISTS(SELECT 1 FROM telegram_callback_grants g JOIN assignments a ON a.organization_id=g.organization_id AND a.id=g.assignment_id JOIN worship_services ws ON ws.organization_id=a.organization_id AND ws.id=a.worship_service_id WHERE g.organization_id=? AND g.id=? AND g.consumed_at IS NULL AND g.expires_at>? AND a.status='awaiting_confirmation' AND a.version=? AND ws.status='scheduled'),?)",
    ).bind(
      crypto.randomUUID(),
      env.ORGANIZATION_ID,
      grant.id,
      grant.assignment_id,
      grant.version,
      env.ORGANIZATION_ID,
      grant.assignment_id,
      env.ORGANIZATION_ID,
      grant.id,
      telegramUserId,
      env.ORGANIZATION_ID,
      grant.id,
      now,
      grant.version,
      now,
    ),
    env.DB.prepare(
      "UPDATE telegram_callback_grants SET consumed_at=? WHERE organization_id=? AND id=? AND consumed_at IS NULL AND expires_at>? ",
    ).bind(now, env.ORGANIZATION_ID, grant.id, now),
    env.DB.prepare(
      "UPDATE assignments SET status=?,confirmed_at=CASE WHEN ?='accepted' THEN ? ELSE confirmed_at END,version=version+1,updated_at=? WHERE organization_id=? AND id=? AND status='awaiting_confirmation' AND version=?",
    ).bind(
      grant.action === "accept" ? "accepted" : "unavailable",
      grant.action === "accept" ? "accepted" : "unavailable",
      now,
      now,
      env.ORGANIZATION_ID,
      grant.assignment_id,
      grant.version,
    ),
    env.DB.prepare(
      "UPDATE telegram_notification_intents SET status='cancelled',updated_at=? WHERE organization_id=? AND assignment_id=? AND status IN ('pending','sending')",
    ).bind(now, env.ORGANIZATION_ID, grant.assignment_id),
    env.DB.prepare(
      "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'system',NULL,'telegram.callback.response','assignment',?,'telegram-webhook',json_object('response',?),?)",
    ).bind(
      crypto.randomUUID(),
      env.ORGANIZATION_ID,
      grant.assignment_id,
      grant.action,
      now,
    ),
  ]);
  // D1 batch is atomic; the conditional update makes duplicated/stale callbacks no-ops.
  if ((result[2]?.meta.changes ?? 0) !== 1)
    throw new Error("Callback transition was not applied");
}

export async function handleWebhook(
  request: Request,
  env: TelegramEnv,
  sender: TelegramSender = createTelegramSender(env),
) {
  if (
    request.method !== "POST" ||
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return new Response("Not found", { status: 404 });
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !secret ||
    !equal(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "", secret)
  )
    return new Response("Unauthorized", { status: 401 });
  const raw = await request.text();
  if (raw.length > 32_768)
    return new Response("Payload too large", { status: 413 });
  let update: {
    update_id?: number;
    message?: {
      chat?: { id?: number | string; type?: string };
      from?: { id?: number | string };
      text?: string;
    };
    callback_query?: {
      id?: string;
      from?: { id?: number | string };
      data?: string;
    };
  };
  try {
    update = JSON.parse(raw) as typeof update;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!Number.isSafeInteger(update.update_id)) return new Response("OK");
  try {
    await env.DB.prepare(
      "INSERT INTO telegram_webhook_updates(organization_id,update_id,received_at) VALUES(?,?,?)",
    )
      .bind(
        env.ORGANIZATION_ID,
        String(update.update_id),
        new Date().toISOString(),
      )
      .run();
  } catch {
    return new Response("OK");
  }
  const chatId = update.message?.chat?.id;
  const senderId = update.message?.from?.id;
  const text = update.message?.text?.trim() ?? "";
  if (chatId !== undefined) {
    const start = /^\/start\s+([A-Z2-9]{10})$/u.exec(text);
    const reply = start
      ? update.message?.chat?.type === "private" && senderId !== undefined
        ? await activateFromCode(env, String(senderId), start[1] ?? "")
        : "Aktivasi hanya dapat dilakukan melalui percakapan pribadi."
      : ["/jadwal", "/tugas", "/bantuan", "/darurat"].includes(text)
        ? await commandReply(env, String(chatId), text)
        : null;
    // Telegram sends are deliberately not performed in the webhook request. A production sender consumes persisted intents.
    if (reply)
      await env.DB.prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'system',NULL,'telegram.command','telegram_update',?,'telegram-webhook',json_object('command',?),?)",
      )
        .bind(
          crypto.randomUUID(),
          env.ORGANIZATION_ID,
          String(update.update_id),
          start ? "/start" : text,
          new Date().toISOString(),
        )
        .run();
    if (reply) await sender.send(String(chatId), reply);
  }
  if (
    update.callback_query?.data &&
    update.callback_query.from?.id !== undefined
  ) {
    if (update.callback_query.id)
      await sender.acknowledge?.(update.callback_query.id);
    try {
      await handleCallback(
        env,
        String(update.callback_query.from.id),
        update.callback_query.data,
      );
    } catch {
      /* stale/duplicate callbacks are acknowledged safely by returning OK */
    }
  }
  return new Response("OK");
}

const disabledSender: TelegramSender = {
  async send() {
    return { ok: false, transient: false, category: "delivery_disabled" };
  },
  async acknowledge() {},
};
export async function runTelegramNotifications(
  env: TelegramEnv,
  sender: TelegramSender = disabledSender,
) {
  const now = new Date();
  const organization = await env.DB.prepare(
    "SELECT timezone FROM organizations WHERE id=?",
  )
    .bind(env.ORGANIZATION_ID)
    .first<{ timezone: string }>();
  if (!organization) return;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO telegram_notification_intents(id,organization_id,servant_id,assignment_id,event_type,idempotency_key,due_at,payload_json,created_at,updated_at) SELECT lower(hex(randomblob(16))),a.organization_id,a.servant_id,a.id,'assignment_reminder','assignment:' || a.id || ':reminder:v' || a.version,strftime('%Y-%m-%dT%H:%M:%fZ',ws.starts_at,'-1 day'),json_object('text','Pengingat: tugas ibadah Anda masih menunggu konfirmasi. Gunakan /tugas untuk melihat jadwal.'),?,? FROM assignments a JOIN worship_services ws ON ws.organization_id=a.organization_id AND ws.id=a.worship_service_id WHERE a.organization_id=? AND a.status='awaiting_confirmation' AND ws.status='scheduled' AND ws.starts_at>?",
    ).bind(
      now.toISOString(),
      now.toISOString(),
      env.ORGANIZATION_ID,
      now.toISOString(),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO telegram_notification_intents(id,organization_id,servant_id,assignment_id,event_type,idempotency_key,due_at,payload_json,created_at,updated_at) SELECT lower(hex(randomblob(16))),a.organization_id,a.servant_id,a.id,'critical_reminder','assignment:' || a.id || ':critical:v' || a.version,strftime('%Y-%m-%dT%H:%M:%fZ',ws.starts_at,'-1 hour'),json_object('text','Pengingat kritis: tugas ibadah Anda segera dimulai dan masih menunggu konfirmasi. Gunakan /tugas atau /darurat.'),?,? FROM assignments a JOIN worship_services ws ON ws.organization_id=a.organization_id AND ws.id=a.worship_service_id WHERE a.organization_id=? AND a.status='awaiting_confirmation' AND ws.status='scheduled' AND ws.starts_at>?",
    ).bind(
      now.toISOString(),
      now.toISOString(),
      env.ORGANIZATION_ID,
      now.toISOString(),
    ),
  ]);
  const staleSendingBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
  const pending = await env.DB.prepare(
    "SELECT n.id,n.servant_id,n.assignment_id,n.event_type,n.attempt_count,n.payload_json,s.telegram_chat_id,s.status servant_status,ws.starts_at,ws.status service_status,a.status assignment_status,sr.criticality FROM telegram_notification_intents n JOIN servants s ON s.organization_id=n.organization_id AND s.id=n.servant_id LEFT JOIN assignments a ON a.organization_id=n.organization_id AND a.id=n.assignment_id LEFT JOIN worship_services ws ON ws.organization_id=a.organization_id AND ws.id=a.worship_service_id LEFT JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id WHERE n.organization_id=? AND n.attempt_count<3 AND ((n.status='pending' AND n.due_at<=?) OR (n.status='sending' AND n.updated_at<=?)) ORDER BY n.due_at,n.id LIMIT 25",
  )
    .bind(env.ORGANIZATION_ID, now.toISOString(), staleSendingBefore)
    .all<{
      id: string;
      servant_id: string;
      assignment_id: string | null;
      event_type: string;
      attempt_count: number;
      payload_json: string;
      telegram_chat_id: string | null;
      servant_status: string;
      starts_at: string | null;
      service_status: string | null;
      assignment_status: string | null;
      criticality: string | null;
    }>();
  for (const notification of pending.results) {
    if (
      notification.servant_status !== "active" ||
      notification.assignment_status !== "awaiting_confirmation" ||
      notification.service_status !== "scheduled"
    ) {
      await env.DB.prepare(
        "UPDATE telegram_notification_intents SET status='cancelled',updated_at=? WHERE id=? AND status IN ('pending','sending')",
      )
        .bind(now.toISOString(), notification.id)
        .run();
      continue;
    }
    const untilService =
      notification.starts_at === null
        ? Number.POSITIVE_INFINITY
        : Date.parse(notification.starts_at) - now.getTime();
    const critical =
      notification.event_type === "critical_reminder" ||
      notification.criticality === "critical" ||
      (untilService >= 0 && untilService < 3_600_000);
    if (!critical && isQuiet(now, organization.timezone)) {
      await env.DB.prepare(
        "UPDATE telegram_notification_intents SET status='pending',due_at=?,updated_at=? WHERE id=? AND status IN ('pending','sending')",
      )
        .bind(
          new Date(now.getTime() + 60 * 60_000).toISOString(),
          now.toISOString(),
          notification.id,
        )
        .run();
      continue;
    }
    const claimed = await env.DB.prepare(
      "UPDATE telegram_notification_intents SET status='sending',attempt_count=attempt_count+1,updated_at=? WHERE id=? AND attempt_count<3 AND ((status='pending' AND due_at<=?) OR (status='sending' AND updated_at<=?))",
    )
      .bind(
        now.toISOString(),
        notification.id,
        now.toISOString(),
        staleSendingBefore,
      )
      .run();
    if ((claimed.meta.changes ?? 0) !== 1) continue;
    if (!notification.telegram_chat_id) {
      await env.DB.prepare(
        "UPDATE telegram_notification_intents SET status='failed',last_error_category='not_activated',updated_at=? WHERE id=? AND status='sending'",
      )
        .bind(now.toISOString(), notification.id)
        .run();
      continue;
    }
    const payload = JSON.parse(notification.payload_json) as {
      text?: unknown;
      replyMarkup?: unknown;
    };
    const result = await sender.send(
      notification.telegram_chat_id,
      String(payload.text ?? ""),
      payload.replyMarkup,
    );
    if (result.ok)
      await env.DB.prepare(
        "UPDATE telegram_notification_intents SET status='accepted_by_api',updated_at=? WHERE id=? AND status='sending'",
      )
        .bind(now.toISOString(), notification.id)
        .run();
    else if (result.transient && notification.attempt_count < 2)
      await env.DB.prepare(
        "UPDATE telegram_notification_intents SET status='pending',due_at=?,last_error_category=?,updated_at=? WHERE id=? AND status='sending'",
      )
        .bind(
          new Date(
            now.getTime() +
              Math.max(
                result.retryAfterSeconds ?? 0,
                2 ** notification.attempt_count * 60,
              ) *
                1000,
          ).toISOString(),
          result.category,
          now.toISOString(),
          notification.id,
        )
        .run();
    else
      await env.DB.prepare(
        "UPDATE telegram_notification_intents SET status='failed',last_error_category=?,updated_at=? WHERE id=? AND status='sending'",
      )
        .bind(result.category, now.toISOString(), notification.id)
        .run();
  }
}

export function createTelegramSender(env: TelegramEnv): TelegramSender {
  if (env.TELEGRAM_DELIVERY_ENABLED !== "true" || !env.TELEGRAM_BOT_TOKEN)
    return disabledSender;
  const token = env.TELEGRAM_BOT_TOKEN;
  return {
    async send(chatId, message, buttons) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: "HTML",
              ...(buttons ? { reply_markup: buttons } : {}),
            }),
          },
        );
        if (response.ok) return { ok: true };
        let retryAfterSeconds: number | undefined;
        try {
          const body = (await response.json()) as {
            parameters?: { retry_after?: unknown };
          };
          if (
            typeof body.parameters?.retry_after === "number" &&
            body.parameters.retry_after > 0
          )
            retryAfterSeconds = Math.min(body.parameters.retry_after, 3600);
        } catch {
          // Error bodies are intentionally not retained or logged.
        }
        const transient = response.status === 429 || response.status >= 500;
        return {
          ok: false,
          transient,
          retryAfterSeconds,
          category: transient ? "telegram_transient" : "telegram_permanent",
        };
      } catch {
        return { ok: false, transient: true, category: "network_error" };
      }
    },
    async acknowledge(callbackQueryId) {
      try {
        await fetch(
          `https://api.telegram.org/bot${token}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callbackQueryId }),
          },
        );
      } catch {
        // Callback acknowledgement is best-effort; state mutation remains idempotent.
      }
    },
  };
}
