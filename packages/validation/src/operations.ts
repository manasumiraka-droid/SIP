import { z } from "zod";
import { resourceIdSchema } from "./users";

const name = z
  .string()
  .trim()
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(120));
const code = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{1,64}$/);
const timestamp = z.iso.datetime({ offset: true });
export const createFieldSchema = z.object({ code, name }).strict();
export const createServiceRoleSchema = z.object({
  fieldId: resourceIdSchema,
  code,
  name,
  slotsRequired: z.number().int().min(1).max(99).default(1),
  criticality: z.enum(["normal", "critical"]).default("normal"),
});
export const servantTitles = ["Diaken", "Penatua", "Staff"] as const;
export type ServantTitle = (typeof servantTitles)[number];

export const createServantSchema = z
  .object({
    userId: resourceIdSchema.nullable().optional(),
    displayName: name,
    phoneNumber: z.string().trim().max(30).nullable().optional(),
    title: z.enum(servantTitles).nullable().optional(),
    isBackup: z.boolean().default(false),
    administrativeNote: z.string().trim().max(2000).optional(),
  })
  .strict();
export const updateServantSchema = z
  .object({
    displayName: name.optional(),
    phoneNumber: z.string().trim().max(30).nullable().optional(),
    title: z.enum(servantTitles).nullable().optional(),
    status: z.enum(["active", "inactive", "pending_review"]).optional(),
    isBackup: z.boolean().optional(),
    administrativeNote: z.string().trim().max(2000).nullable().optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
export const updateServiceRoleSchema = z
  .object({
    fieldId: resourceIdSchema.optional(),
    name: name.optional(),
    slotsRequired: z.number().int().min(1).max(99).optional(),
    criticality: z.enum(["normal", "critical"]).optional(),
    active: z.number().int().min(0).max(1).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
export const createAvailabilitySchema = z
  .object({
    servantId: resourceIdSchema,
    startsAt: timestamp,
    endsAt: timestamp,
    type: z.enum(["unavailable", "preference"]).default("unavailable"),
    notePrivate: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((value) => Date.parse(value.startsAt) < Date.parse(value.endsAt), {
    message: "Rentang availability tidak valid.",
  });
export const operationsQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();
export const createCapabilityApproverSchema = z
  .object({ serviceRoleId: resourceIdSchema, userId: resourceIdSchema })
  .strict();
export const createCapabilitySchema = z
  .object({
    servantId: resourceIdSchema,
    serviceRoleId: resourceIdSchema,
    status: z.enum(["active", "pending_approval", "inactive"]),
    monthlyAssignmentLimit: z
      .number()
      .int()
      .min(1)
      .max(99)
      .nullable()
      .optional(),
  })
  .strict();
export const createCoordinatorScopeSchema = z
  .object({
    userId: resourceIdSchema,
    type: z.enum(["service", "field"]),
    scopeId: resourceIdSchema,
    startsAt: timestamp,
    endsAt: timestamp.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.endsAt == null ||
      Date.parse(value.startsAt) < Date.parse(value.endsAt),
    { message: "Rentang scope tidak valid." },
  );
export type CreateField = z.infer<typeof createFieldSchema>;
export type CreateServiceRole = z.infer<typeof createServiceRoleSchema>;
export type CreateServant = z.infer<typeof createServantSchema>;
export type UpdateServant = z.infer<typeof updateServantSchema>;
export type UpdateServiceRole = z.infer<typeof updateServiceRoleSchema>;
export type CreateAvailability = z.infer<typeof createAvailabilitySchema>;
export type CreateCapabilityApprover = z.infer<
  typeof createCapabilityApproverSchema
>;
export type CreateCapability = z.infer<typeof createCapabilitySchema>;
export type CreateCoordinatorScope = z.infer<
  typeof createCoordinatorScopeSchema
>;
