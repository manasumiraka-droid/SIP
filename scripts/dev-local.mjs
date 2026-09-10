import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const children = [
  spawn(
    process.execPath,
    [
      resolve("scripts/wrangler.mjs"),
      "dev",
      "--config",
      "apps/worker/wrangler.jsonc",
      "--local",
      "--var",
      "ENVIRONMENT:local",
      "--var",
      "APP_ORIGIN:http://localhost:5173",
      "--var",
      "ACCESS_ISSUER:https://local-demo.cloudflareaccess.com",
      "--var",
      "ACCESS_AUDIENCE:local-demo",
      "--var",
      "ORGANIZATION_ID:local-demo",
      "--var",
      "LOCAL_DEVELOPMENT_EMAIL:demo-admin@example.invalid",
    ],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      "--config",
      "apps/web/vite.config.ts",
      "--host",
      "127.0.0.1",
    ],
    { stdio: "inherit" },
  ),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
