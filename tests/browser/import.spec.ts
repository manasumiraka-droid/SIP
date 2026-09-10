import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("admin downloads, selects a sheet, maps, and reviews an import", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: {
          displayName: "Admin Uji",
          roles: ["admin"],
          permissions: ["import.schedule"],
          timezone: "Asia/Makassar",
        },
      },
    }),
  );
  await page.route("**/api/v1/imports/schedules", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 201,
      json: {
        request_id: "test",
        data: {
          id: "batch-1",
          headers: [
            "Nomor",
            "tanggal",
            "Tempat Kebaktian/Ibadah",
            "Pelayan Firman",
            "MC",
            "Pelayan Persembahan",
          ],
          mapping: {
            Nomor: "Nomor",
            tanggal: "tanggal",
            "Tempat Kebaktian/Ibadah": "Tempat Kebaktian/Ibadah",
            "Pelayan Firman": "Pelayan Firman",
            MC: "MC",
            "Pelayan Persembahan": "Pelayan Persembahan",
          },
        },
      },
    });
  });
  await page.route("**/api/v1/imports/schedules/batch-1/validate", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: { id: "batch-1", status: "needs_review" },
      },
    }),
  );
  await page.route(
    "**/api/v1/imports/schedules/batch-1/preview?limit=100",
    (route) =>
      route.fulfill({
        json: {
          request_id: "test",
          batch: {
            id: "batch-1",
            status: "needs_review",
            sheet_name: "Jadwal Ibadah",
          },
          summary: {
            total: 1,
            valid: 0,
            warnings: 1,
            errors: 0,
            excluded: 0,
            duplicates: 1,
          },
          next_cursor: null,
          data: [
            {
              id: "row-1",
              row_number: 2,
              source_number: "1",
              status: "warning",
              errors: [],
              warnings: ["DUPLICATE_SERVICE"],
              proposed_action: "skip",
              duplicate_service_id: "service-1",
              warnings_acknowledged_at: null,
              normalized: {
                date: "14/09/2026",
                location: "Ruang Utama",
                preacher: "Pelayan A",
                mc: "",
                startsAt: "2026-09-14T09:00:00.000Z",
              },
            },
          ],
        },
      }),
  );
  await page.route("**/api/v1/imports/schedules/batch-1/servants", (route) =>
    route.fulfill({ json: { request_id: "test", data: [] } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Unduh form jadwal ibadah.xlsx" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lanjutkan impor" }).click();
  await expect(
    page.getByRole("link", { name: "Unduh form jadwal ibadah.xlsx" }),
  ).toHaveAttribute("download", "form-jadwal-ibadah.xlsx");
  await page
    .getByLabel("Pilih file XLSX")
    .setInputFiles(resolve("apps/web/public/form-jadwal-ibadah.xlsx"));
  await expect(page.getByLabel("Sheet yang akan diimpor")).toHaveValue(
    "Jadwal Ibadah",
  );
  await page.getByRole("button", { name: "1. Upload" }).click();
  await expect(page.getByText("Periksa pemetaan kolom")).toBeVisible();
  await page.getByRole("button", { name: "2. Validasi d/m/yyyy" }).click();
  await expect(page.getByText(/Total 1 · valid 0 · warning 1/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Saya memahami warning" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
