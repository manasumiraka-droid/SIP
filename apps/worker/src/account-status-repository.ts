import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import type { AccountStatusUpdate } from "../../../packages/validation/src/users";
type StatusReceipt = {
  user_id: string;
  requested_status: string;
  expected_version: number;
};
export async function replaceAccountStatus(
  db: D1Database,
  actor: Actor,
  userId: string,
  update: AccountStatusUpdate,
  key: string,
  requestId: string,
) {
  const receipt = () =>
    db
      .prepare(
        "SELECT user_id,requested_status,expected_version FROM account_status_changes WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
      )
      .bind(actor.organizationId, actor.id, key)
      .first<StatusReceipt>();
  const replay = (prior: StatusReceipt) => {
    if (
      prior.user_id !== userId ||
      prior.requested_status !== update.status ||
      prior.expected_version !== update.version
    )
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain. Muat ulang data.",
      );
    return { version: prior.expected_version + 1, status: update.status };
  };
  const prior = await receipt();
  if (prior) return replay(prior);
  const timestamp = new Date().toISOString();
  const guard = db
    .prepare(
      `INSERT INTO account_status_changes
    (id,organization_id,actor_id,user_id,idempotency_key,requested_status,expected_version,actual_version,actor_authorized,target_exists,preserves_admin,created_at)
    VALUES (?,?,?,?,?,?,?,
      COALESCE((SELECT version FROM users WHERE organization_id=? AND id=?),-1),
      EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.role_id='super_admin' AND ur.revoked_at IS NULL),
      EXISTS(SELECT 1 FROM users WHERE organization_id=? AND id=?),
      (?='active' OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.role_id='super_admin' AND ur.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id<>? AND u.status='active' AND ur.role_id='super_admin' AND ur.revoked_at IS NULL)),?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.organizationId,
      actor.id,
      userId,
      key,
      update.status,
      update.version,
      actor.organizationId,
      userId,
      actor.organizationId,
      actor.id,
      actor.organizationId,
      userId,
      update.status,
      actor.organizationId,
      userId,
      actor.organizationId,
      userId,
      timestamp,
    );
  try {
    await db.batch([
      guard,
      db
        .prepare(
          `INSERT INTO audit_logs (id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at)
        SELECT ?,?,'user',?,'user.status.replace','user',?,?,json_object('before',status,'after',?,'version',?),? FROM users WHERE organization_id=? AND id=?`,
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          userId,
          requestId,
          update.status,
          update.version + 1,
          timestamp,
          actor.organizationId,
          userId,
        ),
      db
        .prepare(
          "UPDATE users SET status=?,version=version+1,updated_at=? WHERE organization_id=? AND id=? AND version=?",
        )
        .bind(
          update.status,
          timestamp,
          actor.organizationId,
          userId,
          update.version,
        ),
    ]);
  } catch (error) {
    const concurrent = await receipt();
    if (concurrent) return replay(concurrent);
    const reason = error instanceof Error ? error.message : "";
    if (reason.includes("status_actor_authorized"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (reason.includes("status_target_exists"))
      throw new ApplicationError("NOT_FOUND", 404, "Pengguna tidak ditemukan.");
    if (reason.includes("status_version_matches")) {
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
    if (reason.includes("status_preserves_admin"))
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Minimal satu Super Admin aktif harus dipertahankan.",
      );
    if (reason.includes("Account status transition must change status"))
      throw new ApplicationError(
        "INVALID_TRANSITION",
        409,
        "Status akun sudah berada pada keadaan yang dipilih.",
      );
    throw error;
  }
  return { version: update.version + 1, status: update.status };
}
