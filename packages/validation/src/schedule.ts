import { z } from "zod";
import { assignmentStatuses, serviceStatuses } from "../../domain/src/schedule";
import { resourceIdSchema } from "./users";

const timestamp = z.iso.datetime({ offset: true });
const normalizedText = (maximum: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "))
    .pipe(z.string().min(1).max(maximum));
export const createWorshipServiceSchema = z
  .object({
    assemblyAt: timestamp,
    startsAt: timestamp,
    endsAt: timestamp,
    location: normalizedText(160),
    theme: normalizedText(200).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.assemblyAt) <= Date.parse(value.startsAt) &&
      Date.parse(value.startsAt) < Date.parse(value.endsAt),
    { message: "Rentang waktu ibadah tidak valid." },
  );
export const serviceStatusUpdateSchema = z
  .object({
    status: z.enum(serviceStatuses),
    version: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER - 1),
    reason: normalizedText(500).optional(),
    assemblyAt: timestamp.optional(),
    startsAt: timestamp.optional(),
    endsAt: timestamp.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.status === "cancelled" || value.status === "postponed") &&
      !value.reason
    )
      context.addIssue({ code: "custom", message: "Alasan wajib diisi." });
    if (
      value.status === "postponed" &&
      (!value.assemblyAt ||
        !value.startsAt ||
        !value.endsAt ||
        Date.parse(value.assemblyAt) > Date.parse(value.startsAt) ||
        Date.parse(value.startsAt) >= Date.parse(value.endsAt))
    )
      context.addIssue({
        code: "custom",
        message: "Jadwal baru wajib dan harus valid.",
      });
  });
export const serviceIdSchema = resourceIdSchema;
export const servicesQuerySchema = z
  .object({
    cursor: resourceIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type CreateWorshipService = z.infer<typeof createWorshipServiceSchema>;
export type ServiceStatusUpdate = z.infer<typeof serviceStatusUpdateSchema>;
export const createAssignmentSchema = z
  .object({
    serviceId: resourceIdSchema,
    serviceRoleId: resourceIdSchema,
    servantId: resourceIdSchema,
    slotNumber: z.number().int().min(1).max(99).default(1),
  })
  .strict();
export const assignmentStatusUpdateSchema = z
  .object({
    status: z.enum(assignmentStatuses),
    version: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .strict();
export const assignmentIdSchema = resourceIdSchema;
export type CreateAssignment = z.infer<typeof createAssignmentSchema>;
export type AssignmentStatusUpdate = z.infer<
  typeof assignmentStatusUpdateSchema
>;
