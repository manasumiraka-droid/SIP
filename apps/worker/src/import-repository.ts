import { z } from "zod";
import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  normalize,
  normalizeRow,
  type ImportDateFormat,
  type ImportMapping,
} from "./import-validation";
import type { ParsedSheet } from "./xlsx-parser";
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
/**
 * Parses a JSON column without trusting its shape: invalid JSON or a failed
 * schema match yields the provided fallback instead of throwing or leaking an
 * inconsistent value to the client.
 */
function safeParseJson<T>(value: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
const codeListSchema = z.array(z.string());
const normalizedRecordSchema = z.record(z.string(), z.unknown());
function payloadChunks<T>(values: T[]) {
  const chunks: T[][] = [];
  let current: T[] = [],
    currentSize = 2;
  for (const value of values) {
    const size = json(value).length + 1;
    if (
      current.length &&
      (current.length >= 100 || currentSize + size > 250_000)
    ) {
      chunks.push(current);
      current = [];
      currentSize = 2;
    }
    current.push(value);
    currentSize += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
const digest = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
/**
 * SQL expression producing a random UUID (v4-shaped) inline, so INSERT ...
 * SELECT statements can mint an id per row without a client round-trip.
 */
const uuidSqlExpression =
  "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6)))";
const allowed = (actor: Actor) =>
  actor.roles.includes("admin") || actor.roles.includes("super_admin");
type ImportNormalized = ReturnType<typeof normalizeRow> & {
  resolved?: {
    preacher?: { servantId: string; roleId: string };
    mc?: { servantId: string; roleId: string };
    offering?: Array<{ servantId: string; roleId: string }>;
  };
  candidates?: Partial<
    Record<"preacher" | "mc", Array<{ servantId: string; displayName: string }>>
  >;
};
type RoleRecord = { id: string; name: string };
type ServantRecord = { id: string; display_name: string };
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const before = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = before;
    }
  }
  return row[b.length] ?? Math.max(a.length, b.length);
}
function addMatchErrors(
  value: ImportNormalized,
  roles: RoleRecord[],
  servants: ServantRecord[],
  capabilities: Set<string>,
  linked: Partial<Record<"preacher" | "mc", string>>,
  pending: Partial<Record<"preacher" | "mc", string>>,
) {
  const roleFor = (name: string) =>
    roles.filter((role) => normalize(role.name) === normalize(name));
  const servantFor = (name: string) =>
    servants.filter(
      (servant) => normalize(servant.display_name) === normalize(name),
    );
  const resolveOne = (
    field: "preacher" | "mc",
    name: string,
    roleName: string,
  ) => {
    if (!name) return;
    const role = roleFor(roleName);
    if (role.length !== 1)
      value.errors.push(`ROLE_${field.toUpperCase()}_NOT_FOUND`);
    if (pending[field]) {
      value.warnings.push(`SERVANT_${field.toUpperCase()}_PENDING_REVIEW`);
      return;
    }
    const candidates = linked[field]
      ? servants.filter((servant) => servant.id === linked[field])
      : servantFor(name);
    if (candidates.length === 0) {
      value.errors.push(`SERVANT_${field.toUpperCase()}_UNRESOLVED`);
      const needle = normalize(name);
      const suggestions = servants
        .map((servant) => ({
          servant,
          distance: editDistance(needle, normalize(servant.display_name)),
        }))
        .filter(
          ({ servant, distance }) =>
            distance /
              Math.max(
                needle.length,
                normalize(servant.display_name).length,
                1,
              ) <=
            0.45,
        )
        .sort(
          (a, b) =>
            a.distance - b.distance ||
            a.servant.display_name.localeCompare(b.servant.display_name, "id"),
        )
        .slice(0, 3)
        .map(({ servant }) => ({
          servantId: servant.id,
          displayName: servant.display_name,
        }));
      if (suggestions.length) {
        value.candidates ??= {};
        value.candidates[field] = suggestions;
      }
    }
    if (candidates.length > 1)
      value.errors.push(`SERVANT_${field.toUpperCase()}_AMBIGUOUS`);
    const selectedRole = role.at(0),
      selectedServant = candidates.at(0);
    if (selectedRole && selectedServant) {
      if (!capabilities.has(`${selectedServant.id}:${selectedRole.id}`)) {
        value.errors.push(`CAPABILITY_${field.toUpperCase()}_INVALID`);
        return;
      }
      value.resolved ??= {};
      value.resolved[field] = {
        roleId: selectedRole.id,
        servantId: selectedServant.id,
      };
    }
  };
  resolveOne("preacher", value.preacher, "Pelayan Firman");
  resolveOne("mc", value.mc, "MC");
  if (value.offering.length) {
    const role = roleFor("Pelayan Persembahan");
    if (role.length !== 1) value.errors.push("ROLE_OFFERING_NOT_FOUND");
    const selectedRole = role.at(0);
    const resolved = value.offering.map((name) => {
      const candidates = servantFor(name);
      if (candidates.length === 0)
        value.errors.push("SERVANT_OFFERING_UNRESOLVED");
      if (candidates.length > 1)
        value.errors.push("SERVANT_OFFERING_AMBIGUOUS");
      const selected = candidates.at(0);
      if (
        selected &&
        selectedRole &&
        !capabilities.has(`${selected.id}:${selectedRole.id}`)
      )
        value.errors.push("CAPABILITY_OFFERING_INVALID");
      return selected && selectedRole
        ? { servantId: selected.id, roleId: selectedRole.id }
        : null;
    });
    if (resolved.every((item) => item)) {
      value.resolved ??= {};
      value.resolved.offering = resolved.filter(
        (item): item is { servantId: string; roleId: string } => item !== null,
      );
    }
  }
}
async function batch(db: D1Database, actor: Actor, id: string) {
  const result = await db
    .prepare(
      "SELECT * FROM import_batches WHERE organization_id=? AND id=? LIMIT 1",
    )
    .bind(actor.organizationId, id)
    .first<{
      id: string;
      uploaded_by: string;
      status: string;
      mapping_json: string;
      date_format: ImportDateFormat | null;
      sheet_name: string;
      version: number;
      checksum: string;
    }>();
  if (
    !result ||
    (!actor.roles.includes("super_admin") && result.uploaded_by !== actor.id)
  )
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Batch impor tidak ditemukan.",
    );
  return result;
}
export async function createImportBatch(
  db: D1Database,
  actor: Actor,
  fileName: string,
  checksum: string,
  parsed: ParsedSheet,
  mapping: ImportMapping,
  requestId: string,
) {
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const previous = await db
    .prepare(
      "SELECT id,status,sheet_name FROM import_batches WHERE organization_id=? AND uploaded_by=? AND checksum=? AND sheet_name=? AND mapping_json=? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(
      actor.organizationId,
      actor.id,
      checksum,
      parsed.sheetName,
      json(mapping),
    )
    .first<{ id: string; status: string; sheet_name: string }>();
  if (previous)
    return {
      id: previous.id,
      status: previous.status,
      sheet_name: previous.sheet_name,
      sheets: parsed.sheets,
      headers: parsed.headers,
      mapping,
      reused: true,
    };
  const id = crypto.randomUUID(),
    at = now(),
    expires = new Date(Date.now() + 7 * 86400000).toISOString();
  const rows = parsed.rows.map((raw, index) => {
    const normalized = normalizeRow(raw, mapping);
    return {
      id: crypto.randomUUID(),
      rowNumber: index + 2,
      sourceNumber: normalized.sourceNumber || null,
      raw,
      normalized,
      status: normalized.errors.length
        ? "error"
        : normalized.warnings.length
          ? "warning"
          : "valid",
    };
  });
  const chunks = payloadChunks(rows);
  await db.batch([
    db
      .prepare(
        "INSERT INTO import_batches(id,organization_id,uploaded_by,original_filename,checksum,sheet_name,mapping_json,timezone,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'Asia/Makassar','uploaded',?,?,?)",
      )
      .bind(
        id,
        actor.organizationId,
        actor.id,
        fileName,
        checksum,
        parsed.sheetName,
        json(mapping),
        expires,
        at,
        at,
      ),
    ...chunks.map((chunk) =>
      db
        .prepare(
          "INSERT INTO import_rows(id,batch_id,organization_id,row_number,source_number,raw_json,normalized_json,status,proposed_action,error_codes_json,warning_codes_json,created_at,updated_at) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.rowNumber'),json_extract(value,'$.sourceNumber'),json_extract(value,'$.raw'),json_extract(value,'$.normalized'),json_extract(value,'$.status'),'create',json_extract(value,'$.normalized.errors'),json_extract(value,'$.normalized.warnings'),?,? FROM json_each(?)",
        )
        .bind(id, actor.organizationId, at, at, json(chunk)),
    ),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.upload','import_batch',?,?,json_object('sheet',?,'rows',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        id,
        requestId,
        parsed.sheetName,
        rows.length,
        at,
      ),
  ]);
  return {
    id,
    status: "uploaded",
    sheet_name: parsed.sheetName,
    sheets: parsed.sheets,
    headers: parsed.headers,
    mapping,
    reused: false,
  };
}
export async function validateImportBatch(
  db: D1Database,
  actor: Actor,
  id: string,
  mapping: ImportMapping,
  dateFormat: ImportDateFormat,
  requestId: string,
) {
  const parent = await batch(db, actor, id);
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  if (
    ["committed", "committing", "rolled_back", "expired"].includes(
      parent.status,
    )
  )
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Batch impor tidak dapat divalidasi.",
    );
  const {
    records,
    roles,
    servants,
    capabilities,
    services,
    linkedByRow,
    pendingByRow,
  } = await loadValidationContext(db, actor.organizationId, id);
  const staged = stageRows(records, mapping, dateFormat, {
    roles,
    servants,
    capabilities,
    linkedByRow,
    pendingByRow,
  });
  const status = await detectDuplicates(
    db,
    actor.organizationId,
    staged,
    services,
  );
  const updateChunks = payloadChunks(
    staged.map((row) => ({
      id: row.id,
      normalized: row.value,
      status: row.status,
      action: row.action,
      duplicateServiceId: row.duplicateServiceId ?? null,
      errors: row.value.errors,
      warnings: row.value.warnings,
      warningsAcknowledgedAt:
        row.warningsAcknowledged &&
        row.priorWarnings === json(row.value.warnings)
          ? row.warningsAcknowledgedAt
          : null,
    })),
  );
  await persistValidation(
    db,
    actor,
    id,
    mapping,
    dateFormat,
    status,
    updateChunks,
    requestId,
  );
  return { id, status };
}

/**
 * Loads every record needed to validate a batch: staged rows, active roles and
 * servants, capability pairs, existing services, and servant resolutions.
 */
async function loadValidationContext(
  db: D1Database,
  organizationId: string,
  id: string,
) {
  const records = await db
    .prepare(
      "SELECT id,raw_json,override_starts_at,warnings_acknowledged_at,warning_codes_json,proposed_action FROM import_rows WHERE organization_id=? AND batch_id=? AND status<>'excluded' ORDER BY row_number LIMIT 5001",
    )
    .bind(organizationId, id)
    .all<RowRecord>();
  if (records.results.length === 0)
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Tambahkan setidaknya satu baris jadwal sebelum validasi.",
    );
  const [roleRows, servantRows, resolutionRows, capabilityRows, serviceRows] =
    await Promise.all([
      db
        .prepare(
          "SELECT id,name FROM service_roles WHERE organization_id=? AND active=1 ORDER BY id LIMIT 100",
        )
        .bind(organizationId)
        .all<RoleRecord>(),
      db
        .prepare(
          "SELECT id,display_name FROM servants WHERE organization_id=? AND status='active' ORDER BY id LIMIT 5001",
        )
        .bind(organizationId)
        .all<ServantRecord>(),
      db
        .prepare(
          "SELECT import_row_id,field_name,resolution_type,target_entity_id FROM import_resolutions WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?) AND resolution_type IN ('link_existing','create_pending_review') LIMIT 10001",
        )
        .bind(organizationId, organizationId, id)
        .all<ResolutionRecord>(),
      db
        .prepare(
          "SELECT servant_id,service_role_id FROM servant_capabilities WHERE organization_id=? AND status='active' LIMIT 20001",
        )
        .bind(organizationId)
        .all<{ servant_id: string; service_role_id: string }>(),
      db
        .prepare(
          "SELECT id,starts_at,lower(trim(location)) location_normalized FROM worship_services WHERE organization_id=? AND status<>'cancelled' ORDER BY starts_at,id LIMIT 10001",
        )
        .bind(organizationId)
        .all<{ id: string; starts_at: string; location_normalized: string }>(),
    ]);
  if (servantRows.results.length > 5000)
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Data pelayan terlalu banyak untuk validasi impor ini.",
    );
  if (serviceRows.results.length > 10000)
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Rentang jadwal terlalu besar untuk validasi impor ini.",
    );
  return {
    records: records.results,
    roles: roleRows.results,
    servants: servantRows.results,
    capabilities: new Set(
      capabilityRows.results.map(
        (row) => `${row.servant_id}:${row.service_role_id}`,
      ),
    ),
    services: new Map(
      serviceRows.results.map((service) => [
        `${service.starts_at}\u0000${service.location_normalized}`,
        service.id,
      ]),
    ),
    ...indexResolutions(resolutionRows.results),
  };
}

/** One row of an import batch, enriched with match results and duplicate state. */
type StagedRow = {
  id: string;
  value: ImportNormalized;
  action: string;
  warningsAcknowledged: boolean;
  warningsAcknowledgedAt: string | null;
  priorWarnings: string;
  status: string;
  duplicateServiceId?: string;
};
type RowRecord = {
  id: string;
  raw_json: string;
  override_starts_at: string | null;
  warnings_acknowledged_at: string | null;
  warning_codes_json: string;
  proposed_action: string;
};
type ResolutionRecord = {
  import_row_id: string;
  field_name: string;
  resolution_type: string;
  target_entity_id: string;
};

/** Groups linked/pending servant resolutions by import row for match checking. */
function indexResolutions(resolutions: ResolutionRecord[]) {
  const linkedByRow = new Map<
    string,
    Partial<Record<"preacher" | "mc", string>>
  >();
  const pendingByRow = new Map<
    string,
    Partial<Record<"preacher" | "mc", string>>
  >();
  for (const resolution of resolutions)
    if (
      (resolution.field_name === "preacher" ||
        resolution.field_name === "mc") &&
      resolution.target_entity_id
    ) {
      const target =
        resolution.resolution_type === "link_existing"
          ? linkedByRow
          : pendingByRow;
      target.set(resolution.import_row_id, {
        ...(target.get(resolution.import_row_id) ?? {}),
        [resolution.field_name]: resolution.target_entity_id,
      });
    }
  return { linkedByRow, pendingByRow };
}

/** Applies date overrides and servant matching to produce stageable rows. */
function stageRows(
  records: RowRecord[],
  mapping: ImportMapping,
  dateFormat: ImportDateFormat,
  context: {
    roles: RoleRecord[];
    servants: ServantRecord[];
    capabilities: Set<string>;
    linkedByRow: Map<string, Partial<Record<"preacher" | "mc", string>>>;
    pendingByRow: Map<string, Partial<Record<"preacher" | "mc", string>>>;
  },
): StagedRow[] {
  return records.map((row) => {
    const value: ImportNormalized = normalizeRow(
      JSON.parse(row.raw_json) as Record<string, string>,
      mapping,
      dateFormat,
    );
    if (row.override_starts_at) {
      value.startsAt = row.override_starts_at;
      value.assemblyAt = new Date(
        new Date(row.override_starts_at).getTime() - 30 * 60_000,
      ).toISOString();
      value.endsAt = new Date(
        new Date(row.override_starts_at).getTime() + 2 * 60 * 60_000,
      ).toISOString();
    }
    addMatchErrors(
      value,
      context.roles,
      context.servants,
      context.capabilities,
      context.linkedByRow.get(row.id) ?? {},
      context.pendingByRow.get(row.id) ?? {},
    );
    return {
      id: row.id,
      value,
      action: row.proposed_action,
      warningsAcknowledged: Boolean(row.warnings_acknowledged_at),
      warningsAcknowledgedAt: row.warnings_acknowledged_at,
      priorWarnings: row.warning_codes_json,
      status: value.errors.length
        ? "error"
        : value.warnings.length
          ? "warning"
          : "valid",
    };
  });
}

/** Flags duplicate services and resolves merge-slot conflicts in a single query. */
async function detectDuplicates(
  db: D1Database,
  organizationId: string,
  staged: StagedRow[],
  services: Map<string, string>,
) {
  const pendingSlots: Array<{
    row: StagedRow;
    serviceId: string;
    roleId: string;
    slot: number;
  }> = [];
  for (const row of staged) {
    const duplicateId =
      row.value.startsAt && row.value.locationNormalized
        ? services.get(
            `${row.value.startsAt}\u0000${row.value.locationNormalized}`,
          )
        : undefined;
    if (!duplicateId) continue;
    row.value.warnings.push("DUPLICATE_SERVICE");
    row.action = row.action === "create" ? "skip" : row.action;
    row.duplicateServiceId = duplicateId;
    row.status = row.value.errors.length ? "error" : "warning";
    if (row.action !== "merge_assignments") continue;
    const assignments = [
      row.value.resolved?.preacher,
      row.value.resolved?.mc,
      ...(row.value.resolved?.offering ?? []),
    ].filter(
      (assignment): assignment is { servantId: string; roleId: string } =>
        assignment !== undefined,
    );
    for (const [index, assignment] of assignments.entries())
      pendingSlots.push({
        row,
        serviceId: duplicateId,
        roleId: assignment.roleId,
        slot:
          assignments
            .slice(0, index)
            .filter((prior) => prior.roleId === assignment.roleId).length + 1,
      });
  }
  if (!pendingSlots.length) return stageStatus(staged);
  const occupied = await db
    .prepare(
      "SELECT service_role_id,slot_number,worship_service_id FROM assignments WHERE organization_id=? AND status<>'cancelled' AND (worship_service_id,service_role_id,slot_number) IN (SELECT value->>'serviceId',value->>'roleId',CAST(value->>'slot' AS INTEGER) FROM json_each(?))",
    )
    .bind(
      organizationId,
      json(
        pendingSlots.map(({ serviceId, roleId, slot }) => ({
          serviceId,
          roleId,
          slot,
        })),
      ),
    )
    .all<{
      worship_service_id: string;
      service_role_id: string;
      slot_number: number;
    }>();
  const occupiedKeys = new Set(
    occupied.results.map(
      (slot) =>
        `${slot.worship_service_id}\u0000${slot.service_role_id}\u0000${slot.slot_number}`,
    ),
  );
  for (const { row, serviceId, roleId, slot } of pendingSlots)
    if (occupiedKeys.has(`${serviceId}\u0000${roleId}\u0000${slot}`))
      row.value.errors.push("MERGE_SLOT_CONFLICT");
  for (const row of staged)
    if (row.action === "merge_assignments" && row.value.errors.length)
      row.status = "error";
  return stageStatus(staged);
}

/** Derives the aggregate batch status from the staged rows. */
function stageStatus(staged: StagedRow[]) {
  return staged.some(
    (row) =>
      row.status === "error" ||
      (row.status === "warning" && !row.warningsAcknowledged),
  )
    ? "needs_review"
    : "ready";
}

/** Writes staged rows, batch status, and the audit entry in one transaction. */
async function persistValidation(
  db: D1Database,
  actor: Actor,
  id: string,
  mapping: ImportMapping,
  dateFormat: ImportDateFormat,
  status: string,
  updateChunks: Array<Array<Record<string, unknown>>>,
  requestId: string,
) {
  const at = now();
  await db.batch([
    ...updateChunks.map((chunk) =>
      db
        .prepare(
          "UPDATE import_rows AS target SET normalized_json=json_extract(source.value,'$.normalized'),status=json_extract(source.value,'$.status'),proposed_action=json_extract(source.value,'$.action'),duplicate_service_id=json_extract(source.value,'$.duplicateServiceId'),error_codes_json=json_extract(source.value,'$.errors'),warning_codes_json=json_extract(source.value,'$.warnings'),warnings_acknowledged_at=json_extract(source.value,'$.warningsAcknowledgedAt'),updated_at=? FROM json_each(?) AS source WHERE target.organization_id=? AND target.id=json_extract(source.value,'$.id')",
        )
        .bind(at, json(chunk), actor.organizationId),
    ),
    db
      .prepare(
        "UPDATE import_batches SET mapping_json=?,date_format=?,status=?,version=version+1,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(json(mapping), dateFormat, status, at, actor.organizationId, id),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.validate','import_batch',?,?,json_object('status',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        id,
        requestId,
        status,
        at,
      ),
  ]);
}
export async function previewImportBatch(
  db: D1Database,
  actor: Actor,
  id: string,
  cursor: number,
  limit: number,
) {
  const parent = await batch(db, actor, id);
  const rows = await db
    .prepare(
      "SELECT id,row_number,source_number,normalized_json,status,proposed_action,error_codes_json,warning_codes_json,warnings_acknowledged_at,duplicate_service_id FROM import_rows WHERE organization_id=? AND batch_id=? AND row_number>? ORDER BY row_number LIMIT ?",
    )
    .bind(actor.organizationId, id, cursor, limit + 1)
    .all<{
      id: string;
      row_number: number;
      source_number: string | null;
      normalized_json: string;
      status: string;
      proposed_action: string;
      error_codes_json: string;
      warning_codes_json: string;
      warnings_acknowledged_at: string | null;
      duplicate_service_id: string | null;
    }>();
  const data = rows.results.slice(0, limit).map((row) => ({
    ...row,
    normalized: safeParseJson(row.normalized_json, normalizedRecordSchema, {}),
    errors: safeParseJson(row.error_codes_json, codeListSchema, [] as string[]),
    warnings: safeParseJson(
      row.warning_codes_json,
      codeListSchema,
      [] as string[],
    ),
  }));
  const totals = await db
    .prepare(
      "SELECT COUNT(*) total,SUM(CASE WHEN status='valid' THEN 1 ELSE 0 END) valid,SUM(CASE WHEN status='warning' THEN 1 ELSE 0 END) warnings,SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errors,SUM(CASE WHEN status='excluded' THEN 1 ELSE 0 END) excluded,SUM(CASE WHEN duplicate_service_id IS NOT NULL THEN 1 ELSE 0 END) duplicates,SUM(CASE WHEN status='committed' THEN 1 ELSE 0 END) committed,SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) skipped FROM import_rows WHERE organization_id=? AND batch_id=?",
    )
    .bind(actor.organizationId, id)
    .first<Record<string, number | null>>();
  return {
    batch: {
      id: parent.id,
      status: parent.status,
      sheet_name: parent.sheet_name,
      version: parent.version,
    },
    data,
    next_cursor:
      rows.results.length > limit ? (data.at(-1)?.row_number ?? null) : null,
    summary: {
      total: totals?.total ?? 0,
      valid: totals?.valid ?? 0,
      warnings: totals?.warnings ?? 0,
      errors: totals?.errors ?? 0,
      excluded: totals?.excluded ?? 0,
      duplicates: totals?.duplicates ?? 0,
      committed: totals?.committed ?? 0,
      skipped: totals?.skipped ?? 0,
    },
  };
}
export async function listImportServants(
  db: D1Database,
  actor: Actor,
  batchId: string,
) {
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  await batch(db, actor, batchId);
  const rows = await db
    .prepare(
      "SELECT id,display_name FROM servants WHERE organization_id=? AND status='active' ORDER BY display_name,id LIMIT 501",
    )
    .bind(actor.organizationId)
    .all<{ id: string; display_name: string }>();
  return {
    data: rows.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
    })),
  };
}
export async function reviewImportRow(
  db: D1Database,
  actor: Actor,
  batchId: string,
  rowId: string,
  input: {
    action?: "skip" | "merge_assignments" | "create_separate";
    acknowledgeWarnings?: boolean;
    startsAt?: string;
  },
  key: string,
  requestId: string,
) {
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const parent = await batch(db, actor, batchId);
  if (!["uploaded", "needs_review", "ready"].includes(parent.status))
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Batch impor tidak dapat diubah.",
    );
  const payloadHash = await digest({ batchId, rowId, input });
  const replay = await db
    .prepare(
      "SELECT import_row_id,payload_hash FROM import_action_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{ import_row_id: string; payload_hash: string }>();
  if (replay) {
    if (replay.import_row_id !== rowId || replay.payload_hash !== payloadHash)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return { id: rowId, replayed: true };
  }
  const row = await db
    .prepare(
      "SELECT id,warning_codes_json,duplicate_service_id FROM import_rows WHERE organization_id=? AND batch_id=? AND id=? LIMIT 1",
    )
    .bind(actor.organizationId, batchId, rowId)
    .first<{
      id: string;
      warning_codes_json: string;
      duplicate_service_id: string | null;
    }>();
  if (!row)
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Baris impor tidak ditemukan.",
    );
  if (input.action && !row.duplicate_service_id)
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Aksi duplikat hanya berlaku untuk jadwal yang sudah ada.",
    );
  if (input.action === "merge_assignments" && !row.duplicate_service_id)
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Target merge tidak ditemukan.",
    );
  if (input.acknowledgeWarnings === false)
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Pengakuan warning harus bernilai benar.",
    );
  const at = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO import_action_receipts(id,organization_id,actor_id,import_row_id,idempotency_key,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        rowId,
        key,
        payloadHash,
        at,
      ),
    db
      .prepare(
        "UPDATE import_rows SET proposed_action=COALESCE(?,proposed_action),override_starts_at=COALESCE(?,override_starts_at),warnings_acknowledged_at=CASE WHEN ?=1 THEN ? WHEN ?=1 THEN NULL ELSE warnings_acknowledged_at END,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(
        input.action ?? null,
        input.startsAt ?? null,
        input.acknowledgeWarnings ? 1 : 0,
        at,
        input.action || input.startsAt ? 1 : 0,
        at,
        actor.organizationId,
        rowId,
      ),
    db
      .prepare(
        "UPDATE import_batches SET status='needs_review',version=version+1,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(at, actor.organizationId, batchId),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.row.review','import_row',?,?,json_object('batch_id',?,'action',?,'time_overridden',?,'warnings_acknowledged',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        rowId,
        requestId,
        batchId,
        input.action ?? null,
        input.startsAt ? 1 : 0,
        input.acknowledgeWarnings ? 1 : 0,
        at,
      ),
  ]);
  return { id: rowId, replayed: false };
}
export async function excludeImportRow(
  db: D1Database,
  actor: Actor,
  batchId: string,
  rowId: string,
  key: string,
  requestId: string,
) {
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const replay = await db
    .prepare(
      "SELECT import_row_id FROM import_resolution_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{ import_row_id: string }>();
  if (replay) {
    if (replay.import_row_id !== rowId)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return { id: rowId, status: "excluded" as const };
  }
  const parent = await batch(db, actor, batchId);
  if (!["needs_review", "ready", "uploaded"].includes(parent.status))
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Batch impor tidak dapat diubah.",
    );
  const row = await db
    .prepare(
      "SELECT id FROM import_rows WHERE organization_id=? AND batch_id=? AND id=? LIMIT 1",
    )
    .bind(actor.organizationId, batchId, rowId)
    .first<{ id: string }>();
  if (!row)
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Baris impor tidak ditemukan.",
    );
  const at = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO import_resolution_receipts(id,organization_id,actor_id,import_row_id,idempotency_key,action,created_at) VALUES(?,?,?,?,?,'exclude',?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        rowId,
        key,
        at,
      ),
    db
      .prepare(
        "INSERT INTO import_resolutions(id,organization_id,import_row_id,field_name,resolution_type,target_entity_id,resolved_by,created_at) VALUES(?,?,?,'duplicate','exclude',NULL,?,?) ON CONFLICT(import_row_id,field_name) DO UPDATE SET resolution_type='exclude',target_entity_id=NULL,resolved_by=excluded.resolved_by,created_at=excluded.created_at",
      )
      .bind(crypto.randomUUID(), actor.organizationId, rowId, actor.id, at),
    db
      .prepare(
        "UPDATE import_rows SET status='excluded',proposed_action='skip',updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(at, actor.organizationId, rowId),
    db
      .prepare(
        "UPDATE import_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM import_rows WHERE organization_id=? AND batch_id=? AND (status='error' OR (status='warning' AND warnings_acknowledged_at IS NULL))) THEN 'needs_review' ELSE 'ready' END,version=version+1,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(actor.organizationId, batchId, at, actor.organizationId, batchId),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.row.exclude','import_row',?,?,json_object('batch_id',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        rowId,
        requestId,
        batchId,
        at,
      ),
  ]);
  return { id: rowId, status: "excluded" as const };
}
export async function linkImportServant(
  db: D1Database,
  actor: Actor,
  batchId: string,
  rowId: string,
  fieldName: "preacher" | "mc",
  servantId: string,
  key: string,
  requestId: string,
) {
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const replay = await db
    .prepare(
      "SELECT import_row_id,field_name,target_servant_id FROM import_link_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{
      import_row_id: string;
      field_name: string;
      target_servant_id: string;
    }>();
  if (replay) {
    if (
      replay.import_row_id !== rowId ||
      replay.field_name !== fieldName ||
      replay.target_servant_id !== servantId
    )
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return { id: rowId, field: fieldName, servant_id: servantId };
  }
  const parent = await batch(db, actor, batchId);
  if (!["uploaded", "needs_review", "ready"].includes(parent.status))
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Batch impor tidak dapat diubah.",
    );
  const row = await db
    .prepare(
      "SELECT id FROM import_rows WHERE organization_id=? AND batch_id=? AND id=? LIMIT 1",
    )
    .bind(actor.organizationId, batchId, rowId)
    .first();
  const servant = await db
    .prepare(
      "SELECT id FROM servants WHERE organization_id=? AND id=? AND status='active' LIMIT 1",
    )
    .bind(actor.organizationId, servantId)
    .first();
  if (!row || !servant)
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Data resolusi tidak ditemukan.",
    );
  const at = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO import_link_receipts(id,organization_id,actor_id,import_row_id,field_name,target_servant_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        rowId,
        fieldName,
        servantId,
        key,
        at,
      ),
    db
      .prepare(
        "INSERT INTO import_resolutions(id,organization_id,import_row_id,field_name,resolution_type,target_entity_id,resolved_by,created_at) VALUES(?,?,?,?,'link_existing',?,?,?) ON CONFLICT(import_row_id,field_name) DO UPDATE SET resolution_type='link_existing',target_entity_id=excluded.target_entity_id,resolved_by=excluded.resolved_by,created_at=excluded.created_at",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        rowId,
        fieldName,
        servantId,
        actor.id,
        at,
      ),
    db
      .prepare(
        "UPDATE import_batches SET status='needs_review',version=version+1,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(at, actor.organizationId, batchId),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.resolution.link','import_row',?,?,json_object('field',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        rowId,
        requestId,
        fieldName,
        at,
      ),
  ]);
  return { id: rowId, field: fieldName, servant_id: servantId };
}
export async function createPendingImportServant(
  db: D1Database,
  actor: Actor,
  batchId: string,
  rowId: string,
  fieldName: "preacher" | "mc",
  key: string,
  requestId: string,
) {
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  await batch(db, actor, batchId);
  const replay = await db
    .prepare(
      "SELECT servant_id,import_row_id,field_name FROM import_pending_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{ servant_id: string; import_row_id: string; field_name: string }>();
  if (replay) {
    if (replay.import_row_id !== rowId || replay.field_name !== fieldName)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return {
      id: rowId,
      servant_id: replay.servant_id,
      status: "pending_review" as const,
    };
  }
  const row = await db
    .prepare(
      "SELECT normalized_json FROM import_rows WHERE organization_id=? AND batch_id=? AND id=? LIMIT 1",
    )
    .bind(actor.organizationId, batchId, rowId)
    .first<{ normalized_json: string }>();
  if (!row)
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Baris impor tidak ditemukan.",
    );
  const normalized = JSON.parse(row.normalized_json) as ImportNormalized;
  const name = fieldName === "preacher" ? normalized.preacher : normalized.mc;
  if (!name)
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Nama pelayan belum tersedia.",
    );
  const roleName = fieldName === "preacher" ? "Pelayan Firman" : "MC";
  const role = await db
    .prepare(
      "SELECT id FROM service_roles WHERE organization_id=? AND active=1 AND lower(trim(name))=lower(trim(?)) LIMIT 1",
    )
    .bind(actor.organizationId, roleName)
    .first<{ id: string }>();
  if (!role)
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Peran pelayanan belum tersedia.",
    );
  const servantId = crypto.randomUUID(),
    at = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO servants(id,organization_id,display_name,status,is_backup,version,created_at,updated_at) VALUES(?,?,?,'pending_review',0,1,?,?)",
      )
      .bind(servantId, actor.organizationId, name, at, at),
    db
      .prepare(
        "INSERT INTO servant_capabilities(id,organization_id,servant_id,service_role_id,status,version,created_at,updated_at) VALUES(?,?,?,?, 'pending_approval',1,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        servantId,
        role.id,
        at,
        at,
      ),
    db
      .prepare(
        "INSERT INTO import_pending_receipts(id,organization_id,actor_id,import_row_id,field_name,servant_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        rowId,
        fieldName,
        servantId,
        key,
        at,
      ),
    db
      .prepare(
        "INSERT INTO import_resolutions(id,organization_id,import_row_id,field_name,resolution_type,target_entity_id,resolved_by,created_at) VALUES(?,?,?,?,'create_pending_review',?,?,?) ON CONFLICT(import_row_id,field_name) DO UPDATE SET resolution_type='create_pending_review',target_entity_id=excluded.target_entity_id,resolved_by=excluded.resolved_by,created_at=excluded.created_at",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        rowId,
        fieldName,
        servantId,
        actor.id,
        at,
      ),
    db
      .prepare(
        "UPDATE import_batches SET status='needs_review',version=version+1,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(at, actor.organizationId, batchId),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.servant.pending','servant',?,?,json_object('import_row_id',?,'field',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        servantId,
        requestId,
        rowId,
        fieldName,
        at,
      ),
  ]);
  return {
    id: rowId,
    servant_id: servantId,
    status: "pending_review" as const,
  };
}
export async function commitImportBatch(
  db: D1Database,
  actor: Actor,
  id: string,
  key: string,
  requestId: string,
) {
  if (!allowed(actor))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const parent = await batch(db, actor, id);
  const hash = await digest({ id });
  const prior = await db
    .prepare(
      "SELECT payload_hash FROM import_commit_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{ payload_hash: string }>();
  if (prior) {
    if (prior.payload_hash !== hash)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return { id, status: "committed", replayed: true };
  }
  if (parent.status !== "ready")
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Perbaiki seluruh error sebelum commit.",
    );
  const rows = await db
    .prepare(
      "SELECT id,normalized_json,proposed_action,duplicate_service_id FROM import_rows WHERE organization_id=? AND batch_id=? AND status IN ('valid','warning') ORDER BY row_number LIMIT 5001",
    )
    .bind(actor.organizationId, id)
    .all<{
      id: string;
      normalized_json: string;
      proposed_action: string;
      duplicate_service_id: string | null;
    }>();
  const at = now();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO import_commit_receipts(id,organization_id,actor_id,batch_id,idempotency_key,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        id,
        key,
        hash,
        at,
      ),
  ];
  statements.push(
    db
      .prepare(
        `INSERT INTO import_results(id,organization_id,import_row_id,entity_type,entity_id,action,created_at)
       SELECT ${uuidSqlExpression},organization_id,id,'worship_service',
         CASE WHEN duplicate_service_id IS NOT NULL AND proposed_action<>'create_separate' THEN duplicate_service_id ELSE ${uuidSqlExpression} END,
         CASE WHEN proposed_action='merge_assignments' THEN 'merged' WHEN duplicate_service_id IS NOT NULL AND proposed_action<>'create_separate' THEN 'skipped' ELSE 'created' END,?
       FROM import_rows WHERE organization_id=? AND batch_id=? AND status IN ('valid','warning')`,
      )
      .bind(at, actor.organizationId, id),
    db
      .prepare(
        `INSERT INTO worship_services(id,organization_id,assembly_at,starts_at,ends_at,location,status,theme,version,created_at,updated_at)
       SELECT result.entity_id,row.organization_id,json_extract(row.normalized_json,'$.assemblyAt'),json_extract(row.normalized_json,'$.startsAt'),json_extract(row.normalized_json,'$.endsAt'),json_extract(row.normalized_json,'$.location'),'draft','Impor jadwal',1,?,?
       FROM import_results result JOIN import_rows row ON row.organization_id=result.organization_id AND row.id=result.import_row_id
       WHERE row.organization_id=? AND row.batch_id=? AND result.action='created'`,
      )
      .bind(at, at, actor.organizationId, id),
    db
      .prepare(
        `INSERT INTO assignments(id,organization_id,worship_service_id,service_role_id,servant_id,slot_number,status,source_import_row_id,version,created_at,updated_at)
       WITH candidates AS (
         SELECT row.id row_id,result.entity_id service_id,json_extract(row.normalized_json,'$.resolved.preacher.roleId') role_id,json_extract(row.normalized_json,'$.resolved.preacher.servantId') servant_id,1 slot FROM import_rows row JOIN import_results result ON result.organization_id=row.organization_id AND result.import_row_id=row.id WHERE row.organization_id=? AND row.batch_id=? AND result.action<>'skipped'
         UNION ALL SELECT row.id,result.entity_id,json_extract(row.normalized_json,'$.resolved.mc.roleId'),json_extract(row.normalized_json,'$.resolved.mc.servantId'),1 FROM import_rows row JOIN import_results result ON result.organization_id=row.organization_id AND result.import_row_id=row.id WHERE row.organization_id=? AND row.batch_id=? AND result.action<>'skipped'
         UNION ALL SELECT row.id,result.entity_id,json_extract(item.value,'$.roleId'),json_extract(item.value,'$.servantId'),CAST(item.key AS INTEGER)+1 FROM import_rows row JOIN import_results result ON result.organization_id=row.organization_id AND result.import_row_id=row.id JOIN json_each(row.normalized_json,'$.resolved.offering') item WHERE row.organization_id=? AND row.batch_id=? AND result.action<>'skipped'
       ) SELECT ${uuidSqlExpression},?,service_id,role_id,servant_id,slot,'draft',row_id,1,?,? FROM candidates candidate
       WHERE role_id IS NOT NULL AND servant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assignments existing WHERE existing.organization_id=? AND existing.worship_service_id=candidate.service_id AND existing.service_role_id=candidate.role_id AND existing.slot_number=candidate.slot AND existing.status<>'cancelled')`,
      )
      .bind(
        actor.organizationId,
        id,
        actor.organizationId,
        id,
        actor.organizationId,
        id,
        actor.organizationId,
        at,
        at,
        actor.organizationId,
      ),
    db
      .prepare(
        "UPDATE import_rows SET status=CASE WHEN EXISTS(SELECT 1 FROM import_results result WHERE result.organization_id=import_rows.organization_id AND result.import_row_id=import_rows.id AND result.action='skipped') THEN 'skipped' ELSE 'committed' END,updated_at=? WHERE organization_id=? AND batch_id=? AND status IN ('valid','warning')",
      )
      .bind(at, actor.organizationId, id),
  );
  statements.push(
    db
      .prepare(
        "UPDATE import_batches SET status='committed',committed_at=?,version=version+1,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(at, at, actor.organizationId, id),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.commit','import_batch',?,?,json_object('rows',?),?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        id,
        requestId,
        rows.results.length,
        at,
      ),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    const replay = await db
      .prepare(
        "SELECT 1 FROM import_commit_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=?",
      )
      .bind(actor.organizationId, actor.id, key)
      .first();
    if (replay) return { id, status: "committed", replayed: true };
    throw error;
  }
  return { id, status: "committed", replayed: false };
}
export async function rollbackImportBatch(
  db: D1Database,
  actor: Actor,
  id: string,
  key: string,
  requestId: string,
) {
  if (!actor.roles.includes("super_admin"))
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const parent = await batch(db, actor, id);
  const replay = await db
    .prepare(
      "SELECT batch_id FROM import_rollback_receipts WHERE organization_id=? AND actor_id=? AND idempotency_key=? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{ batch_id: string }>();
  if (replay) {
    if (replay.batch_id !== id)
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Kode permintaan sudah digunakan untuk perubahan lain.",
      );
    return { id, status: "rolled_back" as const };
  }
  if (parent.status !== "committed")
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Batch impor belum dapat di-rollback.",
    );
  const changed = await db
    .prepare(
      "SELECT 1 FROM import_results r JOIN worship_services ws ON ws.organization_id=r.organization_id AND ws.id=r.entity_id WHERE r.organization_id=? AND r.entity_type='worship_service' AND r.import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?) AND (ws.published_at IS NOT NULL OR ws.version<>1) LIMIT 1",
    )
    .bind(actor.organizationId, actor.organizationId, id)
    .first();
  if (changed)
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Rollback ditolak karena jadwal sudah dipublikasikan atau diubah.",
    );
  const at = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO import_rollback_receipts(id,organization_id,actor_id,batch_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(crypto.randomUUID(), actor.organizationId, actor.id, id, key, at),
    db
      .prepare(
        "UPDATE assignments SET status='cancelled',version=version+1,updated_at=? WHERE organization_id=? AND source_import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?) AND status NOT IN ('cancelled','completed')",
      )
      .bind(at, actor.organizationId, actor.organizationId, id),
    db
      .prepare(
        "UPDATE worship_services SET status='cancelled',cancellation_reason='import rollback',version=version+1,updated_at=? WHERE organization_id=? AND id IN (SELECT entity_id FROM import_results WHERE organization_id=? AND entity_type='worship_service' AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?) AND action='created')",
      )
      .bind(
        at,
        actor.organizationId,
        actor.organizationId,
        actor.organizationId,
        id,
      ),
    db
      .prepare(
        "UPDATE import_results SET rollback_status='voided' WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
      )
      .bind(actor.organizationId, actor.organizationId, id),
    db
      .prepare(
        "UPDATE import_batches SET status='rolled_back',version=version+1,updated_at=? WHERE organization_id=? AND id=?",
      )
      .bind(at, actor.organizationId, id),
    db
      .prepare(
        "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'user',?,'import.rollback','import_batch',?,?, '{}',?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        id,
        requestId,
        at,
      ),
  ]);
  return { id, status: "rolled_back" as const };
}
