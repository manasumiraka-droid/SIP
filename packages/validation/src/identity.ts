import { z } from "zod";
import { roles } from "../../domain/src/access";
export const timezoneSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("id-ID", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Zona waktu tidak valid");
export const identitySchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    displayName: z.string(),
    status: z.enum(["active", "inactive", "suspended"]),
    roles: z.array(z.enum(roles)),
    scopes: z.array(
      z.object({
        type: z.enum(["service", "field"]),
        id: z.string(),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime().nullable(),
      }),
    ),
  })
  .strict();
export const meResponseSchema = z
  .object({
    request_id: z.string(),
    data: z
      .object({
        displayName: z.string(),
        roles: z.array(z.enum(roles)),
        permissions: z.array(z.string()),
        timezone: timezoneSchema,
      })
      .strict(),
  })
  .strict();
