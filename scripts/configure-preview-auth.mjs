import { spawnSync } from "node:child_process";
import process from "node:process";
import { z } from "zod";

const apply = process.argv.includes("--apply");
const values = z
  .object({
    token: z.string().min(20),
    accountId: z.string().min(1),
    key: z.string().min(32),
  })
  .parse({
    token: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    key: process.env.SPI_PREVIEW_AUTH_KEY,
  });

if (!apply) {
  process.stdout.write(
    "Input autentikasi preview valid; belum ada secret yang diubah.\n",
  );
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [
    "scripts/wrangler.mjs",
    "secret",
    "put",
    "PREVIEW_AUTH_KEY",
    "--config",
    ".wrangler/generated/preview.json",
  ],
  { encoding: "utf8", input: values.key, env: process.env, windowsHide: true },
);
if (result.status !== 0)
  throw new Error(
    `Gagal menyimpan secret autentikasi preview: ${result.stderr.trim()}`,
  );
process.stdout.write("Secret autentikasi preview tersimpan.\n");
