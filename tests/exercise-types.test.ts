import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSql, freshDb, migrationFiles, MIGRATIONS_DIR, newDb, applyMigrations } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";
import {
  BODYWEIGHT_NAME_PATTERN,
  LOADED_NAME_PATTERN,
  STATIC_NAME_PATTERN,
  guessExerciseType,
  parseDuration,
  parseTargets,
  formatDuration,
  durationInputValue,
} from "@/lib/exercise-types";
import {
  hasExactMatch,
  matchScore,
  recentExercises,
  searchExercises,
  type PickerExercise,
} from "@/lib/exercise-search";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());
vi.mock("next/headers", async () => (await import("./helpers/next-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers/next-mocks")).nextNavigationMock);
vi.mock("next/cache", async () => (await import("./helpers/next-mocks")).nextCacheMock);

const current = vi.hoisted(() => ({ userId: "alice" }));
vi.mock("@/lib/auth", () => ({
  requireUserId: async () => current.userId,
  getSessionUserId: async () => current.userId,
}));

const planActions = await import("@/app/plans/[id]/actions");
const workoutActions = await import("@/app/workout/[id]/actions");
const { startOrResumeSession, getSessionLogs } = await import("@/lib/workout-session");

const TODAY = "2026-10-09";
const TOMORROW = "2026-10-10";

describe("exercise type rules", () => {
  it("validates plan targets per type", () => {
    expect(parseTargets({ type: "weighted", sets: 3, reps: 10, rest: 90 })).toEqual({
      type: "weighted", sets: 3, reps: 10, seconds: null, rest: 90,
    });
    // Bodyweight: reps, never seconds.
    expect(parseTargets({ type: "bodyweight", sets: "4", reps: "8", seconds: 30, rest: 60 })).toEqual({
      type: "bodyweight", sets: 4, reps: 8, seconds: null, rest: 60,
    });
    // Static: seconds, never reps.
    expect(parseTargets({ type: "static", sets: 3, reps: 10, seconds: 20, rest: 90 })).toEqual({
      type: "static", sets: 3, reps: null, seconds: 20, rest: 90,
    });
    expect(parseTargets({ type: "static", sets: 3, reps: 10, rest: 90 })).toBeNull(); // no hold time
    expect(parseTargets({ type: "static", sets: 3, seconds: 0, rest: 90 })).toBeNull();
    expect(parseTargets({ type: "static", sets: 3, seconds: 601, rest: 90 })).toBeNull();
    expect(parseTargets({ type: "bodyweight", sets: 3, seconds: 20, rest: 90 })).toBeNull(); // no reps
    expect(parseTargets({ type: "cardio", sets: 3, reps: 10, rest: 90 })).toBeNull();
    expect(parseTargets({ type: "weighted", sets: 0, reps: 10, rest: 90 })).toBeNull();
  });

  it("parses and formats hold times", () => {
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1.05")).toBe(65);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("1:")).toBeUndefined();
    expect(parseDuration("1:75")).toBeUndefined();
    expect(parseDuration("abc")).toBeUndefined();
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1:30");
    expect(durationInputValue(45)).toBe("45");
    expect(durationInputValue(605)).toBe("10:05");
  });

  it("guesses a type from the name", () => {
    expect(guessExerciseType("Pull-Up")).toBe("bodyweight");
    expect(guessExerciseType("pull up")).toBe("bodyweight");
    expect(guessExerciseType("HSPU")).toBe("bodyweight");
    expect(guessExerciseType("Handstand Push-Up")).toBe("bodyweight");
    expect(guessExerciseType("Dips")).toBe("bodyweight");
    expect(guessExerciseType("Weighted Pull-Up")).toBe("weighted");
    expect(guessExerciseType("Planche")).toBe("static");
    expect(guessExerciseType("Front Lever")).toBe("static");
    expect(guessExerciseType("Plank")).toBe("static");
    expect(guessExerciseType("Bench Press")).toBe("weighted");
    expect(guessExerciseType("Lat Pulldown")).toBe("weighted");
    expect(guessExerciseType("")).toBe("weighted");
  });
});

describe("add-exercise picker search", () => {
  const ex = (id: number, name: string, extra: Partial<PickerExercise> = {}): PickerExercise => ({
    id, name, exercise_type: "weighted", default_sets: 3, default_reps: 10, default_seconds: null,
    default_rest_seconds: 90, own: false, sessions: 0, plans: 0, last_used: null, ...extra,
  });
  const lib = [
    ex(1, "Bench Press"),
    ex(2, "Incline Bench Press", { sessions: 12, last_used: 2000 }),
    ex(3, "Pull-Up", { exercise_type: "bodyweight", sessions: 3, last_used: 3000 }),
    ex(4, "Squat", { plans: 2 }),
    ex(5, "Front Lever", { exercise_type: "static", own: true }),
  ];

  it("matches as you type, ignoring case and punctuation", () => {
    expect(searchExercises(lib, "pullup").map((e) => e.id)).toEqual([3]);
    expect(searchExercises(lib, "PULL UP").map((e) => e.id)).toEqual([3]);
    expect(searchExercises(lib, "inc ben").map((e) => e.id)).toEqual([2]);
    expect(searchExercises(lib, "zzz")).toEqual([]);
    expect(matchScore("Bench Press", "bench press")).toBeGreaterThan(matchScore("Incline Bench Press", "bench press"));
  });

  it("ranks frequently used exercises higher among similar matches", () => {
    // Equally good matches: the one logged 12 times comes first.
    expect(searchExercises(lib, "press").map((e) => e.id)).toEqual([2, 1]);
    // A name that starts with the query still beats a merely popular one.
    expect(searchExercises(lib, "bench").map((e) => e.id)).toEqual([1, 2]);
  });

  it("shows recent and frequent exercises first before typing", () => {
    expect(recentExercises(lib).map((e) => e.id)).toEqual([3, 2, 4]);
  });

  it("offers Create only for a new name", () => {
    expect(hasExactMatch(lib, "pull up")).toBe(true);
    expect(hasExactMatch(lib, "Planche")).toBe(false);
  });
});

async function seed() {
  const sql = holder.sql!;
  for (const id of ["alice", "bob"]) {
    await sql`INSERT INTO users (id, email, name) VALUES (${id}, ${id + "@x.nl"}, ${id})`;
    await sql`INSERT INTO user_profiles (user_id, username, email) VALUES (${id}, ${id}, ${id + "@x.nl"})`;
  }
  await sql`
    INSERT INTO exercises (id, user_id, name, exercise_type, default_sets, default_reps, default_seconds, default_rest_seconds) VALUES
      (1, NULL, 'Bench Press', 'weighted', 3, 10, NULL, 90),
      (2, NULL, 'Pull-Up', 'bodyweight', 3, 8, NULL, 90),
      (3, NULL, 'Front Lever', 'static', 3, 10, 20, 120)
  `;
  await sql`INSERT INTO plans (id, user_id, title, exercise_count) VALUES (10, 'alice', 'Skills', 0), (20, 'bob', 'Bob', 0)`;
  await sql`INSERT INTO workouts (id, user_id, name, day_label, plan_id) VALUES (1000, 'alice', 'Skills', 'FRI', 10)`;
  for (const table of ["exercises", "plans", "workouts"]) {
    await sql.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`);
  }
}

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  current.userId = "alice";
  await seed();
});

const planRows = () =>
  holder.sql!`
    SELECT id, name, exercise_type, sets, reps, target_seconds, rest_seconds, position, exercise_id
    FROM plan_exercises WHERE plan_id = 10 ORDER BY position, id
  `;

describe("plan exercises with types", () => {
  it("adds each type with its own targets, in order", async () => {
    const a = await planActions.addExerciseToPlan(10, { name: "Bench Press", type: "weighted", sets: 3, reps: 10, rest: 90 });
    const b = await planActions.addExerciseToPlan(10, { name: "Pull-Up", type: "bodyweight", sets: 3, reps: 8, rest: 90 });
    const c = await planActions.addExerciseToPlan(10, { name: "Front Lever", type: "static", sets: 3, seconds: 20, reps: 99, rest: 120 });
    for (const r of [a, b, c]) expect(r).toMatchObject({ success: true, id: expect.any(Number) });

    const rows = await planRows();
    expect(rows.map((r) => [r.name, r.exercise_type, r.reps, r.target_seconds, r.position])).toEqual([
      ["Bench Press", "weighted", 10, null, 0],
      ["Pull-Up", "bodyweight", 8, null, 1],
      ["Front Lever", "static", 1, 20, 2], // reps unused for static
    ]);
    // Identical to the shared defaults: linked to the shared exercises, no copies.
    expect(rows.map((r) => r.exercise_id)).toEqual([1, 2, 3]);
    expect(await holder.sql!`SELECT id FROM exercises WHERE user_id = 'alice'`).toHaveLength(0);
    const [plan] = await holder.sql!`SELECT exercise_count FROM plans WHERE id = 10`;
    expect(plan.exercise_count).toBe(3);
  });

  it("refuses targets that don't fit the type", async () => {
    const bad = [
      { name: "Plank", type: "static", sets: 3, reps: 10, rest: 60 }, // no hold time
      { name: "Dips", type: "bodyweight", sets: 3, seconds: 30, rest: 60 }, // no reps
      { name: "Run", type: "cardio", sets: 1, reps: 1, rest: 0 },
      { name: "", type: "weighted", sets: 3, reps: 10, rest: 60 },
    ];
    for (const input of bad) {
      // @ts-expect-error deliberately wrong shapes, as a tampered client could send
      expect((await planActions.addExerciseToPlan(10, input)).success).toBe(false);
    }
    expect(await planRows()).toHaveLength(0);
  });

  it("changing the type of a shared exercise makes a private copy; own exercises change in place", async () => {
    const { id } = await planActions.addExerciseToPlan(10, { name: "Pull-Up", type: "bodyweight", sets: 3, reps: 8, rest: 90 });
    // Weighted pull-ups now: the shared one stays bodyweight.
    expect(
      await planActions.updatePlanExercise(10, id!, { name: "Pull-Up", type: "weighted", sets: 4, reps: 6, rest: 120 })
    ).toEqual({ success: true });
    const [shared] = await holder.sql!`SELECT exercise_type FROM exercises WHERE id = 2`;
    expect(shared.exercise_type).toBe("bodyweight");
    const [copy] = await holder.sql!`SELECT id, exercise_type, default_reps FROM exercises WHERE user_id = 'alice'`;
    expect(copy).toMatchObject({ exercise_type: "weighted", default_reps: 6 });

    // Now it's her own: switching to a static hold updates it, no second copy.
    expect(
      await planActions.updatePlanExercise(10, id!, { name: "Pull-Up", type: "static", sets: 3, seconds: 15, rest: 90 })
    ).toEqual({ success: true });
    const own = await holder.sql!`SELECT exercise_type, default_seconds FROM exercises WHERE user_id = 'alice'`;
    expect(own).toEqual([{ exercise_type: "static", default_seconds: 15 }]);
    const [row] = await planRows();
    expect(row).toMatchObject({ exercise_type: "static", target_seconds: 15, exercise_id: copy.id });
  });

  it("reorders, and refuses stale or foreign lists", async () => {
    const ids: number[] = [];
    for (const name of ["A", "B", "C"]) {
      ids.push((await planActions.addExerciseToPlan(10, { name, type: "weighted", sets: 3, reps: 10, rest: 90 })).id!);
    }
    expect(await planActions.reorderPlanExercises(10, [ids[2], ids[0], ids[1]])).toEqual({ success: true });
    expect((await planRows()).map((r) => r.name)).toEqual(["C", "A", "B"]);

    expect((await planActions.reorderPlanExercises(10, [ids[0], ids[1]])).success).toBe(false); // missing one
    expect((await planActions.reorderPlanExercises(10, [ids[0], ids[0], ids[1]])).success).toBe(false); // duplicate
    expect((await planActions.reorderPlanExercises(10, [ids[0], ids[1], 999])).success).toBe(false);
    expect((await planActions.reorderPlanExercises(10, "1,2,3")).success).toBe(false);
    current.userId = "bob";
    expect((await planActions.reorderPlanExercises(10, [ids[1], ids[0], ids[2]])).success).toBe(false);
    expect((await planRows()).map((r) => r.name)).toEqual(["C", "A", "B"]);
  });

  it("undo puts a removed exercise back where it was", async () => {
    const ids: number[] = [];
    for (const name of ["A", "B", "C"]) {
      ids.push((await planActions.addExerciseToPlan(10, { name, type: "weighted", sets: 3, reps: 10, rest: 90 })).id!);
    }
    await planActions.deleteExercise(10, ids[1]);
    await planActions.addExerciseToPlan(10, { name: "B", type: "weighted", sets: 3, reps: 10, rest: 90 }, 1);
    expect((await planRows()).map((r) => [r.name, r.position])).toEqual([["A", 0], ["B", 1], ["C", 2]]);
  });
});

describe("workouts with types", () => {
  async function planWithAllTypes() {
    await planActions.addExerciseToPlan(10, { name: "Front Lever", type: "static", sets: 2, seconds: 20, rest: 120 });
    await planActions.addExerciseToPlan(10, { name: "Pull-Up", type: "bodyweight", sets: 2, reps: 8, rest: 90 });
    await planActions.addExerciseToPlan(10, { name: "Bench Press", type: "weighted", sets: 1, reps: 10, rest: 90 });
  }
  const open = (today = TODAY) =>
    startOrResumeSession({ userId: "alice", workoutId: 1000, planId: 10, planTitle: "Skills", today, unit: "kg" });

  it("seeds sets with the type, targets and plan order", async () => {
    await planWithAllTypes();
    const session = (await open())!;
    const logs = await getSessionLogs({ userId: "alice", sessionId: session.id, unit: "kg" });
    expect(logs.map((l) => [l.exercise_name, l.exercise_type, l.order_index, l.target_reps, l.target_seconds])).toEqual([
      ["Front Lever", "static", 0, null, 20],
      ["Front Lever", "static", 0, null, 20],
      ["Pull-Up", "bodyweight", 1, 8, null],
      ["Pull-Up", "bodyweight", 1, 8, null],
      ["Bench Press", "weighted", 2, 10, null],
    ]);
  });

  it("follows a reordered plan when seeding", async () => {
    await planWithAllTypes();
    const rows = await planRows();
    await planActions.reorderPlanExercises(10, [rows[2].id, rows[0].id, rows[1].id]);
    const session = (await open())!;
    const logs = await getSessionLogs({ userId: "alice", sessionId: session.id, unit: "kg" });
    expect([...new Set(logs.map((l) => l.exercise_name))]).toEqual(["Bench Press", "Front Lever", "Pull-Up"]);
  });

  it("saves only the fields that belong to the set's type", async () => {
    await planWithAllTypes();
    const session = (await open())!;
    const logs = await getSessionLogs({ userId: "alice", sessionId: session.id, unit: "kg" });
    const hold = logs.find((l) => l.exercise_type === "static")!;
    const bw = logs.find((l) => l.exercise_type === "bodyweight")!;
    const w = logs.find((l) => l.exercise_type === "weighted")!;
    const refused = { ok: false, retry: false };

    expect(await workoutActions.updateLogSet(hold.id, { duration_seconds: 25, completed: true })).toEqual({ ok: true });
    expect(await workoutActions.updateLogSet(hold.id, { actual_reps: 5 })).toEqual(refused);
    expect(await workoutActions.updateLogSet(hold.id, { actual_weight: 10 })).toEqual(refused);
    expect(await workoutActions.updateLogSet(hold.id, { duration_seconds: -1 })).toEqual(refused);
    expect(await workoutActions.updateLogSet(hold.id, { duration_seconds: 3601 })).toEqual(refused);

    expect(await workoutActions.updateLogSet(bw.id, { actual_reps: 9 })).toEqual({ ok: true });
    expect(await workoutActions.updateLogSet(bw.id, { actual_weight: 20 })).toEqual(refused);
    expect(await workoutActions.updateLogSet(bw.id, { duration_seconds: 20 })).toEqual(refused);

    expect(await workoutActions.updateLogSet(w.id, { actual_weight: 80, actual_reps: 10, unit: "kg" })).toEqual({ ok: true });
    expect(await workoutActions.updateLogSet(w.id, { duration_seconds: 30 })).toEqual(refused);
    // Clearing is always fine (e.g. an offline queue from before a type change).
    expect(await workoutActions.updateLogSet(w.id, { duration_seconds: null })).toEqual({ ok: true });

    const after = await getSessionLogs({ userId: "alice", sessionId: session.id, unit: "kg" });
    expect(after.find((l) => l.id === hold.id)).toMatchObject({ duration_seconds: 25, actual_reps: null, actual_weight: null, completed: true });
    expect(after.find((l) => l.id === bw.id)).toMatchObject({ actual_reps: 9, actual_weight: null });
    expect(after.find((l) => l.id === w.id)).toMatchObject({ actual_weight: 80, actual_reps: 10, duration_seconds: null });
  });

  it("a logged hold time counts as logged data, and shows as Prev next time", async () => {
    await planWithAllTypes();
    const first = (await open())!;
    const [hold] = (await getSessionLogs({ userId: "alice", sessionId: first.id, unit: "kg" })).filter(
      (l) => l.exercise_type === "static"
    );
    // Only a duration, not ticked off: the session must survive the stale cleanup.
    await workoutActions.updateLogSet(hold.id, { duration_seconds: 18 });
    const resumed = await open(TOMORROW);
    expect(resumed?.id).toBe(first.id);

    await workoutActions.completeWorkout(1000);
    const second = (await open(TOMORROW))!;
    const logs = await getSessionLogs({ userId: "alice", sessionId: second.id, unit: "kg" });
    const nextHold = logs.find((l) => l.exercise_type === "static" && l.set_number === 1)!;
    expect(nextHold.last_seconds).toBe(18);
    expect(nextHold.last_weight).toBeNull();
  });

  it("Prev only comes from the same type", async () => {
    await planWithAllTypes();
    const first = (await open())!;
    const bw = (await getSessionLogs({ userId: "alice", sessionId: first.id, unit: "kg" })).find(
      (l) => l.exercise_type === "bodyweight" && l.set_number === 1
    )!;
    await workoutActions.updateLogSet(bw.id, { actual_reps: 12, completed: true });
    await workoutActions.completeWorkout(1000);

    // Pull-ups become weighted: last time's bodyweight reps aren't a weighted Prev.
    const [row] = await holder.sql!`SELECT id FROM plan_exercises WHERE plan_id = 10 AND name = 'Pull-Up'`;
    await planActions.updatePlanExercise(10, Number(row.id), { name: "Pull-Up", type: "weighted", sets: 2, reps: 8, rest: 90 });
    const second = (await open(TOMORROW))!;
    const pu = (await getSessionLogs({ userId: "alice", sessionId: second.id, unit: "kg" })).find(
      (l) => l.exercise_name === "Pull-Up" && l.set_number === 1
    )!;
    expect(pu.exercise_type).toBe("weighted");
    expect(pu.last_reps).toBeNull();
  });
});

describe("migration 0009", () => {
  it("backfills existing rows as weighted, types the shared library, keeps plan order, and is idempotent", async () => {
    const db = newDb();
    const files = migrationFiles();
    const upTo = files.findIndex((f) => f.startsWith("0009"));
    expect(upTo).toBeGreaterThan(0);
    for (const file of files.slice(0, upTo)) await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));

    const sharedNames = [
      "Bench Press", "Pull-Up", "Chin Up", "Weighted Pull-Up", "HSPU", "Handstand Push-Up", "Dips",
      "Plank", "Planche", "Front Lever", "L-Sit", "Dead Hang", "Lat Pulldown", "Cable Crunch",
    ];
    await db.query(
      `INSERT INTO exercises (user_id, name) SELECT NULL, unnest($1::text[])`,
      [sharedNames]
    );
    await db.exec(`
      INSERT INTO exercises (user_id, name) VALUES ('u1', 'Pull-Up');
      INSERT INTO plans (id, user_id, title) VALUES (1, 'u1', 'P');
      INSERT INTO plan_exercises (id, plan_id, name, sets, reps) VALUES (7, 1, 'Pull-Up', 3, 8), (5, 1, 'Bench Press', 3, 10);
      INSERT INTO workouts (id, user_id, name) VALUES (1, 'u1', 'P');
      INSERT INTO workout_logs (workout_id, exercise_name, set_number, actual_weight, actual_reps) VALUES (1, 'Pull-Up', 1, NULL, 8);
    `);

    await applyMigrations(db, files.slice(upTo));
    await applyMigrations(db, files.slice(upTo)); // idempotent

    const shared = await db.query<{ name: string; exercise_type: string; default_seconds: number | null }>(
      `SELECT name, exercise_type, default_seconds FROM exercises WHERE user_id IS NULL`
    );
    for (const row of shared.rows) {
      // Same rules as the app's guess.
      expect([row.name, row.exercise_type]).toEqual([row.name, guessExerciseType(row.name)]);
      expect(row.default_seconds).toBe(row.exercise_type === "static" ? 20 : null);
    }
    const own = await db.query(`SELECT exercise_type FROM exercises WHERE user_id = 'u1'`);
    expect(own.rows).toEqual([{ exercise_type: "weighted" }]); // existing user data stays weighted

    const pe = await db.query(`SELECT id, exercise_type, position FROM plan_exercises ORDER BY id`);
    expect(pe.rows).toEqual([
      { id: 5, exercise_type: "weighted", position: 0 },
      { id: 7, exercise_type: "weighted", position: 1 },
    ]);
    const logs = await db.query(`SELECT exercise_type, duration_seconds, actual_reps FROM workout_logs`);
    expect(logs.rows).toEqual([{ exercise_type: "weighted", duration_seconds: null, actual_reps: 8 }]);

    await expect(db.exec(`INSERT INTO exercises (name, exercise_type) VALUES ('Run', 'cardio')`)).rejects.toThrow();
    await expect(db.exec(`UPDATE workout_logs SET duration_seconds = -5`)).rejects.toThrow();
    // Old code that doesn't know the columns still inserts fine (defaults).
    await db.exec(`INSERT INTO plan_exercises (plan_id, name, sets, reps) VALUES (1, 'Row', 3, 10)`);
    const [row] = (await db.query(`SELECT exercise_type FROM plan_exercises WHERE name = 'Row'`)).rows;
    expect(row).toEqual({ exercise_type: "weighted" });
  });

  it("uses the same name patterns as lib/exercise-types.ts", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0009_exercise_types.sql"), "utf8");
    for (const pattern of [STATIC_NAME_PATTERN, BODYWEIGHT_NAME_PATTERN, LOADED_NAME_PATTERN]) {
      expect(sql).toContain(`'${pattern}'`);
    }
  });
});
