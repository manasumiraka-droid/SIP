import { expect, test } from "@playwright/test";
test("Super Admin reviews and saves multiple roles on mobile", async ({
  page,
}) => {
  let saved = false;
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: {
          displayName: "Pengurus Uji",
          roles: ["super_admin"],
          permissions: ["user.manage_role"],
          timezone: "Asia/Makassar",
        },
      },
    }),
  );
  await page.route("**/api/v1/users", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: [
          {
            id: "target",
            displayName: "Pelayan Uji",
            status: "active",
            version: saved ? 2 : 1,
            roles: saved ? ["admin", "servant"] : ["servant"],
          },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.route("**/api/v1/users/target/roles", async (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers()["idempotency-key"]).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(route.request().postDataJSON()).toEqual({
      roles: ["admin", "servant"],
      version: 1,
    });
    saved = true;
    await route.fulfill({ json: { request_id: "test", data: { version: 2 } } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Lainnya" }).last().click();
  await page.getByRole("button", { name: "Atur peran Pelayan Uji" }).click();
  await page.getByLabel("Admin/Sekretariat", { exact: true }).check();
  await page.getByRole("button", { name: "Tinjau perubahan" }).click();
  await expect(
    page.getByRole("heading", { name: "Konfirmasi perubahan akses" }),
  ).toBeVisible();
  expect(saved).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "dist/qa/mobile-roles.png", fullPage: true });
  await page.getByRole("button", { name: "Konfirmasi dan simpan" }).click();
  await expect(
    page.getByText("Peran pengguna berhasil diperbarui."),
  ).toBeVisible();
});
test("stale update keeps selections and blocks repeated save", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: {
          displayName: "Admin",
          roles: ["super_admin"],
          permissions: ["user.manage_role"],
          timezone: "Asia/Makassar",
        },
      },
    }),
  );
  await page.route("**/api/v1/users", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: [
          {
            id: "target",
            displayName: "Pelayan Uji",
            status: "active",
            version: 1,
            roles: ["servant"],
          },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.route("**/api/v1/users/target/roles", (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "VERSION_CONFLICT" } },
    }),
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Lainnya" }).last().click();
  await page.getByRole("button", { name: "Atur peran Pelayan Uji" }).click();
  await page.getByRole("button", { name: "Tinjau perubahan" }).click();
  await page.getByRole("button", { name: "Konfirmasi dan simpan" }).click();
  await expect(
    page.getByText(
      "Data berubah saat Anda mengedit. Muat ulang pengguna sebelum melanjutkan.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Pelayan", { exact: true })).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Konfirmasi dan simpan" }),
  ).toBeDisabled();
});
