import type { Actor } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  calculateRate,
  canReadNote,
  sanitizeCsvCell,
  type AttendanceStatus,
  type NoteCategory,
  type ServiceNoteSummary,
} from "../../../packages/domain/src/performance";
import type {
  BatchRecordAttendance,
  CreateServiceNote,
  QueryReports,
} from "../../../packages/validation/src/performance";

export type AttendanceRecordDetail = {
  id: string;
  organizationId: string;
  serviceId: string;
  assignmentId: string;
  servantId: string;
  servantName: string;
  roleCode: string;
  roleName: string;
  assignmentStatus: string;
  attendanceStatus: AttendanceStatus;
  checkinTime: string | null;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
};

export type OrganizationReport = {
  summary: {
    totalServices: number;
    completedServices: number;
    totalAssignments: number;
    acceptedAssignments: number;
    confirmationRate: number;
    attendanceRate: number;
    attendanceBreakdown: {
      present: number;
      late: number;
      absent: number;
      replaced: number;
    };
    incidentCount: number;
    criticalIncidentCount: number;
  };
  workloadDistribution: {
    minAssignments: number;
    maxAssignments: number;
    avgAssignments: number;
    servantsCount: number;
    unassignedSlots: number;
  };
  roleBreakdown: Array<{
    roleCode: string;
    roleName: string;
    totalAssignments: number;
  }>;
};

export type ServantReport = {
  servantId: string;
  displayName: string;
  totalAssignments: number;
  acceptedAssignments: number;
  confirmationRate: number;
  attendanceRate: number;
  attendanceBreakdown: {
    present: number;
    late: number;
    absent: number;
    replaced: number;
  };
  backupDutiesAccepted: number;
  rolesServed: Array<{
    roleCode: string;
    roleName: string;
    count: number;
  }>;
};

export async function recordServiceAttendance(
  db: D1Database,
  actor: Actor,
  serviceId: string,
  batch: BatchRecordAttendance,
  requestId: string,
): Promise<{ recordedCount: number }> {
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");

  // Check service existence and organization
  const service = await db
    .prepare(
      "SELECT id, organization_id, starts_at, status FROM worship_services WHERE organization_id = ? AND id = ?",
    )
    .bind(actor.organizationId, serviceId)
    .first<{
      id: string;
      organization_id: string;
      starts_at: string;
      status: string;
    }>();

  if (!service) {
    throw new ApplicationError("NOT_FOUND", 404, "Ibadah tidak ditemukan.");
  }

  // Check coordinator scope
  if (!isOrgWide) {
    const nowStr = new Date().toISOString();
    const hasServiceScope = actor.scopes.some(
      (s) =>
        s.type === "service" &&
        s.id === serviceId &&
        s.startsAt <= nowStr &&
        (!s.endsAt || s.endsAt > nowStr),
    );

    if (!hasServiceScope) {
      // Check if coordinator has field scope for any of the items' roles
      const hasFieldScope = actor.scopes.some(
        (s) =>
          s.type === "field" &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      );
      if (!hasFieldScope) {
        throw new ApplicationError(
          "FORBIDDEN",
          403,
          "Akses ditolak: Anda tidak memiliki wewenang untuk mencatat kehadiran di ibadah ini.",
        );
      }
    }
  }

  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const item of batch.items) {
    const recordId = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          `INSERT INTO attendance_records (
             id, organization_id, service_id, assignment_id, servant_id,
             status, checkin_time, notes, recorded_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (organization_id, assignment_id) DO UPDATE SET
             status = excluded.status,
             checkin_time = excluded.checkin_time,
             notes = excluded.notes,
             recorded_by = excluded.recorded_by,
             updated_at = excluded.updated_at`,
        )
        .bind(
          recordId,
          actor.organizationId,
          serviceId,
          item.assignmentId,
          item.servantId,
          item.status,
          item.checkinTime ?? null,
          item.notes ?? null,
          actor.id,
          nowIso,
          nowIso,
        ),
    );

    // Sync assignment status when completed or absent
    if (item.status === "present" || item.status === "late") {
      statements.push(
        db
          .prepare(
            `UPDATE assignments SET status = 'completed', updated_at = ?
             WHERE organization_id = ? AND id = ? AND status NOT IN ('cancelled', 'reassigned')`,
          )
          .bind(nowIso, actor.organizationId, item.assignmentId),
      );
    } else if (item.status === "absent") {
      statements.push(
        db
          .prepare(
            `UPDATE assignments SET status = 'absent', updated_at = ?
             WHERE organization_id = ? AND id = ? AND status NOT IN ('cancelled', 'reassigned')`,
          )
          .bind(nowIso, actor.organizationId, item.assignmentId),
      );
    }
  }

  // Audit log
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_logs (
           id, organization_id, actor_type, actor_id, action, entity_type, entity_id,
           request_id, metadata_redacted_json, created_at
         ) VALUES (?, ?, 'user', ?, 'attendance.record', 'worship_service', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        serviceId,
        requestId,
        JSON.stringify({ itemCount: batch.items.length }),
        nowIso,
      ),
  );

  await db.batch(statements);
  return { recordedCount: batch.items.length };
}

export async function getServiceAttendance(
  db: D1Database,
  actor: Actor,
  serviceId: string,
): Promise<{ data: AttendanceRecordDetail[] }> {
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");

  let sql = `
    SELECT
      ar.id, ar.organization_id AS organizationId, ar.service_id AS serviceId,
      ar.assignment_id AS assignmentId, ar.servant_id AS servantId,
      s.display_name AS servantName,
      sr.code AS roleCode, sr.name AS roleName,
      a.status AS assignmentStatus,
      ar.status AS attendanceStatus,
      ar.checkin_time AS checkinTime,
      ar.notes, ar.recorded_by AS recordedBy,
      ar.updated_at AS recordedAt
    FROM attendance_records ar
    JOIN assignments a ON a.organization_id = ar.organization_id AND a.id = ar.assignment_id
    JOIN servants s ON s.organization_id = ar.organization_id AND s.id = ar.servant_id
    JOIN service_roles sr ON sr.organization_id = ar.organization_id AND sr.id = a.service_role_id
    WHERE ar.organization_id = ? AND ar.service_id = ?
  `;
  const params: unknown[] = [actor.organizationId, serviceId];

  if (
    !isOrgWide &&
    actor.roles.includes("servant") &&
    !actor.roles.includes("worship_coordinator") &&
    !actor.roles.includes("field_coordinator")
  ) {
    sql += ` AND s.user_id = ?`;
    params.push(actor.id);
  }

  sql += ` ORDER BY sr.code ASC, s.display_name ASC`;

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<AttendanceRecordDetail>();
  return { data: result.results ?? [] };
}

export async function createServiceNote(
  db: D1Database,
  actor: Actor,
  input: CreateServiceNote,
  requestId: string,
): Promise<{ id: string }> {
  const noteId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO service_notes (
           id, organization_id, service_id, servant_id, category, title, content,
           created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        noteId,
        actor.organizationId,
        input.serviceId ?? null,
        input.servantId ?? null,
        input.category,
        input.title,
        input.content,
        actor.id,
        nowIso,
        nowIso,
      ),
  ];

  // If restricted, populate ACL
  if (
    input.category === "restricted" &&
    input.grantedUserIds &&
    input.grantedUserIds.length > 0
  ) {
    for (const userId of input.grantedUserIds) {
      statements.push(
        db
          .prepare(
            `INSERT INTO service_notes_acl (id, organization_id, note_id, user_id, granted_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            actor.organizationId,
            noteId,
            userId,
            actor.id,
            nowIso,
          ),
      );
    }
  }

  // Audit log (content is NOT stored in audit log to preserve privacy)
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_logs (
           id, organization_id, actor_type, actor_id, action, entity_type, entity_id,
           request_id, metadata_redacted_json, created_at
         ) VALUES (?, ?, 'user', ?, 'notes.create', 'service_note', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        actor.organizationId,
        actor.id,
        noteId,
        requestId,
        JSON.stringify({
          category: input.category,
          serviceId: input.serviceId,
          servantId: input.servantId,
        }),
        nowIso,
      ),
  );

  await db.batch(statements);
  return { id: noteId };
}

export async function listServiceNotes(
  db: D1Database,
  actor: Actor,
  filter?: { serviceId?: string; servantId?: string; category?: NoteCategory },
): Promise<{ data: ServiceNoteSummary[] }> {
  let sql = `
    SELECT
      n.id, n.organization_id AS organizationId, n.service_id AS serviceId,
      n.servant_id AS servantId, n.category, n.title, n.content,
      n.created_by AS createdBy, n.created_at AS createdAt, n.updated_at AS updatedAt,
      s.user_id AS servantUserId
    FROM service_notes n
    LEFT JOIN servants s ON s.organization_id = n.organization_id AND s.id = n.servant_id
    WHERE n.organization_id = ?
  `;
  const params: unknown[] = [actor.organizationId];

  if (filter?.serviceId) {
    sql += ` AND n.service_id = ?`;
    params.push(filter.serviceId);
  }
  if (filter?.servantId) {
    sql += ` AND n.servant_id = ?`;
    params.push(filter.servantId);
  }
  if (filter?.category) {
    sql += ` AND n.category = ?`;
    params.push(filter.category);
  }

  sql += ` ORDER BY n.created_at DESC LIMIT 100`;

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<ServiceNoteSummary>();
  const notes = result.results ?? [];

  if (notes.length === 0) {
    return { data: [] };
  }

  // Fetch ACL entries for all returned notes
  const noteIds = notes.map((n) => n.id);
  const placeholders = noteIds.map(() => "?").join(",");
  const aclRows = await db
    .prepare(
      `SELECT note_id, user_id FROM service_notes_acl WHERE organization_id = ? AND note_id IN (${placeholders})`,
    )
    .bind(actor.organizationId, ...noteIds)
    .all<{ note_id: string; user_id: string }>();

  const aclMap = new Map<string, string[]>();
  for (const row of aclRows.results ?? []) {
    const list = aclMap.get(row.note_id) ?? [];
    list.push(row.user_id);
    aclMap.set(row.note_id, list);
  }

  // Filter with canReadNote domain logic
  const authorized = notes.filter((n) =>
    canReadNote(actor, n, aclMap.get(n.id) ?? []),
  );

  return { data: authorized };
}

export async function getServiceNoteById(
  db: D1Database,
  actor: Actor,
  noteId: string,
): Promise<ServiceNoteSummary & { grantedUserIds: string[] }> {
  const note = await db
    .prepare(
      `SELECT
         n.id, n.organization_id AS organizationId, n.service_id AS serviceId,
         n.servant_id AS servantId, n.category, n.title, n.content,
         n.created_by AS createdBy, n.created_at AS createdAt, n.updated_at AS updatedAt,
         s.user_id AS servantUserId
       FROM service_notes n
       LEFT JOIN servants s ON s.organization_id = n.organization_id AND s.id = n.servant_id
       WHERE n.organization_id = ? AND n.id = ?`,
    )
    .bind(actor.organizationId, noteId)
    .first<ServiceNoteSummary>();

  if (!note) {
    throw new ApplicationError("NOT_FOUND", 404, "Catatan tidak ditemukan.");
  }

  const aclRows = await db
    .prepare(
      "SELECT user_id FROM service_notes_acl WHERE organization_id = ? AND note_id = ?",
    )
    .bind(actor.organizationId, noteId)
    .all<{ user_id: string }>();

  const grantedUserIds = (aclRows.results ?? []).map((r) => r.user_id);

  if (!canReadNote(actor, note, grantedUserIds)) {
    throw new ApplicationError(
      "FORBIDDEN",
      403,
      "Akses ditolak: Anda tidak memiliki izin untuk membaca catatan terbatas ini.",
    );
  }

  return { ...note, grantedUserIds };
}

export async function getOrganizationReport(
  db: D1Database,
  actor: Actor,
  query?: QueryReports,
): Promise<OrganizationReport> {
  const orgId = actor.organizationId;
  const conditions: string[] = ["organization_id = ?"];
  const params: unknown[] = [orgId];

  if (query?.startDate) {
    conditions.push("starts_at >= ?");
    params.push(query.startDate);
  }
  if (query?.endDate) {
    conditions.push("starts_at <= ?");
    params.push(query.endDate);
  }

  const whereClause = conditions.join(" AND ");

  // 1. Services count
  const servicesRow = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM worship_services WHERE ${whereClause}`,
    )
    .bind(...params)
    .first<{ total: number; completed: number }>();

  const totalServices = servicesRow?.total ?? 0;
  const completedServices = servicesRow?.completed ?? 0;

  // 2. Assignments & confirmation
  const asgRow = await db
    .prepare(
      `SELECT
         COUNT(a.id) AS total_assignments,
         SUM(CASE WHEN a.status = 'accepted' THEN 1 ELSE 0 END) AS accepted_count
       FROM assignments a
       JOIN worship_services ws ON ws.organization_id = a.organization_id AND ws.id = a.worship_service_id
       WHERE a.organization_id = ? ${query?.startDate ? "AND ws.starts_at >= ?" : ""} ${query?.endDate ? "AND ws.starts_at <= ?" : ""}`,
    )
    .bind(...params)
    .first<{ total_assignments: number; accepted_count: number }>();

  const totalAssignments = asgRow?.total_assignments ?? 0;
  const acceptedAssignments = asgRow?.accepted_count ?? 0;
  const confirmationRate = calculateRate(acceptedAssignments, totalAssignments);

  // 3. Attendance breakdown
  const attRow = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
         SUM(CASE WHEN ar.status = 'replaced' THEN 1 ELSE 0 END) AS replaced_count
       FROM attendance_records ar
       JOIN worship_services ws ON ws.organization_id = ar.organization_id AND ws.id = ar.service_id
       WHERE ar.organization_id = ? ${query?.startDate ? "AND ws.starts_at >= ?" : ""} ${query?.endDate ? "AND ws.starts_at <= ?" : ""}`,
    )
    .bind(...params)
    .first<{
      present_count: number;
      late_count: number;
      absent_count: number;
      replaced_count: number;
    }>();

  const present = attRow?.present_count ?? 0;
  const late = attRow?.late_count ?? 0;
  const absent = attRow?.absent_count ?? 0;
  const replaced = attRow?.replaced_count ?? 0;
  const totalEvaluated = present + late + absent;
  const attendanceRate = calculateRate(present + late, totalEvaluated);

  // 4. Incidents
  const incRow = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_incidents,
         SUM(CASE WHEN urgency = 'critical' THEN 1 ELSE 0 END) AS critical_incidents
       FROM replacement_cases rc
       JOIN worship_services ws ON ws.organization_id = rc.organization_id AND ws.id = rc.service_id
       WHERE rc.organization_id = ? ${query?.startDate ? "AND ws.starts_at >= ?" : ""} ${query?.endDate ? "AND ws.starts_at <= ?" : ""}`,
    )
    .bind(...params)
    .first<{ total_incidents: number; critical_incidents: number }>();

  const incidentCount = incRow?.total_incidents ?? 0;
  const criticalIncidentCount = incRow?.critical_incidents ?? 0;

  // 5. Workload distribution per active servant
  const workloadRows = await db
    .prepare(
      `SELECT
         s.id,
         COUNT(a.id) AS assignment_count
       FROM servants s
       LEFT JOIN assignments a ON a.organization_id = s.organization_id AND a.servant_id = s.id AND a.status NOT IN ('cancelled', 'reassigned')
       WHERE s.organization_id = ? AND s.status = 'active'
       GROUP BY s.id`,
    )
    .bind(orgId)
    .all<{ id: string; assignment_count: number }>();

  const counts = (workloadRows.results ?? []).map((r) => r.assignment_count);
  const servantsCount = counts.length;
  const minAssignments = servantsCount > 0 ? Math.min(...counts) : 0;
  const maxAssignments = servantsCount > 0 ? Math.max(...counts) : 0;
  const avgAssignments =
    servantsCount > 0
      ? Math.round((counts.reduce((a, b) => a + b, 0) / servantsCount) * 10) /
        10
      : 0;

  // Unassigned slots: count roles needed vs assigned in scheduled services
  const unassignedSlotsRow = await db
    .prepare(
      `SELECT COUNT(*) AS vacant
       FROM worship_services ws
       JOIN service_roles sr ON sr.organization_id = ws.organization_id AND sr.active = 1
       LEFT JOIN assignments a ON a.organization_id = ws.organization_id AND a.worship_service_id = ws.id AND a.service_role_id = sr.id AND a.status NOT IN ('cancelled', 'reassigned')
       WHERE ws.organization_id = ? AND ws.status = 'scheduled' AND a.id IS NULL`,
    )
    .bind(orgId)
    .first<{ vacant: number }>();

  const unassignedSlots = unassignedSlotsRow?.vacant ?? 0;

  // 6. Role breakdown
  const roleBreakdownRows = await db
    .prepare(
      `SELECT
         sr.code AS roleCode,
         sr.name AS roleName,
         COUNT(a.id) AS totalAssignments
       FROM service_roles sr
       LEFT JOIN assignments a ON a.organization_id = sr.organization_id AND a.service_role_id = sr.id
       WHERE sr.organization_id = ?
       GROUP BY sr.id, sr.code, sr.name
       ORDER BY totalAssignments DESC, sr.name ASC`,
    )
    .bind(orgId)
    .all<{ roleCode: string; roleName: string; totalAssignments: number }>();

  return {
    summary: {
      totalServices,
      completedServices,
      totalAssignments,
      acceptedAssignments,
      confirmationRate,
      attendanceRate,
      attendanceBreakdown: { present, late, absent, replaced },
      incidentCount,
      criticalIncidentCount,
    },
    workloadDistribution: {
      minAssignments,
      maxAssignments,
      avgAssignments,
      servantsCount,
      unassignedSlots,
    },
    roleBreakdown: roleBreakdownRows.results ?? [],
  };
}

export async function getServantPerformanceReport(
  db: D1Database,
  actor: Actor,
  servantId: string,
): Promise<ServantReport> {
  // Check authorization: if servant, MUST be linked servant
  if (
    actor.roles.includes("servant") &&
    !actor.roles.includes("super_admin") &&
    !actor.roles.includes("admin") &&
    !actor.roles.includes("worship_coordinator") &&
    !actor.roles.includes("field_coordinator")
  ) {
    const isOwner = await db
      .prepare(
        "SELECT id FROM servants WHERE organization_id = ? AND id = ? AND user_id = ?",
      )
      .bind(actor.organizationId, servantId, actor.id)
      .first<{ id: string }>();

    if (!isOwner) {
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Akses ditolak: Anda hanya berhak melihat statistik pelayanan milik Anda sendiri.",
      );
    }
  }

  const servant = await db
    .prepare(
      "SELECT id, display_name FROM servants WHERE organization_id = ? AND id = ?",
    )
    .bind(actor.organizationId, servantId)
    .first<{ id: string; display_name: string }>();

  if (!servant) {
    throw new ApplicationError("NOT_FOUND", 404, "Pelayan tidak ditemukan.");
  }

  // Aggregate assignments
  const asgRow = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted
       FROM assignments
       WHERE organization_id = ? AND servant_id = ? AND status NOT IN ('cancelled', 'reassigned')`,
    )
    .bind(actor.organizationId, servantId)
    .first<{ total: number; accepted: number }>();

  const totalAssignments = asgRow?.total ?? 0;
  const acceptedAssignments = asgRow?.accepted ?? 0;
  const confirmationRate = calculateRate(acceptedAssignments, totalAssignments);

  // Attendance breakdown
  const attRow = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
         SUM(CASE WHEN status = 'replaced' THEN 1 ELSE 0 END) AS replaced_count
       FROM attendance_records
       WHERE organization_id = ? AND servant_id = ?`,
    )
    .bind(actor.organizationId, servantId)
    .first<{
      present_count: number;
      late_count: number;
      absent_count: number;
      replaced_count: number;
    }>();

  const present = attRow?.present_count ?? 0;
  const late = attRow?.late_count ?? 0;
  const absent = attRow?.absent_count ?? 0;
  const replaced = attRow?.replaced_count ?? 0;
  const totalEvaluated = present + late + absent;
  const attendanceRate = calculateRate(present + late, totalEvaluated);

  // Backup duties accepted
  const backupRow = await db
    .prepare(
      `SELECT COUNT(*) AS backup_count
       FROM replacement_cases
       WHERE organization_id = ? AND resolved_by = ?`,
    )
    .bind(actor.organizationId, servantId)
    .first<{ backup_count: number }>();

  const backupDutiesAccepted = backupRow?.backup_count ?? 0;

  // Roles served
  const rolesRows = await db
    .prepare(
      `SELECT
         sr.code AS roleCode,
         sr.name AS roleName,
         COUNT(a.id) AS count
       FROM assignments a
       JOIN service_roles sr ON sr.organization_id = a.organization_id AND sr.id = a.service_role_id
       WHERE a.organization_id = ? AND a.servant_id = ? AND a.status NOT IN ('cancelled', 'reassigned')
       GROUP BY sr.id, sr.code, sr.name
       ORDER BY count DESC`,
    )
    .bind(actor.organizationId, servantId)
    .all<{ roleCode: string; roleName: string; count: number }>();

  return {
    servantId: servant.id,
    displayName: servant.display_name,
    totalAssignments,
    acceptedAssignments,
    confirmationRate,
    attendanceRate,
    attendanceBreakdown: { present, late, absent, replaced },
    backupDutiesAccepted,
    rolesServed: rolesRows.results ?? [],
  };
}

export async function exportAttendanceReportCsv(
  db: D1Database,
  actor: Actor,
  query?: QueryReports,
  requestId: string = crypto.randomUUID(),
): Promise<string> {
  const isOrgWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");

  const conditions: string[] = ["a.organization_id = ?"];
  const params: unknown[] = [actor.organizationId];

  if (query?.startDate) {
    conditions.push("ws.starts_at >= ?");
    params.push(query.startDate);
  }
  if (query?.endDate) {
    conditions.push("ws.starts_at <= ?");
    params.push(query.endDate);
  }
  if (query?.serviceId) {
    conditions.push("ws.id = ?");
    params.push(query.serviceId);
  }

  // Non-admin servant restricted to self
  if (
    !isOrgWide &&
    actor.roles.includes("servant") &&
    !actor.roles.includes("worship_coordinator") &&
    !actor.roles.includes("field_coordinator")
  ) {
    conditions.push("s.user_id = ?");
    params.push(actor.id);
  }

  const sql = `
    SELECT
      ws.starts_at AS serviceStartsAt,
      ws.location AS serviceLocation,
      sr.name AS roleName,
      s.display_name AS servantName,
      a.status AS assignmentStatus,
      COALESCE(ar.status, 'belum_dicatat') AS attendanceStatus,
      COALESCE(ar.checkin_time, '') AS checkinTime,
      COALESCE(ar.notes, '') AS attendanceNotes
    FROM assignments a
    JOIN worship_services ws ON ws.organization_id = a.organization_id AND ws.id = a.worship_service_id
    JOIN service_roles sr ON sr.organization_id = a.organization_id AND sr.id = a.service_role_id
    JOIN servants s ON s.organization_id = a.organization_id AND s.id = a.servant_id
    LEFT JOIN attendance_records ar ON ar.organization_id = a.organization_id AND ar.assignment_id = a.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY ws.starts_at DESC, sr.name ASC, s.display_name ASC
  `;

  const rows = await db
    .prepare(sql)
    .bind(...params)
    .all<{
      serviceStartsAt: string;
      serviceLocation: string;
      roleName: string;
      servantName: string;
      assignmentStatus: string;
      attendanceStatus: string;
      checkinTime: string;
      attendanceNotes: string;
    }>();

  const header = [
    "Tanggal Ibadah",
    "Lokasi",
    "Peran Pelayanan",
    "Nama Pelayan",
    "Status Penugasan",
    "Status Kehadiran",
    "Waktu Hadir",
    "Catatan Kehadiran",
  ]
    .map(sanitizeCsvCell)
    .join(",");

  const lines = [header];

  for (const r of rows.results ?? []) {
    const formattedDate = new Date(r.serviceStartsAt).toLocaleString("id-ID", {
      timeZone: "Asia/Makassar",
    });
    const line = [
      formattedDate,
      r.serviceLocation,
      r.roleName,
      r.servantName,
      r.assignmentStatus,
      r.attendanceStatus,
      r.checkinTime,
      r.attendanceNotes,
    ]
      .map(sanitizeCsvCell)
      .join(",");
    lines.push(line);
  }

  // Audit log export action
  await db
    .prepare(
      `INSERT INTO audit_logs (
         id, organization_id, actor_type, actor_id, action, entity_type, entity_id,
         request_id, metadata_redacted_json, created_at
       ) VALUES (?, ?, 'user', ?, 'reports.export', 'report_csv', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.organizationId,
      actor.id,
      "attendance_report",
      requestId,
      JSON.stringify({ rowCount: lines.length - 1, filter: query }),
      new Date().toISOString(),
    )
    .run();

  return lines.join("\r\n");
}
