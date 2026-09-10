import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  assertServiceTransition,
  type ServiceStatus,
} from "../../../packages/domain/src/schedule";
import type {
  CreateWorshipService,
  ServiceStatusUpdate,
} from "../../../packages/validation/src/schedule";

export async function listWorshipServices(
  db: D1Database,
  actor: Actor,
  cursor: string,
  limit: number,
) {
  const organizationWide = actor.roles.some(
    (role) => role === "super_admin" || role === "admin",
  );
  const checkedAt = new Date().toISOString();
  const rows = await db
    .prepare(
      `SELECT ws.id,ws.starts_at AS startsAt,ws.assembly_at AS assemblyAt,ws.ends_at AS endsAt,ws.location,ws.status,ws.theme,ws.version,
      (SELECT COUNT(*) FROM assignments a WHERE a.organization_id=ws.organization_id AND a.worship_service_id=ws.id AND a.status NOT IN ('cancelled','reassigned')) AS assignmentCount,
      (SELECT COUNT(*) FROM assignments a WHERE a.organization_id=ws.organization_id AND a.worship_service_id=ws.id AND a.status IN ('accepted','completed')) AS confirmedCount
      FROM worship_services ws WHERE ws.organization_id=? AND ws.id>? AND (?=1 OR
        EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=ws.organization_id AND cs.user_id=? AND cs.scope_type='service' AND cs.scope_id=ws.id AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?)) OR
        EXISTS(SELECT 1 FROM assignments a JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id JOIN coordinator_scopes cs ON cs.organization_id=a.organization_id AND cs.user_id=? AND cs.scope_type='field' AND cs.scope_id=sr.field_id AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?) WHERE a.worship_service_id=ws.id) OR
        EXISTS(SELECT 1 FROM assignments a JOIN servants s ON s.organization_id=a.organization_id AND s.id=a.servant_id WHERE a.worship_service_id=ws.id AND s.user_id=?))
      ORDER BY ws.id LIMIT ?`,
    )
    .bind(
      actor.organizationId,
      cursor,
      organizationWide ? 1 : 0,
      actor.id,
      checkedAt,
      checkedAt,
      actor.id,
      checkedAt,
      checkedAt,
      actor.id,
      limit + 1,
    )
    .all<{
      id: string;
      startsAt: string;
      assemblyAt: string;
      endsAt: string;
      location: string;
      status: ServiceStatus;
      theme: string | null;
      version: number;
      assignmentCount: number;
      confirmedCount: number;
    }>();
  const services = rows.results.slice(0, limit);
  return {
    data: services,
    next_cursor:
      rows.results.length > limit ? (services.at(-1)?.id ?? null) : null,
  };
}

async function payloadHash(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createWorshipService(
  db: D1Database,
  actor: Actor,
  input: CreateWorshipService,
  key: string,
  requestId: string,
) {
  if (!actor.roles.some((role) => role === "super_admin" || role === "admin"))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const hash = await payloadHash(input);
  const receipt = () =>
    db
      .prepare(
        "SELECT worship_service_id,payload_hash FROM worship_service_creations WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
      )
      .bind(actor.organizationId, actor.id, key)
      .first<{ worship_service_id: string; payload_hash: string }>();
  const replay = (prior: {
    worship_service_id: string;
    payload_hash: string;
  }) => {
    if (prior.payload_hash !== hash)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return {
      id: prior.worship_service_id,
      version: 1 as const,
      status: "draft" as const,
    };
  };
  const prior = await receipt();
  if (prior) return replay(prior);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO worship_service_creations(id,organization_id,actor_id,worship_service_id,idempotency_key,payload_hash,actor_authorized,created_at) VALUES(?,?,?,?,?,?,EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.revoked_at IS NULL AND ur.role_id IN ('super_admin','admin')),?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          id,
          key,
          hash,
          actor.organizationId,
          actor.id,
          now,
        ),
      db
        .prepare(
          "INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,theme,notes,version,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',?,?,1,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.assemblyAt,
          input.startsAt,
          input.endsAt,
          input.location,
          input.theme ?? null,
          input.notes ?? null,
          now,
          now,
        ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'service.create','worship_service',?,?,json_object('status','draft','version',1),?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          id,
          requestId,
          now,
        ),
    ]);
  } catch (error) {
    const concurrent = await receipt();
    if (concurrent) return replay(concurrent);
    if (
      error instanceof Error &&
      error.message.includes("service_creation_actor_authorized")
    )
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    throw error;
  }
  return { id, version: 1 as const, status: "draft" as const };
}

type StoredService = {
  status: ServiceStatus;
  version: number;
  assembly_at: string;
  starts_at: string;
  ends_at: string;
};
export async function changeWorshipServiceStatus(
  db: D1Database,
  actor: Actor,
  serviceId: string,
  update: ServiceStatusUpdate,
  key: string,
  requestId: string,
) {
  const receipt = () =>
    db
      .prepare(
        "SELECT worship_service_id,requested_status,expected_version FROM worship_service_status_changes WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
      )
      .bind(actor.organizationId, actor.id, key)
      .first<{
        worship_service_id: string;
        requested_status: string;
        expected_version: number;
      }>();
  const replay = (prior: {
    worship_service_id: string;
    requested_status: string;
    expected_version: number;
  }) => {
    if (
      prior.worship_service_id !== serviceId ||
      prior.requested_status !== update.status ||
      prior.expected_version !== update.version
    )
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return {
      id: serviceId,
      version: update.version + 1,
      status: update.status,
    };
  };
  const prior = await receipt();
  if (prior) return replay(prior);
  const current = await db
    .prepare(
      "SELECT status,version,assembly_at,starts_at,ends_at FROM worship_services WHERE organization_id=? AND id=? LIMIT 1",
    )
    .bind(actor.organizationId, serviceId)
    .first<StoredService>();
  if (!current)
    throw new ApplicationError("NOT_FOUND", 404, "Ibadah tidak ditemukan.");
  assertServiceTransition(current.status, update.status);
  if (
    update.status === "completed" &&
    Date.parse(current.starts_at) > Date.now()
  )
    throw new ApplicationError(
      "INVALID_TRANSITION",
      409,
      "Ibadah belum dapat ditandai selesai.",
    );
  const now = new Date().toISOString();
  if (
    update.status === "postponed" &&
    (!update.assemblyAt || !update.startsAt || !update.endsAt)
  )
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Jadwal baru wajib diisi.",
    );
  const assemblyAt =
    update.status === "postponed" ? update.assemblyAt : current.assembly_at;
  const startsAt =
    update.status === "postponed" ? update.startsAt : current.starts_at;
  const endsAt =
    update.status === "postponed" ? update.endsAt : current.ends_at;
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO worship_service_status_changes(id,organization_id,actor_id,worship_service_id,idempotency_key,requested_status,expected_version,actual_version,actor_authorized,target_exists,created_at) VALUES(?,?,?,?,?,?,?,COALESCE((SELECT version FROM worship_services WHERE organization_id=? AND id=?),-1),EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.revoked_at IS NULL AND (ur.role_id IN ('super_admin','admin') OR (ur.role_id='worship_coordinator' AND EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=? AND cs.user_id=? AND cs.scope_type='service' AND cs.scope_id=? AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?))))),EXISTS(SELECT 1 FROM worship_services WHERE organization_id=? AND id=?),?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          serviceId,
          key,
          update.status,
          update.version,
          actor.organizationId,
          serviceId,
          actor.organizationId,
          actor.id,
          actor.organizationId,
          actor.id,
          serviceId,
          now,
          now,
          actor.organizationId,
          serviceId,
          now,
        ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'service.status.change','worship_service',?,?,json_object('before',?,'after',?,'before_assembly_at',?,'after_assembly_at',?,'before_starts_at',?,'after_starts_at',?,'before_ends_at',?,'after_ends_at',?,'version',?),?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          serviceId,
          requestId,
          current.status,
          update.status,
          current.assembly_at,
          assemblyAt,
          current.starts_at,
          startsAt,
          current.ends_at,
          endsAt,
          update.version + 1,
          now,
        ),
      db
        .prepare(
          "UPDATE worship_services SET status=?,assembly_at=?,starts_at=?,ends_at=?,cancellation_reason=?,version=version+1,updated_at=? WHERE organization_id=? AND id=? AND version=?",
        )
        .bind(
          update.status,
          assemblyAt,
          startsAt,
          endsAt,
          update.status === "cancelled" ? update.reason : null,
          now,
          actor.organizationId,
          serviceId,
          update.version,
        ),
      db
        .prepare(
          "UPDATE assignments SET status=CASE WHEN ?='cancelled' THEN 'cancelled' ELSE 'awaiting_confirmation' END,version=version+1,updated_at=? WHERE organization_id=? AND worship_service_id=? AND ? IN ('cancelled','postponed') AND status NOT IN ('completed','cancelled','reassigned')",
        )
        .bind(
          update.status,
          now,
          actor.organizationId,
          serviceId,
          update.status,
        ),
      db
        .prepare(
          "UPDATE telegram_notification_intents SET status='cancelled',updated_at=? WHERE organization_id=? AND assignment_id IN (SELECT id FROM assignments WHERE organization_id=? AND worship_service_id=?) AND status IN ('pending','sending') AND ? IN ('cancelled','postponed')",
        )
        .bind(
          now,
          actor.organizationId,
          actor.organizationId,
          serviceId,
          update.status,
        ),
    ]);
  } catch (error) {
    const concurrent = await receipt();
    if (concurrent) return replay(concurrent);
    const reason = error instanceof Error ? error.message : "";
    if (reason.includes("service_status_actor_authorized"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (reason.includes("service_status_target_exists"))
      throw new ApplicationError("NOT_FOUND", 404, "Ibadah tidak ditemukan.");
    if (reason.includes("service_status_version_matches"))
      throw new ApplicationError(
        "VERSION_CONFLICT",
        409,
        "Data telah berubah. Muat ulang sebelum menyimpan.",
      );
    throw error;
  }
  return { id: serviceId, version: update.version + 1, status: update.status };
}
