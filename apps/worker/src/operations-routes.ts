import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnvironment } from "./types";
import { effectivePermissions } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  createAvailabilitySchema,
  createCapabilityApproverSchema,
  createCapabilitySchema,
  createCoordinatorScopeSchema,
  createFieldSchema,
  createServantSchema,
  createServiceRoleSchema,
  operationsQuerySchema,
  updateServantSchema,
  updateServiceRoleSchema,
} from "../../../packages/validation/src/operations";
import {
  createAvailability,
  createCapability,
  createCapabilityApprover,
  createCoordinatorScope,
  createField,
  createServant,
  createServiceRole,
  deleteServant,
  deleteServiceRole,
  listAvailability,
  listFields,
  listServants,
  listServiceRoles,
  updateServant,
  updateServiceRole,
} from "./operations-repository";
import { limitMutation, readMutation } from "./mutation-request";

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
export function operationsRoutes() {
  const routes = new Hono<AppEnvironment>();
  const requirePermission = (
    actor: AppEnvironment["Variables"]["actor"],
    permission:
      | "service.create_update"
      | "servant.read"
      | "servant.create_update"
      | "servant.manage_capability"
      | "user.manage_role",
  ) => {
    if (!effectivePermissions(actor).includes(permission))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  };
  routes.get("/fields", async (c) => {
    requirePermission(c.get("actor"), "service.create_update");
    const query = operationsQuerySchema.parse(c.req.query());
    return c.json({
      request_id: c.get("requestId"),
      data: await listFields(
        c.env.DB,
        c.get("actor").organizationId,
        query.limit,
      ),
    });
  });
  routes.post("/fields", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "service.create_update");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    return c.json(
      {
        request_id: c.get("requestId"),
        data: await createField(
          c.env.DB,
          actor,
          createFieldSchema.parse(body),
          key,
          c.get("requestId"),
        ),
      },
      201,
    );
  });
  routes.get("/service-roles", async (c) => {
    requirePermission(c.get("actor"), "servant.read");
    const query = operationsQuerySchema.parse(c.req.query());
    return c.json({
      request_id: c.get("requestId"),
      data: await listServiceRoles(
        c.env.DB,
        c.get("actor").organizationId,
        query.limit,
      ),
    });
  });
  routes.post("/service-roles", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "service.create_update");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    return c.json(
      {
        request_id: c.get("requestId"),
        data: await createServiceRole(
          c.env.DB,
          actor,
          createServiceRoleSchema.parse(body),
          key,
          c.get("requestId"),
        ),
      },
      201,
    );
  });
  routes.get("/servants", async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "servant.read");
    const query = operationsQuerySchema.parse(c.req.query());
    return c.json({
      request_id: c.get("requestId"),
      data: await listServants(c.env.DB, actor, query.limit),
    });
  });
  routes.post("/servants", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "servant.create_update");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    return c.json(
      {
        request_id: c.get("requestId"),
        data: await createServant(
          c.env.DB,
          actor,
          createServantSchema.parse(body),
          key,
          c.get("requestId"),
        ),
      },
      201,
    );
  });
  routes.put("/servants/:id", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "servant.create_update");
    const servantId = c.req.param("id");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    return c.json({
      request_id: c.get("requestId"),
      data: await updateServant(
        c.env.DB,
        actor,
        servantId,
        updateServantSchema.parse(body),
        key,
        c.get("requestId"),
      ),
    });
  });
  routes.delete("/servants/:id", async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "servant.create_update");
    const servantId = c.req.param("id");
    return c.json({
      request_id: c.get("requestId"),
      data: await deleteServant(c.env.DB, actor, servantId, c.get("requestId")),
    });
  });
  routes.put("/service-roles/:id", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "service.create_update");
    const roleId = c.req.param("id");
    const { body } = await readMutation(c);
    await limitMutation(c);
    return c.json({
      request_id: c.get("requestId"),
      data: await updateServiceRole(
        c.env.DB,
        actor,
        roleId,
        updateServiceRoleSchema.parse(body),
        c.get("requestId"),
      ),
    });
  });
  routes.delete("/service-roles/:id", async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "service.create_update");
    const roleId = c.req.param("id");
    return c.json({
      request_id: c.get("requestId"),
      data: await deleteServiceRole(
        c.env.DB,
        actor,
        roleId,
        c.get("requestId"),
      ),
    });
  });
  routes.get("/availability-blocks", async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "servant.read");
    const query = operationsQuerySchema.parse(c.req.query());
    return c.json({
      request_id: c.get("requestId"),
      data: await listAvailability(c.env.DB, actor, query.limit),
    });
  });
  routes.post("/availability-blocks", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "servant.create_update");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    return c.json(
      {
        request_id: c.get("requestId"),
        data: await createAvailability(
          c.env.DB,
          actor,
          createAvailabilitySchema.parse(body),
          key,
          c.get("requestId"),
        ),
      },
      201,
    );
  });
  routes.post("/capability-approvers", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "user.manage_role");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    const data = await createCapabilityApprover(
      c.env.DB,
      actor,
      createCapabilityApproverSchema.parse(body),
      key,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data }, 201);
  });
  routes.post("/servant-capabilities", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "servant.manage_capability");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    const data = await createCapability(
      c.env.DB,
      actor,
      createCapabilitySchema.parse(body),
      key,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data }, 201);
  });
  routes.post("/coordinator-scopes", boundedBody, async (c) => {
    const actor = c.get("actor");
    requirePermission(actor, "user.manage_role");
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    const data = await createCoordinatorScope(
      c.env.DB,
      actor,
      createCoordinatorScopeSchema.parse(body),
      key,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data }, 201);
  });
  return routes;
}
