import { z } from "zod";
const runtimeConfigSchema = z
  .object({
    ENVIRONMENT: z.enum(["local", "preview", "production"]),
    APP_ORIGIN: z.url(),
    ACCESS_ISSUER: z
      .url()
      .regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
    ACCESS_AUDIENCE: z.string().min(1),
    ORGANIZATION_ID: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  })
  .passthrough();
export function assertRuntimeConfig(environment: unknown) {
  if (!runtimeConfigSchema.safeParse(environment).success)
    throw new Error("Worker configuration is incomplete");
}
