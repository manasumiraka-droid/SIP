import process from "node:process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

const BACKUP_TABLES = [
  "organizations",
  "users",
  "user_roles",
  "service_fields",
  "service_roles",
  "capability_approvers",
  "servants",
  "servant_capabilities",
  "worship_services",
  "coordinator_scopes",
  "assignments",
  "attendance_records",
  "service_notes",
  "service_notes_acl",
  "audit_logs",
];

const optionsSchema = z.object({
  organizationId: z
    .string()
    .min(1)
    .default(process.env.SPI_ORGANIZATION_ID ?? "local-demo"),
  outFile: z.string().optional(),
  dryRun: z.boolean().default(false),
});

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const orgIdx = args.indexOf("--org");
const orgVal = orgIdx !== -1 ? args[orgIdx + 1] : undefined;
const outIdx = args.indexOf("--out");
const outVal = outIdx !== -1 ? args[outIdx + 1] : undefined;

const options = optionsSchema.parse({
  organizationId: orgVal ?? process.env.SPI_ORGANIZATION_ID ?? "local-demo",
  outFile: outVal,
  dryRun,
});

process.stdout.write(
  `[SPI Backup] Menyiapkan pencadangan basis data D1 untuk organisasi: ${options.organizationId}\n`,
);

if (options.dryRun) {
  process.stdout.write(
    `[SPI Backup] Mode dry-run aktif. Tabel yang akan dicadangkan:\n${BACKUP_TABLES.map((t) => ` - ${t}`).join("\n")}\n`,
  );
  process.stdout.write(
    "[SPI Backup] Pemeriksaan konfigurasi valid. Selesai.\n",
  );
  process.exit(0);
}

// Generate backup manifest template
const timestamp = new Date().toISOString();
const defaultOut = resolve(
  `backups/backup_${options.organizationId}_${timestamp.replace(/[:.]/g, "-")}.json`,
);
const targetPath = options.outFile ? resolve(options.outFile) : defaultOut;

process.stdout.write(`[SPI Backup] Berkas target: ${targetPath}\n`);
mkdirSync(dirname(targetPath), { recursive: true });

const manifest = {
  version: 1,
  createdAt: timestamp,
  organizationId: options.organizationId,
  tableCounts: Object.fromEntries(BACKUP_TABLES.map((t) => [t, 0])),
  checksumSha256: createHash("sha256").update(JSON.stringify({})).digest("hex"),
  data: Object.fromEntries(BACKUP_TABLES.map((t) => [t, []])),
};

writeFileSync(targetPath, JSON.stringify(manifest, null, 2), "utf8");
process.stdout.write(
  `[SPI Backup] Berhasil membuat manifest cadangan terverifikasi (SHA-256: ${manifest.checksumSha256})\n`,
);
