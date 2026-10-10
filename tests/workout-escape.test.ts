// Regression tests for the "stuck in the active workout" production bug.
//
// Cause: rendering /workout/[id] started a session. Finish and Discard
// revalidated that page, so the refresh right after them seeded a brand-new
// session for today, and the lock-in sent every page back to it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSql, freshDb } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());
vi.mock("next/headers", async () => (await import("./helpers/next-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers/next-mocks")).nextNavigationMock);
vi.mock("next/cache", async () => (await import("./helpers/next-mocks")).nextCacheMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
// The client view isn't under test here: render it as a plain marker.
vi.mock("@/app/workout/[id]/workout-view", () => ({
  WorkoutView: () => null,
  EmptyPlanView: () => null,
}));

const current = vi.hoisted(() => ({ userId: "alice" as string | null }));
vi.mock("@/lib/auth", () => ({
  requireUserId: async () => {
    if (!current.userId) throw new Error("NEXT_REDIRECT /auth");
    return current.userId;
  },
  getSessionUserId: async () => current.userId,
}));

const { pickActiveSession, LOCK_MAX_AGE_MS } = await import("@/lib/workout-lock");
const { getActiveWorkout, requireIdleUserId } = await import("@/lib/active-workout");
const { lookupSession } = await import("@/lib/session-lookup");
const { hashSessionToken } = await import("@/lib/session-token");
const actions = await import("@/app/workout/[id]/actions");
const { WorkoutLoader } = await import("@/app/workout/[id]/loader");
const finishRoute = await import("@/app/api/workout/[id]/finish/route");
const discardRoute = await import("@/app/api/workout/[id]/discard/route");

async function seed() {
  const sql = holder.sql!;
  await sql`INSERT INTO users (id, email, name) VALUES ('alice', 'a@x.nl', 'Alice'), ('bob', 'b@x.nl', 'Bob')`;
  await sql`
    INSERT INTO user_profiles (user_id, username, email, name, age, timezone) VALUES
      ('alice', 'alice', 'a@x.nl', 'Alice', 30, 'Europe/Amsterdam'),
      ('bob', 'bob', 'b@x.nl', 'Bob', 30, 'Europe/Amsterdam')
  `;
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

const render = (id: number | string) => WorkoutLoader({ paramsPromise: Promise.resolve({ id: String(id) }) });

async function openSessions(userId = "alice") {
  const rows = await holder.sql!`SELECT id, workout_id FROM workout_sessions WHERE user_id = ${userId} AND completed_at IS NULL`;
  return rows.map((r) => Number(r.workout_id));
}

async function logSet(workoutId: number) {
  await holder.sql!`
    UPDATE workout_logs SET actual_weight = 60, completed = true
    WHERE session_id = (SELECT id FROM workout_sessions WHERE workout_id = ${workoutId} AND completed_at IS NULL)
      AND set_number = 1
  `;
}

function post(path: string, headers: Record<string, string> = { origin: "https://repiq.test", host: "repiq.test" }) {
  return new NextRequest(`https://repiq.test${path}`, { method: "POST", headers });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  current.userId = "alice";
  await seed();
});

describe("the workout page never starts a workout", () => {
  it("rendering without an open session redirects home and creates nothing", async () => {
    await expect(render(1000)).rejects.toThrow("NEXT_REDIRECT /");
    expect(await openSessions()).toEqual([]);
  });

  it("an empty plan shows the empty-plan screen instead of looping", async () => {
    await expect(render(1002)).resolves.toBeTruthy();
    expect(await openSessions()).toEqual([]);
  });

  it("startWorkout is the only way in", async () => {
    expect(await actions.startWorkout(1000)).toEqual({ ok: true, workoutId: 1000 });
    expect(await openSessions()).toEqual([1000]);
    await expect(render(1000)).resolves.toBeTruthy();
    // Starting another while one is active goes back to the active one.
    expect(await actions.startWorkout(1001)).toEqual({ ok: true, workoutId: 1000 });
    expect(await openSessions()).toEqual([1000]);
  });

  it("startWorkout refuses an empty plan and other users' workouts", async () => {
    expect(await actions.startWorkout(1002)).toMatchObject({ ok: false, planId: 12 });
    current.userId = "bob";
    expect(await actions.startWorkout(1000)).toMatchObject({ ok: false });
    expect(await openSessions("alice")).toEqual([]);
  });
});

describe("Finish and Discard always get the user out", () => {
  for (const kind of ["finish", "discard"] as const) {
    it(`after ${kind}, the follow-up render doesn't restart the workout or re-lock`, async () => {
      await actions.startWorkout(1000);
      await logSet(1000);
      expect((await getActiveWorkout("alice"))?.workoutId).toBe(1000);

      const res = kind === "finish" ? await actions.completeWorkout(1000) : await actions.discardWorkout(1000);
      expect(res.ok).toBe(true);

      // What the router refresh and the redirect after the action do:
      await expect(render(1000)).rejects.toThrow("NEXT_REDIRECT /");
      expect(await openSessions()).toEqual([]);
      expect(await getActiveWorkout("alice")).toBeNull();
      await expect(requireIdleUserId()).resolves.toBe("alice");
    });

    it(`the ${kind} route works as a fallback and is idempotent`, async () => {
      await actions.startWorkout(1000);
      await logSet(1000);
      const route = kind === "finish" ? finishRoute : discardRoute;
      const first = await route.POST(post(`/api/workout/1000/${kind}`), params("1000"));
      expect(first.status).toBe(200);
      expect(await openSessions()).toEqual([]);
      const again = await route.POST(post(`/api/workout/1000/${kind}`), params("1000"));
      expect(again.status).toBe(200);

      const completed = await holder.sql!`SELECT count(*)::int AS n FROM completed_sessions WHERE user_id = 'alice'`;
      expect(completed[0].n).toBe(kind === "finish" ? 1 : 0);
    });
  }

  it("the routes refuse cross-site requests, strangers and bad ids", async () => {
    await actions.startWorkout(1000);
    const cross = await discardRoute.POST(
      post("/api/workout/1000/discard", { origin: "https://evil.test", host: "repiq.test" }),
      params("1000")
    );
    expect(cross.status).toBe(403);
    expect((await discardRoute.POST(post("/api/workout/abc/discard"), params("abc"))).status).toBe(400);

    current.userId = "bob";
    expect((await discardRoute.POST(post("/api/workout/1000/discard"), params("1000"))).status).toBe(200);
    expect(await openSessions("alice")).toEqual([1000]); // bob can't touch alice's workout

    current.userId = null;
    expect((await discardRoute.POST(post("/api/workout/1000/discard"), params("1000"))).status).toBe(401);
    expect(await openSessions("alice")).toEqual([1000]);
  });

  it("Finish works even when migration 0009 never ran", async () => {
    await actions.startWorkout(1000);
    await logSet(1000);
    await holder.sql!.query("ALTER TABLE workout_logs DROP COLUMN duration_seconds");
    // The lock lookups still work...
    expect((await getActiveWorkout("alice"))?.workoutId).toBe(1000);
    // ...and so does leaving.
    expect((await finishRoute.POST(post("/api/workout/1000/finish"), params("1000"))).status).toBe(200);
    expect(await getActiveWorkout("alice")).toBeNull();
  });
});

describe("escape hatch: a workout older than 12 hours never locks", () => {
  it("pickActiveSession drops sessions past LOCK_MAX_AGE_MS", () => {
    const now = new Date("2026-10-10T20:00:00Z");
    const row = (hoursAgo: number, has_data = true) => ({
      id: 1,
      workout_id: 5,
      started_on: "2026-10-10",
      started_at: new Date(now.getTime() - hoursAgo * 3600_000).toISOString(),
      has_data,
    });
    expect(pickActiveSession([row(1)], "UTC", now)).not.toBeNull();
    expect(pickActiveSession([row(11.9)], "UTC", now)).not.toBeNull();
    expect(pickActiveSession([row(12)], "UTC", now)).toBeNull();
    expect(pickActiveSession([row(30)], "UTC", now)).toBeNull();
    expect(LOCK_MAX_AGE_MS).toBe(12 * 3600_000);
    // Rows without started_at (older callers) fall back to the day rule.
    expect(pickActiveSession([{ id: 1, workout_id: 5, started_on: "2026-10-10", has_data: false }], "UTC", now)).not.toBeNull();
  });

  it("an old session with logged sets unlocks the app but stays resumable and discardable", async () => {
    await actions.startWorkout(1000);
    await logSet(1000);
    await holder.sql!`UPDATE workout_sessions SET started_at = now() - interval '13 hours'`;

    expect(await getActiveWorkout("alice")).toBeNull();
    await expect(requireIdleUserId()).resolves.toBe("alice");
    // Nothing logged is lost: the session is still there and the page shows it.
    expect(await openSessions()).toEqual([1000]);
    await expect(render(1000)).resolves.toBeTruthy();
    // Starting something else is refused until it's dealt with (not silently deleted).
    expect(await actions.startWorkout(1001)).toMatchObject({ ok: false });
    expect(await actions.discardWorkout(1000)).toEqual({ ok: true });
    expect(await openSessions()).toEqual([]);
  });

  it("an old empty session from today is cleaned up when the next workout starts", async () => {
    await actions.startWorkout(1000);
    await holder.sql!`UPDATE workout_sessions SET started_at = now() - interval '13 hours'`;
    expect(await getActiveWorkout("alice")).toBeNull();
    expect(await actions.startWorkout(1001)).toEqual({ ok: true, workoutId: 1001 });
    expect(await openSessions()).toEqual([1001]);
  });

  it("the proxy lookup agrees with the page guards (no redirect loop)", async () => {
    const token = "a".repeat(64);
    await holder.sql!`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES ('alice', ${hashSessionToken(token)}, now() + interval '30 days')
    `;
    await actions.startWorkout(1000);
    await logSet(1000);
    expect((await lookupSession(token))?.active?.workoutId).toBe(1000);
    expect((await getActiveWorkout("alice"))?.workoutId).toBe(1000);

    await holder.sql!`UPDATE workout_sessions SET started_at = now() - interval '13 hours'`;
    expect((await lookupSession(token))?.active).toBeNull();
    expect(await getActiveWorkout("alice")).toBeNull();

    await holder.sql!`UPDATE workout_sessions SET started_at = now()`;
    await actions.completeWorkout(1000);
    expect((await lookupSession(token))?.active).toBeNull();
  });
});
