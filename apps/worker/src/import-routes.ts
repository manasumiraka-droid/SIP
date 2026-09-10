import { Hono } from "hono";
import { ApplicationError } from "../../../packages/domain/src/errors";
import type { AppEnvironment } from "./types";
import { parseXlsx, suggestMapping, IMPORT_LIMITS } from "./xlsx-parser";
import {
  createImportBatch,
  validateImportBatch,
  previewImportBatch,
  commitImportBatch,
  excludeImportRow,
  rollbackImportBatch,
  linkImportServant,
  listImportServants,
  createPendingImportServant,
  reviewImportRow,
} from "./import-repository";
import { z } from "zod";
import { resourceIdSchema } from "../../../packages/validation/src/users";
import { limitMutation, readMutation } from "./mutation-request";
const mapping = z
  .record(z.string(), z.string().max(200).nullable())
  .refine((v) =>
    [
      "Nomor",
      "tanggal",
      "Tempat Kebaktian/Ibadah",
      "Pelayan Firman",
      "MC",
      "Pelayan Persembahan",
    ].every((k) => k in v),
  );
const validate = z
  .object({ mapping, dateFormat: z.enum(["dmy", "mdy"]) })
  .strict();
const linkResolution = z
  .object({ field: z.enum(["preacher", "mc"]), servantId: resourceIdSchema })
  .strict();
export function importRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.post("/schedules", async (c) => {
    if (c.req.header("Origin") !== c.env.APP_ORIGIN)
      throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
    if (
      !c.req
        .header("Content-Type")
        ?.toLowerCase()
        .startsWith("multipart/form-data")
    )
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Gunakan unggahan XLSX.",
      );
    const form = await c.req.raw.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > IMPORT_LIMITS.bytes ||
      !file.name.toLowerCase().endsWith(".xlsx")
    )
      throw new ApplicationError(
        "VALIDATION_FAILED",
        422,
        "Pilih file XLSX maksimum 5 MB.",
      );
    await limitMutation(c);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await parseXlsx(
      bytes,
      typeof form.get("sheet") === "string"
        ? String(form.get("sheet"))
        : undefined,
    );
    const checksum = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const result = await createImportBatch(
      c.env.DB,
      c.get("actor"),
      file.name,
      checksum,
      parsed,
      suggestMapping(parsed.headers),
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data: result }, 201);
  });
  routes.post("/schedules/:id/validate", async (c) => {
    const { body } = await readMutation(c);
    await limitMutation(c);
    const input = validate.parse(body);
    return c.json({
      request_id: c.get("requestId"),
      data: await validateImportBatch(
        c.env.DB,
        c.get("actor"),
        resourceIdSchema.parse(c.req.param("id")),
        input.mapping,
        input.dateFormat,
        c.get("requestId"),
      ),
    });
  });
  routes.get("/schedules/:id/preview", async (c) => {
    const cursor = z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .parse(c.req.query("cursor"));
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .parse(c.req.query("limit"));
    return c.json({
      request_id: c.get("requestId"),
      ...(await previewImportBatch(
        c.env.DB,
        c.get("actor"),
        resourceIdSchema.parse(c.req.param("id")),
        cursor,
        limit,
      )),
    });
  });
  routes.get("/schedules/:id/servants", async (c) =>
    c.json({
      request_id: c.get("requestId"),
      ...(await listImportServants(
        c.env.DB,
        c.get("actor"),
        resourceIdSchema.parse(c.req.param("id")),
      )),
    }),
  );
  routes.put("/schedules/:id/rows/:rowId/exclude", async (c) => {
    const { key } = await readMutation(c);
    await limitMutation(c);
    const result = await excludeImportRow(
      c.env.DB,
      c.get("actor"),
      resourceIdSchema.parse(c.req.param("id")),
      resourceIdSchema.parse(c.req.param("rowId")),
      key,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data: result });
  });
  routes.put("/schedules/:id/rows/:rowId/resolution", async (c) => {
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    const input = linkResolution.parse(body);
    return c.json({
      request_id: c.get("requestId"),
      data: await linkImportServant(
        c.env.DB,
        c.get("actor"),
        resourceIdSchema.parse(c.req.param("id")),
        resourceIdSchema.parse(c.req.param("rowId")),
        input.field,
        input.servantId,
        key,
        c.get("requestId"),
      ),
    });
  });
  routes.put("/schedules/:id/resolutions", async (c) => {
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    const input = z
      .object({
        rowId: resourceIdSchema,
        action: z
          .enum(["skip", "merge_assignments", "create_separate"])
          .optional(),
        acknowledgeWarnings: z.literal(true).optional(),
        startsAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict()
      .refine(
        (value) => value.action || value.acknowledgeWarnings || value.startsAt,
        {
          message: "Pilih perubahan yang akan disimpan.",
        },
      )
      .parse(body);
    return c.json({
      request_id: c.get("requestId"),
      data: await reviewImportRow(
        c.env.DB,
        c.get("actor"),
        resourceIdSchema.parse(c.req.param("id")),
        input.rowId,
        input,
        key,
        c.get("requestId"),
      ),
    });
  });
  routes.post("/schedules/:id/rows/:rowId/pending", async (c) => {
    const { body, key } = await readMutation(c);
    await limitMutation(c);
    const input = z
      .object({ field: z.enum(["preacher", "mc"]) })
      .strict()
      .parse(body);
    return c.json(
      {
        request_id: c.get("requestId"),
        data: await createPendingImportServant(
          c.env.DB,
          c.get("actor"),
          resourceIdSchema.parse(c.req.param("id")),
          resourceIdSchema.parse(c.req.param("rowId")),
          input.field,
          key,
          c.get("requestId"),
        ),
      },
      201,
    );
  });
  routes.post("/schedules/:id/commit", async (c) => {
    const { key } = await readMutation(c);
    await limitMutation(c);
    return c.json({
      request_id: c.get("requestId"),
      data: await commitImportBatch(
        c.env.DB,
        c.get("actor"),
        resourceIdSchema.parse(c.req.param("id")),
        key,
        c.get("requestId"),
      ),
    });
  });
  routes.post("/schedules/:id/rollback", async (c) => {
    const { key } = await readMutation(c);
    await limitMutation(c);
    return c.json({
      request_id: c.get("requestId"),
      data: await rollbackImportBatch(
        c.env.DB,
        c.get("actor"),
        resourceIdSchema.parse(c.req.param("id")),
        key,
        c.get("requestId"),
      ),
    });
  });
  return routes;
}
