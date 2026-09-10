import process from "node:process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";

const environment = z.enum(["preview", "production"]).parse(process.argv[2]);
const apply = process.argv.includes("--apply");
const values = z
  .object({
    databaseUrl: z.url().regex(/^postgres(?:ql)?:\/\//),
    organizationId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    before: z.iso.datetime(),
  })
  .parse({
    databaseUrl: process.env.SUPABASE_DATABASE_URL,
    organizationId: process.env.SPI_ORGANIZATION_ID,
    before: process.env.SPI_RETENTION_BEFORE,
  });
if (process.env.SPI_ENVIRONMENT !== environment)
  throw new Error("SPI_ENVIRONMENT tidak cocok dengan target retensi.");
const latestAllowed = new Date();
latestAllowed.setUTCFullYear(latestAllowed.getUTCFullYear() - 5);
if (Date.parse(values.before) > latestAllowed.getTime())
  throw new Error("Batas retensi harus sekurangnya lima tahun yang lalu.");

const client = new Client({ connectionString: values.databaseUrl });
await client.connect();
try {
  const queries = [
    "select count(*)::integer as count from audit_logs a where a.organization_id=$1 and a.created_at<$2 and not exists(select 1 from audit_retention_holds h where h.audit_log_id=a.id)",
    "select count(*)::integer as count from role_changes where organization_id=$1 and created_at<$2",
    "select count(*)::integer as count from user_creations where organization_id=$1 and created_at<$2",
    "select count(*)::integer as count from account_status_changes where organization_id=$1 and created_at<$2",
  ];
  const counts = await Promise.all(
    queries.map((sql) =>
      client.query(sql, [values.organizationId, values.before]),
    ),
  );
  process.stdout.write(
    `Kandidat retensi ${environment} sebelum ${values.before}: ${JSON.stringify(counts.map((result) => result.rows[0]))}\n`,
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
  await client.query("begin");
  await client.query(
    "delete from role_changes where organization_id=$1 and created_at<$2",
    [values.organizationId, values.before],
  );
  await client.query(
    "delete from user_creations where organization_id=$1 and created_at<$2",
    [values.organizationId, values.before],
  );
  await client.query(
    "delete from account_status_changes where organization_id=$1 and created_at<$2",
    [values.organizationId, values.before],
  );
  await client.query("alter table audit_logs disable trigger audit_no_delete");
  await client.query(
    "delete from audit_logs where organization_id=$1 and created_at<$2 and not exists(select 1 from audit_retention_holds h where h.audit_log_id=audit_logs.id)",
    [values.organizationId, values.before],
  );
  await client.query(
    "insert into audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) values($1,$2,'system',null,'retention.execute','organization',$2,$3,$4,$5)",
    [
      randomUUID(),
      values.organizationId,
      `retention_${randomUUID()}`,
      JSON.stringify({ before: values.before, environment }),
      timestamp,
    ],
  );
  await client.query("alter table audit_logs enable trigger audit_no_delete");
  await client.query("commit");
  process.stdout.write(
    `Retensi ${environment} selesai dan dicatat pada audit.\n`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
