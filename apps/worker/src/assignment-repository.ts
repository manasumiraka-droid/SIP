import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  assertAssignmentTransition,
  type AssignmentStatus,
} from "../../../packages/domain/src/schedule";
import type {
  AssignmentStatusUpdate,
  CreateAssignment,
} from "../../../packages/validation/src/schedule";
import { buildConfirmationNotification } from "./telegram";

async function hashPayload(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
type CreateReceipt = { assignment_id: string; payload_hash: string };
export async function createAssignment(
  db: D1Database,
  actor: Actor,
  input: CreateAssignment,
  key: string,
  requestId: string,
) {
  const hash = await hashPayload(input);
  const receipt = () =>
    db
      .prepare(
        "SELECT assignment_id,payload_hash FROM assignment_creations WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
      )
      .bind(actor.organizationId, actor.id, key)
      .first<CreateReceipt>();
  const replay = (prior: CreateReceipt) => {
    if (prior.payload_hash !== hash)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return {
      id: prior.assignment_id,
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
          `INSERT INTO assignment_creations(id,organization_id,actor_id,assignment_id,idempotency_key,payload_hash,actor_authorized,created_at) VALUES(?,?,?,?,?,?,EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.revoked_at IS NULL AND (ur.role_id IN ('super_admin','admin') OR (ur.role_id='worship_coordinator' AND EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=? AND cs.user_id=? AND cs.scope_type='service' AND cs.scope_id=? AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?))) OR (ur.role_id='field_coordinator' AND EXISTS(SELECT 1 FROM coordinator_scopes cs JOIN service_roles sr ON sr.organization_id=cs.organization_id AND sr.field_id=cs.scope_id WHERE cs.organization_id=? AND cs.user_id=? AND cs.scope_type='field' AND sr.id=? AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?))))),?)`,
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
          actor.organizationId,
          actor.id,
          input.serviceId,
          now,
          now,
          actor.organizationId,
          actor.id,
          input.serviceRoleId,
          now,
          now,
          now,
        ),
      db
        .prepare(
          "INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,slot_number,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',1,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.serviceId,
          input.serviceRoleId,
          input.servantId,
          input.slotNumber,
          now,
          now,
        ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'assignment.create','assignment',?,?,json_object('service_id',?,'service_role_id',?,'status','draft','version',1),?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          id,
          requestId,
          input.serviceId,
          input.serviceRoleId,
          now,
        ),
    ]);
  } catch (error) {
    const concurrent = await receipt();
    if (concurrent) return replay(concurrent);
    const reason = error instanceof Error ? error.message : "";
    if (reason.includes("assignment_creation_actor_authorized"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (
      reason.includes("Assignment servant inactive") ||
      reason.includes("Assignment capability unapproved") ||
      reason.includes("Assignment availability conflict") ||
      reason.includes("Assignment schedule conflict") ||
      reason.includes("Assignment monthly limit exceeded")
    )
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Penugasan bertentangan dengan kelayakan atau jadwal pelayan.",
      );
    if (reason.includes("FOREIGN KEY constraint failed"))
      throw new ApplicationError(
        "NOT_FOUND",
        404,
        "Data penugasan tidak ditemukan.",
      );
    throw error;
  }
  return { id, version: 1 as const, status: "draft" as const };
}

type StoredAssignment = {
  status: AssignmentStatus;
  version: number;
  servant_id: string;
};
type StatusReceipt = {
  assignment_id: string;
  requested_status: string;
  expected_version: number;
};
export async function changeAssignmentStatus(
  db: D1Database,
  actor: Actor,
  assignmentId: string,
  update: AssignmentStatusUpdate,
  key: string,
  requestId: string,
) {
  const receipt = () =>
    db
      .prepare(
        "SELECT assignment_id,requested_status,expected_version FROM assignment_status_changes WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
      )
      .bind(actor.organizationId, actor.id, key)
      .first<StatusReceipt>();
  const replay = (prior: StatusReceipt) => {
    if (
      prior.assignment_id !== assignmentId ||
      prior.requested_status !== update.status ||
      prior.expected_version !== update.version
    )
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return {
      id: assignmentId,
      version: update.version + 1,
      status: update.status,
    };
  };
  const prior = await receipt();
  if (prior) return replay(prior);
  const organizationWide = actor.roles.some(
    (role) => role === "super_admin" || role === "admin",
  );
  if (!organizationWide) {
    const checkedAt = new Date().toISOString();
    const visible = await db
      .prepare(
        `SELECT 1 FROM assignments a JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id
         WHERE a.organization_id=? AND a.id=? AND (
           EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=a.organization_id AND cs.user_id=? AND cs.scope_type='service' AND cs.scope_id=a.worship_service_id AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?)) OR
           EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=a.organization_id AND cs.user_id=? AND cs.scope_type='field' AND cs.scope_id=sr.field_id AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?)) OR
           EXISTS(SELECT 1 FROM servants s WHERE s.organization_id=a.organization_id AND s.user_id=? AND s.id=a.servant_id)
         ) LIMIT 1`,
      )
      .bind(
        actor.organizationId,
        assignmentId,
        actor.id,
        checkedAt,
        checkedAt,
        actor.id,
        checkedAt,
        checkedAt,
        actor.id,
      )
      .first();
    if (!visible)
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  }
  const current = await db
    .prepare(
      "SELECT status,version,servant_id FROM assignments WHERE organization_id=? AND id=? LIMIT 1",
    )
    .bind(actor.organizationId, assignmentId)
    .first<StoredAssignment>();
  if (!current)
    throw new ApplicationError("NOT_FOUND", 404, "Penugasan tidak ditemukan.");
  assertAssignmentTransition(current.status, update.status);
  const now = new Date().toISOString();
  const confirmation =
    update.status === "awaiting_confirmation"
      ? await buildConfirmationNotification(
          new Date(Date.parse(now) + 24 * 60 * 60_000).toISOString(),
        )
      : null;
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO assignment_status_changes(id,organization_id,actor_id,assignment_id,idempotency_key,requested_status,expected_version,actual_version,actor_authorized,target_exists,created_at) VALUES(?,?,?,?,?,?,?,COALESCE((SELECT version FROM assignments WHERE organization_id=? AND id=?),-1),EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id JOIN assignments a ON a.organization_id=u.organization_id AND a.id=? JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.revoked_at IS NULL AND (ur.role_id IN ('super_admin','admin') OR (ur.role_id='worship_coordinator' AND EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=a.organization_id AND cs.user_id=u.id AND cs.scope_type='service' AND cs.scope_id=a.worship_service_id AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?))) OR (ur.role_id='field_coordinator' AND EXISTS(SELECT 1 FROM coordinator_scopes cs WHERE cs.organization_id=a.organization_id AND cs.user_id=u.id AND cs.scope_type='field' AND cs.scope_id=sr.field_id AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?))) OR (ur.role_id='servant' AND ? IN ('accepted','unavailable') AND EXISTS(SELECT 1 FROM servants s WHERE s.organization_id=u.organization_id AND s.user_id=u.id AND s.id=a.servant_id)))),EXISTS(SELECT 1 FROM assignments WHERE organization_id=? AND id=?),?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          assignmentId,
          key,
          update.status,
          update.version,
          actor.organizationId,
          assignmentId,
          assignmentId,
          actor.organizationId,
          actor.id,
          now,
          now,
          now,
          now,
          update.status,
          actor.organizationId,
          assignmentId,
          now,
        ),
      db
        .prepare(
          "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'assignment.status.change','assignment',?,?,json_object('before',?,'after',?,'version',?),?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          assignmentId,
          requestId,
          current.status,
          update.status,
          update.version + 1,
          now,
        ),
      db
        .prepare(
          "UPDATE assignments SET status=?,version=version+1,updated_at=? WHERE organization_id=? AND id=? AND version=?",
        )
        .bind(
          update.status,
          now,
          actor.organizationId,
          assignmentId,
          update.version,
        ),
      ...(update.status === "awaiting_confirmation"
        ? [
            ...(confirmation?.grants ?? []).map((grant) =>
              db
                .prepare(
                  "INSERT INTO telegram_callback_grants(id,organization_id,servant_id,assignment_id,action,nonce_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
                )
                .bind(
                  grant.id,
                  actor.organizationId,
                  current.servant_id,
                  assignmentId,
                  grant.action,
                  grant.nonceHash,
                  grant.expiresAt,
                  now,
                ),
            ),
            db
              .prepare(
                "INSERT OR IGNORE INTO telegram_notification_intents(id,organization_id,servant_id,assignment_id,event_type,idempotency_key,due_at,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                actor.organizationId,
                current.servant_id,
                assignmentId,
                "assignment_confirmation",
                `assignment:${assignmentId}:confirmation:v${update.version + 1}`,
                now,
                confirmation?.payloadJson ?? "{}",
                now,
                now,
              ),
          ]
        : []),
      ...(update.status === "accepted" ||
      update.status === "unavailable" ||
      update.status === "cancelled" ||
      update.status === "reassigned"
        ? [
            db
              .prepare(
                "UPDATE telegram_notification_intents SET status='cancelled',updated_at=? WHERE organization_id=? AND assignment_id=? AND status IN ('pending','sending')",
              )
              .bind(now, actor.organizationId, assignmentId),
          ]
        : []),
    ]);
  } catch (error) {
    const concurrent = await receipt();
    if (concurrent) return replay(concurrent);
    const reason = error instanceof Error ? error.message : "";
    if (reason.includes("assignment_status_actor_authorized"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (reason.includes("assignment_status_target_exists"))
      throw new ApplicationError(
        "NOT_FOUND",
        404,
        "Penugasan tidak ditemukan.",
      );
    if (reason.includes("assignment_status_version_matches"))
      throw new ApplicationError(
        "VERSION_CONFLICT",
        409,
        "Data telah berubah. Muat ulang sebelum menyimpan.",
      );
    throw error;
  }
  return {
    id: assignmentId,
    version: update.version + 1,
    status: update.status,
  };
}
