import readXlsxFile from "read-excel-file/universal";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  IMPORT_FILE_SIZE_LABEL,
  IMPORT_LIMITS,
  importColumns,
} from "../../../packages/validation/src/imports";

export { IMPORT_LIMITS };
const required = importColumns;
export type ParsedSheet = {
  sheets: string[];
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
};
const fail = (message: string): never => {
  throw new ApplicationError("VALIDATION_FAILED", 422, message);
};
function entries(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    fail("File bukan XLSX yang valid.");
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 5 &&
      bytes[i + 3] === 6
    ) {
      eocd = i;
      break;
    }
  if (eocd < 0) fail("Struktur ZIP XLSX tidak valid.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  if (count > IMPORT_LIMITS.zipEntries || offset >= bytes.length)
    fail("Struktur XLSX melebihi batas aman.");
  let at = offset,
    total = 0;
  const names: string[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50)
      fail("Direktori XLSX rusak.");
    const flags = view.getUint16(at + 8, true),
      size = view.getUint32(at + 24, true),
      len = view.getUint16(at + 28, true),
      extra = view.getUint16(at + 30, true),
      comment = view.getUint16(at + 32, true);
    if (flags & 1) fail("Workbook terenkripsi tidak didukung.");
    total += size;
    if (total > IMPORT_LIMITS.uncompressedBytes)
      fail("Ukuran XLSX setelah dibuka melebihi batas aman.");
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + len),
    );
    if (name.includes("..") || name.startsWith("/") || name.length > 300)
      fail("Nama entri XLSX tidak aman.");
    names.push(name.toLowerCase());
    at += 46 + len + extra + comment;
  }
  if (
    names.some(
      (name) =>
        name.includes("vbaproject") ||
        name.includes("macrosheets") ||
        name.includes("externallinks/") ||
        name.includes("embeddings/") ||
        name.includes("media/"),
    )
  )
    fail("Macro, tautan eksternal, atau objek tersemat tidak didukung.");
}
function cell(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  const text = String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
  if (text.length > IMPORT_LIMITS.cellChars)
    fail("Panjang sel melebihi batas aman.");
  return text;
}
export async function parseXlsx(
  bytes: Uint8Array,
  selectedSheet?: string,
): Promise<ParsedSheet> {
  if (bytes.byteLength > IMPORT_LIMITS.bytes)
    fail(`Ukuran file maksimum ${IMPORT_FILE_SIZE_LABEL}.`);
  entries(bytes);
  const sheets = await (() => {
    try {
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return readXlsxFile(new Blob([copy]));
    } catch {
      return fail("Workbook XLSX tidak dapat dibaca.");
    }
  })().catch(() => fail("Workbook XLSX tidak dapat dibaca."));
  if (sheets.length === 0 || sheets.length > IMPORT_LIMITS.sheets)
    fail("Workbook tidak didukung.");
  const sheetNames = sheets.map((sheet) => sheet.sheet);
  const defaultSheet =
    sheetNames.at(0) ?? fail("Workbook tidak memiliki sheet.");
  const sheetName: string = selectedSheet ?? defaultSheet;
  const sheet =
    sheets.find((candidate) => candidate.sheet === sheetName) ??
    fail("Sheet yang dipilih tidak ditemukan.");
  const matrix = sheet.data;
  if (matrix.length === 0 || matrix.length - 1 > IMPORT_LIMITS.rows)
    fail("Jumlah baris XLSX melebihi batas aman.");
  const headers = (matrix[0] ?? []).slice(0, IMPORT_LIMITS.columns).map(cell);
  if ((matrix[0] ?? []).length > IMPORT_LIMITS.columns)
    fail("Jumlah kolom melebihi batas aman.");
  const rows = matrix
    .slice(1)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, cell(values[index])]),
      ),
    );
  return { sheets: sheetNames, sheetName, headers, rows };
}
export function suggestMapping(headers: string[]) {
  const canonical = (v: string) =>
    v.toLocaleLowerCase("id-ID").replace(/\s+/gu, " ").trim();
  return Object.fromEntries(
    required.map((target) => [
      target,
      headers.find((header) => canonical(header) === canonical(target)) ?? null,
    ]),
  );
}
