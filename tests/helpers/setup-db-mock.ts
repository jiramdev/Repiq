// tests/helpers/setup-db-mock.ts
// Shared holder so vi.mock factories (which are hoisted) can reach the test DB.
import type { createSql } from "./pg";

export const holder: { sql: ReturnType<typeof createSql> | null } = { sql: null };

export function dbModuleMock() {
  const delegate = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    holder.sql!(strings, ...values)) as unknown as ReturnType<typeof createSql>;
  Object.assign(delegate, {
    transaction: (q: never) => holder.sql!.transaction(q),
    query: (t: string, p?: unknown[]) => holder.sql!.query(t, p),
  });
  return {
    sql: delegate,
    UNIQUE_VIOLATION: "23505",
    isUniqueViolation: (err: unknown) =>
      typeof err === "object" && err !== null && (err as { code?: string }).code === "23505",
  };
}
