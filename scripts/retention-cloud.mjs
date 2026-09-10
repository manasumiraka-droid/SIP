import process from "node:process";
import { randomUUID } from "node:crypto";
import { z } from "zod";
const environment = z.enum(["preview", "production"]).parse(process.argv[2]);
const apply = process.argv.includes("--apply");
const values = z
  .object({
    accountId: z.string().min(1).max(32),
    databaseId: z.uuid(),
    token: z.string().min(20),
    organizationId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    before: z.iso.datetime(),
  })
  .parse({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.SPI_D1_DATABASE_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
    organizationId: process.env.SPI_ORGANIZATION_ID,
    before: process.env.SPI_RETENTION_BEFORE,
  });
if (process.env.SPI_ENVIRONMENT !== environment)
  throw new Error("SPI_ENVIRONMENT tidak cocok dengan target retensi.");
const latestAllowed = new Date();
latestAllowed.setUTCFullYear(latestAllowed.getUTCFullYear() - 5);
if (Date.parse(values.before) > latestAllowed.getTime())
  throw new Error("Batas retensi harus sekurangnya lima tahun yang lalu.");
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(values.accountId)}/d1/database/${encodeURIComponent(values.databaseId)}/query`;
async function query(body) {
  const response = await globalThis.fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${values.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (
    !response.ok ||
    typeof result !== "object" ||
    result === null ||
    result.success !== true
  )
    throw new Error(`Cloudflare D1 query gagal (${response.status}).`);
  return result;
}
const counts = await query({
  batch: [
    {
      sql: "SELECT COUNT(*) AS count FROM audit_logs a WHERE a.organization_id=? AND a.created_at<? AND NOT EXISTS(SELECT 1 FROM audit_retention_holds h WHERE h.audit_log_id=a.id)",
      params: [values.organizationId, values.before],
    },
    {
      sql: "SELECT COUNT(*) AS count FROM role_changes WHERE organization_id=? AND created_at<?",
      params: [values.organizationId, values.before],
    },
    {
      sql: "SELECT COUNT(*) AS count FROM user_creations WHERE organization_id=? AND created_at<?",
      params: [values.organizationId, values.before],
    },
    {
      sql: "SELECT COUNT(*) AS count FROM account_status_changes WHERE organization_id=? AND created_at<?",
      params: [values.organizationId, values.before],
    },
  ],
});
process.stdout.write(
  `Kandidat retensi ${environment} sebelum ${values.before}: ${JSON.stringify(counts.result)}\n`,
);
if (!apply) {
  process.stdout.write(
    "Dry run selesai. Tambahkan --apply setelah hasil dan retention hold direview.\n",
  );
  process.exit(0);
}
if (
  process.env.SPI_RETENTION_CONFIRM !==
  `retention-${environment}-${values.before}`
)
  throw new Error("Konfirmasi retensi tidak cocok.");
const timestamp = new Date().toISOString();
await query({
  batch: [
    {
      sql: "DELETE FROM role_changes WHERE organization_id=? AND created_at<?",
      params: [values.organizationId, values.before],
    },
    {
      sql: "DELETE FROM user_creations WHERE organization_id=? AND created_at<?",
      params: [values.organizationId, values.before],
    },
    {
      sql: "DELETE FROM account_status_changes WHERE organization_id=? AND created_at<?",
      params: [values.organizationId, values.before],
    },
    { sql: "DROP TRIGGER audit_no_update", params: [] },
    { sql: "DROP TRIGGER audit_no_delete", params: [] },
    {
      sql: "DELETE FROM audit_logs WHERE organization_id=? AND created_at<? AND NOT EXISTS(SELECT 1 FROM audit_retention_holds h WHERE h.audit_log_id=audit_logs.id)",
      params: [values.organizationId, values.before],
    },
    {
      sql: "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES (?,?,'system',NULL,'retention.execute','organization',?,?,?,?)",
      params: [
        randomUUID(),
        values.organizationId,
        values.organizationId,
        `retention_${randomUUID()}`,
        JSON.stringify({ before: values.before, environment }),
        timestamp,
      ],
    },
    {
      sql: "CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit is append only'); END",
      params: [],
    },
    {
      sql: "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit retention requires reviewed maintenance migration'); END",
      params: [],
    },
  ],
});
process.stdout.write(
  `Retensi ${environment} selesai dan dicatat pada audit.\n`,
);
