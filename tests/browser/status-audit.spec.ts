import { expect, test } from "@playwright/test";
test("Super Admin confirms account suspension on mobile", async ({ page }) => {
  let status: "active" | "suspended" = "active";
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
  await page.route("**/api/v1/audit-logs", (route) =>
    route.fulfill({
      json: { request_id: "test", data: [], next_cursor: null },
    }),
  );
  await page.route("**/api/v1/users**", async (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toEqual({
        status: "suspended",
        version: 1,
      });
      status = "suspended";
      await route.fulfill({
        json: { request_id: "test", data: { status, version: 2 } },
      });
    } else
      await route.fulfill({
        json: {
          request_id: "test",
          data: [
            {
              id: "target",
              displayName: "Pengurus Target",
              status,
              version: status === "active" ? 1 : 2,
              roles: ["admin"],
            },
          ],
          next_cursor: null,
        },
      });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Lainnya" }).last().click();
  await page
    .getByRole("button", { name: "Ubah status Pengurus Target" })
    .click();
  await page.getByLabel("Ditangguhkan").check();
  await page.getByRole("button", { name: "Tinjau perubahan status" }).click();
  await expect(
    page.getByRole("heading", { name: "Konfirmasi perubahan status" }),
  ).toBeVisible();
  expect(status).toBe("active");
  await page.screenshot({
    path: "dist/qa/mobile-account-status.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Konfirmasi dan simpan" }).click();
  await expect(
    page.getByText("Status akun berhasil diperbarui."),
  ).toBeVisible();
});
test("Admin sees redacted audit list and pagination", async ({ page }) => {
  let second = false;
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: {
          displayName: "Admin Uji",
          roles: ["admin"],
          permissions: ["audit.read"],
          timezone: "Asia/Makassar",
        },
      },
    }),
  );
  await page.route("**/api/v1/audit-logs*", (route) => {
    second = new URL(route.request().url()).searchParams.has("cursor");
    return route.fulfill({
      json: {
        request_id: "test",
        data: [
          {
            id: second ? "audit2" : "audit1",
            actorType: "user",
            actorId: "actor",
            action: second ? "user.create" : "user.roles.replace",
            entityType: "user",
            entityId: "target",
            requestId: second ? "req2" : "req1",
            metadata: { roles: ["admin"] },
            createdAt: second
              ? "2026-09-07T01:00:00.000Z"
              : "2026-09-08T01:00:00.000Z",
          },
        ],
        next_cursor: second ? null : "cursor_safe",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Lainnya" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Riwayat audit" }),
  ).toBeVisible();
  await expect(page.getByText("Peran diperbarui")).toBeVisible();
  await expect(page.getByText(/@|token|email/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Muat riwayat berikutnya" }).click();
  await expect(page.getByText("Akun dibuat")).toBeVisible();
  expect(second).toBe(true);
});
