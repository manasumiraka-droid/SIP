import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

const environment = z.enum(["preview", "production"]).parse(process.argv[2]);
const apply = process.argv.includes("--apply");
const input = z
  .object({
    accountId: z.string().min(1).max(64),
    apiToken: z.string().min(20),
    botToken: z.string().regex(/^\d{8,12}:[A-Za-z0-9_-]{35,}$/),
    webhookSecret: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  })
  .parse({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  });
const configPath = resolve(`.wrangler/generated/${environment}.json`);
if (!existsSync(configPath))
  throw new Error(`Konfigurasi ${environment} belum dibuat.`);
if (!apply) {
  process.stdout.write(
    `Input secret Telegram ${environment} valid. Tambahkan --apply untuk menyimpan.\n`,
  );
  process.exit(0);
}
if (process.env.SPI_TELEGRAM_SECRET_CONFIRM !== `configure-${environment}`)
  throw new Error("Konfirmasi secret Telegram tidak cocok.");
const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "secret",
    "bulk",
    "--config",
    configPath,
  ],
  {
    input: JSON.stringify({
      TELEGRAM_BOT_TOKEN: input.botToken,
      TELEGRAM_WEBHOOK_SECRET: input.webhookSecret,
    }),
    encoding: "utf8",
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: input.accountId,
      CLOUDFLARE_API_TOKEN: input.apiToken,
      XDG_CONFIG_HOME: resolve(".wrangler/config"),
      WRANGLER_LOG_PATH: resolve(".wrangler/logs"),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
if (result.status !== 0) {
  process.stderr.write(
    result.stderr
      .replaceAll(input.botToken, "[REDACTED]")
      .replaceAll(input.webhookSecret, "[REDACTED]"),
  );
  throw new Error(`Secret Telegram ${environment} gagal disimpan.`);
}
process.stdout.write(
  `Secret Telegram ${environment} berhasil disimpan tanpa mencetak nilainya.\n`,
);
