// Regression tests for "Start shows 'Couldn't reach the server'" (after PR #4).
//
// Cause: production's workout_logs predates the baseline migration and has
// target_reps NOT NULL. Seeding a plan with a static hold inserted NULL there,
// the start action threw, and the client showed every throw as a network error.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { applyMigrations, createSql, freshDb, migrationFiles, MIGRATIONS_DIR, newDb } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());
vi.mock("next/headers", async () => (await import("./helpers/next-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers/next-mocks")).nextNavigationMock);
vi.mock("next/cache", async () => (await import("./helpers/next-mocks")).nextCacheMock);
vi.mock("@/lib/auth", () => ({
  requireUserId: async () => "alice",
  getSessionUserId: async () => "alice",
}));

const actions = await import("@/app/workout/[id]/actions");
const { getSessionLogs } = await import("@/lib/workout-session");
const discardRoute = await import("@/app/api/workout/[id]/discard/route");

/** The production shape of workout_logs (older than 0000_baseline). */
const PROD_LIKE = `
  ALTER TABLE workout_logs ALTER COLUMN target_reps SET NOT NULL;
  ALTER TABLE workout_logs ALTER COLUMN actual_weight SET DEFAULT 0;
  ALTER TABLE workout_logs ALTER COLUMN actual_reps SET DEFAULT 10;
`;

async function seed(sql = holder.sql!) {
  await sql`INSERT INTO users (id, email, name) VALUES ('alice', 'a@x.nl', 'Alice')`;
  await sql`INSERT INTO user_profiles (user_id, username, email, name, timezone) VALUES ('alice', 'alice', 'a@x.nl', 'Alice', 'Europe/Amsterdam')`;
  await sql`INSERT INTO plans (id, user_id, title, exercise_count) VALUES (10, 'alice', 'Skills', 3)`;
  await sql`
    INSERT INTO plan_exercises (id, plan_id, name, exercise_type, sets, reps, target_seconds, rest_seconds, position) VALUES
      (100, 10, 'Straddle Planche', 'static', 2, 1, 5, 180, 0),
      (101, 10, 'Pull-Up', 'bodyweight', 2, 8, NULL, 90, 1),
      (102, 10, 'Bench Press', 'weighted', 2, 10, NULL, 90, 2)
  `;
  await sql`INSERT INTO workouts (id, user_id, name, day_label, plan_id) VALUES (1000, 'alice', 'Skills', 'SAT', 10)`;
}

describe("starting a workout on a production-shaped database", () => {
  beforeEach(async () => {
    const db = await freshDb();
    await db.exec(PROD_LIKE);
    holder.sql = createSql(db);
    await seed();
  });

  it("seeds static, bodyweight and weighted sets even with target_reps NOT NULL", async () => {
    expect(await actions.startWorkout(1000)).toEqual({ ok: true, workoutId: 1000 });
    const [session] = await holder.sql!`SELECT id FROM workout_sessions WHERE completed_at IS NULL`;
    const logs = await getSessionLogs({ userId: "alice", sessionId: Number(session.id), unit: "kg" });
    const byName = (n: string) => logs.filter((l) => l.exercise_name === n);
    expect(byName("Straddle Planche")).toHaveLength(2);
    // Static holds have no rep target, whatever the column holds.
    expect(byName("Straddle Planche").every((l) => l.target_reps === null && l.target_seconds === 5)).toBe(true);
    expect(byName("Pull-Up").every((l) => l.target_reps === 8)).toBe(true);
    expect(byName("Bench Press").every((l) => l.target_reps === 10)).toBe(true);
  });

  it("a database error comes back as a server error, not a throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await holder.sql!.query("ALTER TABLE workout_logs ADD CONSTRAINT boom CHECK (set_number < 0) NOT VALID");
    expect(await actions.startWorkout(1000)).toEqual({ ok: false, error: expect.any(String), kind: "server" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("the escape routes answer 500 (not a hang or a crash) when the database fails", async () => {
    await actions.startWorkout(1000);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await holder.sql!.query("ALTER TABLE workout_sessions RENAME TO workout_sessions_gone");
    const res = await discardRoute.POST(
      new NextRequest("https://repiq.test/api/workout/1000/discard", {
        method: "POST",
        headers: { origin: "https://repiq.test", host: "repiq.test" },
      }),
      { params: Promise.resolve({ id: "1000" }) }
    );
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe("migration 0010", () => {
  it("makes workout_logs nullable, drops the defaults and clears only untouched open sets", async () => {
    const db = newDb();
    const files = migrationFiles();
    const upTo0009 = files.filter((f) => f < "0010");
    for (const f of upTo0009) await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    await db.exec(PROD_LIKE);
    await seed(createSql(db));
    await db.exec(`
      INSERT INTO workout_sessions (id, user_id, workout_id, plan_id, plan_name, started_on, completed_at, completed_on)
      VALUES (1, 'alice', 1000, 10, 'Skills', '2026-10-01', now(), '2026-10-01'),
             (2, 'alice', 1000, 10, 'Skills', '2026-10-10', NULL, NULL);
      INSERT INTO workout_logs (workout_id, session_id, exercise_name, set_number, target_reps, order_index, completed) VALUES
        (1000, 1, 'Bench Press', 1, 10, 0, false),  -- history: untouched
        (1000, 2, 'Bench Press', 1, 10, 0, false),  -- open, defaults only: cleared
        (1000, 2, 'Bench Press', 2, 10, 0, true);   -- open but completed: kept
      INSERT INTO workout_logs (workout_id, session_id, exercise_name, set_number, target_reps, order_index, actual_weight, actual_reps)
        VALUES (1000, 2, 'Pull-Up', 1, 8, 1, 0, 12); -- typed in: kept
    `);

    const migration = readFileSync(join(MIGRATIONS_DIR, "0010_workout_logs_nullable.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration); // idempotent

    const rows = (
      await db.query<{ session_id: string; set_number: number; exercise_name: string; actual_weight: string | null; actual_reps: number | null }>(
        "SELECT session_id, set_number, exercise_name, actual_weight, actual_reps FROM workout_logs ORDER BY session_id, exercise_name, set_number"
      )
    ).rows.map((r) => [Number(r.session_id), r.exercise_name, r.set_number, r.actual_weight === null ? null : Number(r.actual_weight), r.actual_reps]);
    expect(rows).toEqual([
      [1, "Bench Press", 1, 0, 10],
      [2, "Bench Press", 1, null, null],
      [2, "Bench Press", 2, 0, 10],
      [2, "Pull-Up", 1, 0, 12],
    ]);

    const cols = (
      await db.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
        `SELECT column_name, is_nullable, column_default FROM information_schema.columns
         WHERE table_name = 'workout_logs' AND column_name IN ('target_reps', 'actual_weight', 'actual_reps')`
      )
    ).rows;
    for (const c of cols) {
      expect(c.is_nullable).toBe("YES");
      if (c.column_name !== "target_reps") expect(c.column_default).toBeNull();
    }
  });

  it("is part of a clean full run", async () => {
    const db = newDb();
    await applyMigrations(db);
    await applyMigrations(db);
  });
});
