import type { Actor } from "../../../packages/domain/src/access";
export type AppEnvironment = {
  Bindings: {
    DB: D1Database;
    AUTH_MODE?: "cloudflare_access" | "preview_key";
    ACCESS_ISSUER?: string;
    ACCESS_AUDIENCE?: string;
    PREVIEW_AUTH_KEY?: string;
    PREVIEW_AUTH_EMAIL?: string;
    ORGANIZATION_ID: string;
    APP_ORIGIN: string;
    ENVIRONMENT: "local" | "preview" | "production";
    LOCAL_DEVELOPMENT_EMAIL?: string;
    MUTATION_LIMITER: RateLimit;
    AUTH_LIMITER: RateLimit;
    TELEGRAM_WEBHOOK_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_DELIVERY_ENABLED?: string;
  };
  Variables: { requestId: string; actor: Actor };
};
