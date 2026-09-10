import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import type {
  CreateAvailability,
  CreateCapability,
  CreateCapabilityApprover,
  CreateCoordinatorScope,
  CreateField,
  CreateServant,
  CreateServiceRole,
} from "../../../packages/validation/src/operations";

async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function createOperational(
  db: D1Database,
  actor: Actor,
  key: string,
  requestId: string,
  action: string,
  entityType: string,
  payload: unknown,
  insert: (id: string, now: string) => D1PreparedStatement,
  allowedRoles: readonly string[] = ["super_admin", "admin"],
) {
  if (!actor.roles.some((role) => allowedRoles.includes(role)))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const payloadHash = await digest(payload);
  const prior = await db
    .prepare(
      "SELECT action,entity_id,payload_hash FROM operational_mutation_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{ action: string; entity_id: string; payload_hash: string }>();
  if (prior) {
    if (prior.action !== action || prior.payload_hash !== payloadHash)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return { id: prior.entity_id, version: 1 as const };
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO operational_mutation_receipts(id,organization_id,actor_id,idempotency_key,action,entity_id,payload_hash,actor_authorized,created_at) VALUES(?,?,?,?,?,?,?,EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.revoked_at IS NULL AND ur.role_id IN (SELECT value FROM json_each(?))),?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          key,
          action,
          id,
          payloadHash,
          actor.organizationId,
          actor.id,
          JSON.stringify(allowedRoles),
          now,
        ),
      insert(id, now),
      db
        .prepare(
          "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,?,?,?,?,'{}',?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          action,
          entityType,
          id,
          requestId,
          now,
        ),
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason.includes("operational_actor_authorized"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (reason.includes("Capability approver not designated"))
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Persetujuan capability memerlukan approver yang ditunjuk.",
      );
    if (reason.includes("FOREIGN KEY constraint failed"))
      throw new ApplicationError(
        "NOT_FOUND",
        404,
        "Data terkait tidak ditemukan.",
      );
    if (reason.includes("UNIQUE constraint failed"))
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Data dengan kode atau relasi tersebut sudah ada.",
      );
    throw error;
  }
  return { id, version: 1 as const };
}

export const createField = (
  db: D1Database,
  actor: Actor,
  input: CreateField,
  key: string,
  requestId: string,
) =>
  createOperational(
    db,
    actor,
    key,
    requestId,
    "field.create",
    "service_field",
    input,
    (id, now) =>
      db
        .prepare(
          "INSERT INTO service_fields(id,organization_id,code,name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(id, actor.organizationId, input.code, input.name, now, now),
  );
export const createServiceRole = (
  db: D1Database,
  actor: Actor,
  input: CreateServiceRole,
  key: string,
  requestId: string,
) =>
  createOperational(
    db,
    actor,
    key,
    requestId,
    "service_role.create",
    "service_role",
    input,
    (id, now) =>
      db
        .prepare(
          "INSERT INTO service_roles(id,organization_id,field_id,code,name,slots_required,criticality,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.fieldId,
          input.code,
          input.name,
          input.slotsRequired,
          input.criticality,
          now,
          now,
        ),
  );
export const createServant = (
  db: D1Database,
  actor: Actor,
  input: CreateServant,
  key: string,
  requestId: string,
) =>
  createOperational(
    db,
    actor,
    key,
    requestId,
    "servant.create",
    "servant",
    input,
    (id, now) =>
      db
        .prepare(
          "INSERT INTO servants(id,organization_id,user_id,display_name,is_backup,administrative_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.userId ?? null,
          input.displayName,
          input.isBackup ? 1 : 0,
          input.administrativeNote ?? null,
          now,
          now,
        ),
  );
export const createAvailability = (
  db: D1Database,
  actor: Actor,
  input: CreateAvailability,
  key: string,
  requestId: string,
) =>
  createOperational(
    db,
    actor,
    key,
    requestId,
    "availability.create",
    "availability_block",
    input,
    (id, now) =>
      db
        .prepare(
          "INSERT INTO availability_blocks(id,organization_id,servant_id,starts_at,ends_at,block_type,note_private,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.servantId,
          input.startsAt,
          input.endsAt,
          input.type,
          input.notePrivate ?? null,
          now,
          now,
        ),
  );

export const createCapabilityApprover = (
  db: D1Database,
  actor: Actor,
  input: CreateCapabilityApprover,
  key: string,
  requestId: string,
) =>
  createOperational(
    db,
    actor,
    key,
    requestId,
    "capability_approver.create",
    "capability_approver",
    input,
    (id, now) =>
      db
        .prepare(
          "INSERT INTO capability_approvers(id,organization_id,service_role_id,user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.serviceRoleId,
          input.userId,
          now,
          now,
        ),
    ["super_admin"],
  );

export const createCapability = (
  db: D1Database,
  actor: Actor,
  input: CreateCapability,
  key: string,
  requestId: string,
) =>
  createOperational(
    db,
    actor,
    key,
    requestId,
    "capability.create",
    "servant_capability",
    input,
    (id, now) =>
      db
        .prepare(
          "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,approved_by,approved_at,monthly_assignment_limit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.servantId,
          input.serviceRoleId,
          input.status,
          input.status === "active" ? actor.id : null,
          input.status === "active" ? now : null,
          input.monthlyAssignmentLimit ?? null,
          now,
          now,
        ),
  );

export const createCoordinatorScope = (
  db: D1Database,
  actor: Actor,
  input: CreateCoordinatorScope,
  key: string,
  requestId: string,
) =>
  createOperational(
    db,
    actor,
    key,
    requestId,
    "coordinator_scope.create",
    "coordinator_scope",
    input,
    (id, now) =>
      db
        .prepare(
          "INSERT INTO coordinator_scopes(id,organization_id,user_id,scope_type,scope_id,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          actor.organizationId,
          input.userId,
          input.type,
          input.scopeId,
          input.startsAt,
          input.endsAt ?? null,
          now,
          now,
        ),
    ["super_admin"],
  );

export async function listFields(
  db: D1Database,
  organizationId: string,
  limit: number,
) {
  return (
    await db
      .prepare(
        "SELECT id,code,name,active,version FROM service_fields WHERE organization_id=? ORDER BY name,id LIMIT ?",
      )
      .bind(organizationId, limit)
      .all()
  ).results;
}
export async function listServiceRoles(
  db: D1Database,
  organizationId: string,
  limit: number,
) {
  return (
    await db
      .prepare(
        "SELECT id,field_id AS fieldId,code,name,slots_required AS slotsRequired,criticality,active,version FROM service_roles WHERE organization_id=? ORDER BY name,id LIMIT ?",
      )
      .bind(organizationId, limit)
      .all()
  ).results;
}
export async function listServants(
  db: D1Database,
  actor: Actor,
  limit: number,
) {
  const privileged = actor.roles.some(
    (role) => role === "super_admin" || role === "admin",
  );
  const checkedAt = new Date().toISOString();
  return (
    await db
      .prepare(
        `SELECT s.id,s.display_name AS displayName,s.status,s.is_backup AS isBackup,s.version,CASE WHEN ?=1 THEN s.administrative_note ELSE NULL END AS administrativeNote
         FROM servants s WHERE s.organization_id=? AND (?=1 OR s.user_id=? OR EXISTS(
           SELECT 1 FROM assignments a JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id
           JOIN coordinator_scopes cs ON cs.organization_id=a.organization_id AND cs.user_id=? AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?)
           WHERE a.servant_id=s.id AND ((cs.scope_type='service' AND cs.scope_id=a.worship_service_id) OR (cs.scope_type='field' AND cs.scope_id=sr.field_id))))
         ORDER BY s.display_name,s.id LIMIT ?`,
      )
      .bind(
        privileged ? 1 : 0,
        actor.organizationId,
        privileged ? 1 : 0,
        actor.id,
        actor.id,
        checkedAt,
        checkedAt,
        limit,
      )
      .all()
  ).results;
}
export async function listAvailability(
  db: D1Database,
  actor: Actor,
  limit: number,
) {
  const privileged = actor.roles.some(
    (role) => role === "super_admin" || role === "admin",
  );
  const checkedAt = new Date().toISOString();
  return (
    await db
      .prepare(
        `SELECT b.id,b.servant_id AS servantId,b.starts_at AS startsAt,b.ends_at AS endsAt,b.block_type AS type,
         CASE WHEN ?=1 OR s.user_id=? THEN b.note_private ELSE NULL END AS notePrivate,b.version
         FROM availability_blocks b JOIN servants s ON s.organization_id=b.organization_id AND s.id=b.servant_id
         WHERE b.organization_id=? AND (?=1 OR s.user_id=? OR EXISTS(
           SELECT 1 FROM assignments a JOIN service_roles sr ON sr.organization_id=a.organization_id AND sr.id=a.service_role_id
           JOIN coordinator_scopes cs ON cs.organization_id=a.organization_id AND cs.user_id=? AND cs.starts_at<=? AND (cs.ends_at IS NULL OR cs.ends_at>?)
           WHERE a.servant_id=s.id AND ((cs.scope_type='service' AND cs.scope_id=a.worship_service_id) OR (cs.scope_type='field' AND cs.scope_id=sr.field_id))))
         ORDER BY b.starts_at,b.id LIMIT ?`,
      )
      .bind(
        privileged ? 1 : 0,
        actor.id,
        actor.organizationId,
        privileged ? 1 : 0,
        actor.id,
        actor.id,
        checkedAt,
        checkedAt,
        limit,
      )
      .all()
  ).results;
}
