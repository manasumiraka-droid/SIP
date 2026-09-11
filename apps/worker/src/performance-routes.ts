import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnvironment } from "./types";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  batchRecordAttendanceSchema,
  createServiceNoteSchema,
  noteCategorySchema,
  queryReportsSchema,
} from "../../../packages/validation/src/performance";
import { resourceIdSchema } from "../../../packages/validation/src/users";
import { limitMutation, readMutation } from "./mutation-request";
import {
  createServiceNote,
  exportAttendanceReportCsv,
  getOrganizationReport,
  getServiceAttendance,
  getServiceNoteById,
  getServantPerformanceReport,
  listServiceNotes,
  recordServiceAttendance,
} from "./performance-repository";

const boundedBody = bodyLimit({
  maxSize: 8192,
  onError: () => {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Permintaan terlalu besar.",
    );
  },
});

export function performanceRoutes() {
  const routes = new Hono<AppEnvironment>();

  // 1. Get attendance for a service
  routes.get("/services/:id/attendance", async (c) => {
    const serviceId = resourceIdSchema.parse(c.req.param("id"));
    const result = await getServiceAttendance(
      c.env.DB,
      c.get("actor"),
      serviceId,
    );
    return c.json({ request_id: c.get("requestId"), ...result });
  });

  // 2. Record / batch attendance for a service
  routes.post("/services/:id/attendance", boundedBody, async (c) => {
    const serviceId = resourceIdSchema.parse(c.req.param("id"));
    const actor = c.get("actor");
    if (
      !actor.roles.includes("super_admin") &&
      !actor.roles.includes("admin") &&
      !actor.roles.includes("worship_coordinator") &&
      !actor.roles.includes("field_coordinator")
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Akses ditolak: Anda tidak memiliki izin mencatat kehadiran.",
      );
    }
    const { body } = await readMutation(c);
    const payload = batchRecordAttendanceSchema.parse(body);
    await limitMutation(c);
    const result = await recordServiceAttendance(
      c.env.DB,
      actor,
      serviceId,
      payload,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), ...result });
  });

  // 3. Notes listing
  routes.get("/notes", async (c) => {
    const query = c.req.query();
    const categoryParsed = noteCategorySchema.safeParse(query.category);
    const filter = {
      serviceId: query.serviceId,
      servantId: query.servantId,
      category: categoryParsed.success ? categoryParsed.data : undefined,
    };
    const result = await listServiceNotes(c.env.DB, c.get("actor"), filter);
    return c.json({ request_id: c.get("requestId"), ...result });
  });

  // 4. Create service note
  routes.post("/notes", boundedBody, async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("super_admin") &&
      !actor.roles.includes("admin") &&
      !actor.roles.includes("worship_coordinator") &&
      !actor.roles.includes("field_coordinator")
    ) {
      throw new ApplicationError(
        "FORBIDDEN",
        403,
        "Akses ditolak: Anda tidak memiliki izin membuat catatan pelayanan.",
      );
    }
    const { body } = await readMutation(c);
    const payload = createServiceNoteSchema.parse(body);
    await limitMutation(c);
    const result = await createServiceNote(
      c.env.DB,
      actor,
      payload,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), ...result }, 201);
  });

  // 5. Get note by ID (with strict RBAC-06 ACL validation)
  routes.get("/notes/:id", async (c) => {
    const noteId = resourceIdSchema.parse(c.req.param("id"));
    const result = await getServiceNoteById(c.env.DB, c.get("actor"), noteId);
    return c.json({ request_id: c.get("requestId"), data: result });
  });

  // 6. Organization statistics report
  routes.get("/reports/organization", async (c) => {
    const query = queryReportsSchema.parse(c.req.query());
    const result = await getOrganizationReport(c.env.DB, c.get("actor"), query);
    return c.json({ request_id: c.get("requestId"), data: result });
  });

  // 7. My personal servant report
  routes.get("/reports/me", async (c) => {
    const actor = c.get("actor");
    const servant = await c.env.DB.prepare(
      "SELECT id FROM servants WHERE organization_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(actor.organizationId, actor.id)
      .first<{ id: string }>();
    if (!servant) {
      return c.json({
        request_id: c.get("requestId"),
        data: {
          servantId: "",
          displayName: actor.displayName,
          totalAssignments: 0,
          acceptedAssignments: 0,
          confirmationRate: 100,
          attendanceRate: 100,
          attendanceBreakdown: { present: 0, late: 0, absent: 0, replaced: 0 },
          backupDutiesAccepted: 0,
          rolesServed: [],
        },
      });
    }
    const result = await getServantPerformanceReport(
      c.env.DB,
      actor,
      servant.id,
    );
    return c.json({ request_id: c.get("requestId"), data: result });
  });

  // 8. Individual servant report
  routes.get("/reports/servants/:id", async (c) => {
    const servantId = resourceIdSchema.parse(c.req.param("id"));
    const result = await getServantPerformanceReport(
      c.env.DB,
      c.get("actor"),
      servantId,
    );
    return c.json({ request_id: c.get("requestId"), data: result });
  });

  // 8. Export CSV
  routes.get("/reports/export", async (c) => {
    const query = queryReportsSchema.parse(c.req.query());
    const csv = await exportAttendanceReportCsv(
      c.env.DB,
      c.get("actor"),
      query,
      c.get("requestId"),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="laporan-pelayanan-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  });

  return routes;
}
