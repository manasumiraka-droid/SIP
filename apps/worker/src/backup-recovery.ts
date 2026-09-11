import type { D1Database } from "@cloudflare/workers-types";
import { ApplicationError } from "../../../packages/domain/src/errors";

export const BACKUP_TABLES = [
  "organizations",
  "users",
  "user_roles",
  "service_fields",
  "service_roles",
  "capability_approvers",
  "servants",
  "servant_capabilities",
  "worship_services",
  "coordinator_scopes",
  "assignments",
  "attendance_records",
  "service_notes",
  "service_notes_acl",
  "audit_logs",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupManifest = {
  version: 1;
  createdAt: string;
  organizationId: string;
  tableCounts: Record<string, number>;
  checksumSha256: string;
  data: Record<string, Array<Record<string, unknown>>>;
};

export type RestoreReport = {
  restoredTables: string[];
  totalRowsRestored: number;
  restoredAt: string;
};

export async function computeDataChecksum(
  data: Record<string, Array<Record<string, unknown>>>,
): Promise<string> {
  // Sort keys deterministically
  const sortedKeys = Object.keys(data).sort();
  const normalized: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    normalized[k] = data[k];
  }
  const jsonStr = JSON.stringify(normalized);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(jsonStr),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function backupD1Tables(
  db: D1Database,
  organizationId: string,
): Promise<BackupManifest> {
  const data: Record<string, Array<Record<string, unknown>>> = {};
  const tableCounts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    let sql: string;
    if (table === "organizations") {
      sql = `SELECT * FROM ${table} WHERE id = ? ORDER BY id`;
    } else {
      sql = `SELECT * FROM ${table} WHERE organization_id = ? ORDER BY id`;
    }

    try {
      const rows = await db
        .prepare(sql)
        .bind(organizationId)
        .all<Record<string, unknown>>();
      const results = rows.results ?? [];
      data[table] = results;
      tableCounts[table] = results.length;
    } catch {
      data[table] = [];
      tableCounts[table] = 0;
    }
  }

  const checksumSha256 = await computeDataChecksum(data);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    organizationId,
    tableCounts,
    checksumSha256,
    data,
  };
}

export async function verifyBackupChecksum(
  manifest: BackupManifest,
): Promise<boolean> {
  const recomputed = await computeDataChecksum(manifest.data);
  return recomputed === manifest.checksumSha256;
}

export async function restoreD1Tables(
  db: D1Database,
  manifest: BackupManifest,
  targetOrganizationId: string,
): Promise<RestoreReport> {
  if (manifest.version !== 1) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Versi berkas cadangan tidak didukung.",
    );
  }

  if (manifest.organizationId !== targetOrganizationId) {
    throw new ApplicationError(
      "CONFLICT",
      409,
      `Organisasi pada cadangan (${manifest.organizationId}) tidak sesuai dengan target (${targetOrganizationId}).`,
    );
  }

  const isValid = await verifyBackupChecksum(manifest);
  if (!isValid) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Checksum SHA-256 berkas cadangan tidak valid atau berkas telah mengalami kerusakan (corrupted).",
    );
  }

  // Restore tables in foreign-key safe order
  let totalRows = 0;
  const restoredTables: string[] = [];

  // Temporary disable foreign keys for safe restoration batch
  await db.prepare("PRAGMA foreign_keys = OFF;").run();

  // 1. Delete existing rows in REVERSE foreign-key order (children first, parents last)
  for (const table of [...BACKUP_TABLES].reverse()) {
    if (table === "organizations") {
      await db
        .prepare(`DELETE FROM ${table} WHERE id = ?`)
        .bind(targetOrganizationId)
        .run();
    } else {
      await db
        .prepare(`DELETE FROM ${table} WHERE organization_id = ?`)
        .bind(targetOrganizationId)
        .run();
    }
  }

  // 2. Insert backed-up rows in FORWARD foreign-key order (parents first, children last)
  for (const table of BACKUP_TABLES) {
    const rows = manifest.data[table] ?? [];
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0] ?? {});
    if (columns.length > 0) {
      const placeholders = columns.map(() => "?").join(", ");
      const insertSql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

      const batchStmts = rows.map((row) => {
        const values = columns.map((col) => row[col] ?? null);
        return db.prepare(insertSql).bind(...values);
      });

      const chunkSize = 50;
      for (let i = 0; i < batchStmts.length; i += chunkSize) {
        const chunk = batchStmts.slice(i, i + chunkSize);
        await db.batch(chunk);
      }

      totalRows += rows.length;
      restoredTables.push(table);
    }
  }

  // Audit the restoration event
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO audit_logs (
        id, organization_id, actor_type, actor_id, action, entity_type, entity_id,
        request_id, metadata_redacted_json, created_at
      ) VALUES (?, ?, 'system', NULL, 'backup.restore.executed', 'organization', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      targetOrganizationId,
      targetOrganizationId,
      `restore_${crypto.randomUUID()}`,
      JSON.stringify({
        restoredTables,
        totalRowsRestored: totalRows,
        sourceCreatedAt: manifest.createdAt,
      }),
      now,
    )
    .run();

  return {
    restoredTables,
    totalRowsRestored: totalRows,
    restoredAt: now,
  };
}
