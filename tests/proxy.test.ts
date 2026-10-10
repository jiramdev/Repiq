// proxy.ts: session validation, the workout lock-in redirect and sliding expiry.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSql, freshDb } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());

const { proxy } = await import("@/proxy");
const { generateSessionToken, hashSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } = await import(
  "@/lib/session-token"
);
const { todayIn } = await import("@/lib/time");

const BASE = "https://repiq.test";
let token = "";

function req(path: string, init: { method?: string; cookie?: string | null } = {}) {
  const headers = new Headers();
  const cookie = init.cookie === undefined ? `${SESSION_COOKIE}=${token}` : init.cookie;
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(path, BASE), { method: init.method ?? "GET", headers });
}

function location(res: Response) {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname : null;
}

async function openWorkout(startedOn = todayIn("Europe/Amsterdam").date, withData = false) {
  const sql = holder.sql!;
  const [s] = await sql`
    INSERT INTO workout_sessions (user_id, workout_id, plan_name, started_on)
    VALUES ('alice', 7, 'Push', ${startedOn}::date) RETURNING id
  `;
  await sql`
    INSERT INTO workout_logs (workout_id, session_id, exercise_name, set_number, order_index, actual_weight)
    VALUES (7, ${s.id}, 'Bench', 1, 0, ${withData ? 50 : null})
  `;
}

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  const sql = holder.sql;
  await sql`INSERT INTO user_profiles (user_id, username, timezone) VALUES ('alice', 'alice', 'Europe/Amsterdam')`;
  await sql`INSERT INTO workouts (id, user_id, name, day_label) VALUES (7, 'alice', 'Push', 'MON')`;
  token = generateSessionToken();
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES ('alice', ${hashSessionToken(token)}, now() + interval '50 days')
  `;
});

describe("proxy", () => {
  it("sends visitors without a session to /auth, and lets /auth through", async () => {
    const res = await proxy(req("/schedule", { cookie: null }));
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/auth");
    expect((await proxy(req("/auth", { cookie: null }))).headers.get("x-middleware-next")).toBe("1");
  });

  it("returns 401 for API routes without a cookie, except the signed QStash callback", async () => {
    expect((await proxy(req("/api/push/schedule", { cookie: null }))).status).toBe(401);
    expect((await proxy(req("/api/workout/active", { cookie: null }))).status).toBe(401);
    expect((await proxy(req("/api/push/deliver", { method: "POST", cookie: null }))).headers.get("x-middleware-next")).toBe("1");
  });

  it("drops an invalid or expired session cookie", async () => {
    const forged = await proxy(req("/", { cookie: `${SESSION_COOKIE}=${"A".repeat(43)}` }));
    expect(location(forged)).toBe("/auth");
    expect(forged.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;`));

    const legacy = await proxy(req("/", { cookie: `${SESSION_COOKIE}=usr_123` }));
    expect(location(legacy)).toBe("/auth");
  });

  it("lets a valid session through and bounces /auth to the dashboard", async () => {
    expect((await proxy(req("/statistics"))).headers.get("x-middleware-next")).toBe("1");
    expect(location(await proxy(req("/auth")))).toBe("/");
  });

  it("locks every page onto the active workout", async () => {
    await openWorkout();
    for (const path of ["/", "/schedule", "/plans/3", "/statistics", "/account", "/workout/99", "/auth"]) {
      const res = await proxy(req(path));
      expect(res.status, path).toBe(307);
      expect(location(res), path).toBe("/workout/7");
    }
    expect((await proxy(req("/workout/7"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("doesn't redirect Server Action POSTs (they enforce the lock themselves)", async () => {
    await openWorkout();
    expect((await proxy(req("/schedule", { method: "POST" }))).headers.get("x-middleware-next")).toBe("1");
  });

  it("an old unfinished workout locks only when something was logged", async () => {
    await openWorkout("2026-01-05", false);
    expect((await proxy(req("/"))).headers.get("x-middleware-next")).toBe("1");
    await holder.sql!`DELETE FROM workout_sessions`;
    await openWorkout("2026-01-05", true);
    expect(location(await proxy(req("/")))).toBe("/workout/7");
  });

  it("slides the session expiry forward once a day", async () => {
    const res = await proxy(req("/"));
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=${token}`));
    const [row] = await holder.sql!`SELECT expires_at FROM sessions`;
    const remaining = (new Date(row.expires_at as string).getTime() - Date.now()) / 1000;
    expect(remaining).toBeGreaterThan(SESSION_TTL_SECONDS - 60);

    // Just renewed: no second write.
    expect((await proxy(req("/"))).headers.get("set-cookie")).toBeNull();
  });

  it("fails open when the database is down (pages still check the session)", async () => {
    const original = holder.sql!;
    holder.sql = Object.assign((() => Promise.reject(new Error("db down"))) as unknown as typeof original, {
      transaction: original.transaction,
      query: original.query,
      log: original.log,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await proxy(req("/"))).headers.get("x-middleware-next")).toBe("1");
    spy.mockRestore();
    holder.sql = original;
  });
});
