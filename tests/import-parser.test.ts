import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseXlsx, suggestMapping } from "../apps/worker/src/xlsx-parser";
import { normalizeRow } from "../apps/worker/src/import-validation";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const fixture = async () =>
  new Uint8Array(await readFile("apps/web/public/form-jadwal-ibadah.xlsx"));

it("parses the blank schedule template", async () => {
  const parsed = await parseXlsx(await fixture());
  const mapping = suggestMapping(parsed.headers);
  expect(parsed.sheetName).toBe("Jadwal Ibadah");
  expect(parsed.rows).toEqual([]);
  expect(mapping["Pelayan Firman"]).toBe("Pelayan Firman");
});

it("rejects a non-ZIP payload before workbook parsing", async () => {
  await expect(parseXlsx(new Uint8Array([1, 2, 3]))).rejects.toThrow(
    "File bukan XLSX yang valid.",
  );
});

it("rejects macro payloads and oversized cells during safe preflight", async () => {
  const workbook = unzipSync(await fixture());
  workbook["xl/vbaProject.bin"] = new Uint8Array([1]);
  await expect(parseXlsx(zipSync(workbook))).rejects.toThrow("Macro");

  delete workbook["xl/vbaProject.bin"];
  const sheetFile = workbook["xl/worksheets/sheet1.xml"];
  if (!sheetFile) throw new Error("Synthetic worksheet missing");
  const sheet = strFromU8(sheetFile);
  workbook["xl/worksheets/sheet1.xml"] = strToU8(
    sheet.replace(
      '<x:c r="A2" s="8" />',
      `<x:c r="A2" s="8" t="str"><x:v>${"x".repeat(2001)}</x:v></x:c>`,
    ),
  );
  await expect(parseXlsx(zipSync(workbook))).rejects.toThrow("Panjang sel");
});

it("does not execute formulas", async () => {
  const workbook = unzipSync(await fixture());
  const sheetFile = workbook["xl/worksheets/sheet1.xml"];
  if (!sheetFile) throw new Error("Synthetic worksheet missing");
  const sheet = strFromU8(sheetFile);
  workbook["xl/worksheets/sheet1.xml"] = strToU8(
    sheet.replace(
      '<x:c r="A2" s="8" />',
      '<x:c r="A2" s="8"><x:f>1+1</x:f><x:v>2</x:v></x:c>',
    ),
  );
  const parsed = await parseXlsx(zipSync(workbook));
  expect(JSON.stringify(parsed.rows)).not.toContain("1+1");
});

it("blocks an ambiguous date until a format is confirmed", () => {
  const normalized = normalizeRow(
    {
      Nomor: "1",
      tanggal: "14/09/2026",
      "Tempat Kebaktian/Ibadah": "Sintetis",
      "Pelayan Firman": "Pelayan Sintetis",
    },
    {
      Nomor: "Nomor",
      tanggal: "tanggal",
      "Tempat Kebaktian/Ibadah": "Tempat Kebaktian/Ibadah",
      "Pelayan Firman": "Pelayan Firman",
      MC: null,
      "Pelayan Persembahan": null,
    },
  );
  expect(normalized.errors).toContain("AMBIGUOUS_DATE_FORMAT");
});
