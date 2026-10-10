import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSql, freshDb } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());
vi.mock("next/headers", async () => (await import("./helpers/next-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers/next-mocks")).nextNavigationMock);
vi.mock("next/cache", async () => (await import("./helpers/next-mocks")).nextCacheMock);

// Act as whichever user the test says.
const current = vi.hoisted(() => ({ userId: "alice" }));
vi.mock("@/lib/auth", () => ({
  requireUserId: async () => current.userId,
  getSessionUserId: async () => current.userId,
}));

const workoutActions = await import("@/app/workout/[id]/actions");
const planActions = await import("@/app/plans/[id]/actions");
const scheduleActions = await import("@/app/schedule/actions");
const { startOrResumeSession, getSessionLogs } = await import("@/lib/workout-session");

const TODAY = "2026-10-09";

async function seed() {
  const sql = holder.sql!;
  for (const id of ["alice", "bob"]) {
    await sql`INSERT INTO users (id, email, name) VALUES (${id}, ${id + "@x.nl"}, ${id})`;
    await sql`INSERT INTO user_profiles (user_id, username, email) VALUES (${id}, ${id}, ${id + "@x.nl"})`;
  }
  // A shared library exercise.
  await sql`INSERT INTO exercises (id, user_id, name, default_sets, default_reps, default_rest_seconds) VALUES (1, NULL, 'Bench Press', 3, 10, 90)`;
  // Alice: two plans that both use Bench Press. Bob: one plan.
  await sql`INSERT INTO plans (id, user_id, title, exercise_count) VALUES (10, 'alice', 'Push', 1), (11, 'alice', 'Upper', 1), (20, 'bob', 'Bob Push', 1)`;
  await sql`
    INSERT INTO plan_exercises (id, plan_id, exercise_id, name, sets, reps, rest_seconds) VALUES
      (100, 10, 1, 'Bench Press', 3, 10, 90),
      (101, 11, 1, 'Bench Press', 3, 10, 90),
      (200, 20, 1, 'Bench Press', 2, 5, 180)
  `;
  await sql`INSERT INTO workouts (id, user_id, name, day_label, plan_id) VALUES (1000, 'alice', 'Push', 'FRI', 10), (2000, 'bob', 'Bob Push', 'FRI', 20)`;
  // Explicit ids above: move the sequences past them.
  for (const table of ["exercises", "plans", "plan_exercises", "workouts"]) {
    await sql.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`);
  }
}

async function openSession(userId: string, workoutId: number, planId: number) {
  return (await startOrResumeSession({ userId, workoutId, planId, planTitle: "Plan", today: TODAY, unit: "kg" }))!;
}

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  current.userId = "alice";
  await seed();
});

describe("workout sets", () => {
  it("seeds sets once, even when the page loads twice at the same time", async () => {
    const [a, b] = await Promise.all([openSession("alice", 1000, 10), openSession("alice", 1000, 10)]);
    expect(a.id).toBe(b.id);
    const logs = await holder.sql!`SELECT id FROM workout_logs WHERE session_id = ${a.id}`;
    expect(logs).toHaveLength(3);
  });

  it("a user can't edit someone else's set", async () => {
    const bobSession = await openSession("bob", 2000, 20);
    const [bobLog] = await holder.sql!`SELECT id FROM workout_logs WHERE session_id = ${bobSession.id} LIMIT 1`;

    current.userId = "alice";
    const res = await workoutActions.updateLogSet(Number(bobLog.id), { actual_weight: 999, completed: true });
    expect(res).toEqual({ ok: false, retry: false });

    const [after] = await holder.sql!`SELECT actual_weight, completed FROM workout_logs WHERE id = ${bobLog.id}`;
    expect(after).toMatchObject({ actual_weight: null, completed: false });
  });

  it("saves the owner's set, with its unit, and validates input", async () => {
    const s = await openSession("alice", 1000, 10);
    const [log] = await holder.sql!`SELECT id FROM workout_logs WHERE session_id = ${s.id} ORDER BY id LIMIT 1`;
    const id = Number(log.id);

    expect(await workoutActions.updateLogSet(id, { actual_weight: 185, unit: "lbs" })).toEqual({ ok: true });
    expect(await workoutActions.updateLogSet(id, { actual_reps: 8 })).toEqual({ ok: true });
    expect(await workoutActions.updateLogSet(id, { actual_reps: -3 })).toEqual({ ok: false, retry: false });

    const [row] = await holder.sql!`SELECT actual_weight::float AS w, weight_unit, actual_reps FROM workout_logs WHERE id = ${id}`;
    expect(row).toEqual({ w: 185, weight_unit: "lbs", actual_reps: 8 });
  });

  it("discarding only affects the caller's own workout", async () => {
    const bobSession = await openSession("bob", 2000, 20);
    current.userId = "alice";
    await workoutActions.discardWorkout(2000);
    const still = await holder.sql!`SELECT id FROM workout_sessions WHERE id = ${bobSession.id}`;
    expect(still).toHaveLength(1);
  });

  it("finishing is idempotent and a second session on the same day is allowed", async () => {
    await openSession("alice", 1000, 10);
    await workoutActions.completeWorkout(1000);
    await workoutActions.completeWorkout(1000);
    expect(await holder.sql!`SELECT id FROM completed_sessions WHERE user_id = 'alice'`).toHaveLength(1);

    const second = await openSession("alice", 1000, 10);
    expect(second).toBeTruthy();
    await workoutActions.completeWorkout(1000);
    expect(await holder.sql!`SELECT id FROM completed_sessions WHERE user_id = 'alice'`).toHaveLength(2);
  });

  it("the Prev hint only comes from the user's own history", async () => {
    // Bob lifted 140 kg on bench in a finished session.
    const bobSession = await openSession("bob", 2000, 20);
    await holder.sql!`UPDATE workout_logs SET actual_weight = 140 WHERE session_id = ${bobSession.id}`;
    await holder.sql!`UPDATE workout_sessions SET completed_at = now() WHERE id = ${bobSession.id}`;

    const aliceFirst = await openSession("alice", 1000, 10);
    let logs = await getSessionLogs({ userId: "alice", sessionId: aliceFirst.id, unit: "kg" });
    expect(logs.every((l) => l.last_weight === null)).toBe(true);

    // Alice's own 60 kg from a previous session does show, converted to lbs.
    await holder.sql!`UPDATE workout_logs SET actual_weight = 60 WHERE session_id = ${aliceFirst.id}`;
    current.userId = "alice";
    await workoutActions.completeWorkout(1000);
    const aliceSecond = await openSession("alice", 1000, 10);
    logs = await getSessionLogs({ userId: "alice", sessionId: aliceSecond.id, unit: "lbs" });
    expect(logs[0].last_weight).toBe(132.3);

    // And alice can't read bob's session at all.
    expect(await getSessionLogs({ userId: "alice", sessionId: bobSession.id, unit: "kg" })).toEqual([]);
  });
});

describe("plans", () => {
  it("editing an exercise changes one row in one plan and never the shared library", async () => {
    const res = await planActions.updatePlanExercise(10, 100, { name: "Bench Press", type: "weighted", sets: 5, reps: 5, rest: 180 });
    expect(res).toEqual({ success: true });

    const rows = await holder.sql!`SELECT id, sets, reps, rest_seconds, exercise_id FROM plan_exercises ORDER BY id`;
    expect(rows.find((r) => r.id === 100)).toMatchObject({ sets: 5, reps: 5, rest_seconds: 180 });
    expect(rows.find((r) => r.id === 101)).toMatchObject({ sets: 3, reps: 10, rest_seconds: 90 }); // other plan
    expect(rows.find((r) => r.id === 200)).toMatchObject({ sets: 2, reps: 5, rest_seconds: 180 }); // bob

    const [shared] = await holder.sql!`SELECT default_sets, default_reps FROM exercises WHERE id = 1`;
    expect(shared).toEqual({ default_sets: 3, default_reps: 10 });

    // Alice got her own copy of the exercise.
    const copies = await holder.sql!`SELECT id FROM exercises WHERE user_id = 'alice' AND name = 'Bench Press'`;
    expect(copies).toHaveLength(1);
    expect(rows.find((r) => r.id === 100)!.exercise_id).toBe(copies[0].id);
  });

  it("can't touch another user's plan", async () => {
    current.userId = "bob";
    expect(await planActions.updatePlanExercise(10, 100, { name: "Hacked", type: "weighted", sets: 1, reps: 1, rest: 0 })).toEqual({ success: false });
    expect(await planActions.addExerciseToPlan(10, { name: "Hacked", type: "weighted", sets: 1, reps: 1, rest: 0 })).toEqual({ success: false });
    await planActions.deleteExercise(10, 100);
    await planActions.updatePlanTitle(10, "Hacked");
    await expect(planActions.deletePlan(10)).rejects.toThrow("NEXT_REDIRECT /schedule");

    const [plan] = await holder.sql!`SELECT title FROM plans WHERE id = 10`;
    expect(plan.title).toBe("Push");
    const [pe] = await holder.sql!`SELECT name FROM plan_exercises WHERE id = 100`;
    expect(pe.name).toBe("Bench Press");
  });

  it("schedule days follow a plan by id across renames, and only own plans can be assigned", async () => {
    await planActions.updatePlanTitle(10, "Push Day");
    const [w] = await holder.sql!`SELECT plan_id, name FROM workouts WHERE id = 1000`;
    expect(w).toEqual({ plan_id: 10, name: "Push Day" });

    expect(await scheduleActions.assignPlanToWorkout("MON", 20)).toEqual({ success: false }); // bob's plan
    expect(await scheduleActions.assignPlanToWorkout("FUNDAY", 10)).toEqual({ success: false });
    expect(await scheduleActions.assignPlanToWorkout("MON", 11)).toEqual({ success: true });
    const [mon] = await holder.sql!`SELECT plan_id FROM workouts WHERE user_id = 'alice' AND day_label = 'MON'`;
    expect(mon.plan_id).toBe(11);
  });

  it("deleting a plan turns its days into rest days", async () => {
    await expect(planActions.deletePlan(10)).rejects.toThrow("NEXT_REDIRECT /schedule");
    const [w] = await holder.sql!`SELECT plan_id, name FROM workouts WHERE id = 1000`;
    expect(w).toEqual({ plan_id: null, name: "Rest" });
  });
});
