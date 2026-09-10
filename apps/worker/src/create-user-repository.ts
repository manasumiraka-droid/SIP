import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import type { CreateUser } from "../../../packages/validation/src/users";
export async function persistNewUser(
  db: D1Database,
  actor: Actor,
  input: CreateUser,
  key: string,
  requestId: string,
) {
  const roles = [...input.roles].sort();
  const canonical = JSON.stringify({
    displayName: input.displayName,
    email: input.email,
    roles,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const receipt = () =>
    db
      .prepare(
        "SELECT user_id,payload_hash FROM user_creations WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
      )
      .bind(actor.organizationId, actor.id, key)
      .first<{ user_id: string; payload_hash: string }>();
  const replay = (previous: { user_id: string; payload_hash: string }) => {
    if (previous.payload_hash !== hash)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk data lain. Muat ulang daftar pengguna.",
      );
    return { id: previous.user_id, version: 1 as const };
  };
  const previous = await receipt();
  if (previous) return replay(previous);
  const userId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO user_creations (id,organization_id,actor_id,user_id,idempotency_key,payload_hash,actor_authorized,created_at)
        VALUES (?,?,?,?,?,?,EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.organization_id=u.organization_id AND ur.user_id=u.id WHERE u.organization_id=? AND u.id=? AND u.status='active' AND ur.role_id='super_admin' AND ur.revoked_at IS NULL),?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          userId,
          key,
          hash,
          actor.organizationId,
          actor.id,
          timestamp,
        ),
      db
        .prepare(
          "INSERT INTO users (id,organization_id,email,display_name,status,version,created_at,updated_at) VALUES (?,?,?,?,'active',1,?,?)",
        )
        .bind(
          userId,
          actor.organizationId,
          input.email,
          input.displayName,
          timestamp,
          timestamp,
        ),
      ...roles.map((role) =>
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
          "INSERT INTO audit_logs (id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES (?,?,'user',?,'user.create','user',?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          actor.organizationId,
          actor.id,
          userId,
          requestId,
          JSON.stringify({ roles, status: "active", version: 1 }),
          timestamp,
        ),
    ]);
  } catch (error) {
    const concurrent = await receipt();
    if (concurrent) return replay(concurrent);
    const reason = error instanceof Error ? error.message : "";
    if (reason.includes("creation_actor_authorized"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (reason.includes("users.organization_id, users.email"))
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Email tersebut sudah terdaftar dalam jemaat ini. Periksa daftar pengguna.",
      );
    throw error;
  }
  return { id: userId, version: 1 as const };
}
