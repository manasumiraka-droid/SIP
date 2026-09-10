import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
const common = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: "synthetic-account",
  CLOUDFLARE_API_TOKEN: "synthetic-token-that-is-long-enough",
  SUPABASE_DATABASE_URL:
    "postgresql://synthetic:synthetic@database.example.invalid/postgres",
  SPI_HYPERDRIVE_ID: "hyperdrive-preview",
  SPI_ENVIRONMENT: "preview",
  SPI_AUTH_RATE_LIMIT_NAMESPACE_ID: "2001",
  SPI_MUTATION_RATE_LIMIT_NAMESPACE_ID: "2002",
  SPI_OTHER_AUTH_RATE_LIMIT_NAMESPACE_ID: "3001",
  SPI_OTHER_MUTATION_RATE_LIMIT_NAMESPACE_ID: "3002",
};
const telegram = {
  TELEGRAM_BOT_TOKEN: `12345678:${"A".repeat(35)}`,
  TELEGRAM_WEBHOOK_SECRET: "S".repeat(32),
};
describe("operations scripts fail safely", () => {
  it("validates the key-and-URL-only preview setup without network access", () => {
    const secrets = {
      CLOUDFLARE_API_TOKEN: "synthetic-cloudflare-key-not-real",
      CLOUDFLARE_ACCOUNT_URL:
        "https://dash.cloudflare.com/11111111111111111111111111111111",
      SUPABASE_DATABASE_URL:
        "postgresql://postgres:synthetic@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require",
      SPI_APP_URL: "https://spi-preview.example.invalid",
      SPI_ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
      SPI_ACCESS_AUDIENCE: "synthetic-access-audience-key",
      SPI_ADMIN_EMAIL_URL: "mailto:admin@example.invalid",
    };
    const result = spawnSync(process.execPath, ["scripts/setup-preview.mjs"], {
      encoding: "utf8",
      env: { ...process.env, ...secrets },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Input KEY/URL preview valid");
    expect(result.stdout).toContain("belum ada resource");
    for (const value of Object.values(secrets))
      expect(`${result.stdout}${result.stderr}`).not.toContain(value);
  });

  it("validates bootstrap inputs without network or sensitive output", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/bootstrap-supabase.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...common,
          SPI_BOOTSTRAP_ORGANIZATION_ID: "org-preview",
          SPI_BOOTSTRAP_ORGANIZATION_NAME: "Jemaat Sintetis",
          SPI_BOOTSTRAP_TIMEZONE: "Asia/Makassar",
          SPI_BOOTSTRAP_USER_ID: "root-preview",
          SPI_BOOTSTRAP_USER_NAME: "Admin Sintetis",
          SPI_BOOTSTRAP_USER_EMAIL: "admin@example.invalid",
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Input bootstrap preview valid");
    expect(result.stdout).not.toContain("admin@example.invalid");
    expect(result.stdout).not.toContain(common.CLOUDFLARE_API_TOKEN);
  });
  it("rejects an invalid bootstrap timezone before network access", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/bootstrap-supabase.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...common,
          SPI_BOOTSTRAP_ORGANIZATION_ID: "org-preview",
          SPI_BOOTSTRAP_ORGANIZATION_NAME: "Jemaat Sintetis",
          SPI_BOOTSTRAP_TIMEZONE: "Invalid/Timezone",
          SPI_BOOTSTRAP_USER_ID: "root-preview",
          SPI_BOOTSTRAP_USER_NAME: "Admin Sintetis",
          SPI_BOOTSTRAP_USER_EMAIL: "admin@example.invalid",
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain(common.CLOUDFLARE_API_TOKEN);
  });
  it("generates an isolated config under ignored storage", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-worker-config.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...common,
          SPI_OTHER_HYPERDRIVE_ID: "hyperdrive-production",
          SPI_APP_ORIGIN: "https://preview.example.invalid",
          SPI_ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
          SPI_ACCESS_AUDIENCE: "synthetic-audience",
          SPI_ORGANIZATION_ID: "org-preview",
          SPI_WORKER_ROUTE: "preview.example.invalid/api/*",
          SPI_TELEGRAM_WEBHOOK_ROUTE:
            "preview.example.invalid/telegram/webhook",
          SPI_ZONE_NAME: "example.invalid",
          SPI_TELEGRAM_DELIVERY_ENABLED: "false",
        },
      },
    );
    expect(result.status).toBe(0);
    const config = JSON.parse(
      readFileSync(".wrangler/generated/preview.json", "utf8"),
    ) as unknown;
    expect(config).toMatchObject({
      name: "spi-api-preview",
      vars: { ENVIRONMENT: "preview", ORGANIZATION_ID: "org-preview" },
      routes: [
        {
          pattern: "preview.example.invalid/api/*",
          zone_name: "example.invalid",
        },
        {
          pattern: "preview.example.invalid/telegram/webhook",
          zone_name: "example.invalid",
        },
      ],
      hyperdrive: [{ binding: "HYPERDRIVE", id: "hyperdrive-preview" }],
    });
  });
  it("rejects a shared preview and production Hyperdrive", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-worker-config.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...common,
          SPI_OTHER_HYPERDRIVE_ID: common.SPI_HYPERDRIVE_ID,
          SPI_APP_ORIGIN: "https://preview.example.invalid",
          SPI_ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
          SPI_ACCESS_AUDIENCE: "synthetic-audience",
          SPI_ORGANIZATION_ID: "org-preview",
          SPI_WORKER_ROUTE: "preview.example.invalid/api/*",
          SPI_TELEGRAM_WEBHOOK_ROUTE:
            "preview.example.invalid/telegram/webhook",
          SPI_ZONE_NAME: "example.invalid",
          SPI_TELEGRAM_DELIVERY_ENABLED: "false",
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain(common.CLOUDFLARE_API_TOKEN);
  });
  it("rejects reused rate limit namespaces", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-worker-config.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...common,
          SPI_MUTATION_RATE_LIMIT_NAMESPACE_ID:
            common.SPI_AUTH_RATE_LIMIT_NAMESPACE_ID,
          SPI_OTHER_HYPERDRIVE_ID: "hyperdrive-production",
          SPI_APP_ORIGIN: "https://preview.example.invalid",
          SPI_ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
          SPI_ACCESS_AUDIENCE: "synthetic-audience",
          SPI_ORGANIZATION_ID: "org-preview",
          SPI_WORKER_ROUTE: "preview.example.invalid/api/*",
          SPI_TELEGRAM_WEBHOOK_ROUTE:
            "preview.example.invalid/telegram/webhook",
          SPI_ZONE_NAME: "example.invalid",
          SPI_TELEGRAM_DELIVERY_ENABLED: "false",
        },
      },
    );
    expect(result.status).not.toBe(0);
  });
  it("rejects real Telegram delivery in preview", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-worker-config.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...common,
          SPI_OTHER_HYPERDRIVE_ID: "hyperdrive-production",
          SPI_APP_ORIGIN: "https://preview.example.invalid",
          SPI_ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
          SPI_ACCESS_AUDIENCE: "synthetic-audience",
          SPI_ORGANIZATION_ID: "org-preview",
          SPI_WORKER_ROUTE: "preview.example.invalid/api/*",
          SPI_TELEGRAM_WEBHOOK_ROUTE:
            "preview.example.invalid/telegram/webhook",
          SPI_ZONE_NAME: "example.invalid",
          SPI_TELEGRAM_DELIVERY_ENABLED: "true",
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("wajib nonaktif di preview");
  });
  it("validates Telegram Worker secrets without network or sensitive output", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/configure-telegram-cloud.mjs", "preview"],
      {
        encoding: "utf8",
        env: { ...common, ...telegram },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Input secret Telegram preview valid");
    expect(result.stdout).not.toContain(telegram.TELEGRAM_BOT_TOKEN);
    expect(result.stdout).not.toContain(telegram.TELEGRAM_WEBHOOK_SECRET);
    expect(result.stdout).not.toContain(common.CLOUDFLARE_API_TOKEN);
  });
  it("validates a same-host Telegram webhook without network or sensitive output", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/configure-telegram-webhook.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...telegram,
          SPI_APP_ORIGIN: "https://preview.example.invalid",
          SPI_TELEGRAM_WEBHOOK_URL:
            "https://preview.example.invalid/telegram/webhook",
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Input webhook Telegram preview valid");
    expect(result.stdout).not.toContain(telegram.TELEGRAM_BOT_TOKEN);
    expect(result.stdout).not.toContain(telegram.TELEGRAM_WEBHOOK_SECRET);
  });
  it("rejects a cross-host Telegram webhook before network access", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/configure-telegram-webhook.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...telegram,
          SPI_APP_ORIGIN: "https://preview.example.invalid",
          SPI_TELEGRAM_WEBHOOK_URL:
            "https://attacker.example.invalid/telegram/webhook",
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Host webhook Telegram harus sama");
    expect(result.stderr).not.toContain(telegram.TELEGRAM_BOT_TOKEN);
    expect(result.stderr).not.toContain(telegram.TELEGRAM_WEBHOOK_SECRET);
  });
  it("rejects retention shorter than five years before network access", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/retention-cloud.mjs", "preview"],
      {
        encoding: "utf8",
        env: {
          ...common,
          SPI_ORGANIZATION_ID: "org-preview",
          SPI_RETENTION_BEFORE: new Date().toISOString(),
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("sekurangnya lima tahun");
    expect(result.stderr).not.toContain(common.CLOUDFLARE_API_TOKEN);
  });
});
