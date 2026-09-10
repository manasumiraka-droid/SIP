import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnvironment } from "./types";
import { effectivePermissions } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  assignmentIdSchema,
  assignmentStatusUpdateSchema,
  createAssignmentSchema,
} from "../../../packages/validation/src/schedule";
import {
  changeAssignmentStatus,
  createAssignment,
} from "./assignment-repository";
import { limitMutation, readMutation } from "./mutation-request";

const boundedBody = bodyLimit({
  maxSize: 2048,
  onError: () => {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Permintaan terlalu besar.",
    );
  },
});
export function assignmentRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.post("/", boundedBody, async (c) => {
    const actor = c.get("actor");
    if (!effectivePermissions(actor).includes("assignment.create_update"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    const { body, key } = await readMutation(c);
    const input = createAssignmentSchema.parse(body);
    await limitMutation(c);
    const result = await createAssignment(
      c.env.DB,
      actor,
      input,
      key,
      c.get("requestId"),
    );
    c.header("ETag", '"1"');
    return c.json({ request_id: c.get("requestId"), data: result }, 201);
  });
  routes.patch("/:id/status", boundedBody, async (c) => {
    const actor = c.get("actor");
    const allowed = effectivePermissions(actor);
    if (
      !allowed.includes("assignment.create_update") &&
      !allowed.includes("assignment.respond")
    )
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    const id = assignmentIdSchema.parse(c.req.param("id"));
    const { body, key } = await readMutation(c);
    const update = assignmentStatusUpdateSchema.parse(body);
    const match = c.req.header("If-Match");
    if (match !== undefined && match !== `"${update.version}"`)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Versi permintaan tidak konsisten.",
      );
    await limitMutation(c);
    const result = await changeAssignmentStatus(
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
