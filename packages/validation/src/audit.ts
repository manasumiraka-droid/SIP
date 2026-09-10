import { z } from "zod";
import { resourceIdSchema } from "./users";
export const auditQuerySchema = z
  .object({
    cursor: z
      .string()
      .max(300)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    action: z
      .enum([
        "identity.read",
        "user.create",
        "user.roles.replace",
        "user.status.replace",
      ])
      .optional(),
  })
  .strict();
export const auditEntrySchema = z
  .object({
    id: resourceIdSchema,
    actorType: z.enum(["user", "system"]),
    actorId: resourceIdSchema.nullable(),
    action: z.string(),
    entityType: z.string(),
    entityId: resourceIdSchema,
    requestId: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const auditResponseSchema = z
  .object({
    request_id: z.string(),
    data: z.array(auditEntrySchema),
    next_cursor: z.string().nullable(),
  })
  .strict();
