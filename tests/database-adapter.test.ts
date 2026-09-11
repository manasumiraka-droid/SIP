import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { toPostgresQuery } from "../apps/worker/src/database";

describe("PostgreSQL query adapter", () => {
  it("numbers bind parameters without touching quoted question marks", () => {
    expect(toPostgresQuery("select '?' note, ? first, ? second")).toBe(
      "select '?' note, $1 first, $2 second",
    );
  });

  it("preserves ignore semantics with PostgreSQL conflict handling", () => {
    expect(toPostgresQuery("INSERT OR IGNORE INTO example(id) VALUES(?)")).toBe(
      "INSERT INTO example(id) VALUES($1) ON CONFLICT DO NOTHING",
    );
  });

  it("quotes camelCase column aliases to preserve casing in PostgreSQL", () => {
    expect(
      toPostgresQuery(
        "SELECT id, organization_id AS organizationId, display_name AS displayName FROM users",
      ),
    ).toBe(
      'SELECT id, organization_id AS "organizationId", display_name AS "displayName" FROM users',
    );
  });

  it("converts staged import JSON expansion", () => {
    const source =
      "INSERT INTO import_rows(id,batch_id,organization_id,row_number,source_number,raw_json,normalized_json,status,proposed_action,error_codes_json,warning_codes_json,created_at,updated_at) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.rowNumber'),json_extract(value,'$.sourceNumber'),json_extract(value,'$.raw'),json_extract(value,'$.normalized'),json_extract(value,'$.status'),'create',json_extract(value,'$.normalized.errors'),json_extract(value,'$.normalized.warnings'),?,? FROM json_each(?)";
    const converted = toPostgresQuery(source);
    expect(converted).toContain("jsonb_array_elements($5::jsonb)");
    expect(converted).toContain("(value->>'rowNumber')::integer");
    expect(converted).not.toMatch(/json_extract|json_each/);
  });

  it("converts reminder UUID and timestamp functions", () => {
    const converted = toPostgresQuery(
      "INSERT OR IGNORE INTO t(id,due_at,payload_json) SELECT lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ',ws.starts_at,'-1 day'),json_object('text',?) FROM worship_services ws",
    );
    expect(converted).toContain("gen_random_uuid()::text");
    expect(converted).toContain("interval '1 day'");
    expect(converted).toContain("jsonb_build_object");
    expect(converted).toMatch(/ON CONFLICT DO NOTHING$/);
  });

  it("removes SQLite-only syntax from every static repository query", () => {
    const directory = "apps/worker/src";
    const failures: string[] = [];
    for (const name of readdirSync(directory).filter((file) =>
      file.endsWith(".ts"),
    )) {
      const file = join(directory, name);
      const source = readFileSync(file, "utf8");
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "prepare"
        ) {
          const argument = node.arguments[0];
          if (
            argument &&
            (ts.isStringLiteral(argument) ||
              ts.isNoSubstitutionTemplateLiteral(argument))
          ) {
            const converted = toPostgresQuery(argument.text);
            if (
              /json_extract|json_each|json_group_array|randomblob|strftime|INSERT OR IGNORE|COLLATE NOCASE/iu.test(
                converted,
              )
            )
              failures.push(`${name}: ${converted}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(failures).toEqual([]);
  });
});
