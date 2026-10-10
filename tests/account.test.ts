// Account actions, statistics and the rate limiter.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  destroyOtherSessions: async () => {},
}));

const account = await import("@/app/account/actions");
const { logWeight } = await import("@/app/statistics/actions");
const { rateLimit, clientIp } = await import("@/lib/rate-limit");
const { hashPassword } = await import("@/lib/password");

let hash = "";
beforeAll(async () => {
  hash = await hashPassword("alice-password");
});

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  current.userId = "alice";
  const sql = holder.sql;
  await sql`INSERT INTO users (id, email, name) VALUES ('alice', 'a@x.nl', 'Alice'), ('bob', 'b@x.nl', 'Bob')`;
  await sql`
    INSERT INTO user_profiles (user_id, name, username, email, age, password_hash) VALUES
      ('alice', 'Alice', 'alice', 'a@x.nl', 30, ${hash}),
      ('bob', 'Bob', 'bob', 'b@x.nl', 31, NULL)
  `;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("account details", () => {
  const details = { name: "Alice B", age: 31, email: "a@x.nl", username: "alice_b" };

  it("updates name, age and username without a password", async () => {
    expect(await account.updateAccountDetails(details)).toEqual({ success: true });
    const [row] = await holder.sql!`SELECT name, age, username FROM user_profiles WHERE user_id = 'alice'`;
    expect(row).toEqual({ name: "Alice B", age: 31, username: "alice_b" });
  });

  it("needs the current password to change the email", async () => {
    const next = { ...details, email: "new@x.nl" };
    expect(await account.updateAccountDetails(next)).toMatchObject({ success: false, error: /current password/ });
    expect(await account.updateAccountDetails({ ...next, currentPassword: "wrong" })).toMatchObject({
      success: false,
      error: "Current password does not match.",
    });
    expect(await account.updateAccountDetails({ ...next, currentPassword: "alice-password" })).toEqual({ success: true });
    const [u] = await holder.sql!`SELECT email FROM users WHERE id = 'alice'`;
    expect(u.email).toBe("new@x.nl");
  });

  it("refuses an email or username someone else has", async () => {
    expect(
      await account.updateAccountDetails({ ...details, email: "B@x.nl", currentPassword: "alice-password" })
    ).toMatchObject({ success: false, error: "Email is already registered." });
    expect(await account.updateAccountDetails({ ...details, username: "bob" })).toMatchObject({
      success: false,
      error: "Username is already taken.",
    });
  });

  it("changing body weight in account details also logs it", async () => {
    expect(await account.updateAccountDetails({ ...details, body_weight: "82.4" })).toEqual({ success: true });
    expect(await account.updateAccountDetails({ ...details, body_weight: 82.4 })).toEqual({ success: true }); // unchanged
    expect(await account.updateAccountDetails({ ...details, body_weight: "" })).toEqual({ success: true }); // kept
    const metrics = await holder.sql!`SELECT value::float AS value, unit FROM metrics`;
    expect(metrics).toEqual([{ value: 82.4, unit: "kg" }]);
    const [p] = await holder.sql!`SELECT body_weight::float AS w FROM user_profiles WHERE user_id = 'alice'`;
    expect(p.w).toBe(82.4);
    expect((await account.updateAccountDetails({ ...details, body_weight: "1000" })).success).toBe(false);
  });

  it("validates input on the server", async () => {
    expect((await account.updateAccountDetails({ ...details, age: 7 })).success).toBe(false);
    expect((await account.updateAccountDetails({ ...details, username: "No Spaces" })).success).toBe(false);
  });
});

describe("statistics", () => {
  it("logs body weight in the user's unit, within sensible bounds", async () => {
    expect(await logWeight(80.25)).toEqual({ success: true });
    expect(await logWeight(5)).toEqual({ success: false });
    expect(await logWeight(Number.NaN)).toEqual({ success: false });
    await account.setUnitSystem("lbs");
    expect(await logWeight(180)).toEqual({ success: true });
    const rows = await holder.sql!`SELECT value::float AS value, unit FROM metrics ORDER BY id`;
    const [p] = await holder.sql!`SELECT body_weight::float AS w, body_weight_unit AS u FROM user_profiles WHERE user_id = 'alice'`;
    expect(p).toEqual({ w: 180, u: "lbs" }); // mirrored on the profile
    expect(rows).toEqual([
      { value: 80.3, unit: "kg" },
      { value: 180, unit: "lbs" },
    ]);
  });
});

describe("rate limiter", () => {
  const rule = { name: "test", limit: 3, windowSeconds: 60 };

  it("allows up to the limit per window and subject", async () => {
    const t = Date.UTC(2026, 9, 10, 12, 0, 0);
    for (let i = 0; i < 3; i++) expect((await rateLimit(rule, "1.2.3.4", t)).ok).toBe(true);
    const blocked = await rateLimit(rule, "1.2.3.4", t + 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(59);
    expect((await rateLimit(rule, "5.6.7.8", t)).ok).toBe(true);
    expect((await rateLimit(rule, "1.2.3.4", t + 60_000)).ok).toBe(true); // next window
  });

  it("stores hashed keys only", async () => {
    await rateLimit(rule, "alice@example.com");
    const rows = await holder.sql!`SELECT key FROM rate_limits`;
    expect(String(rows[0].key)).not.toContain("alice");
  });

  it("fails open when its table is missing, and can be disabled", async () => {
    await holder.sql!`DROP TABLE rate_limits`;
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 5; i++) expect((await rateLimit(rule, "x")).ok).toBe(true);
    spy.mockRestore();
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    expect((await rateLimit(rule, "x")).ok).toBe(true);
  });

  it("reads the client IP from Vercel's headers", () => {
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
