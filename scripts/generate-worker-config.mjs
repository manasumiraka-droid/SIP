import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";
import { z } from "zod";
const environment = z.enum(["preview", "production"]).parse(process.argv[2]);
const values = z
  .object({
    hyperdriveId: z.string().min(1).max(100),
    otherHyperdriveId: z.string().min(1).max(100),
    appOrigin: z.url().regex(/^https:\/\//),
    issuer: z.url().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
    audience: z.string().min(1),
    organizationId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    workerRoute: z.string().regex(/^[a-z0-9.-]+\/api\/\*$/),
    telegramWebhookRoute: z.string().regex(/^[a-z0-9.-]+\/telegram\/webhook$/),
    zoneName: z.string().regex(/^[a-z0-9.-]+$/),
    authNamespace: z.string().regex(/^\d+$/),
    mutationNamespace: z.string().regex(/^\d+$/),
    otherAuthNamespace: z.string().regex(/^\d+$/),
    otherMutationNamespace: z.string().regex(/^\d+$/),
    telegramDeliveryEnabled: z.enum(["true", "false"]),
  })
  .parse({
    hyperdriveId: process.env.SPI_HYPERDRIVE_ID,
    otherHyperdriveId: process.env.SPI_OTHER_HYPERDRIVE_ID,
    appOrigin: process.env.SPI_APP_ORIGIN,
    issuer: process.env.SPI_ACCESS_ISSUER,
    audience: process.env.SPI_ACCESS_AUDIENCE,
    organizationId: process.env.SPI_ORGANIZATION_ID,
    workerRoute: process.env.SPI_WORKER_ROUTE,
    telegramWebhookRoute: process.env.SPI_TELEGRAM_WEBHOOK_ROUTE,
    zoneName: process.env.SPI_ZONE_NAME,
    authNamespace: process.env.SPI_AUTH_RATE_LIMIT_NAMESPACE_ID,
    mutationNamespace: process.env.SPI_MUTATION_RATE_LIMIT_NAMESPACE_ID,
    otherAuthNamespace: process.env.SPI_OTHER_AUTH_RATE_LIMIT_NAMESPACE_ID,
    otherMutationNamespace:
      process.env.SPI_OTHER_MUTATION_RATE_LIMIT_NAMESPACE_ID,
    telegramDeliveryEnabled: process.env.SPI_TELEGRAM_DELIVERY_ENABLED,
  });
if (process.env.SPI_ENVIRONMENT !== environment)
  throw new Error("SPI_ENVIRONMENT tidak cocok dengan konfigurasi target.");
if (environment === "preview" && values.telegramDeliveryEnabled !== "false")
  throw new Error("Pengiriman Telegram nyata wajib nonaktif di preview.");
if (values.hyperdriveId === values.otherHyperdriveId)
  throw new Error("Hyperdrive preview dan production wajib berbeda.");
if (
  new Set([
    values.authNamespace,
    values.mutationNamespace,
    values.otherAuthNamespace,
    values.otherMutationNamespace,
  ]).size !== 4
)
  throw new Error("Namespace rate limit preview dan production wajib berbeda.");
if (
  values.telegramWebhookRoute !==
  `${values.workerRoute.slice(0, -"/api/*".length)}/telegram/webhook`
)
  throw new Error(
    "Route webhook Telegram harus memakai host Worker API yang sama.",
  );
const target = resolve(`.wrangler/generated/${environment}.json`);
await mkdir(resolve(".wrangler/generated"), { recursive: true });
await writeFile(
  target,
  JSON.stringify(
    {
      name: `spi-api-${environment}`,
      main: resolve("apps/worker/src/index.ts"),
      compatibility_date: "2026-09-08",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: false,
      triggers: { crons: ["0 3 * * *"] },
      routes: [
        { pattern: values.workerRoute, zone_name: values.zoneName },
        {
          pattern: values.telegramWebhookRoute,
          zone_name: values.zoneName,
        },
      ],
      vars: {
        ENVIRONMENT: environment,
        APP_ORIGIN: values.appOrigin,
        ACCESS_ISSUER: values.issuer,
        ACCESS_AUDIENCE: values.audience,
        ORGANIZATION_ID: values.organizationId,
        TELEGRAM_DELIVERY_ENABLED: values.telegramDeliveryEnabled,
      },
      ratelimits: [
        {
          name: "AUTH_LIMITER",
          namespace_id: values.authNamespace,
          simple: { limit: 30, period: 60 },
        },
        {
          name: "MUTATION_LIMITER",
          namespace_id: values.mutationNamespace,
          simple: { limit: 20, period: 60 },
        },
      ],
      hyperdrive: [
        {
          binding: "HYPERDRIVE",
          id: values.hyperdriveId,
        },
      ],
    },
    null,
    2,
  ),
);
process.stdout.write(`${target}\n`);
