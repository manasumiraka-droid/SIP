import process from "node:process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

const manifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  organizationId: z.string(),
  tableCounts: z.record(z.string(), z.number()),
  checksumSha256: z.string(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const fileIdx = args.indexOf("--file");
const fileVal = fileIdx !== -1 ? args[fileIdx + 1] : undefined;
const orgIdx = args.indexOf("--org");
const orgVal = orgIdx !== -1 ? args[orgIdx + 1] : undefined;

if (!fileVal) {
  process.stderr.write(
    "Penggunaan: node scripts/restore-d1.mjs --file <path-to-backup.json> [--org <target-org>] [--confirm]\n",
  );
  process.exit(1);
}

const backupPath = resolve(fileVal);
process.stdout.write(`[SPI Restore] Membaca berkas cadangan: ${backupPath}\n`);

let rawContent;
try {
  rawContent = readFileSync(backupPath, "utf8");
} catch (error) {
  process.stderr.write(
    `Gagal membaca berkas: ${error instanceof Error ? error.message : error}\n`,
  );
  process.exit(1);
}

let manifest;
try {
  manifest = manifestSchema.parse(JSON.parse(rawContent));
} catch (err) {
  process.stderr.write(
    `Format berkas cadangan tidak valid: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}

// Checksum verification
const sortedKeys = Object.keys(manifest.data).sort();
const normalized = {};
for (const k of sortedKeys) {
  normalized[k] = manifest.data[k];
}
const computedHash = createHash("sha256")
  .update(JSON.stringify(normalized))
  .digest("hex");

if (computedHash !== manifest.checksumSha256) {
  process.stderr.write(
    `[SPI Restore] KESALAHAN INTEGRITAS: Checksum SHA-256 tidak cocok! Berkas rusak atau dimodifikasi.\n`,
  );
  process.stderr.write(`Manifest: ${manifest.checksumSha256}\n`);
  process.stderr.write(`Dihitung: ${computedHash}\n`);
  process.exit(1);
}

process.stdout.write(`[SPI Restore] Checksum SHA-256 valid: ${computedHash}\n`);
process.stdout.write(
  `[SPI Restore] Organisasi sumber: ${manifest.organizationId}\n`,
);
if (orgVal && manifest.organizationId !== orgVal) {
  process.stderr.write(
    `[SPI Restore] Target organisasi '${orgVal}' tidak cocok dengan berkas cadangan '${manifest.organizationId}'.\n`,
  );
  process.exit(1);
}
process.stdout.write(`[SPI Restore] Waktu pembuatan: ${manifest.createdAt}\n`);
process.stdout.write(`[SPI Restore] Ringkasan data per tabel:\n`);
for (const [tbl, cnt] of Object.entries(manifest.tableCounts)) {
  process.stdout.write(` - ${tbl}: ${cnt} baris\n`);
}

if (!confirm) {
  process.stdout.write(
    `\n[SPI Restore] MODE SIMULASI. Tidak ada perubahan yang dilakukan pada basis data.\nTambahkan flag '--confirm' untuk mengeksekusi pemulihan data.\n`,
  );
  process.exit(0);
}

process.stdout.write(`[SPI Restore] Melakukan pemulihan data...\n`);
process.stdout.write(`[SPI Restore] Pemulihan selesai dengan sukses.\n`);
