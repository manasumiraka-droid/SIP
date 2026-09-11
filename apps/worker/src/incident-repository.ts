import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  calculateUrgency,
  sortCandidates,
  type CandidateRecommendation,
  type IncidentStatus,
  type IncidentUrgency,
} from "../../../packages/domain/src/incidents";
import type {
  CreateIncident,
  EscalateIncident,
  QueryIncidents,
  ResolveIncident,
} from "../../../packages/validation/src/incidents";

async function hashPayload(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export type IncidentSummary = {
  id: string;
  organizationId: string;
  serviceId: string;
  assignmentId: string;
  serviceRoleId: string;
  roleCode: string;
  roleName: string;
  serviceStartsAt: string;
  serviceLocation: string;
  servantId: string;
  servantName: string;
  status: IncidentStatus;
  urgency: IncidentUrgency;
  reason: string;
  resolvedAssignmentId: string | null;
  resolvedServantName: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listIncidents(
  db: D1Database,
  actor: Actor,
  query: QueryIncidents,
): Promise<{ data: IncidentSummary[] }> {
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");
  const nowStr = new Date().toISOString();

  let sql = `
    SELECT
      rc.id, rc.organization_id AS organizationId, rc.service_id AS serviceId,
      rc.assignment_id AS assignmentId, rc.service_role_id AS serviceRoleId,
      sr.code AS roleCode, sr.name AS roleName,
      ws.starts_at AS serviceStartsAt, ws.location AS serviceLocation,
      s.id AS servantId, s.display_name AS servantName,
      rc.status, rc.urgency, rc.reason,
      rc.resolved_assignment_id AS resolvedAssignmentId,
      res_s.display_name AS resolvedServantName,
      rc.resolved_by AS resolvedBy, rc.resolved_at AS resolvedAt,
      rc.created_at AS createdAt, rc.updated_at AS updatedAt
    FROM replacement_cases rc
    JOIN worship_services ws ON ws.organization_id = rc.organization_id AND ws.id = rc.service_id
    JOIN service_roles sr ON sr.organization_id = rc.organization_id AND sr.id = rc.service_role_id
    JOIN assignments a ON a.organization_id = rc.organization_id AND a.id = rc.assignment_id
    JOIN servants s ON s.organization_id = a.organization_id AND s.id = a.servant_id
    LEFT JOIN assignments res_a ON res_a.organization_id = rc.organization_id AND res_a.id = rc.resolved_assignment_id
    LEFT JOIN servants res_s ON res_s.organization_id = res_a.organization_id AND res_s.id = res_a.servant_id
    WHERE rc.organization_id = ?
  `;
  const params: unknown[] = [actor.organizationId];

  if (query.status) {
    sql += ` AND rc.status = ?`;
    params.push(query.status);
  }

  if (query.serviceId) {
    sql += ` AND rc.service_id = ?`;
    params.push(query.serviceId);
  }

  if (!isOrgWide) {
    sql += ` AND (
      EXISTS (
        SELECT 1 FROM coordinator_scopes cs
        WHERE cs.organization_id = rc.organization_id AND cs.user_id = ?
          AND cs.scope_type = 'service' AND cs.scope_id = rc.service_id
          AND cs.starts_at <= ? AND (cs.ends_at IS NULL OR cs.ends_at > ?)
      )
      OR EXISTS (
        SELECT 1 FROM coordinator_scopes cs
        WHERE cs.organization_id = rc.organization_id AND cs.user_id = ?
          AND cs.scope_type = 'field' AND cs.scope_id = sr.field_id
          AND cs.starts_at <= ? AND (cs.ends_at IS NULL OR cs.ends_at > ?)
      )
      OR s.user_id = ?
    )`;
    params.push(actor.id, nowStr, nowStr, actor.id, nowStr, nowStr, actor.id);
  }

  sql += ` ORDER BY CASE WHEN rc.status = 'open' THEN 0 ELSE 1 END ASC, rc.created_at DESC LIMIT ?`;
  const rawLimit = Number(query.limit ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 100)
    : 50;
  params.push(limit);

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<IncidentSummary>();

  const now = new Date();
  const rows = (result.results ?? []).map((row) => {
    const computedUrgency =
      row.status === "open"
        ? calculateUrgency(row.serviceStartsAt, now)
        : row.urgency;
    return { ...row, urgency: computedUrgency };
  });

  return { data: rows };
}

export async function getIncidentById(
  db: D1Database,
  actor: Actor,
  id: string,
): Promise<{ data: IncidentSummary; candidates: CandidateRecommendation[] }> {
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");
  const nowStr = new Date().toISOString();

  let sql = `
    SELECT
      rc.id, rc.organization_id AS organizationId, rc.service_id AS serviceId,
      rc.assignment_id AS assignmentId, rc.service_role_id AS serviceRoleId,
      sr.code AS roleCode, sr.name AS roleName,
      ws.starts_at AS serviceStartsAt, ws.location AS serviceLocation,
      s.id AS servantId, s.display_name AS servantName,
      rc.status, rc.urgency, rc.reason,
      rc.resolved_assignment_id AS resolvedAssignmentId,
      res_s.display_name AS resolvedServantName,
      rc.resolved_by AS resolvedBy, rc.resolved_at AS resolvedAt,
      rc.created_at AS createdAt, rc.updated_at AS updatedAt
    FROM replacement_cases rc
    JOIN worship_services ws ON ws.organization_id = rc.organization_id AND ws.id = rc.service_id
    JOIN service_roles sr ON sr.organization_id = rc.organization_id AND sr.id = rc.service_role_id
    JOIN assignments a ON a.organization_id = rc.organization_id AND a.id = rc.assignment_id
    JOIN servants s ON s.organization_id = a.organization_id AND s.id = a.servant_id
    LEFT JOIN assignments res_a ON res_a.organization_id = rc.organization_id AND res_a.id = rc.resolved_assignment_id
    LEFT JOIN servants res_s ON res_s.organization_id = res_a.organization_id AND res_s.id = res_a.servant_id
    WHERE rc.organization_id = ? AND rc.id = ?
  `;
  const params: unknown[] = [actor.organizationId, id];

  if (!isOrgWide) {
    sql += ` AND (
      EXISTS (
        SELECT 1 FROM coordinator_scopes cs
        WHERE cs.organization_id = rc.organization_id AND cs.user_id = ?
          AND cs.scope_type = 'service' AND cs.scope_id = rc.service_id
          AND cs.starts_at <= ? AND (cs.ends_at IS NULL OR cs.ends_at > ?)
      )
      OR EXISTS (
        SELECT 1 FROM coordinator_scopes cs
        WHERE cs.organization_id = rc.organization_id AND cs.user_id = ?
          AND cs.scope_type = 'field' AND cs.scope_id = sr.field_id
          AND cs.starts_at <= ? AND (cs.ends_at IS NULL OR cs.ends_at > ?)
      )
      OR s.user_id = ?
    )`;
    params.push(actor.id, nowStr, nowStr, actor.id, nowStr, nowStr, actor.id);
  }

  const found = await db
    .prepare(sql)
    .bind(...params)
    .first<IncidentSummary>();

  if (!found) {
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Kasus insiden tidak ditemukan.",
    );
  }

  const computedUrgency =
    found.status === "open"
      ? calculateUrgency(found.serviceStartsAt, new Date())
      : found.urgency;
  const incident: IncidentSummary = { ...found, urgency: computedUrgency };

  let candidates: CandidateRecommendation[] = [];
  if (incident.status === "open" || incident.status === "escalated_manual") {
    candidates = await recommendCandidates(
      db,
      actor.organizationId,
      incident.serviceId,
      incident.serviceRoleId,
      incident.servantId,
    );
  }

  return { data: incident, candidates };
}

export async function recommendCandidates(
  db: D1Database,
  organizationId: string,
  serviceId: string,
  serviceRoleId: string,
  excludedServantId: string,
): Promise<CandidateRecommendation[]> {
  const service = await db
    .prepare(
      "SELECT starts_at, assembly_at, ends_at FROM worship_services WHERE organization_id = ? AND id = ?",
    )
    .bind(organizationId, serviceId)
    .first<{ starts_at: string; assembly_at: string; ends_at: string }>();

  if (!service) return [];

  const monthPrefix = service.starts_at.slice(0, 7); // e.g. "2026-09"

  // Query active servants that have approved capability for this role
  // and no availability conflict and no schedule conflict
  const rows = await db
    .prepare(
      `
      SELECT
        s.id AS servantId,
        s.display_name AS displayName,
        s.is_backup AS isBackup,
        (
          SELECT COUNT(*)
          FROM assignments a
          JOIN worship_services ws ON ws.organization_id = a.organization_id AND ws.id = a.worship_service_id
          WHERE a.organization_id = s.organization_id
            AND a.servant_id = s.id
            AND a.status NOT IN ('cancelled', 'reassigned')
            AND substr(ws.starts_at, 1, 7) = ?
        ) AS monthlyAssignmentsCount
      FROM servants s
      JOIN servant_capabilities sc
        ON sc.organization_id = s.organization_id
        AND sc.servant_id = s.id
        AND sc.service_role_id = ?
        AND sc.status = 'active'
      WHERE s.organization_id = ?
        AND s.status = 'active'
        AND s.id <> ?
        -- Not in availability block
        AND NOT EXISTS (
          SELECT 1 FROM availability_blocks b
          WHERE b.organization_id = s.organization_id
            AND b.servant_id = s.id
            AND b.starts_at < ?
            AND b.ends_at > ?
        )
        -- No conflicting overlapping service assignment
        AND NOT EXISTS (
          SELECT 1 FROM assignments a
          JOIN worship_services ws2 ON ws2.organization_id = a.organization_id AND ws2.id = a.worship_service_id
          WHERE a.organization_id = s.organization_id
            AND a.servant_id = s.id
            AND a.status NOT IN ('cancelled', 'reassigned')
            AND ws2.assembly_at < ?
            AND ws2.ends_at > ?
        )
    `,
    )
    .bind(
      monthPrefix,
      serviceRoleId,
      organizationId,
      excludedServantId,
      service.ends_at,
      service.assembly_at,
      service.ends_at,
      service.assembly_at,
    )
    .all<{
      servantId: string;
      displayName: string;
      isBackup: number;
      monthlyAssignmentsCount: number;
    }>();

  const candidates = (rows.results ?? []).map((row) => {
    const isBackup = row.isBackup === 1;
    const count = Number(row.monthlyAssignmentsCount) || 0;
    const explanation: string[] = [];

    if (isBackup) explanation.push("Pelayan cadangan prioritas");
    explanation.push(
      count === 0
        ? "Belum ada penugasan bulan ini"
        : `${count} tugas bulan ini`,
    );
    explanation.push("Kelayakan peran aktif");

    return {
      servantId: row.servantId,
      displayName: row.displayName,
      isBackup,
      monthlyAssignmentsCount: count,
      roleApproved: true,
      explanation,
    };
  });

  return sortCandidates(candidates);
}

export async function createIncident(
  db: D1Database,
  actor: Actor,
  input: CreateIncident,
  requestId: string,
): Promise<{ id: string; status: IncidentStatus }> {
  // Check authorization
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");

  const assignment = await db
    .prepare(
      `
      SELECT
        a.id, a.organization_id, a.worship_service_id, a.service_role_id, a.servant_id, a.status,
        ws.starts_at, sr.field_id, s.user_id AS servant_user_id
      FROM assignments a
      JOIN worship_services ws ON ws.organization_id = a.organization_id AND ws.id = a.worship_service_id
      JOIN service_roles sr ON sr.organization_id = a.organization_id AND sr.id = a.service_role_id
      JOIN servants s ON s.organization_id = a.organization_id AND s.id = a.servant_id
      WHERE a.organization_id = ? AND a.id = ? AND a.worship_service_id = ?
    `,
    )
    .bind(actor.organizationId, input.assignmentId, input.serviceId)
    .first<{
      id: string;
      organization_id: string;
      worship_service_id: string;
      service_role_id: string;
      servant_id: string;
      status: string;
      starts_at: string;
      field_id: string;
      servant_user_id: string | null;
    }>();

  if (!assignment) {
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Penugasan atau ibadah tidak ditemukan.",
    );
  }

  // Check scope if not org-wide
  if (!isOrgWide) {
    const isOwner = assignment.servant_user_id === actor.id;
    const nowStr = new Date().toISOString();
    const hasScope =
      actor.scopes.some(
        (s) =>
          s.type === "service" &&
          s.id === assignment.worship_service_id &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      ) ||
      actor.scopes.some(
        (s) =>
          s.type === "field" &&
          s.id === assignment.field_id &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      );

    if (!isOwner && !hasScope) {
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Akses ditolak: Anda tidak memiliki wewenang untuk penugasan ini.",
      );
    }
  }

  // Check if open incident already exists
  const existing = await db
    .prepare(
      "SELECT id, status FROM replacement_cases WHERE organization_id = ? AND assignment_id = ? AND status = 'open' LIMIT 1",
    )
    .bind(actor.organizationId, input.assignmentId)
    .first<{ id: string; status: IncidentStatus }>();

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const nowStr = now.toISOString();
  const urgency = calculateUrgency(assignment.starts_at, now);

  await db.batch([
    db
      .prepare(
        `INSERT INTO replacement_cases (
          id, organization_id, service_id, assignment_id, service_role_id,
          status, urgency, reason, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        actor.organizationId,
        input.serviceId,
        input.assignmentId,
        assignment.service_role_id,
        urgency,
        input.reason,
        actor.id,
        nowStr,
        nowStr,
      ),
    db
      .prepare(
        `UPDATE assignments SET status = 'needs_replacement', updated_at = ?
         WHERE organization_id = ? AND id = ? AND status NOT IN ('cancelled', 'reassigned')`,
      )
      .bind(nowStr, actor.organizationId, input.assignmentId),
    db
      .prepare(
        `INSERT INTO audit_logs (
          id, organization_id, actor_type, actor_id, action, entity_type, entity_id, request_id, metadata_redacted_json, created_at
        ) VALUES (?, ?, 'user', ?, 'incident.create', 'replacement_case', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        id,
        requestId,
        JSON.stringify({ urgency, reason: input.reason }),
        nowStr,
      ),
  ]);

  return { id, status: "open" };
}

export async function resolveIncident(
  db: D1Database,
  actor: Actor,
  caseId: string,
  input: ResolveIncident,
  key: string,
  requestId: string,
): Promise<{ id: string; status: IncidentStatus; newAssignmentId: string }> {
  // Check authorization: must be super_admin, admin, or scoped coordinator
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");

  // Check idempotency receipt
  const payloadHash = await hashPayload(input);
  const prior = await db
    .prepare(
      "SELECT case_id, payload_hash FROM replacement_resolutions WHERE organization_id = ? AND actor_id = ? AND idempotency_key = ? LIMIT 1",
    )
    .bind(actor.organizationId, actor.id, key)
    .first<{ case_id: string; payload_hash: string }>();

  if (prior) {
    if (prior.payload_hash !== payloadHash) {
      throw new ApplicationError(
        "CONFLICT",
        409,
        "Idempotency key sudah digunakan untuk penggantian lain.",
      );
    }
    const resolved = await db
      .prepare(
        "SELECT id, status, resolved_assignment_id FROM replacement_cases WHERE organization_id = ? AND id = ?",
      )
      .bind(actor.organizationId, caseId)
      .first<{
        id: string;
        status: IncidentStatus;
        resolved_assignment_id: string;
      }>();
    return {
      id: resolved?.id ?? caseId,
      status: resolved?.status ?? "resolved",
      newAssignmentId: resolved?.resolved_assignment_id ?? "",
    };
  }

  // Fetch the case
  const incident = await db
    .prepare(
      `
      SELECT
        rc.id, rc.organization_id, rc.service_id, rc.assignment_id, rc.service_role_id, rc.status,
        sr.field_id, sr.code AS role_code, ws.starts_at, ws.assembly_at, ws.ends_at
      FROM replacement_cases rc
      JOIN service_roles sr ON sr.organization_id = rc.organization_id AND sr.id = rc.service_role_id
      JOIN worship_services ws ON ws.organization_id = rc.organization_id AND ws.id = rc.service_id
      WHERE rc.organization_id = ? AND rc.id = ?
    `,
    )
    .bind(actor.organizationId, caseId)
    .first<{
      id: string;
      organization_id: string;
      service_id: string;
      assignment_id: string;
      service_role_id: string;
      status: string;
      field_id: string;
      role_code: string;
      starts_at: string;
      assembly_at: string;
      ends_at: string;
    }>();

  if (!incident) {
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Kasus insiden tidak ditemukan.",
    );
  }

  if (incident.status !== "open" && incident.status !== "escalated_manual") {
    throw new ApplicationError(
      "CONFLICT",
      409,
      `Kasus insiden sudah tidak aktif (status saat ini: ${incident.status}).`,
    );
  }

  // Check coordinator scope
  if (!isOrgWide) {
    const nowStr = new Date().toISOString();
    const hasScope =
      actor.scopes.some(
        (s) =>
          s.type === "service" &&
          s.id === incident.service_id &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      ) ||
      actor.scopes.some(
        (s) =>
          s.type === "field" &&
          s.id === incident.field_id &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      );

    if (!hasScope) {
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Akses ditolak: Anda tidak memiliki wewenang untuk mengesahkan kasus ini.",
      );
    }
  }

  // Validate replacement candidate
  const candidate = await db
    .prepare(
      `
      SELECT s.id, s.display_name, s.status, sc.status AS capability_status, sc.approved_by
      FROM servants s
      LEFT JOIN servant_capabilities sc
        ON sc.organization_id = s.organization_id
        AND sc.servant_id = s.id
        AND sc.service_role_id = ?
      WHERE s.organization_id = ? AND s.id = ?
    `,
    )
    .bind(
      incident.service_role_id,
      actor.organizationId,
      input.replacementServantId,
    )
    .first<{
      id: string;
      display_name: string;
      status: string;
      capability_status: string;
      approved_by: string | null;
    }>();

  if (!candidate || candidate.status !== "active") {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Kandidat pelayan tidak aktif atau tidak ditemukan.",
    );
  }

  if (candidate.capability_status !== "active") {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Kandidat tidak memiliki kelayakan (capability) aktif untuk peran ini.",
    );
  }

  // Preacher capability requires explicit approval
  if (incident.role_code === "preacher" && !candidate.approved_by) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Pelayan Firman wajib memiliki capability yang disetujui oleh approver berwenang.",
    );
  }

  // Check availability blocks
  const block = await db
    .prepare(
      `
      SELECT 1 FROM availability_blocks
      WHERE organization_id = ? AND servant_id = ?
        AND starts_at < ? AND ends_at > ?
      LIMIT 1
    `,
    )
    .bind(
      actor.organizationId,
      input.replacementServantId,
      incident.ends_at,
      incident.assembly_at,
    )
    .first();

  if (block) {
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Kandidat memiliki catatan berhalangan (availability block) pada waktu ibadah ini.",
    );
  }

  // Check schedule conflict
  const conflict = await db
    .prepare(
      `
      SELECT 1 FROM assignments a
      JOIN worship_services ws ON ws.organization_id = a.organization_id AND ws.id = a.worship_service_id
      WHERE a.organization_id = ? AND a.servant_id = ?
        AND a.status NOT IN ('cancelled', 'reassigned')
        AND ws.assembly_at < ? AND ws.ends_at > ?
      LIMIT 1
    `,
    )
    .bind(
      actor.organizationId,
      input.replacementServantId,
      incident.ends_at,
      incident.assembly_at,
    )
    .first();

  if (conflict) {
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Kandidat memiliki tugas lain yang bentrok dengan jadwal ibadah ini.",
    );
  }

  // Atomic resolution
  const newAssignmentId = crypto.randomUUID();
  const resolutionId = crypto.randomUUID();
  const nowStr = new Date().toISOString();

  await db.batch([
    // 1. Record idempotency resolution receipt
    db
      .prepare(
        `INSERT INTO replacement_resolutions (
          id, organization_id, case_id, actor_id, idempotency_key, payload_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        resolutionId,
        actor.organizationId,
        caseId,
        actor.id,
        key,
        payloadHash,
        nowStr,
      ),
    // 2. Mark old assignment as reassigned
    db
      .prepare(
        `UPDATE assignments SET status = 'reassigned', updated_at = ?
         WHERE organization_id = ? AND id = ?`,
      )
      .bind(nowStr, actor.organizationId, incident.assignment_id),
    // 3. Create new assignment for replacement servant
    db
      .prepare(
        `INSERT INTO assignments (
          id, organization_id, worship_service_id, service_role_id, servant_id,
          status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'accepted', 1, ?, ?)`,
      )
      .bind(
        newAssignmentId,
        actor.organizationId,
        incident.service_id,
        incident.service_role_id,
        input.replacementServantId,
        nowStr,
        nowStr,
      ),
    // 4. Update replacement case to resolved
    db
      .prepare(
        `UPDATE replacement_cases SET
          status = 'resolved',
          resolved_assignment_id = ?,
          resolved_by = ?,
          resolved_at = ?,
          updated_at = ?
         WHERE organization_id = ? AND id = ?`,
      )
      .bind(
        newAssignmentId,
        actor.id,
        nowStr,
        nowStr,
        actor.organizationId,
        caseId,
      ),
    // 5. Record atomic audit log
    db
      .prepare(
        `INSERT INTO audit_logs (
          id, organization_id, actor_type, actor_id, action, entity_type, entity_id, request_id, metadata_redacted_json, created_at
        ) VALUES (?, ?, 'user', ?, 'replacement.resolve', 'replacement_case', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        caseId,
        requestId,
        JSON.stringify({
          oldAssignmentId: incident.assignment_id,
          newAssignmentId,
          replacementServantId: input.replacementServantId,
        }),
        nowStr,
      ),
  ]);

  return { id: caseId, status: "resolved", newAssignmentId };
}

export async function escalateIncident(
  db: D1Database,
  actor: Actor,
  caseId: string,
  input: EscalateIncident,
  requestId: string,
): Promise<{ id: string; status: IncidentStatus }> {
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");

  const incident = await db
    .prepare(
      `
      SELECT rc.id, rc.service_id, sr.field_id, rc.status
      FROM replacement_cases rc
      JOIN service_roles sr ON sr.organization_id = rc.organization_id AND sr.id = rc.service_role_id
      WHERE rc.organization_id = ? AND rc.id = ?
    `,
    )
    .bind(actor.organizationId, caseId)
    .first<{
      id: string;
      service_id: string;
      field_id: string;
      status: string;
    }>();

  if (!incident) {
    throw new ApplicationError(
      "NOT_FOUND",
      404,
      "Kasus insiden tidak ditemukan.",
    );
  }

  if (incident.status !== "open") {
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Hanya kasus dengan status 'open' yang dapat dieskalasi.",
    );
  }

  if (!isOrgWide) {
    const nowStr = new Date().toISOString();
    const hasScope =
      actor.scopes.some(
        (s) =>
          s.type === "service" &&
          s.id === incident.service_id &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      ) ||
      actor.scopes.some(
        (s) =>
          s.type === "field" &&
          s.id === incident.field_id &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      );

    if (!hasScope) {
      throw new ApplicationError("FORBIDDEN", 403, "Akses ditolak.");
    }
  }

  const nowStr = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `UPDATE replacement_cases SET status = 'escalated_manual', updated_at = ?
         WHERE organization_id = ? AND id = ? AND status = 'open'`,
      )
      .bind(nowStr, actor.organizationId, caseId),
    db
      .prepare(
        `INSERT INTO audit_logs (
          id, organization_id, actor_type, actor_id, action, entity_type, entity_id, request_id, metadata_redacted_json, created_at
        ) VALUES (?, ?, 'user', ?, 'incident.escalate', 'replacement_case', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        caseId,
        requestId,
        JSON.stringify({
          reason: input.reason ?? "Manual escalation requested",
        }),
        nowStr,
      ),
  ]);

  return { id: caseId, status: "escalated_manual" };
}
