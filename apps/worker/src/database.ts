import { Client, types as postgresTypes } from "pg";
import type { DatabaseError } from "pg";

export type DatabaseMeta = { changes?: number; [key: string]: unknown };
export type DatabaseResult<T = unknown> = {
  results: T[];
  success: boolean;
  meta: DatabaseMeta;
};

export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run<T = unknown>(): Promise<DatabaseResult<T>>;
}

export interface Database {
  prepare(query: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<DatabaseResult[]>;
}

export interface CloseableDatabase extends Database {
  close(): Promise<void>;
}

// Keep JSON values in the repository contract as serialized strings, matching
// the former SQLite/D1 behavior. Repository code validates/parses them itself.
postgresTypes.setTypeParser(114, (value) => value);
postgresTypes.setTypeParser(3802, (value) => value);
postgresTypes.setTypeParser(20, (value) => Number(value));

export function toPostgresQuery(query: string) {
  const ignoreConflict = /^\s*INSERT OR IGNORE INTO\b/i.test(query);
  let position = 0;
  let quoted = false;
  let result = "";
  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    if (character === "'") {
      result += character;
      if (quoted && query[index + 1] === "'") {
        result += query[index + 1];
        index += 1;
      } else quoted = !quoted;
    } else if (character === "?" && !quoted) {
      position += 1;
      result += `$${position}`;
    } else result += character;
  }
  result = result
    .replaceAll("INSERT OR IGNORE INTO", "INSERT INTO")
    .replaceAll(" COLLATE NOCASE", "")
    .replace(/\bas\s+([a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*)\b/gi, 'AS "$1"')
    .replaceAll("json_object(", "jsonb_build_object(")
    .replaceAll("json_group_array(", "json_agg(")
    .replace(/json_each\((\$\d+)\)/g, "jsonb_array_elements_text($1::jsonb)")
    .replace(
      "SELECT json_extract(value,'$.id'),$1,$2,json_extract(value,'$.rowNumber'),json_extract(value,'$.sourceNumber'),json_extract(value,'$.raw'),json_extract(value,'$.normalized'),json_extract(value,'$.status'),'create',json_extract(value,'$.normalized.errors'),json_extract(value,'$.normalized.warnings'),$3,$4 FROM jsonb_array_elements_text($5::jsonb)",
      "SELECT value->>'id',$1,$2,(value->>'rowNumber')::integer,value->>'sourceNumber',value->'raw',value->'normalized',value->>'status','create',value#>'{normalized,errors}',value#>'{normalized,warnings}',$3,$4 FROM jsonb_array_elements($5::jsonb) AS items(value)",
    )
    .replace(
      "FROM jsonb_array_elements_text($2::jsonb) AS source",
      "FROM jsonb_array_elements($2::jsonb) AS source(value)",
    )
    .replaceAll(
      "json_extract(source.value,'$.normalized')",
      "source.value->'normalized'",
    )
    .replaceAll(
      "json_extract(source.value,'$.status')",
      "source.value->>'status'",
    )
    .replaceAll(
      "json_extract(source.value,'$.action')",
      "source.value->>'action'",
    )
    .replaceAll(
      "json_extract(source.value,'$.duplicateServiceId')",
      "source.value->>'duplicateServiceId'",
    )
    .replaceAll(
      "json_extract(source.value,'$.errors')",
      "source.value->'errors'",
    )
    .replaceAll(
      "json_extract(source.value,'$.warnings')",
      "source.value->'warnings'",
    )
    .replaceAll(
      "json_extract(source.value,'$.warningsAcknowledgedAt')",
      "source.value->>'warningsAcknowledgedAt'",
    )
    .replaceAll("json_extract(source.value,'$.id')", "source.value->>'id'")
    .replaceAll(
      "json_extract(row.normalized_json,'$.assemblyAt')",
      "row.normalized_json->>'assemblyAt'",
    )
    .replaceAll(
      "json_extract(row.normalized_json,'$.startsAt')",
      "row.normalized_json->>'startsAt'",
    )
    .replaceAll(
      "json_extract(row.normalized_json,'$.endsAt')",
      "row.normalized_json->>'endsAt'",
    )
    .replaceAll(
      "json_extract(row.normalized_json,'$.location')",
      "row.normalized_json->>'location'",
    )
    .replaceAll(
      "json_extract(row.normalized_json,'$.resolved.preacher.roleId')",
      "row.normalized_json#>>'{resolved,preacher,roleId}'",
    )
    .replaceAll(
      "json_extract(row.normalized_json,'$.resolved.preacher.servantId')",
      "row.normalized_json#>>'{resolved,preacher,servantId}'",
    )
    .replaceAll(
      "json_extract(row.normalized_json,'$.resolved.mc.roleId')",
      "row.normalized_json#>>'{resolved,mc,roleId}'",
    )
    .replaceAll(
      "json_extract(row.normalized_json,'$.resolved.mc.servantId')",
      "row.normalized_json#>>'{resolved,mc,servantId}'",
    )
    .replaceAll("json_extract(item.value,'$.roleId')", "item.value->>'roleId'")
    .replaceAll(
      "json_extract(item.value,'$.servantId')",
      "item.value->>'servantId'",
    )
    .replace(
      "JOIN json_each(row.normalized_json,'$.resolved.offering') item",
      "JOIN LATERAL jsonb_array_elements(row.normalized_json#>'{resolved,offering}') WITH ORDINALITY item(value,key) ON true",
    )
    .replace("CAST(item.key AS INTEGER)+1", "item.key::integer")
    .replaceAll(
      "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6)))",
      "gen_random_uuid()::text",
    )
    .replaceAll("lower(hex(randomblob(16)))", "gen_random_uuid()::text")
    .replaceAll(
      "strftime('%Y-%m-%dT%H:%M:%fZ',ws.starts_at,'-1 day')",
      "to_char((ws.starts_at::timestamptz - interval '1 day') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')",
    )
    .replaceAll(
      "strftime('%Y-%m-%dT%H:%M:%fZ',ws.starts_at,'-1 hour')",
      "to_char((ws.starts_at::timestamptz - interval '1 hour') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')",
    );
  if (ignoreConflict) result += " ON CONFLICT DO NOTHING";
  return result;
}

function compatibleError(error: unknown) {
  const postgres = error as Partial<DatabaseError>;
  if (!(error instanceof Error)) return error;
  const details = [error.message, postgres.constraint].filter(Boolean);
  if (postgres.code === "23503") details.push("FOREIGN KEY constraint failed");
  if (postgres.code === "23505") details.push("UNIQUE constraint failed");
  if (
    postgres.constraint === "users_organization_id_email_key" ||
    postgres.constraint === "users_org_email_ci"
  )
    details.push("users.organization_id, users.email");
  const compatible = new Error(details.join(" "), { cause: error });
  compatible.name = error.name;
  return compatible;
}

class PostgresStatement implements DatabaseStatement {
  private values: unknown[] = [];

  constructor(
    readonly source: string,
    private readonly execute: (
      query: string,
      values: unknown[],
    ) => Promise<DatabaseResult>,
  ) {}

  bind(...values: unknown[]) {
    const statement = new PostgresStatement(this.source, this.execute);
    statement.values = values;
    return statement;
  }

  parameters() {
    return [...this.values];
  }

  async first<T = Record<string, unknown>>(columnName?: string) {
    const row = (await this.execute(this.source, this.values)).results[0] as
      Record<string, unknown> | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  async all<T = Record<string, unknown>>() {
    return (await this.execute(this.source, this.values)) as DatabaseResult<T>;
  }

  async run<T = unknown>() {
    return (await this.execute(this.source, this.values)) as DatabaseResult<T>;
  }
}

export function createPostgresDatabase(
  connectionString: string,
): CloseableDatabase {
  const client = new Client({ connectionString });
  let connected: Promise<void> | undefined;
  const connect = () => (connected ??= client.connect().then(() => undefined));
  const execute = async (query: string, values: unknown[]) => {
    await connect();
    try {
      const result = await client.query(toPostgresQuery(query), values);
      return {
        results: result.rows,
        success: true,
        meta: { changes: result.rowCount ?? 0 },
      } satisfies DatabaseResult;
    } catch (error) {
      throw compatibleError(error);
    }
  };
  return {
    prepare(query) {
      return new PostgresStatement(query, execute);
    },
    async batch(statements) {
      await connect();
      await client.query("BEGIN");
      try {
        const results: DatabaseResult[] = [];
        for (const statement of statements) {
          if (!(statement instanceof PostgresStatement))
            throw new Error(
              "Database batch contains an incompatible statement",
            );
          const result = await client.query(
            toPostgresQuery(statement.source),
            statement.parameters(),
          );
          results.push({
            results: result.rows,
            success: true,
            meta: { changes: result.rowCount ?? 0 },
          });
        }
        await client.query("COMMIT");
        return results;
      } catch (error) {
        await client.query("ROLLBACK");
        throw compatibleError(error);
      }
    },
    async close() {
      if (!connected) return;
      await connected.catch(() => undefined);
      await client.end().catch(() => undefined);
    },
  };
}

export function asDatabase(database: D1Database): Database {
  return database as unknown as Database;
}

export function asD1Database(database: Database): D1Database {
  return database as unknown as D1Database;
}
