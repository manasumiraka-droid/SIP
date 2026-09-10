import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { Client } from "pg";
import { z } from "zod";

const input = z
  .object({ databaseUrl: z.url().regex(/^postgres(?:ql)?:\/\//) })
  .parse({ databaseUrl: process.env.SUPABASE_DATABASE_URL });
const directory = resolve("supabase/migrations");
const files = (await readdir(directory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
if (files.length === 0) throw new Error("Tidak ada migrasi Supabase.");

const client = new Client({ connectionString: input.databaseUrl });
await client.connect();
try {
  await client.query(`create table if not exists public.spi_schema_migrations (
    name text primary key, checksum text not null, applied_at timestamptz not null default now()
  )`);
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = await client.query(
      "select checksum from public.spi_schema_migrations where name=$1",
      [file],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].checksum !== checksum)
        throw new Error(`Migrasi yang sudah diterapkan berubah: ${file}`);
      process.stdout.write(`lewati ${file}\n`);
      continue;
    }
    await client.query(sql);
    await client.query(
      "insert into public.spi_schema_migrations(name,checksum) values($1,$2)",
      [file, checksum],
    );
    process.stdout.write(`terapkan ${file}\n`);
  }
} finally {
  await client.end();
}
