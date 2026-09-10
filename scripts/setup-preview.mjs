import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { URL } from "node:url";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { z } from "zod";

const apply = process.argv.includes("--apply");
const input = z
  .object({
    cloudflareToken: z.string().min(20),
    cloudflareAccountUrl: z.url().regex(/^https:\/\/dash\.cloudflare\.com\//),
    databaseUrl: z.url().regex(/^postgres(?:ql)?:\/\//),
    appUrl: z.url().regex(/^https:\/\//),
    adminEmailUrl: z.url().regex(/^mailto:/),
  })
  .parse({
    cloudflareToken: process.env.CLOUDFLARE_API_TOKEN,
    cloudflareAccountUrl: process.env.CLOUDFLARE_ACCOUNT_URL,
    databaseUrl: process.env.SUPABASE_DATABASE_URL,
    appUrl: process.env.SPI_APP_URL,
    adminEmailUrl: process.env.SPI_ADMIN_EMAIL_URL,
  });

const accountUrl = new URL(input.cloudflareAccountUrl);
const accountId = accountUrl.pathname.split("/").filter(Boolean)[0];
if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId))
  throw new Error("URL account Cloudflare tidak memuat account ID yang valid.");
let app = new URL(input.appUrl);
if (app.search || app.hash)
  throw new Error("SPI_APP_URL tidak boleh memuat query atau fragment.");
const databaseUrl = new URL(input.databaseUrl);
if (
  !(
    /^db\.[a-z0-9]+\.supabase\.co$/i.test(databaseUrl.hostname) ||
    /^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(databaseUrl.hostname)
  ) ||
  (databaseUrl.port && databaseUrl.port !== "5432")
)
  throw new Error(
    "Gunakan Supabase Direct atau Session pooler connection URL pada port 5432.",
  );
if (!databaseUrl.username || !databaseUrl.password)
  throw new Error("Supabase URL harus memuat user dan password database.");
const directDatabaseUrl = new URL(databaseUrl);
if (!directDatabaseUrl.hostname.startsWith("db.")) {
  const decodedUser = decodeURIComponent(directDatabaseUrl.username);
  const projectRef = decodedUser.match(/^postgres\.([a-z0-9]+)$/i)?.[1];
  if (!projectRef)
    throw new Error(
      "Session pooler URL harus memakai user postgres.<project-ref>.",
    );
  directDatabaseUrl.hostname = `db.${projectRef}.supabase.co`;
  directDatabaseUrl.username = "postgres";
}
const adminUrl = new URL(input.adminEmailUrl);
const adminEmail = decodeURIComponent(adminUrl.pathname).toLowerCase();
if (!z.email().safeParse(adminEmail).success)
  throw new Error("SPI_ADMIN_EMAIL_URL harus berformat mailto:email-valid.");

const defaults = {
  organizationId: "spi-preview",
  organizationName: "SPI Preview",
  timezone: "Asia/Makassar",
  adminId: "preview-admin",
  adminName: "Administrator Preview",
  pagesProject: "spi-preview",
  hyperdriveName: "spi-supabase-preview",
  hyperdriveRole: "spi_hyperdrive_preview",
  authNamespace: "2001",
  mutationNamespace: "2002",
  otherAuthNamespace: "3001",
  otherMutationNamespace: "3002",
};

if (!apply) {
  process.stdout.write(
    [
      "Input KEY/URL preview valid.",
      "Mode dry-run: belum ada resource atau secret yang diubah.",
      "Tambahkan -- --apply untuk migrasi, provisioning, konfigurasi GitHub, bootstrap, dan dispatch deploy.",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

async function cloudflare(path, options = {}) {
  const response = await globalThis.fetch(
    `https://api.cloudflare.com/client/v4${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${input.cloudflareToken}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success !== true) {
    if (options.allowNotFound && response.status === 404) return null;
    const message = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error.message).join("; ")
      : `HTTP ${response.status}`;
    throw new Error(`Cloudflare API gagal: ${message}`);
  }
  return payload.result;
}

function runGh(args, value) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    input: value,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(`GitHub CLI gagal: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

async function applyMigrations(client) {
  await client.query(`create table if not exists public.spi_schema_migrations (
    name text primary key, checksum text not null, applied_at timestamptz not null default now()
  )`);
  const directory = resolve("supabase/migrations");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = await client.query(
      "select checksum from public.spi_schema_migrations where name=$1",
      [file],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].checksum !== checksum)
        throw new Error(`Migrasi yang sudah diterapkan berubah: ${file}`);
      continue;
    }
    await client.query(sql);
    await client.query(
      "insert into public.spi_schema_migrations(name,checksum) values($1,$2)",
      [file, checksum],
    );
  }
}

async function configureHyperdriveRole(client, password) {
  const role = defaults.hyperdriveRole;
  const statement = await client.query(
    `select case when exists(select 1 from pg_roles where rolname=$1)
      then format('alter role %I login password %L',$1,$2)
      else format('create role %I login password %L',$1,$2) end as sql`,
    [role, password],
  );
  await client.query(statement.rows[0].sql);
  await client.query(`grant usage on schema public to ${role}`);
  await client.query(
    `grant select,insert,update,delete on all tables in schema public to ${role}`,
  );
  await client.query(
    `alter default privileges in schema public grant select,insert,update,delete on tables to ${role}`,
  );
}

async function bootstrap(client, adminEmail) {
  const at = new Date().toISOString();
  const canonical = JSON.stringify({
    organizationId: defaults.organizationId,
    organizationName: defaults.organizationName,
    timezone: defaults.timezone,
    userId: defaults.adminId,
    userName: defaults.adminName,
    email: adminEmail,
  });
  const payloadHash = createHash("sha256").update(canonical).digest("hex");
  await client.query("begin");
  try {
    const prior = await client.query(
      "select payload_hash from bootstrap_state where singleton=1",
    );
    if (prior.rows[0]) {
      if (prior.rows[0].payload_hash !== payloadHash)
        throw new Error(
          "Database sudah di-bootstrap dengan identitas berbeda.",
        );
      await client.query("rollback");
      return;
    }
    await client.query(
      "insert into bootstrap_state(singleton,organization_id,payload_hash,initialized_at) values(1,$1,$2,$3)",
      [defaults.organizationId, payloadHash, at],
    );
    await client.query(
      "insert into organizations(id,name,timezone,settings_json,version,created_at,updated_at) values($1,$2,$3,'{}',1,$4,$4)",
      [
        defaults.organizationId,
        defaults.organizationName,
        defaults.timezone,
        at,
      ],
    );
    await client.query(
      "insert into users(id,organization_id,email,display_name,status,version,created_at,updated_at) values($1,$2,$3,$4,'active',1,$5,$5)",
      [
        defaults.adminId,
        defaults.organizationId,
        adminEmail,
        defaults.adminName,
        at,
      ],
    );
    await client.query(
      "insert into user_roles(id,organization_id,user_id,role_id,granted_by,granted_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,'super_admin',$2,$3,$3,$3)",
      [defaults.organizationId, defaults.adminId, at],
    );
    await client.query(
      "insert into audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) values(gen_random_uuid()::text,$1,'user',$2,'organization.bootstrap','organization',$1,$3,$4,$5)",
      [
        defaults.organizationId,
        defaults.adminId,
        `setup_${randomBytes(12).toString("hex")}`,
        JSON.stringify({ environment: "preview", version: 1 }),
        at,
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

const zones = await cloudflare(
  `/zones?account.id=${encodeURIComponent(accountId)}&status=active&per_page=50`,
);
const zone = zones
  .filter(
    (candidate) =>
      app.hostname.endsWith(`.${candidate.name}`) ||
      app.hostname === candidate.name,
  )
  .sort((left, right) => right.name.length - left.name.length)[0];
const deployTarget = zone ? "zone" : "workers_dev";
if (!zone) {
  const workerSubdomain = await cloudflare(
    `/accounts/${accountId}/workers/subdomain`,
  );
  app = new URL(
    `https://spi-api-preview.${workerSubdomain.subdomain}.workers.dev`,
  );
} else {
  const pages = await cloudflare(
    `/accounts/${accountId}/pages/projects/${defaults.pagesProject}`,
    { allowNotFound: true },
  );
  if (!pages)
    await cloudflare(`/accounts/${accountId}/pages/projects`, {
      method: "POST",
      body: { name: defaults.pagesProject, production_branch: "main" },
    });
  const domains = await cloudflare(
    `/accounts/${accountId}/pages/projects/${defaults.pagesProject}/domains`,
  );
  if (!domains.some((domain) => domain.name === app.hostname))
    await cloudflare(
      `/accounts/${accountId}/pages/projects/${defaults.pagesProject}/domains`,
      { method: "POST", body: { name: app.hostname } },
    );
}

const hyperdrives = await cloudflare(
  `/accounts/${accountId}/hyperdrive/configs`,
);
let hyperdrive = hyperdrives.find(
  (candidate) => candidate.name === defaults.hyperdriveName,
);
if (
  hyperdrive &&
  (hyperdrive.origin?.host !== directDatabaseUrl.hostname ||
    hyperdrive.origin?.database !==
      (directDatabaseUrl.pathname.slice(1) || "postgres") ||
    hyperdrive.origin?.user !== defaults.hyperdriveRole)
)
  throw new Error(
    "Hyperdrive bernama spi-supabase-preview sudah menunjuk database lain.",
  );
const client = new Client({ connectionString: input.databaseUrl });
await client.connect();
try {
  await applyMigrations(client);
  if (!hyperdrive) {
    const password = randomBytes(32).toString("hex");
    await configureHyperdriveRole(client, password);
    hyperdrive = await cloudflare(`/accounts/${accountId}/hyperdrive/configs`, {
      method: "POST",
      body: {
        name: defaults.hyperdriveName,
        origin: {
          scheme: "postgresql",
          host: directDatabaseUrl.hostname,
          port: Number(directDatabaseUrl.port || "5432"),
          database: directDatabaseUrl.pathname.slice(1) || "postgres",
          user: defaults.hyperdriveRole,
          password,
        },
        mtls: { sslmode: "require" },
        origin_connection_limit: 5,
      },
    });
  }
  await bootstrap(client, adminEmail);
} finally {
  await client.end();
}

const repository = runGh([
  "repo",
  "view",
  "--json",
  "nameWithOwner",
  "-q",
  ".nameWithOwner",
]);
runGh(["api", `repos/${repository}/environments/preview`, "-X", "PUT"]);
const previewAuthKey = randomBytes(32).toString("base64url");
const secrets = {
  CLOUDFLARE_API_TOKEN: input.cloudflareToken,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  SUPABASE_DATABASE_URL: input.databaseUrl,
  SPI_PREVIEW_AUTH_KEY: previewAuthKey,
  SPI_HYPERDRIVE_ID: hyperdrive.id,
  SPI_PRODUCTION_HYPERDRIVE_ID: "production-not-configured",
  SPI_AUTH_RATE_LIMIT_NAMESPACE_ID: defaults.authNamespace,
  SPI_MUTATION_RATE_LIMIT_NAMESPACE_ID: defaults.mutationNamespace,
  SPI_PRODUCTION_AUTH_RATE_LIMIT_NAMESPACE_ID: defaults.otherAuthNamespace,
  SPI_PRODUCTION_MUTATION_RATE_LIMIT_NAMESPACE_ID:
    defaults.otherMutationNamespace,
};
for (const [name, value] of Object.entries(secrets))
  runGh(["secret", "set", name, "--env", "preview"], value);
const variables = {
  SPI_APP_ORIGIN: app.origin,
  SPI_DEPLOY_TARGET: deployTarget,
  SPI_AUTH_MODE: "preview_key",
  SPI_PREVIEW_AUTH_EMAIL: adminEmail,
  SPI_ORGANIZATION_ID: defaults.organizationId,
  SPI_TELEGRAM_WEBHOOK_URL: `${app.origin}/telegram/webhook`,
  SPI_TELEGRAM_DELIVERY_ENABLED: "false",
  ...(zone
    ? {
        SPI_WORKER_ROUTE: `${app.hostname}/api/*`,
        SPI_TELEGRAM_WEBHOOK_ROUTE: `${app.hostname}/telegram/webhook`,
        SPI_ZONE_NAME: zone.name,
        SPI_PAGES_PROJECT: defaults.pagesProject,
      }
    : {}),
};
for (const [name, value] of Object.entries(variables))
  runGh(["variable", "set", name, "--env", "preview", "--body", value]);

await writeFile(resolve(".preview-login-key"), `${previewAuthKey}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
await writeFile(resolve(".preview-app-url"), `${app.origin}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

runGh([
  "workflow",
  "run",
  "deploy-preview.yml",
  "-f",
  "apply_migrations=true",
  "-f",
  "configure_telegram=false",
]);
process.stdout.write(
  "Environment preview selesai disiapkan dan workflow deploy sudah dikirim. URL dan kunci login tersimpan di .preview-app-url serta .preview-login-key.\n",
);
