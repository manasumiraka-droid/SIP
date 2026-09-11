import {
  managedUserSchema,
  type RoleUpdate,
} from "../../../packages/validation/src/users";
import { ApplicationError } from "../../../packages/domain/src/errors";
import type { Actor } from "../../../packages/domain/src/access";
type Receipt = {
  user_id: string;
  roles_json: string;
  expected_version: number;
};

export async function listManagedUsers(
  db: D1Database,
  organizationId: string,
  cursor: string,
  limit: number,
  ownerId: string | null,
) {
  const query =
    ownerId !== null
      ? `SELECT u.id, u.display_name AS displayName, u.status, u.version,
    COALESCE((SELECT json_group_array(role_id) FROM (SELECT role_id FROM user_roles WHERE organization_id = u.organization_id AND user_id = u.id AND revoked_at IS NULL ORDER BY role_id) AS r), '[]') AS rolesJson
    FROM users u WHERE u.organization_id = ? AND u.id > ? AND u.id = ? ORDER BY u.id LIMIT ?`
      : `SELECT u.id, u.display_name AS displayName, u.status, u.version,
    COALESCE((SELECT json_group_array(role_id) FROM (SELECT role_id FROM user_roles WHERE organization_id = u.organization_id AND user_id = u.id AND revoked_at IS NULL ORDER BY role_id) AS r), '[]') AS rolesJson
    FROM users u WHERE u.organization_id = ? AND u.id > ? ORDER BY u.id LIMIT ?`;

  const bindings =
    ownerId !== null
      ? [organizationId, cursor, ownerId, limit + 1]
      : [organizationId, cursor, limit + 1];

  const rows = await db
    .prepare(query)
    .bind(...bindings)
    .all<{
      id: string;
      displayName: string;
      status: string;
      version: number;
      rolesJson: string;
    }>();
  const users = rows.results.slice(0, limit).map(({ rolesJson, ...user }) => {
    const parsed = managedUserSchema.safeParse({
      ...user,
      roles: JSON.parse(rolesJson || "[]"),
    });
    if (!parsed.success) throw new Error("Persisted user invalid");
    return parsed.data;
  });
  return {
    data: users,
    next_cursor:
      rows.results.length > limit ? (users.at(-1)?.id ?? null) : null,
  };
}

export async function replaceUserRoles(
  db: D1Database,
  actor: Actor,
  userId: string,
  update: RoleUpdate,
  key: string,
  requestId: string,
) {
  const rolesJson = JSON.stringify([...update.roles].sort());
  const receipt = () =>
    db
      .prepare(
        "SELECT user_id, roles_json, expected_version FROM role_changes WHERE organization_id = ? AND actor_id = ? AND idempotency_key = ? LIMIT 1",
      )
      .bind(actor.organizationId, actor.id, key)
      .first<Receipt>();
  const replay = (previous: Receipt) => {
    if (
      previous.user_id !== userId ||
      previous.roles_json !== rolesJson ||
      previous.expected_version !== update.version
    )
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain. Muat ulang data.",
      );
    return { version: previous.expected_version + 1 };
  };
  const previous = await receipt();
  if (previous) return replay(previous);
  const timestamp = new Date().toISOString();
  const changeId = crypto.randomUUID();
  // The first statement aborts the entire D1 transaction if permissions or
  // versions changed since authentication. No read-then-write authorization gap.
  const guard = db
    .prepare(
      `INSERT INTO role_changes
    (id,organization_id,actor_id,user_id,idempotency_key,roles_json,expected_version,actual_version,actor_authorized,target_exists,preserves_admin,created_at)
    VALUES (?,?,?,?,?,?,?,
      COALESCE((SELECT version FROM users WHERE organization_id = ? AND id = ?),-1),
      EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.role_id='super_admin' AND ur.revoked_at IS NULL),
      EXISTS(SELECT 1 FROM users WHERE organization_id=? AND id=?),
      (EXISTS(SELECT 1 FROM json_each(?) WHERE value='super_admin') OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.role_id='super_admin' AND ur.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id<>? AND u.status='active' AND ur.role_id='super_admin' AND ur.revoked_at IS NULL)),?)`,
    )
    .bind(
      changeId,
      actor.organizationId,
      actor.id,
      userId,
      key,
      rolesJson,
      update.version,
      actor.organizationId,
      userId,
      actor.organizationId,
      actor.id,
      actor.organizationId,
      userId,
      rolesJson,
      actor.organizationId,
      userId,
      actor.organizationId,
      userId,
      timestamp,
    );
  const statements = [
    guard,
    db
      .prepare(
        `INSERT INTO audit_logs (id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at)
      SELECT ?,?,'user',?,'user.roles.replace','user',?,?,json_object('before',json((SELECT json_group_array(role_id) FROM (SELECT role_id FROM user_roles WHERE organization_id=? AND user_id=? AND revoked_at IS NULL ORDER BY role_id))),'after',json(?),'version',?),?`,
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        userId,
        requestId,
        actor.organizationId,
        userId,
        rolesJson,
        update.version + 1,
        timestamp,
      ),
    db
      .prepare(
        "UPDATE user_roles SET revoked_at=?,updated_at=?,version=version+1 WHERE organization_id=? AND user_id=? AND revoked_at IS NULL",
      )
      .bind(timestamp, timestamp, actor.organizationId, userId),
    ...update.roles.map((role) =>
      db
        .prepare(
          "INSERT INTO user_roles (id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          userId,
          role,
          actor.id,
          timestamp,
          timestamp,
          timestamp,
        ),
    ),
    db
      .prepare(
        "UPDATE users SET version=version+1,updated_at=? WHERE organization_id=? AND id=? AND version=?",
      )
      .bind(timestamp, actor.organizationId, userId, update.version),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const concurrent = await receipt();
    if (concurrent) return replay(concurrent);
    const reason = error instanceof Error ? error.message : "";
    if (reason.includes("role_actor_authorized"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (reason.includes("role_target_exists"))
      throw new ApplicationError("NOT_FOUND", 404, "Pengguna tidak ditemukan.");
    if (reason.includes("role_version_matches")) {
      const target = await db
        .prepare(
          "SELECT id FROM users WHERE organization_id=? AND id=? LIMIT 1",
        )
        .bind(actor.organizationId, userId)
        .first();
      if (!target)
        throw new ApplicationError(
          "NOT_FOUND",
          404,
          "Pengguna tidak ditemukan.",
        );
      throw new ApplicationError(
        "VERSION_CONFLICT",
        409,
        "Data telah berubah. Muat ulang sebelum menyimpan.",
      );
    }
    if (reason.includes("role_preserves_admin"))
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Minimal satu Super Admin aktif harus dipertahankan.",
      );
    throw error;
  }
  return { version: update.version + 1 };
}
