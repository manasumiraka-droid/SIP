import { expect, test, type Page } from "@playwright/test";
async function openForm(page: Page) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: {
          displayName: "Admin Uji",
          roles: ["super_admin"],
          permissions: ["user.manage_role"],
          timezone: "Asia/Makassar",
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Lainnya" }).last().click();
  await page
    .getByRole("button", { name: "Tambah pengurus", exact: true })
    .click();
}
test("validates and confirms creation on mobile", async ({ page }) => {
  let created = false;
  await page.route("**/api/v1/users", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({
        displayName: "Pengurus Baru",
        email: "new@example.invalid",
        roles: ["admin"],
      });
      created = true;
      await route.fulfill({
        status: 201,
        json: { request_id: "test", data: { id: "new-user", version: 1 } },
      });
    } else
      await route.fulfill({
        json: {
          request_id: "test",
          data: created
            ? [
                {
                  id: "new-user",
                  displayName: "Pengurus Baru",
                  status: "active",
                  version: 1,
                  roles: ["admin"],
                },
              ]
            : [],
          next_cursor: null,
        },
      });
  });
  await openForm(page);
  await page.getByRole("button", { name: "Tinjau akun baru" }).click();
  await expect(page.getByLabel("Nama tampilan")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Email akses")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Nama tampilan").fill("  Pengurus   Baru ");
  await page.getByLabel("Email akses").fill("NEW@example.invalid");
  await page.getByLabel("Admin/Sekretariat", { exact: true }).check();
  await page.getByRole("button", { name: "Tinjau akun baru" }).click();
  await expect(
    page.getByRole("heading", { name: "Konfirmasi akun baru" }),
  ).toBeVisible();
  expect(created).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "dist/qa/mobile-create-user.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Konfirmasi buat akun" }).click();
  await expect(page.getByText("Akun pengurus berhasil dibuat.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Atur peran Pengurus Baru" }),
  ).toBeVisible();
});
test("uncertain network response reuses idempotency key and retains identity", async ({
  page,
}) => {
  const keys: string[] = [];
  await page.route("**/api/v1/users", async (route) => {
    if (route.request().method() === "POST") {
      keys.push(route.request().headers()["idempotency-key"] ?? "");
      if (keys.length === 1) await route.abort();
      else
        await route.fulfill({
          status: 201,
          json: { request_id: "test", data: { id: "new-user", version: 1 } },
        });
    } else
      await route.fulfill({
        json: { request_id: "test", data: [], next_cursor: null },
      });
  });
  await openForm(page);
  await page.getByLabel("Nama tampilan").fill("Pengurus Baru");
  await page.getByLabel("Email akses").fill("new@example.invalid");
  await page.getByLabel("Admin/Sekretariat", { exact: true }).check();
  await page.getByRole("button", { name: "Tinjau akun baru" }).click();
  await page.getByRole("button", { name: "Konfirmasi buat akun" }).click();
  await expect(
    page.getByText(
      "Hasil penyimpanan belum dapat dipastikan. Coba kembali dengan isian yang sama.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Email akses")).toHaveValue(
    "new@example.invalid",
  );
  await page.getByRole("button", { name: "Konfirmasi buat akun" }).click();
  await expect(page.getByText("Akun pengurus berhasil dibuat.")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
});
