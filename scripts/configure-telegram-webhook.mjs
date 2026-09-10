import process from "node:process";
import { URL } from "node:url";
import { z } from "zod";

const environment = z.enum(["preview", "production"]).parse(process.argv[2]);
const apply = process.argv.includes("--apply");
const input = z
  .object({
    botToken: z.string().regex(/^\d{8,12}:[A-Za-z0-9_-]{35,}$/),
    webhookSecret: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
    webhookUrl: z.url().refine((value) => {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" &&
        parsed.pathname === "/telegram/webhook" &&
        !parsed.search &&
        !parsed.hash
      );
    }, "URL webhook Telegram harus HTTPS dan berakhir tepat /telegram/webhook"),
    appOrigin: z.url(),
  })
  .parse({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    webhookUrl: process.env.SPI_TELEGRAM_WEBHOOK_URL,
    appOrigin: process.env.SPI_APP_ORIGIN,
  });
if (new URL(input.webhookUrl).host !== new URL(input.appOrigin).host)
  throw new Error(
    "Host webhook Telegram harus sama dengan origin aplikasi preview.",
  );
if (!apply) {
  process.stdout.write(
    `Input webhook Telegram ${environment} valid. Tambahkan --apply untuk mendaftarkan.\n`,
  );
  process.exit(0);
}
if (process.env.SPI_TELEGRAM_WEBHOOK_CONFIRM !== `configure-${environment}`)
  throw new Error("Konfirmasi webhook Telegram tidak cocok.");
const response = await globalThis.fetch(
  `https://api.telegram.org/bot${input.botToken}/setWebhook`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: input.webhookUrl,
      secret_token: input.webhookSecret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
  },
);
if (!response.ok)
  throw new Error(`Registrasi webhook Telegram gagal (${response.status}).`);
const result = await response.json();
if (typeof result !== "object" || result === null || result.ok !== true)
  throw new Error("Telegram menolak registrasi webhook.");
process.stdout.write(`Webhook Telegram ${environment} berhasil didaftarkan.\n`);
