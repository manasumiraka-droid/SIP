import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { effectivePermissions } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import { resourceIdSchema } from "../../../packages/validation/src/users";
import type { AppEnvironment } from "./types";
import { createActivation } from "./telegram";
import { listTelegramDeliveryFailures } from "./telegram";
import { limitMutation, readMutation } from "./mutation-request";

export function telegramRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.get("/telegram-deliveries", async (c) => {
    const actor = c.get("actor");
    if (!effectivePermissions(actor).includes("assignment.read"))
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    const query = new URL(c.req.url).searchParams;
    if ([...query.keys()].some((key) => key !== "limit"))
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Parameter tidak valid.",
      );
    const rawLimit = query.get("limit") ?? "20";
    if (!/^\d{1,3}$/u.test(rawLimit))
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Parameter tidak valid.",
      );
    const limit = Number(rawLimit);
    if (limit < 1 || limit > 100)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Parameter tidak valid.",
      );
    return c.json({
      request_id: c.get("requestId"),
      data: await listTelegramDeliveryFailures(
        c.env.DB,
        actor,
        limit,
        c.get("requestId"),
      ),
    });
  });
  routes.post(
    "/servants/:id/telegram-activation",
    bodyLimit({
      maxSize: 128,
      onError: () => {
        throw new ApplicationError(
          "VALIDATION_FAILED",
          422,
          "Permintaan tidak valid.",
        );
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      if (!effectivePermissions(actor).includes("servant.create_update"))
        throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
      const servantId = resourceIdSchema.parse(c.req.param("id"));
      const { body, key } = await readMutation(c);
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        Object.keys(body).length !== 0
      )
        throw new ApplicationError(
          "VALIDATION_FAILED",
          422,
          "Permintaan tidak valid.",
        );
      await limitMutation(c);
      const result = await createActivation(
        c.env.DB,
        actor.organizationId,
        servantId,
        actor.id,
        c.get("requestId"),
        key,
      );
      return c.json({ request_id: c.get("requestId"), data: result }, 201);
    },
  );
  return routes;
}
