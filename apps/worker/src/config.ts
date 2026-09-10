import { z } from "zod";
const base = z
  .object({
    ENVIRONMENT: z.enum(["local", "preview", "production"]),
    APP_ORIGIN: z.url(),
    ORGANIZATION_ID: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  })
  .passthrough();
const runtimeConfigSchema = z.union([
  base.extend({
    AUTH_MODE: z.literal("preview_key"),
    ENVIRONMENT: z.literal("preview"),
    PREVIEW_AUTH_KEY: z.string().min(32),
    PREVIEW_AUTH_EMAIL: z.email(),
  }),
  base.extend({
    AUTH_MODE: z.literal("cloudflare_access").optional(),
    ACCESS_ISSUER: z
      .url()
      .regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
    ACCESS_AUDIENCE: z.string().min(1),
  }),
]);
export function assertRuntimeConfig(environment: unknown) {
  if (!runtimeConfigSchema.safeParse(environment).success)
    throw new Error("Worker configuration is incomplete");
}
