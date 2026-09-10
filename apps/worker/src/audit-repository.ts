import { auditEntrySchema } from "../../../packages/validation/src/audit";
import { ApplicationError } from "../../../packages/domain/src/errors";
export async function listAuditEntries(
  db: D1Database,
  organizationId: string,
  cursor: string,
  limit: number,
  action: string | null,
  includeRestricted: boolean,
) {
  const boundary = cursor
    ? decodeAuditCursor(cursor)
    : { createdAt: "9999-12-31T23:59:59.999Z", id: "~" };
  const rows = await db
    .prepare(
      `SELECT id,actor_type AS actorType,actor_id AS actorId,action,entity_type AS entityType,entity_id AS entityId,request_id AS requestId,metadata_redacted_json AS metadataJson,created_at AS createdAt
    FROM audit_logs WHERE organization_id=? AND (created_at < ? OR (created_at = ? AND id < ?)) AND (? IS NULL OR action=?) AND (?=1 OR action NOT LIKE 'note.restricted.%')
    ORDER BY created_at DESC,id DESC LIMIT ?`,
    )
    .bind(
      organizationId,
      boundary.createdAt,
      boundary.createdAt,
      boundary.id,
      action,
      action,
      includeRestricted ? 1 : 0,
      limit + 1,
    )
    .all<{
      id: string;
      actorType: string;
      actorId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      requestId: string;
      metadataJson: string;
      createdAt: string;
    }>();
  const entries = rows.results
    .slice(0, limit)
    .map(({ metadataJson, ...entry }) => {
      const parsed = auditEntrySchema.safeParse({
        ...entry,
        metadata: JSON.parse(metadataJson),
      });
      if (!parsed.success) throw new Error("Persisted audit entry invalid");
      return parsed.data;
    });
  const lastEntry = entries.at(-1);
  return {
    data: entries,
    next_cursor:
      rows.results.length > limit && lastEntry
        ? encodeAuditCursor(lastEntry.createdAt, lastEntry.id)
        : null,
  };
}
function encodeAuditCursor(createdAt: string, id: string) {
  return btoa(JSON.stringify([createdAt, id]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function decodeAuditCursor(cursor: string) {
  try {
    const base64 = cursor
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(cursor.length / 4) * 4, "=");
    const parsed: unknown = JSON.parse(atob(base64));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(parsed[0]) ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(parsed[1])
    )
      throw new Error("Invalid cursor");
    return { createdAt: parsed[0], id: parsed[1] };
  } catch {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Cursor audit tidak valid.",
    );
  }
}
