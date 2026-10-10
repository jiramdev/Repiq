// /api/push/deliver (QStash callback) and /api/push/schedule.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { createHash } from "node:crypto";
import { createSql, freshDb } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());
vi.mock("next/headers", async () => (await import("./helpers/next-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers/next-mocks")).nextNavigationMock);

const current = vi.hoisted(() => ({ userId: "alice" as string | null }));
vi.mock("@/lib/auth", () => ({
  getSessionUserId: async () => current.userId,
  requireUserId: async () => current.userId,
}));

const push = vi.hoisted(() => ({ result: { sent: 1, failed: 0 }, calls: [] as unknown[] }));
vi.mock("@/lib/push", () => ({
  isPushConfigured: () => true,
  sendPushToUser: async (...args: unknown[]) => {
    push.calls.push(args);
    return push.result;
  },
}));

const deliver = await import("@/app/api/push/deliver/route");
const schedule = await import("@/app/api/push/schedule/route");

const CURRENT_KEY = "sig_current_test_key";
const NEXT_KEY = "sig_next_test_key";
const APP_URL = "https://repiq.test";
const DELIVER_URL = `${APP_URL}/api/push/deliver`;
const TIMER = "3b241101-e2bb-4255-8caf-4136c566a962";

async function sign(body: string, opts: { url?: string; key?: string } = {}) {
  const bodyHash = createHash("sha256").update(body).digest("base64url");
  return new SignJWT({ body: bodyHash })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("Upstash")
    .setSubject(opts.url ?? DELIVER_URL)
    .setIssuedAt()
    .setNotBefore(Math.floor(Date.now() / 1000) - 5)
    .setExpirationTime("5m")
    .setJti(`jwt_${Math.random()}`)
    .sign(new TextEncoder().encode(opts.key ?? CURRENT_KEY));
}

async function deliverReq(body: string, signature?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("upstash-signature", signature);
  return deliver.POST(new Request(DELIVER_URL, { method: "POST", body, headers }));
}

function scheduleReq(method: "POST" | "DELETE", body?: unknown) {
  return new Request(`${APP_URL}/api/push/schedule`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  current.userId = "alice";
  push.result = { sent: 1, failed: 0 };
  push.calls = [];
  vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", CURRENT_KEY);
  vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", NEXT_KEY);
  vi.stubEnv("APP_URL", APP_URL);
  vi.stubEnv("QSTASH_TOKEN", "");
  await holder.sql`INSERT INTO workouts (id, user_id, name, day_label) VALUES (7, 'alice', 'Push', 'MON'), (8, 'bob', 'Bob', 'MON')`;
  await holder.sql`
    INSERT INTO rest_timers (id, user_id, workout_id, fire_at) VALUES (${TIMER}::uuid, 'alice', 7, now())
  `;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/push/deliver", () => {
  const body = JSON.stringify({ timerId: TIMER });

  it("is unavailable without signing keys", async () => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");
    expect((await deliverReq(body, await sign(body))).status).toBe(503);
  });

  it("rejects missing, forged and wrong-key signatures", async () => {
    expect((await deliverReq(body)).status).toBe(401);
    expect((await deliverReq(body, "not-a-jwt")).status).toBe(401);
    expect((await deliverReq(body, await sign(body, { key: "someone-elses-key" }))).status).toBe(401);
    expect(push.calls).toHaveLength(0);
  });

  it("rejects a valid signature for a different URL or a different body", async () => {
    expect((await deliverReq(body, await sign(body, { url: "https://repiq.test/api/other" }))).status).toBe(401);
    const otherBody = JSON.stringify({ timerId: "00000000-0000-4000-8000-000000000000" });
    expect((await deliverReq(otherBody, await sign(body))).status).toBe(401);
    expect(push.calls).toHaveLength(0);
  });

  it("accepts the next signing key too (key rotation)", async () => {
    const res = await deliverReq(body, await sign(body, { key: NEXT_KEY }));
    expect(res.status).toBe(200);
  });

  it("sends once: a replayed delivery is skipped", async () => {
    const first = await deliverReq(body, await sign(body));
    expect(await first.json()).toEqual({ sent: 1 });
    expect(push.calls[0]).toEqual(["alice", expect.objectContaining({ url: "/workout/7", timerId: TIMER })]);
    const second = await deliverReq(body, await sign(body));
    expect(await second.json()).toEqual({ skipped: true });
    expect(push.calls).toHaveLength(1);
  });

  it("skips cancelled timers", async () => {
    await holder.sql!`UPDATE rest_timers SET cancelled_at = now()`;
    expect(await (await deliverReq(body, await sign(body))).json()).toEqual({ skipped: true });
  });

  it("releases the timer for QStash to retry when every push failed", async () => {
    push.result = { sent: 0, failed: 1 };
    const res = await deliverReq(body, await sign(body));
    expect(res.status).toBe(502);
    const [row] = await holder.sql!`SELECT sent_at FROM rest_timers`;
    expect(row.sent_at).toBeNull();
    push.result = { sent: 1, failed: 0 };
    expect((await deliverReq(body, await sign(body))).status).toBe(200);
  });

  it("ignores malformed timer ids without a database error", async () => {
    const bad = JSON.stringify({ timerId: "-".repeat(36) });
    expect(await (await deliverReq(bad, await sign(bad))).json()).toEqual({ skipped: true });
  });
});

describe("/api/push/schedule", () => {
  it("requires a session", async () => {
    current.userId = null;
    expect((await schedule.POST(scheduleReq("POST", { restSeconds: 90, workoutId: 7 }))).status).toBe(401);
    expect((await schedule.DELETE(scheduleReq("DELETE"))).status).toBe(401);
  });

  it("validates input and ownership", async () => {
    expect((await schedule.POST(scheduleReq("POST", { restSeconds: 2, workoutId: 7 }))).status).toBe(400);
    expect((await schedule.POST(scheduleReq("POST", { restSeconds: 90, workoutId: 99999999999 }))).status).toBe(400);
    expect((await schedule.POST(scheduleReq("POST", { restSeconds: 90, workoutId: "7" }))).status).toBe(200);
    expect((await schedule.POST(scheduleReq("POST", { restSeconds: 90, workoutId: 8 }))).status).toBe(404);
  });

  it("degrades gracefully without QStash", async () => {
    const res = await schedule.POST(scheduleReq("POST", { restSeconds: 90, workoutId: 7 }));
    expect(await res.json()).toEqual({ scheduled: false, reason: "not_configured" });
  });

  it("is rate-limited per user", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 121; i++) last = await schedule.POST(scheduleReq("POST", { restSeconds: 90, workoutId: 7 }));
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("cancels only the caller's own timers and rejects bad ids", async () => {
    expect((await schedule.DELETE(scheduleReq("DELETE", { timerId: "-".repeat(36) }))).status).toBe(400);
    current.userId = "bob";
    expect(await (await schedule.DELETE(scheduleReq("DELETE", { timerId: TIMER }))).json()).toEqual({ cancelled: 0 });
    current.userId = "alice";
    expect(await (await schedule.DELETE(scheduleReq("DELETE", { timerId: TIMER }))).json()).toEqual({ cancelled: 1 });
  });
});
