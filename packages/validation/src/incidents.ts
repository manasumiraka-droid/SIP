import { z } from "zod";
import { incidentStatuses } from "../../domain/src/incidents";
import { resourceIdSchema } from "./users";

const normalizedText = (maximum: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "))
    .pipe(z.string().min(1).max(maximum));

export const createIncidentSchema = z
  .object({
    serviceId: resourceIdSchema,
    assignmentId: resourceIdSchema,
    reason: normalizedText(255),
  })
  .strict();
export type CreateIncident = z.infer<typeof createIncidentSchema>;

export const resolveIncidentSchema = z
  .object({
    replacementServantId: resourceIdSchema,
  })
  .strict();
export type ResolveIncident = z.infer<typeof resolveIncidentSchema>;

export const escalateIncidentSchema = z
  .object({
    reason: normalizedText(255).optional(),
  })
  .strict();
export type EscalateIncident = z.infer<typeof escalateIncidentSchema>;

export const queryIncidentsSchema = z
  .object({
    status: z.enum(incidentStatuses).optional(),
    serviceId: resourceIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type QueryIncidents = z.input<typeof queryIncidentsSchema>;
