import type { Context } from "hono";
import type { AppEnvironment } from "./types";
import { ApplicationError } from "../../../packages/domain/src/errors";
import { idempotencyKeySchema } from "../../../packages/validation/src/users";
export async function readMutation(c: Context<AppEnvironment>) {
  if (!c.env.APP_ORIGIN || c.req.header("Origin") !== c.env.APP_ORIGIN)
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  if (
    c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Gunakan format JSON.",
    );
  if (new URL(c.req.url).search)
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Parameter tidak valid.",
    );
  const key = idempotencyKeySchema.parse(c.req.header("Idempotency-Key"));
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Isi permintaan tidak valid.",
    );
  }
  return { body, key };
}
export async function limitMutation(c: Context<AppEnvironment>) {
  if (!c.env.MUTATION_LIMITER)
    throw new Error("Mutation rate limiter not configured");
  const limited = await c.env.MUTATION_LIMITER.limit({
    key: `${c.get("actor").organizationId}:${c.get("actor").id}`,
  });
  if (!limited.success) {
    c.header("Retry-After", "60");
    throw new ApplicationError(
      "RATE_LIMITED",
      429,
      "Terlalu banyak perubahan. Coba lagi dalam satu menit.",
    );
  }
}
