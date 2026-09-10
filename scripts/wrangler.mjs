import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--outdir");
if (outputIndex !== -1 && args[outputIndex + 1])
  args[outputIndex + 1] = resolve(args[outputIndex + 1]);
const result = spawnSync(
  process.execPath,
  [resolve("node_modules/wrangler/bin/wrangler.js"), ...args],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: resolve(".wrangler/config"),
      WRANGLER_LOG_PATH: resolve(".wrangler/logs"),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
