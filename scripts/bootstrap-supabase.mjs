import process from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";

const environment = z.enum(["preview", "production"]).parse(process.argv[2]);
const apply = process.argv.includes("--apply");
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);
const input = z
  .object({
    databaseUrl: z.url().regex(/^postgres(?:ql)?:\/\//),
    organizationId: id,
    organizationName: z.string().trim().min(1).max(160),
    timezone: z.string().min(1).max(80),
    userId: id,
    userName: z.string().trim().min(1).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  })
  .parse({
    databaseUrl: process.env.SUPABASE_DATABASE_URL,
    organizationId: process.env.SPI_BOOTSTRAP_ORGANIZATION_ID,
    organizationName: process.env.SPI_BOOTSTRAP_ORGANIZATION_NAME,
    timezone: process.env.SPI_BOOTSTRAP_TIMEZONE,
    userId: process.env.SPI_BOOTSTRAP_USER_ID,
    userName: process.env.SPI_BOOTSTRAP_USER_NAME,
    email: process.env.SPI_BOOTSTRAP_USER_EMAIL,
  });
new Intl.DateTimeFormat("id-ID", { timeZone: input.timezone }).format();
if (process.env.SPI_ENVIRONMENT !== environment)
  throw new Error("SPI_ENVIRONMENT tidak cocok dengan target bootstrap.");
if (!apply) {
  process.stdout.write(
    `Input bootstrap ${environment} valid. Tambahkan --apply untuk menjalankan.\n`,
  );
  process.exit(0);
}
if (process.env.SPI_BOOTSTRAP_CONFIRM !== `bootstrap-${environment}`)
  throw new Error("Konfirmasi bootstrap tidak cocok.");

const at = new Date().toISOString();
const requestId = `bootstrap_${randomUUID()}`;
const canonical = JSON.stringify({
  organizationId: input.organizationId,
  organizationName: input.organizationName,
  timezone: input.timezone,
  userId: input.userId,
  userName: input.userName,
  email: input.email,
});
const payloadHash = createHash("sha256").update(canonical).digest("hex");
const client = new Client({ connectionString: input.databaseUrl });
await client.connect();
try {
  await client.query("begin");
  const prior = await client.query(
    "select payload_hash from bootstrap_state where singleton=1",
  );
  if (prior.rows[0]) {
    if (prior.rows[0].payload_hash !== payloadHash)
      throw new Error(
        "Database sudah di-bootstrap dengan konfigurasi berbeda.",
      );
    await client.query("rollback");
    process.stdout.write(
      `Bootstrap ${environment} sebelumnya sudah berhasil.\n`,
    );
    process.exit(0);
  }
  await client.query(
    "insert into bootstrap_state(singleton,organization_id,payload_hash,initialized_at) values(1,$1,$2,$3)",
    [input.organizationId, payloadHash, at],
  );
  await client.query(
    "insert into organizations(id,name,timezone,settings_json,version,created_at,updated_at) values($1,$2,$3,'{}',1,$4,$4)",
    [input.organizationId, input.organizationName, input.timezone, at],
  );
  await client.query(
    "insert into users(id,organization_id,email,display_name,status,version,created_at,updated_at) values($1,$2,$3,$4,'active',1,$5,$5)",
    [input.userId, input.organizationId, input.email, input.userName, at],
  );
  await client.query(
    "insert into user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) values($1,$2,$3,'super_admin',$3,$4,$4,$4)",
    [randomUUID(), input.organizationId, input.userId, at],
  );
  await client.query(
    "insert into audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) values($1,$2,'user',$3,'organization.bootstrap','organization',$2,$4,$5,$6)",
    [
      randomUUID(),
      input.organizationId,
      input.userId,
      requestId,
      JSON.stringify({ environment, timezone: input.timezone, version: 1 }),
      at,
    ],
  );
  await client.query("commit");
  process.stdout.write(
    `Bootstrap ${environment} berhasil. Request ID: ${requestId}\n`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
