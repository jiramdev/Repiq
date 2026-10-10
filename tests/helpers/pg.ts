// tests/helpers/pg.ts
// An in-memory Postgres (PGlite) behind the same tagged-template API as the
// Neon client, so server actions run their real SQL in tests.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Runner = Pick<PGlite, "query"> | Transaction;

export interface LazyQuery extends PromiseLike<Record<string, unknown>[]> {
  text: string;
  params: unknown[];
  run(runner: Runner): Promise<Record<string, unknown>[]>;
}

export const MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

export async function applyMigrations(db: PGlite, files = migrationFiles()) {
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
}

export function createSql(db: PGlite) {
  const log: { text: string; params: unknown[] }[] = [];

  const sql = ((strings: TemplateStringsArray, ...values: unknown[]): LazyQuery => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
    const run = async (runner: Runner) => {
      log.push({ text, params: values });
      const res = await runner.query<Record<string, unknown>>(text, values);
      return res.rows;
    };
    return {
      text,
      params: values,
      run,
      then(onFulfilled, onRejected) {
        return run(db).then(onFulfilled, onRejected);
      },
    };
  }) as ((strings: TemplateStringsArray, ...values: unknown[]) => LazyQuery) & {
    transaction: (queries: LazyQuery[]) => Promise<Record<string, unknown>[][]>;
    query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
    log: typeof log;
  };

  sql.transaction = async (queries) =>
    db.transaction(async (tx) => {
      const results: Record<string, unknown>[][] = [];
      for (const q of queries) results.push(await q.run(tx));
      return results;
    });
  sql.query = async (text, params = []) => (await db.query<Record<string, unknown>>(text, params)).rows;
  sql.log = log;
  return sql;
}

export async function freshDb() {
  const db = new PGlite();
  await applyMigrations(db);
  return db;
}
