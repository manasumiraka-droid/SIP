import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnvironment } from "./types";
import { ApplicationError } from "../../../packages/domain/src/errors";
import { canAccess } from "../../../packages/domain/src/access";
import {
  createWorshipServiceSchema,
  serviceIdSchema,
  serviceStatusUpdateSchema,
  servicesQuerySchema,
} from "../../../packages/validation/src/schedule";
import { limitMutation, readMutation } from "./mutation-request";
import {
  changeWorshipServiceStatus,
  createWorshipService,
  listWorshipServices,
} from "./schedule-repository";

const boundedBody = bodyLimit({
  maxSize: 4096,
  onError: () => {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Permintaan terlalu besar.",
    );
  },
});
export function scheduleRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.get("/", async (c) => {
    const query = servicesQuerySchema.parse(c.req.query());
    const result = await listWorshipServices(
      c.env.DB,
      c.get("actor"),
      query.cursor ?? "",
      query.limit,
    );
    return c.json({ request_id: c.get("requestId"), ...result });
  });
  routes.post("/", boundedBody, async (c) => {
    const { body, key } = await readMutation(c);
    const input = createWorshipServiceSchema.parse(body);
    await limitMutation(c);
    const result = await createWorshipService(
      c.env.DB,
      c.get("actor"),
      input,
      key,
      c.get("requestId"),
    );
    c.header("ETag", '"1"');
    return c.json({ request_id: c.get("requestId"), data: result }, 201);
  });
  routes.patch("/:id/status", boundedBody, async (c) => {
    const id = serviceIdSchema.parse(c.req.param("id"));
    const { body, key } = await readMutation(c);
    const update = serviceStatusUpdateSchema.parse(body);
    const actor = c.get("actor");
    if (
      !canAccess(
        actor,
        "service.change_status",
        { organizationId: actor.organizationId, serviceId: id },
        new Date(),
      )
    )
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    const match = c.req.header("If-Match");
    if (match !== undefined && match !== `"${update.version}"`)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Versi permintaan tidak konsisten.",
      );
    await limitMutation(c);
    const result = await changeWorshipServiceStatus(
      c.env.DB,
      actor,
      id,
      update,
      key,
      c.get("requestId"),
    );
    c.header("ETag", `"${result.version}"`);
    return c.json({ request_id: c.get("requestId"), data: result });
  });
  return routes;
}
