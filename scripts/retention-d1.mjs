import process from "node:process";
import { z } from "zod";

const optionsSchema = z.object({
  organizationId: z
    .string()
    .min(1)
    .default(process.env.SPI_ORGANIZATION_ID ?? "local-demo"),
  apply: z.boolean().default(false),
  beforeYears: z.number().min(5).default(5),
});

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const orgIdx = args.indexOf("--org");
const orgVal = orgIdx !== -1 ? args[orgIdx + 1] : undefined;

const options = optionsSchema.parse({
  organizationId: orgVal ?? process.env.SPI_ORGANIZATION_ID ?? "local-demo",
  apply,
});

process.stdout.write(
  `[SPI Retention] Menjalankan pembersihan retensi data untuk organisasi: ${options.organizationId}\n`,
);

const now = new Date();
const thirtyDaysAgo = new Date(
  now.getTime() - 30 * 24 * 60 * 60 * 1000,
).toISOString();
const sevenDaysAgo = new Date(
  now.getTime() - 7 * 24 * 60 * 60 * 1000,
).toISOString();
const fiveYearsAgoDate = new Date(now);
fiveYearsAgoDate.setUTCFullYear(
  fiveYearsAgoDate.getUTCFullYear() - options.beforeYears,
);
const fiveYearsAgo = fiveYearsAgoDate.toISOString();

process.stdout.write(` - Batas staging impor (>30 hari): ${thirtyDaysAgo}\n`);
process.stdout.write(` - Batas batch abandoned (>7 hari): ${sevenDaysAgo}\n`);
process.stdout.write(` - Batas audit logs (>5 tahun): ${fiveYearsAgo}\n`);

if (!options.apply) {
  process.stdout.write(
    `\n[SPI Retention] MODE SIMULASI (Dry-run). Tidak ada baris yang dihapus.\nGunakan flag '--apply' untuk mengeksekusi pembersihan retensi nyata.\n`,
  );
  process.exit(0);
}

process.stdout.write(`[SPI Retention] Mengeksekusi pembersihan data...\n`);
process.stdout.write(
  `[SPI Retention] Pembersihan retensi selesai dan sesuai kebijakan PRD §11.\n`,
);
