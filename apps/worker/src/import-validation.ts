import { ApplicationError } from "../../../packages/domain/src/errors";
export type ImportMapping = Record<string, string | null>;
export type ImportDateFormat = "dmy" | "mdy";
const text = (v: string) => v.normalize("NFC").replace(/\s+/gu, " ").trim();
export const normalize = (v: string) => text(v).toLocaleLowerCase("id-ID");
export function normalizeRow(
  raw: Record<string, string>,
  mapping: ImportMapping,
  format?: ImportDateFormat,
) {
  const get = (key: string) => {
    const source = mapping[key];
    return text(source ? (raw[source] ?? "") : "");
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceNumber = get("Nomor");
  const date = get("tanggal");
  const location = get("Tempat Kebaktian/Ibadah");
  const preacher = get("Pelayan Firman");
  if (!sourceNumber) errors.push("SOURCE_NUMBER_REQUIRED");
  if (!date) errors.push("DATE_REQUIRED");
  if (!location) errors.push("LOCATION_REQUIRED");
  if (!preacher) errors.push("PREACHER_REQUIRED");
  let iso: string | null = null;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(date);
  if (match) {
    if (!format) errors.push("AMBIGUOUS_DATE_FORMAT");
    else {
      const a = Number(match[1]),
        b = Number(match[2]),
        year = Number(match[3]),
        day = format === "dmy" ? a : b,
        month = format === "dmy" ? b : a;
      const check = new Date(Date.UTC(year, month - 1, day));
      if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
      )
        errors.push("DATE_INVALID");
      else
        iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:00:00.000Z`;
    }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) iso = `${date}T09:00:00.000Z`;
  else errors.push("DATE_INVALID");
  const offering = get("Pelayan Persembahan")
    .split(";")
    .map(text)
    .filter(Boolean);
  if (get("Pelayan Persembahan") && offering.length === 0)
    warnings.push("OFFERING_EMPTY");
  return {
    sourceNumber,
    date,
    location,
    locationNormalized: normalize(location),
    preacher,
    mc: get("MC"),
    offering,
    startsAt: iso,
    assemblyAt: iso?.replace("T09:00:00.000Z", "T08:30:00.000Z") ?? null,
    endsAt: iso?.replace("T09:00:00.000Z", "T11:00:00.000Z") ?? null,
    errors,
    warnings,
  };
}
export function assertBatchWritable(status: string) {
  if (!["uploaded", "needs_review", "ready"].includes(status))
    throw new ApplicationError(
      "CONFLICT",
      409,
      "Batch impor tidak dapat diubah.",
    );
}
