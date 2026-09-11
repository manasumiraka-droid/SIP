import { createApp } from "./app";
import { runImportRetention } from "./import-retention";
import {
  createTelegramSender,
  handleWebhook,
  runTelegramNotifications,
} from "./telegram";
import type { TelegramEnv } from "./telegram";
import { asD1Database, createPostgresDatabase } from "./database";

type WorkerEnv = Omit<TelegramEnv, "DB"> & {
  DB?: D1Database;
  HYPERDRIVE?: Hyperdrive;
  AUTH_MODE?: "cloudflare_access" | "preview_key";
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  PREVIEW_AUTH_KEY_HASH?: string;
  PREVIEW_AUTH_EMAIL?: string;
  APP_ORIGIN: string;
  ENVIRONMENT: "local" | "preview" | "production";
  LOCAL_DEVELOPMENT_EMAIL?: string;
  MUTATION_LIMITER: RateLimit;
  AUTH_LIMITER: RateLimit;
};

function runtimeDatabase(env: WorkerEnv) {
  if (env.HYPERDRIVE) {
    const postgres = createPostgresDatabase(env.HYPERDRIVE.connectionString);
    return { database: asD1Database(postgres), close: () => postgres.close() };
  }
  if (env.DB) return { database: env.DB, close: async () => undefined };
  throw new Error("Database binding not configured");
}

const app = createApp();
export default {
  async fetch(request: Request, env: WorkerEnv, context: ExecutionContext) {
    const runtime = runtimeDatabase(env);
    const resolved = { ...env, DB: runtime.database };
    try {
      if (new URL(request.url).pathname === "/telegram/webhook")
        return await handleWebhook(
          request,
          resolved,
          createTelegramSender(resolved),
        );
      return await app.fetch(request, resolved, context);
    } finally {
      context.waitUntil(runtime.close());
    }
  },
  scheduled(
    _controller: ScheduledController,
    env: WorkerEnv,
    context: ExecutionContext,
  ) {
    const runtime = runtimeDatabase(env);
    const resolved = { ...env, DB: runtime.database };
    context.waitUntil(
      (async () => {
        await runImportRetention(resolved.DB);
        await runTelegramNotifications(
          resolved,
          createTelegramSender(resolved),
        );
      })().finally(runtime.close),
    );
  },
};
