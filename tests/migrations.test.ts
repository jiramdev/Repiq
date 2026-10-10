import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyMigrations, migrationFiles, MIGRATIONS_DIR } from "./helpers/pg";

describe("migrations", () => {
  it("apply cleanly to an empty database and are idempotent", async () => {
    const db = new PGlite();
    await applyMigrations(db);
    await applyMigrations(db); // second run must be a no-op
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["sessions", "workout_sessions", "rest_timers", "workouts", "plans"])
    );
  });

  it("upgrade legacy data: plan links, sessions, duplicate sets, multi-session days", async () => {
    const db = new PGlite();
    const [baseline, ...rest] = migrationFiles();
    await db.exec(readFileSync(join(MIGRATIONS_DIR, baseline), "utf8"));

    // Legacy state, including the old one-completion-per-day constraint.
    await db.exec(`
      ALTER TABLE completed_sessions ADD CONSTRAINT completed_sessions_user_date UNIQUE (user_id, completed_date);
      INSERT INTO users (id, email, name) VALUES ('u1', 'a@x.nl', 'A');
      INSERT INTO user_profiles (user_id, username, email, password_hash) VALUES ('u1', 'a', 'a@x.nl', 'plaintext');
      INSERT INTO plans (id, user_id, title, exercise_count) VALUES (10, 'u1', 'Push', 1);
      INSERT INTO workouts (id, user_id, name, day_label, completed) VALUES
        (100, 'u1', ' push ', 'MON', true),
        (101, 'u1', 'Rest', 'TUE', false);
      INSERT INTO workout_logs (workout_id, exercise_name, set_number, actual_weight, completed, order_index) VALUES
        (100, 'Bench', 1, 80, true, 0),
        (100, 'Bench', 1, NULL, false, 0),
        (100, 'Bench', 2, 82.5, true, 0);
      INSERT INTO completed_sessions (user_id, workout_id, plan_name, completed_date) VALUES ('u1', 100, 'Push', '2026-10-05');
    `);

    for (const file of rest) await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));

    const w = await db.query<{ id: number; plan_id: number | null }>(`SELECT id, plan_id FROM workouts ORDER BY id`);
    expect(w.rows).toEqual([
      { id: 100, plan_id: 10 },
      { id: 101, plan_id: null },
    ]);

    const s = await db.query<{ workout_id: number; completed_on: string | null }>(
      `SELECT workout_id, to_char(completed_on, 'YYYY-MM-DD') AS completed_on FROM workout_sessions`
    );
    expect(s.rows).toEqual([{ workout_id: 100, completed_on: "2026-10-05" }]);

    const logs = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM workout_logs WHERE session_id IS NOT NULL`);
    expect(logs.rows[0].n).toBe(2); // the empty duplicate was removed

    // Two completions on the same day are now allowed.
    await db.exec(`
      INSERT INTO completed_sessions (user_id, workout_id, plan_name, completed_date, session_id) VALUES
        ('u1', 100, 'Push', '2026-10-06', 1001),
        ('u1', 100, 'Push', '2026-10-06', 1002);
    `);
    await expect(
      db.exec(`INSERT INTO completed_sessions (user_id, plan_name, session_id) VALUES ('u1', 'Push', 1001)`)
    ).rejects.toThrow();

    const tz = await db.query<{ timezone: string }>(`SELECT timezone FROM user_profiles`);
    expect(tz.rows[0].timezone).toBe("Europe/Amsterdam");
  });
});
