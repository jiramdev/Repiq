// The workout lock-in: while a workout is active, nothing else may change.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSql, freshDb } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());
vi.mock("next/headers", async () => (await import("./helpers/next-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers/next-mocks")).nextNavigationMock);
vi.mock("next/cache", async () => (await import("./helpers/next-mocks")).nextCacheMock);

const current = vi.hoisted(() => ({ userId: "alice" }));
vi.mock("@/lib/auth", () => ({
  requireUserId: async () => current.userId,
  getSessionUserId: async () => current.userId,
  destroySession: async () => {},
  destroyOtherSessions: async () => {},
}));

// Lets a test simulate a request that slipped past the lock (a race), to prove
// the SQL underneath still never deletes logged sets.
const bypass = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/active-workout", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/active-workout")>();
  return {
    ...real,
    workoutLockError: async (userId: string) => (bypass.on ? null : real.workoutLockError(userId)),
  };
});

const { pickActiveSession } = await import("@/lib/workout-lock");
const { getActiveWorkout, requireIdleUserId } = await import("@/lib/active-workout");
const { startOrResumeSession } = await import("@/lib/workout-session");
const workoutActions = await import("@/app/workout/[id]/actions");
const planActions = await import("@/app/plans/[id]/actions");
const scheduleActions = await import("@/app/schedule/actions");
const accountActions = await import("@/app/account/actions");
const { logWeight } = await import("@/app/statistics/actions");
const { logoutUser } = await import("@/app/auth/actions");
const { todayIn } = await import("@/lib/time");

const LOCKED = "Finish or discard your active workout first.";
const today = () => todayIn("Europe/Amsterdam").date;

async function seed() {
  const sql = holder.sql!;
  await sql`INSERT INTO users (id, email, name) VALUES ('alice', 'a@x.nl', 'Alice')`;
  await sql`INSERT INTO user_profiles (user_id, username, email, name, age) VALUES ('alice', 'alice', 'a@x.nl', 'Alice', 30)`;
  await sql`INSERT INTO plans (id, user_id, title, exercise_count) VALUES (10, 'alice', 'Push', 1), (11, 'alice', 'Pull', 1), (12, 'alice', 'Empty', 0)`;
  await sql`
    INSERT INTO plan_exercises (id, plan_id, name, sets, reps, rest_seconds) VALUES
      (100, 10, 'Bench', 2, 10, 90),
      (101, 11, 'Row', 2, 10, 90)
  `;
  await sql`
    INSERT INTO workouts (id, user_id, name, day_label, plan_id) VALUES
      (1000, 'alice', 'Push', 'MON', 10),
      (1001, 'alice', 'Pull', 'TUE', 11),
      (1002, 'alice', 'Empty', 'WED', 12)
  `;
  for (const table of ["plans", "plan_exercises", "workouts"]) {
    await sql.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`);
  }
}

function start(workoutId: number, planId: number, day = today()) {
  return startOrResumeSession({ userId: "alice", workoutId, planId, planTitle: "Plan", today: day, unit: "kg" });
}

async function logSomething(sessionId: number) {
  await holder.sql!`UPDATE workout_logs SET actual_weight = 60 WHERE session_id = ${sessionId} AND set_number = 1`;
}

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  current.userId = "alice";
  bypass.on = false;
  await seed();
});

describe("pickActiveSession", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  it("locks on today's session, or an older one with logged data", () => {
    expect(pickActiveSession([], "Europe/Amsterdam", now)).toBeNull();
    expect(
      pickActiveSession([{ id: 1, workout_id: 5, started_on: "2026-10-10", has_data: false }], "Europe/Amsterdam", now)
    ).toEqual({ sessionId: 1, workoutId: 5, startedOn: "2026-10-10", stale: false });
    expect(
      pickActiveSession([{ id: 2, workout_id: 6, started_on: "2026-10-01", has_data: true }], "Europe/Amsterdam", now)
    ).toMatchObject({ workoutId: 6, stale: true });
  });

  it("ignores stale sessions with nothing logged", () => {
    expect(
      pickActiveSession([{ id: 3, workout_id: 7, started_on: "2026-10-01", has_data: false }], "Europe/Amsterdam", now)
    ).toBeNull();
  });

  it("uses the user's timezone for 'today'", () => {
    // 23:30 UTC on the 9th is already the 10th in Amsterdam.
    const late = new Date("2026-10-09T23:30:00Z");
    const row = [{ id: 1, workout_id: 5, started_on: "2026-10-09", has_data: false }];
    expect(pickActiveSession(row, "Europe/Amsterdam", late)).toBeNull();
    expect(pickActiveSession(row, "UTC", late)).not.toBeNull();
  });
});

describe("starting workouts", () => {
  it("allows only one active workout per user", async () => {
    const a = await start(1000, 10);
    expect(a).not.toBeNull();
    expect(await start(1001, 11)).toBeNull();
    expect((await getActiveWorkout("alice"))?.workoutId).toBe(1000);
  });

  it("doesn't start a session for a plan without exercises", async () => {
    expect(await start(1002, 12)).toBeNull();
    expect(await getActiveWorkout("alice")).toBeNull();
  });

  it("stale empty sessions never lock and are cleaned up; stale ones with data are kept", async () => {
    const old = (await start(1000, 10, "2026-01-05"))!;
    expect(await getActiveWorkout("alice")).toBeNull(); // nothing logged, from an earlier day
    const fresh = await start(1001, 11);
    expect(fresh).not.toBeNull();
    expect(await holder.sql!`SELECT 1 FROM workout_sessions WHERE id = ${old.id}`).toHaveLength(0);

    await workoutActions.discardWorkout(1001);
    const kept = (await start(1000, 10, "2026-01-06"))!;
    await logSomething(kept.id);
    const active = await getActiveWorkout("alice");
    expect(active).toMatchObject({ workoutId: 1000, sessionId: kept.id, stale: true });
    // Starting another workout doesn't drop it, and it stays the active one.
    expect(await start(1001, 11)).toBeNull();
    expect(await holder.sql!`SELECT 1 FROM workout_sessions WHERE id = ${kept.id}`).toHaveLength(1);
    // The user can always get out by discarding it.
    await workoutActions.discardWorkout(1000);
    expect(await getActiveWorkout("alice")).toBeNull();
  });
});

describe("guards while a workout is active", () => {
  beforeEach(async () => {
    const s = (await start(1000, 10))!;
    await logSomething(s.id);
  });

  it("pages redirect to the workout", async () => {
    await expect(requireIdleUserId()).rejects.toThrow("NEXT_REDIRECT /workout/1000");
  });

  it("schedule, plan, account, statistics and sign-out actions refuse", async () => {
    expect(await scheduleActions.createPlan("New")).toEqual({ id: null, error: LOCKED });
    expect(await scheduleActions.assignPlanToWorkout("TUE", 10)).toEqual({ success: false, error: LOCKED });
    expect(await planActions.updatePlanTitle(10, "Renamed")).toEqual({ success: false, error: LOCKED });
    expect(await planActions.addExerciseToPlan(10, "Squat", 3, 5, 120)).toEqual({ success: false, error: LOCKED });
    expect(await planActions.updatePlanExercise(10, 100, "Bench", 3, 5, 120)).toEqual({ success: false, error: LOCKED });
    expect(await planActions.deleteExercise(10, 100)).toEqual({ success: false, error: LOCKED });
    expect(await planActions.deletePlan(10)).toEqual({ success: false, error: LOCKED });
    expect(await accountActions.setUnitSystem("lbs")).toEqual({ success: false, error: LOCKED });
    expect(await accountActions.setNotification("notify_rest_day_alerts", true)).toEqual({ success: false, error: LOCKED });
    expect(
      await accountActions.updateAccountDetails({ name: "A", age: 30, email: "a@x.nl", username: "alice" })
    ).toEqual({ success: false, error: LOCKED });
    expect(
      await accountActions.changePassword({ currentPassword: "whatever", newPassword: "new-password-1" })
    ).toEqual({ success: false, error: LOCKED });
    expect(await accountActions.resetWorkoutHistory()).toEqual({ success: false, error: LOCKED });
    expect(await logWeight(80)).toEqual({ success: false, error: LOCKED });
    expect(await logoutUser()).toEqual({ success: false, error: LOCKED });

    // Nothing changed.
    const [plan] = await holder.sql!`SELECT title FROM plans WHERE id = 10`;
    expect(plan.title).toBe("Push");
    expect(await holder.sql!`SELECT 1 FROM plans`).toHaveLength(3);
    expect(await holder.sql!`SELECT 1 FROM metrics`).toHaveLength(0);
  });

  it("finishing releases the lock", async () => {
    expect(await workoutActions.completeWorkout(1000)).toEqual({ ok: true });
    expect(await getActiveWorkout("alice")).toBeNull();
    await expect(requireIdleUserId()).resolves.toBe("alice");
    expect((await scheduleActions.createPlan("New")).id).toEqual(expect.any(Number));
  });
});

describe("never silently deleting logged sets", () => {
  it("re-assigning a day drops an empty unfinished session but keeps one with data", async () => {
    const empty = (await start(1000, 10))!;
    bypass.on = true;
    expect(await scheduleActions.assignPlanToWorkout("MON", 11)).toEqual({ success: true });
    expect(await holder.sql!`SELECT 1 FROM workout_sessions WHERE id = ${empty.id}`).toHaveLength(0);

    const withData = (await start(1001, 11))!;
    await logSomething(withData.id);
    expect(await scheduleActions.assignPlanToWorkout("TUE", 10)).toEqual({ success: true });
    expect(await holder.sql!`SELECT 1 FROM workout_sessions WHERE id = ${withData.id}`).toHaveLength(1);
  });

  it("deleting a plan keeps an unfinished session with data", async () => {
    const s = (await start(1000, 10))!;
    await logSomething(s.id);
    bypass.on = true;
    await expect(planActions.deletePlan(10)).rejects.toThrow("NEXT_REDIRECT /schedule");
    const [row] = await holder.sql!`SELECT plan_id, completed_at FROM workout_sessions WHERE id = ${s.id}`;
    expect(row).toEqual({ plan_id: null, completed_at: null });
    expect(await holder.sql!`SELECT 1 FROM workout_logs WHERE session_id = ${s.id}`).toHaveLength(2);
  });

  it("resetting history keeps an open session", async () => {
    const done = (await start(1001, 11))!;
    await workoutActions.completeWorkout(1001);
    const open = (await start(1000, 10, "2026-01-05"))!; // stale, empty: not active
    expect(await accountActions.resetWorkoutHistory()).toEqual({ success: true });
    expect(await holder.sql!`SELECT 1 FROM workout_sessions WHERE id = ${done.id}`).toHaveLength(0);
    expect(await holder.sql!`SELECT 1 FROM workout_sessions WHERE id = ${open.id}`).toHaveLength(1);
  });
});
