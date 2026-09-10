import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
const excluded = new Set([
  "node_modules",
  ".git",
  ".wrangler",
  "dist",
  "test-results",
  "playwright-report",
]);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
];
async function scan(directory) {
  let failures = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      excluded.has(entry.name) ||
      entry.name.startsWith(".dev.vars") ||
      (entry.name.startsWith(".env") && entry.name !== ".env.example")
    )
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) failures += await scan(path);
    else if (entry.isFile()) {
      const content = await readFile(path, "utf8");
      if (patterns.some((pattern) => pattern.test(content))) {
        process.stderr.write(`Possible secret: ${path}\n`);
        failures++;
      }
    }
  }
  return failures;
}
const failures = await scan(".");
if (failures) process.exitCode = 1;
else
  process.stdout.write(
    "Secret baseline scan passed (private keys, Telegram tokens, GitHub tokens).\n",
  );
