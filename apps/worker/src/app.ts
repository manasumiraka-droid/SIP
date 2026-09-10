import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { effectivePermissions } from "../../../packages/domain/src/access";
import type { Actor } from "../../../packages/domain/src/access";
import { auditStatement, findActor, getTimezone } from "./repository";
import { verifyConfiguredAccess } from "./auth";
import type { AppEnvironment } from "./types";
import { usersRoutes, isValidationError } from "./users-routes";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  logRequestOutcome,
  operationName,
  type RequestOutcome,
} from "./observability";
import { auditRoutes } from "./audit-routes";
import { assertRuntimeConfig } from "./config";
import { timezoneSchema } from "../../../packages/validation/src/identity";
import { scheduleRoutes } from "./schedule-routes";
import { assignmentRoutes } from "./assignment-routes";
import { importRoutes } from "./import-routes";
import { operationsRoutes } from "./operations-routes";
import { telegramRoutes } from "./telegram-routes";
type Dependencies = {
  observe?: (outcome: RequestOutcome) => void;
  verify: typeof verifyConfiguredAccess;
  findActor: typeof findActor;
  timezone: typeof getTimezone;
  audit: (db: D1Database, actor: Actor, requestId: string) => Promise<void>;
};
const defaults: Dependencies = {
  observe: logRequestOutcome,
  verify: verifyConfiguredAccess,
  findActor,
  timezone: getTimezone,
  audit: async (db, actor, requestId) => {
    await auditStatement(db, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      requestId,
      action: "identity.read",
    }).run();
  },
};
export function createApp(dependencies: Dependencies = defaults) {
  const app = new Hono<AppEnvironment>();
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    const startedAt = performance.now();
    c.set("requestId", crypto.randomUUID());
    c.header("Cache-Control", "no-store");
    await next();
    c.header("X-Request-Id", c.get("requestId"));
    dependencies.observe?.({
      request_id: c.get("requestId"),
      operation: operationName(c.req.method, c.req.path),
      status: c.res.status,
      duration_ms: Math.round(performance.now() - startedAt),
    });
  });
  app.use("/api/*", async (c, next) => {
    assertRuntimeConfig(c.env);
    if (!c.env.AUTH_LIMITER)
      throw new Error("Authentication rate limiter not configured");
    const authLimit = await c.env.AUTH_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") ?? "unknown",
    });
    if (!authLimit.success) {
      c.header("Retry-After", "60");
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi dalam satu menit.",
            request_id: c.get("requestId"),
            details: [],
          },
        },
        429,
      );
    }
    const origin = c.req.header("Origin");
    if (origin && origin !== c.env.APP_ORIGIN)
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Akses tidak diizinkan.",
            request_id: c.get("requestId"),
            details: [],
          },
        },
        403,
      );
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    let email: string;
    try {
      if (!token || token.length > 16384) throw new Error("Missing assertion");
      email = await dependencies.verify(token, c.env);
    } catch {
      return c.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Silakan masuk melalui akses pengurus.",
            request_id: c.get("requestId"),
            details: [],
          },
        },
        401,
      );
    }
    const actor = await dependencies.findActor(
      c.env.DB,
      c.env.ORGANIZATION_ID,
      email,
    );
    if (
      !actor ||
      actor.status !== "active" ||
      actor.roles.length === 0 ||
      actor.organizationId !== c.env.ORGANIZATION_ID
    )
      return c.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Silakan masuk melalui akses pengurus.",
            request_id: c.get("requestId"),
            details: [],
          },
        },
        401,
      );
    c.set("actor", actor);
    await next();
  });
  app.get("/api/v1/me", async (c) => {
    if (new URL(c.req.url).search)
      return c.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "Parameter tidak valid.",
            request_id: c.get("requestId"),
            details: [],
          },
        },
        422,
      );
    const actor = c.get("actor");
    const organization = await dependencies.timezone(
      c.env.DB,
      actor.organizationId,
    );
    if (!organization) throw new Error("Organization missing");
    const timezone = timezoneSchema.safeParse(organization.timezone);
    if (!timezone.success) throw new Error("Organization timezone invalid");
    await dependencies.audit(c.env.DB, actor, c.get("requestId"));
    return c.json({
      request_id: c.get("requestId"),
      data: {
        displayName: actor.displayName,
        roles: actor.roles,
        permissions: effectivePermissions(actor),
        timezone: timezone.data,
      },
    });
  });
  app.get("/api/v1/health", async (c) => {
    if (new URL(c.req.url).search)
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Parameter tidak valid.",
      );
    const database = await c.env.DB.prepare(
      "SELECT 1 AS healthy",
    ).first<number>("healthy");
    if (database !== 1) throw new Error("Database health check failed");
    return c.json({
      request_id: c.get("requestId"),
      data: {
        status: "available",
        database: "available",
        environment: c.env.ENVIRONMENT,
      },
    });
  });
  app.route("/api/v1/users", usersRoutes());
  app.route("/api/v1/audit-logs", auditRoutes());
  app.route("/api/v1/services", scheduleRoutes());
  app.route("/api/v1/assignments", assignmentRoutes());
  app.route("/api/v1/imports", importRoutes());
  app.route("/api/v1", operationsRoutes());
  app.route("/api/v1", telegramRoutes());
  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Halaman tidak ditemukan.",
          request_id: c.get("requestId"),
          details: [],
        },
      },
      404,
    ),
  );
  app.onError((error, c) => {
    if (error instanceof ApplicationError)
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            request_id: c.get("requestId"),
            details: [],
          },
        },
        error.status,
      );
    if (isValidationError(error))
      return c.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "Periksa kembali isian permintaan.",
            request_id: c.get("requestId"),
            details: [],
          },
        },
        422,
      );
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Layanan belum tersedia. Silakan coba lagi.",
          request_id: c.get("requestId"),
          details: [],
        },
      },
      500,
    );
  });
  return app;
}
