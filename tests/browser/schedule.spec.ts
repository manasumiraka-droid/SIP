import { expect, test } from "@playwright/test";

test("admin reviews and creates a draft service on mobile", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: {
          displayName: "Admin Uji",
          roles: ["admin"],
          permissions: ["service.create_update"],
          timezone: "Asia/Makassar",
        },
      },
    }),
  );
  let created = false;
  await page.route("**/api/v1/services?limit=20", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: [
          {
            id: "service-1",
            startsAt: "2026-09-14T09:00:00Z",
            assemblyAt: "2026-09-14T08:00:00Z",
            endsAt: "2026-09-14T11:00:00ZZ",
            location: "Ruang Utama",
            status: "scheduled",
            theme: "Ibadah Minggu",
            assignmentCount: 2,
            confirmedCount: 1,
          },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.route("**/api/v1/services", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as Record<string, string>;
    expect(body).toMatchObject({
      theme: "Ibadah Pemuda",
      location: "Kapel",
      assemblyAt: "2026-09-20T08:00:00.000Z",
      startsAt: "2026-09-20T09:00:00.000Z",
      endsAt: "2026-09-20T11:00:00.000Z",
    });
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    created = true;
    await route.fulfill({
      status: 201,
      json: {
        request_id: "test",
        data: { id: "service-2", status: "draft", version: 1 },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Kalender" }).last().click();
  await expect(
    page.getByText("1 dari 2 penugasan terkonfirmasi"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tambah ibadah" }).click();
  await page.getByLabel("Nama ibadah").fill("Ibadah Pemuda");
  await page.getByLabel("Lokasi").fill("Kapel");
  await page.getByLabel("Waktu hadir (WITA)").fill("2026-09-20T16:00");
  await page.getByLabel("Waktu mulai (WITA)").fill("2026-09-20T17:00");
  await page.getByLabel("Perkiraan selesai (WITA)").fill("2026-09-20T19:00");
  await page.getByRole("button", { name: "Simpan draf" }).click();
  await expect(page.getByText("Ibadah tersimpan sebagai draf.")).toBeVisible();
  expect(created).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
