import { z } from "zod";
import { roles } from "../../domain/src/access";
export const resourceIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);
export const roleUpdateSchema = z
  .object({
    roles: z
      .array(z.enum(roles))
      .max(5)
      .refine((value) => new Set(value).size === value.length),
    version: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .strict();
export const idempotencyKeySchema = z.uuid();
export const usersQuerySchema = z
  .object({
    cursor: resourceIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const managedUserSchema = z
  .object({
    id: resourceIdSchema,
    displayName: z.string(),
    status: z.enum(["active", "inactive", "suspended"]),
    version: z.number().int().positive(),
    roles: z.array(z.enum(roles)),
  })
  .strict();
export const usersResponseSchema = z
  .object({
    request_id: z.string(),
    data: z.array(managedUserSchema),
    next_cursor: resourceIdSchema.nullable(),
  })
  .strict();
export type ManagedUser = z.infer<typeof managedUserSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
export const createUserSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "))
      .pipe(
        z
          .string()
          .min(1)
          .max(120)
          .regex(/^[^\p{Cc}\p{Cf}]+$/u),
      ),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    roles: roleUpdateSchema.shape.roles.refine(
      (value) => value.some((role) => role !== "servant"),
      "Pilih minimal satu peran pengurus.",
    ),
  })
  .strict();
export const createdUserResponseSchema = z
  .object({
    request_id: z.string(),
    data: z.object({ id: resourceIdSchema, version: z.literal(1) }).strict(),
  })
  .strict();
export type CreateUser = z.infer<typeof createUserSchema>;
export const accountStatusUpdateSchema = z
  .object({
    status: z.enum(["active", "inactive", "suspended"]),
    version: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .strict();
export type AccountStatusUpdate = z.infer<typeof accountStatusUpdateSchema>;
