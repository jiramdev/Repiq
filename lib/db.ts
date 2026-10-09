// lib/db.ts
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;

function getClient(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is missing.");
    }
    client = neon(url);
  }
  return client;
}

/**
 * Lazily-connected Neon client. Connecting on first use (instead of at import
 * time) keeps `next build`, type generation and unit tests working without a
 * database.
 */
export const sql: Sql = Object.assign(
  ((strings: TemplateStringsArray, ...values: unknown[]) =>
    getClient()(strings, ...values)) as Sql,
  {
    query: ((...args: Parameters<Sql["query"]>) => getClient().query(...args)) as Sql["query"],
    unsafe: ((raw: string) => getClient().unsafe(raw)) as Sql["unsafe"],
    transaction: ((...args: Parameters<Sql["transaction"]>) =>
      getClient().transaction(...args)) as Sql["transaction"],
  }
);

/** Postgres error code for unique_violation. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown): err is { code: string; constraint?: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === UNIQUE_VIOLATION
  );
}
