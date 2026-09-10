import { createApp } from "./app";
import { runImportRetention } from "./import-retention";
import {
  createTelegramSender,
  handleWebhook,
  runTelegramNotifications,
} from "./telegram";
const app = createApp();
export default {
  fetch(
    request: Request,
    env: Parameters<typeof handleWebhook>[1],
    context: ExecutionContext,
  ) {
    if (new URL(request.url).pathname === "/telegram/webhook")
      return handleWebhook(request, env, createTelegramSender(env));
    return app.fetch(request, env, context);
  },
  scheduled(
    _controller: ScheduledController,
    env: {
      DB: D1Database;
      ORGANIZATION_ID: string;
      TELEGRAM_WEBHOOK_SECRET?: string;
      TELEGRAM_BOT_TOKEN?: string;
      TELEGRAM_DELIVERY_ENABLED?: string;
    },
    context: ExecutionContext,
  ) {
    context.waitUntil(
      Promise.all([
        runImportRetention(env.DB),
        runTelegramNotifications(env, createTelegramSender(env)),
      ]),
    );
  },
};
