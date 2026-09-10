import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AppEnvironment } from "./types";
import {
  changeAccountStatus,
  changeRoles,
  createUser,
  readUsers,
  requireRoleManagement,
} from "./users-service";
import {
  accountStatusUpdateSchema,
  createUserSchema,
  resourceIdSchema,
  roleUpdateSchema,
  usersQuerySchema,
} from "../../../packages/validation/src/users";
import { ApplicationError } from "../../../packages/domain/src/errors";
import { readMutation, limitMutation } from "./mutation-request";
export function usersRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.use("*", async (c, next) => {
    if (c.req.method !== "GET") requireRoleManagement(c.get("actor"));
    await next();
  });
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
  routes.get("/", async (c) => {
    const query = usersQuerySchema.parse(c.req.query());
    const users = await readUsers(
      c.env.DB,
      c.get("actor"),
      query.cursor ?? "",
      query.limit,
    );
    return c.json({ request_id: c.get("requestId"), ...users });
  });
  routes.post("/", boundedBody, async (c) => {
    const { body, key } = await readMutation(c);
    const input = createUserSchema.parse(body);
    await limitMutation(c);
    const result = await createUser(
      c.env.DB,
      c.get("actor"),
      input,
      key,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data: result }, 201);
  });
  routes.put("/:id/roles", boundedBody, async (c) => {
    const userId = resourceIdSchema.parse(c.req.param("id"));
    const { body, key } = await readMutation(c);
    const update = roleUpdateSchema.parse(body);
    const match = c.req.header("If-Match");
    if (match !== undefined && match !== `"${update.version}"`)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Versi permintaan tidak konsisten.",
      );
    await limitMutation(c);
    const result = await changeRoles(
      c.env.DB,
      c.get("actor"),
      userId,
      update,
      key,
      c.get("requestId"),
    );
    c.header("ETag", `"${result.version}"`);
    return c.json({ request_id: c.get("requestId"), data: result });
  });
  routes.patch("/:id/status", boundedBody, async (c) => {
    const userId = resourceIdSchema.parse(c.req.param("id"));
    const { body, key } = await readMutation(c);
    const update = accountStatusUpdateSchema.parse(body);
    const match = c.req.header("If-Match");
    if (match !== undefined && match !== `"${update.version}"`)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Versi permintaan tidak konsisten.",
      );
    await limitMutation(c);
    const result = await changeAccountStatus(
      c.env.DB,
      c.get("actor"),
      userId,
      update,
      key,
      c.get("requestId"),
    );
    c.header("ETag", `"${result.version}"`);
    return c.json({ request_id: c.get("requestId"), data: result });
  });
  return routes;
}
export function isValidationError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}
