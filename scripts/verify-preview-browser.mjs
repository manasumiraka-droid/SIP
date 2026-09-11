/* global console, process */
import { chromium } from "@playwright/test";
import path from "node:path";

const targetDir =
  "C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\bde45653-147c-481d-898b-1392ee585975";
const previewUrl =
  "https://spi-api-preview.manasumiraka.workers.dev/?key=czF0v2bxLESFCfZlrqFkkPdw8NusLjTrInPSxCKErJo";

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log("Navigating to preview URL:", previewUrl);
  await page.goto(previewUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1. Super Admin Beranda
  console.log("Capturing 1. Super Admin Beranda...");
  await page.screenshot({
    path: path.join(targetDir, "preview_admin_beranda.png"),
    fullPage: true,
  });

  // 2. Kalender tab
  console.log("Capturing 2. Kalender tab...");
  await page.click('nav a[href="#kalender"]');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(targetDir, "preview_kalender.png"),
    fullPage: true,
  });

  // 3. Service Detail Modal
  console.log("Capturing 3. Service Detail Modal...");
  const kelolaBtn = await page.$('button:has-text("Kelola")');
  if (kelolaBtn) {
    await kelolaBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(targetDir, "preview_service_modal.png"),
      fullPage: true,
    });
    // Close modal
    const closeBtn = await page.$('button[aria-label="Tutup"]');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(500);
  }

  // 4. Insiden tab
  console.log("Capturing 4. Insiden tab...");
  await page.click('nav a[href="#insiden"]');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(targetDir, "preview_insiden.png"),
    fullPage: true,
  });

  // 5. Laporan tab (Admin)
  console.log("Capturing 5. Laporan tab (Admin)...");
  await page.click('nav a[href="#laporan"]');
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(targetDir, "preview_laporan_admin.png"),
    fullPage: true,
  });

  // 6. Switch Persona to Pelayan (Johan Pratama)
  console.log("Switching persona to Johan Pratama...");
  await page.selectOption(
    'select[aria-label="Ganti Persona Preview"]',
    "johan.pratama@spi-preview.invalid",
  );
  await page.waitForTimeout(2000);

  // 7. Tugas Saya (Johan)
  console.log("Capturing 6. Tugas Saya (Johan)...");
  await page.click('nav a[href="#tugas"]');
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(targetDir, "preview_pelayan_tugas.png"),
    fullPage: true,
  });

  // 8. Laporan Pribadi (Johan)
  console.log("Capturing 7. Laporan Pribadi (Johan)...");
  await page.click('nav a[href="#laporan"]');
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(targetDir, "preview_pelayan_laporan.png"),
    fullPage: true,
  });

  // 9. Switch Persona to Pelayan (Rina Kurnia)
  console.log("Switching persona to Rina Kurnia...");
  await page.selectOption(
    'select[aria-label="Ganti Persona Preview"]',
    "rina.kurnia@spi-preview.invalid",
  );
  await page.waitForTimeout(2000);
  await page.click('nav a[href="#tugas"]');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(targetDir, "preview_rina_tugas.png"),
    fullPage: true,
  });

  console.log("Verification finished successfully!");
  await browser.close();
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
