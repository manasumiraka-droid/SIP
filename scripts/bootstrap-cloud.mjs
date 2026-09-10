import process from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const environmentSchema = z.enum(["preview", "production"]);
const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);
const inputSchema = z
  .object({
    accountId: z.string().min(1).max(32),
    databaseId: z.uuid(),
    token: z.string().min(20),
    organizationId: idSchema,
    organizationName: z.string().trim().min(1).max(160),
    timezone: z
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
      }, "Zona waktu tidak valid"),
    userId: idSchema,
    userName: z.string().trim().min(1).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  })
  .strict();
const environment = environmentSchema.parse(process.argv[2]);
const apply = process.argv.includes("--apply");
const input = inputSchema.parse({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.SPI_D1_DATABASE_ID,
  token: process.env.CLOUDFLARE_API_TOKEN,
  organizationId: process.env.SPI_BOOTSTRAP_ORGANIZATION_ID,
  organizationName: process.env.SPI_BOOTSTRAP_ORGANIZATION_NAME,
  timezone: process.env.SPI_BOOTSTRAP_TIMEZONE,
  userId: process.env.SPI_BOOTSTRAP_USER_ID,
  userName: process.env.SPI_BOOTSTRAP_USER_NAME,
  email: process.env.SPI_BOOTSTRAP_USER_EMAIL,
});
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
const initializedAt = new Date().toISOString();
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
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(input.accountId)}/d1/database/${encodeURIComponent(input.databaseId)}/query`;
async function query(body) {
  const response = await globalThis.fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
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
const batch = [
  {
    sql: "INSERT INTO bootstrap_state(singleton,organization_id,payload_hash,initialized_at) VALUES (1,?,?,?)",
    params: [input.organizationId, payloadHash, initializedAt],
  },
  {
    sql: "INSERT INTO organizations(id,name,timezone,settings_json,version,created_at,updated_at) VALUES (?,?,?,'{}',1,?,?)",
    params: [
      input.organizationId,
      input.organizationName,
      input.timezone,
      initializedAt,
      initializedAt,
    ],
  },
  {
    sql: "INSERT INTO users(id,organization_id,email,display_name,status,version,created_at,updated_at) VALUES (?,?,?,?,'active',1,?,?)",
    params: [
      input.userId,
      input.organizationId,
      input.email,
      input.userName,
      initializedAt,
      initializedAt,
    ],
  },
  {
    sql: "INSERT INTO user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    params: [
      randomUUID(),
      input.organizationId,
      input.userId,
      "super_admin",
      input.userId,
      initializedAt,
      initializedAt,
      initializedAt,
    ],
  },
  {
    sql: "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES (?,?,'user',?,'organization.bootstrap','organization',?,?,?,?)",
    params: [
      randomUUID(),
      input.organizationId,
      input.userId,
      input.organizationId,
      requestId,
      JSON.stringify({ environment, timezone: input.timezone, version: 1 }),
      initializedAt,
    ],
  },
];
try {
  await query({ batch });
  process.stdout.write(
    `Bootstrap ${environment} berhasil. Simpan request ID operator: ${requestId}\n`,
  );
} catch (error) {
  const verification = await query({
    sql: "SELECT payload_hash FROM bootstrap_state WHERE singleton=1 LIMIT 1",
    params: [],
  }).catch(() => null);
  const rows =
    verification &&
    typeof verification === "object" &&
    "result" in verification &&
    Array.isArray(verification.result)
      ? verification.result
      : [];
  const first = rows[0];
  const resultRows =
    first &&
    typeof first === "object" &&
    "results" in first &&
    Array.isArray(first.results)
      ? first.results
      : [];
  const stored = resultRows[0];
  if (
    stored &&
    typeof stored === "object" &&
    "payload_hash" in stored &&
    stored.payload_hash === payloadHash
  )
    process.stdout.write(
      `Bootstrap ${environment} sebelumnya sudah berhasil dengan input yang sama.\n`,
    );
  else throw error;
}
