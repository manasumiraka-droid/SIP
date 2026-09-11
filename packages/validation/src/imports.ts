import { z } from "zod";

/** Canonical XLSX column names accepted by the schedule import pipeline. */
export const importColumns = [
  "Nomor",
  "tanggal",
  "Tempat Kebaktian/Ibadah",
  "Pelayan Firman",
  "MC",
  "Pelayan Persembahan",
] as const;

export type ImportColumn = (typeof importColumns)[number];

/** Safety limits applied while parsing and storing an imported workbook. */
export const IMPORT_LIMITS = {
  bytes: 5 * 1024 * 1024,
  rows: 5000,
  sheets: 16,
  columns: 64,
  cellChars: 2000,
  zipEntries: 2000,
  uncompressedBytes: 20 * 1024 * 1024,
} as const;

/** Human-readable file size limit used in validation messages. */
export const IMPORT_FILE_SIZE_LABEL = "5 MB";

export const importMappingSchema = z
  .record(z.string(), z.string().max(200).nullable())
  .refine((value) => importColumns.every((column) => column in value));
