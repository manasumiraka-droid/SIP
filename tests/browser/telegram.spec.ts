import { expect, test } from "@playwright/test";

test("pengurus membuat kode aktivasi Telegram sekali pakai pada ponsel", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: {
          displayName: "Admin Uji",
          roles: ["admin"],
          permissions: ["servant.create_update"],
          timezone: "Asia/Makassar",
        },
      },
    }),
  );
  await page.route("**/api/v1/services?limit=20", (route) =>
    route.fulfill({ json: { request_id: "test", data: [] } }),
  );
  await page.route("**/api/v1/servants?limit=100", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: [
          {
            id: "servant-one",
            displayName: "Pelayan Sintetis",
            status: "active",
          },
          {
            id: "servant-two",
            displayName: "Pelayan Belum Aktif",
            status: "pending_review",
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/telegram-deliveries?limit=20", (route) =>
    route.fulfill({
      json: {
        request_id: "test",
        data: [
          {
            id: "failure-one",
            servantName: "Pelayan Sintetis",
            attemptCount: 3,
            errorCategory: "telegram_permanent",
          },
        ],
      },
    }),
  );
  let activationRequests = 0;
  await page.route(
    "**/api/v1/servants/servant-one/telegram-activation",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers()["idempotency-key"]).toMatch(
        /^[0-9a-f-]{36}$/u,
      );
      expect(route.request().postDataJSON()).toEqual({});
      activationRequests += 1;
      await route.fulfill({
        status: 201,
        json: {
          request_id: "test",
          data: {
            code: "ABCD234567",
            expiresAt: "2026-09-09T15:15:00Z",
            maxAttempts: 5,
          },
        },
      });
    },
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Lainnya" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Aktivasi Telegram" }),
  ).toBeVisible();
  await expect(page.getByText("Perlu tindak lanjut manual")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buat kode" })).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Buat kode" }).nth(1),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Buat kode" }).first().click();
  await expect(page.getByText("ABCD234567")).toBeVisible();
  await expect(
    page.getByText("Kode tidak dapat dilihat kembali.", { exact: false }),
  ).toBeVisible();
  expect(activationRequests).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
