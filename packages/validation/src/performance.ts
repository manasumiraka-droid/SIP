import { z } from "zod";
import {
  attendanceStatuses,
  noteCategories,
} from "../../domain/src/performance";
import { resourceIdSchema } from "./users";

const normalizedText = (maximum: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "))
    .pipe(z.string().min(1).max(maximum));

export const recordAttendanceItemSchema = z
  .object({
    assignmentId: resourceIdSchema,
    servantId: resourceIdSchema,
    status: z.enum(attendanceStatuses),
    checkinTime: z.string().datetime().optional().nullable(),
    notes: normalizedText(255).optional().nullable(),
  })
  .strict();
export type RecordAttendanceItem = z.infer<typeof recordAttendanceItemSchema>;

export const batchRecordAttendanceSchema = z
  .object({
    items: z.array(recordAttendanceItemSchema).min(1).max(50),
  })
  .strict();
export type BatchRecordAttendance = z.infer<typeof batchRecordAttendanceSchema>;

export const noteCategorySchema = z.enum(noteCategories);

export const createServiceNoteSchema = z
  .object({
    serviceId: resourceIdSchema.optional().nullable(),
    servantId: resourceIdSchema.optional().nullable(),
    category: noteCategorySchema,
    title: normalizedText(160),
    content: z.string().trim().min(1).max(2000),
    grantedUserIds: z.array(resourceIdSchema).max(50).optional(),
  })
  .strict();
export type CreateServiceNote = z.infer<typeof createServiceNoteSchema>;

export const queryReportsSchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    serviceId: resourceIdSchema.optional(),
    fieldId: resourceIdSchema.optional(),
  })
  .strict();
export type QueryReports = z.infer<typeof queryReportsSchema>;
