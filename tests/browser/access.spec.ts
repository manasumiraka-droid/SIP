import { expect, test } from "@playwright/test";
test("mobile access denial, retry and verified empty state", async ({
  page,
}) => {
  let allowed = false;
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      status: allowed ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(
        allowed
          ? {
              request_id: "synthetic",
              data: {
                displayName: "Pengurus Uji",
                roles: ["admin"],
                permissions: ["user.read"],
                timezone: "Asia/Makassar",
              },
            }
          : { error: { code: "UNAUTHENTICATED" } },
      ),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Akses pengurus diperlukan" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const box = await page
    .getByRole("button", { name: "Periksa kembali" })
    .boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: "dist/qa/mobile-access.png", fullPage: true });
  allowed = true;
  await page.getByRole("button", { name: "Periksa kembali" }).click();
  await expect(
    page.getByRole("heading", { name: "Selamat pagi, Pengurus." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Lainnya" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Pengaturan dan audit" }),
  ).toBeVisible();
});
test("loading and network failure provide a retry", async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/me", async (route) => {
    await pending;
    await route.abort();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Memeriksa akses…" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: "Layanan belum dapat dihubungi" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Periksa kembali" }),
  ).toBeVisible();
});
