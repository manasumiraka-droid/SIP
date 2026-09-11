import process from "node:process";
import { z } from "zod";

// Verifikasi kesiapan environment preview sebelum pipeline menjalankan migrasi
// dan deploy. Tidak pernah mencetak nilai secret, hanya nama dan status.
const withTelegram =
  process.argv.includes("--with-telegram") ||
  process.env.SPI_PREFLIGHT_TELEGRAM === "true";

const problems = [];
let checks = 0;

function requireSecret(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    problems.push(`Secret wajib belum diisi: ${name}`);
    return undefined;
  }
  checks += 1;
  return value;
}

function requireVariable(name, schema) {
  const value = process.env[name]?.trim();
  if (!value) {
    problems.push(`Variabel wajib belum diisi: ${name}`);
    return undefined;
  }
  if (!schema.safeParse(value).success) {
    problems.push(`Format ${name} tidak valid.`);
    return undefined;
  }
  checks += 1;
  return value;
}

const requiredSecrets = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "SUPABASE_DATABASE_URL",
  "SPI_HYPERDRIVE_ID",
  "SPI_OTHER_HYPERDRIVE_ID",
  "SPI_AUTH_RATE_LIMIT_NAMESPACE_ID",
  "SPI_MUTATION_RATE_LIMIT_NAMESPACE_ID",
  "SPI_OTHER_AUTH_RATE_LIMIT_NAMESPACE_ID",
  "SPI_OTHER_MUTATION_RATE_LIMIT_NAMESPACE_ID",
  ...(withTelegram ? ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"] : []),
];
for (const name of requiredSecrets) requireSecret(name);

const deployTarget = requireVariable(
  "SPI_DEPLOY_TARGET",
  z.enum(["zone", "workers_dev"]),
);
const authMode = requireVariable(
  "SPI_AUTH_MODE",
  z.enum(["preview_key", "cloudflare_access"]),
);
requireVariable("SPI_APP_ORIGIN", z.url().regex(/^https:\/\//));
requireVariable(
  "SPI_ORGANIZATION_ID",
  z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
);
requireVariable(
  "SPI_TELEGRAM_WEBHOOK_URL",
  z.url().regex(/^https:\/\/[^/]+\/telegram\/webhook$/),
);

if (process.env.SPI_TELEGRAM_DELIVERY_ENABLED?.trim() !== "false")
  problems.push(
    "SPI_TELEGRAM_DELIVERY_ENABLED wajib bernilai false di preview.",
  );

if (deployTarget === "zone") {
  const workerRoute = requireVariable(
    "SPI_WORKER_ROUTE",
    z.string().regex(/^[a-z0-9.-]+\/api\/\*$/),
  );
  const webhookRoute = requireVariable(
    "SPI_TELEGRAM_WEBHOOK_ROUTE",
    z.string().regex(/^[a-z0-9.-]+\/telegram\/webhook$/),
  );
  requireVariable("SPI_ZONE_NAME", z.string().regex(/^[a-z0-9.-]+$/));
  requireVariable("SPI_PAGES_PROJECT", z.string().regex(/^[a-z0-9-]+$/));
  if (
    workerRoute &&
    webhookRoute &&
    webhookRoute !==
      `${workerRoute.slice(0, -"/api/*".length)}/telegram/webhook`
  )
    problems.push(
      "SPI_TELEGRAM_WEBHOOK_ROUTE harus memakai host Worker API yang sama.",
    );
}

if (authMode === "preview_key") {
  requireVariable("SPI_PREVIEW_AUTH_EMAIL", z.email());
  requireVariable(
    "SPI_PREVIEW_AUTH_KEY_HASH",
    z.string().regex(/^[a-f0-9]{64}$/),
  );
} else if (authMode === "cloudflare_access") {
  requireVariable(
    "SPI_ACCESS_ISSUER",
    z.url().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
  );
  requireVariable("SPI_ACCESS_AUDIENCE", z.string().min(1));
}

const previewHyperdrive = process.env.SPI_HYPERDRIVE_ID?.trim();
const otherHyperdrive = process.env.SPI_OTHER_HYPERDRIVE_ID?.trim();
if (previewHyperdrive && previewHyperdrive === otherHyperdrive)
  problems.push("Hyperdrive preview dan production wajib berbeda.");

const namespaces = [
  "SPI_AUTH_RATE_LIMIT_NAMESPACE_ID",
  "SPI_MUTATION_RATE_LIMIT_NAMESPACE_ID",
  "SPI_OTHER_AUTH_RATE_LIMIT_NAMESPACE_ID",
  "SPI_OTHER_MUTATION_RATE_LIMIT_NAMESPACE_ID",
]
  .map((name) => process.env[name]?.trim())
  .filter(Boolean);
if (namespaces.length === 4 && new Set(namespaces).size !== 4)
  problems.push("Namespace rate limit preview dan production wajib berbeda.");

if (problems.length > 0) {
  process.stderr.write(
    `Preflight preview gagal (${problems.length} masalah):\n` +
      problems.map((problem) => `- ${problem}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

process.stdout.write(
  `Preflight preview lulus: ${checks} pemeriksaan OK, tidak ada nilai rahasia yang dicetak.\n`,
);
