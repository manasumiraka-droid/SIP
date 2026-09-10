import { Hono } from "hono";
import type { AppEnvironment } from "./types";
import { canAccess } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import { auditQuerySchema } from "../../../packages/validation/src/audit";
import { listAuditEntries } from "./audit-repository";
export function auditRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.get("/", async (c) => {
    const actor = c.get("actor");
    if (
      !canAccess(
        actor,
        "audit.read",
        { organizationId: actor.organizationId },
        new Date(),
      )
    )
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    const query = auditQuerySchema.parse(c.req.query());
    const result = await listAuditEntries(
      c.env.DB,
      actor.organizationId,
      query.cursor ?? "",
      query.limit,
      query.action ?? null,
      actor.roles.includes("super_admin"),
    );
    return c.json({ request_id: c.get("requestId"), ...result });
  });
  return routes;
}
