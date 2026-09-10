import { identitySchema } from "../../../packages/validation/src/identity";

export async function findActor(
  db: D1Database,
  organizationId: string,
  email: string,
) {
  const user = await db
    .prepare(
      "SELECT id, organization_id AS organizationId, display_name AS displayName, status FROM users WHERE organization_id = ? AND email = ? COLLATE NOCASE LIMIT 1",
    )
    .bind(organizationId, email)
    .first<{
      id: string;
      organizationId: string;
      displayName: string;
      status: string;
    }>();
  if (!user) return null;
  const [roleRows, scopeRows] = await Promise.all([
    db
      .prepare(
        "SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.organization_id = ? AND ur.user_id = ? AND ur.revoked_at IS NULL ORDER BY r.code LIMIT 6",
      )
      .bind(organizationId, user.id)
      .all<{ code: string }>(),
    db
      .prepare(
        "SELECT scope_type AS type, scope_id AS id, starts_at AS startsAt, ends_at AS endsAt FROM coordinator_scopes WHERE organization_id = ? AND user_id = ? ORDER BY id LIMIT 101",
      )
      .bind(organizationId, user.id)
      .all(),
  ]);
  if (scopeRows.results.length > 100) throw new Error("Scope limit exceeded");
  const identity = identitySchema.safeParse({
    ...user,
    roles: roleRows.results.map((row) => row.code),
    scopes: scopeRows.results,
  });
  if (!identity.success) throw new Error("Persisted identity invalid");
  return identity.data;
}

export async function getTimezone(db: D1Database, organizationId: string) {
  return db
    .prepare("SELECT timezone FROM organizations WHERE id = ? LIMIT 1")
    .bind(organizationId)
    .first<{ timezone: string }>();
}

export function auditStatement(
  db: D1Database,
  event: {
    organizationId: string;
    actorId: string;
    requestId: string;
    action: "identity.read";
  },
) {
  // Call inside D1 batch alongside future mutations; never accept arbitrary metadata.
  return db
    .prepare(
      "INSERT INTO audit_logs (id, organization_id, actor_type, actor_id, action, entity_type, entity_id, request_id, metadata_redacted_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      event.organizationId,
      "user",
      event.actorId,
      event.action,
      "user",
      event.actorId,
      event.requestId,
      "{}",
      new Date().toISOString(),
    );
}
