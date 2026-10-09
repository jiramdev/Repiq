import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSql, freshDb } from "./helpers/pg";
import { holder } from "./helpers/setup-db-mock";
import { cookieJar } from "./helpers/next-mocks";

vi.mock("@/lib/db", async () => (await import("./helpers/setup-db-mock")).dbModuleMock());
vi.mock("next/headers", async () => (await import("./helpers/next-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers/next-mocks")).nextNavigationMock);
vi.mock("next/cache", async () => (await import("./helpers/next-mocks")).nextCacheMock);

const { getSessionUserId, requireUserId } = await import("@/lib/auth");
const { loginUser, registerAndOnboard, checkUsernameAvailable, logoutUser } = await import(
  "@/app/auth/actions"
);
const { changePassword } = await import("@/app/account/actions");
const { isBcryptHash } = await import("@/lib/password");
const { SESSION_COOKIE, LEGACY_SESSION_COOKIE } = await import("@/lib/session-token");

async function seedLegacyUser() {
  const sql = holder.sql!;
  await sql`INSERT INTO users (id, email, name) VALUES ('usr_legacy', 'old@repiq.app', 'Old')`;
  await sql`
    INSERT INTO user_profiles (user_id, name, username, email, age, password_hash)
    VALUES ('usr_legacy', 'Old', 'oldtimer', 'old@repiq.app', 30, 'plain-pass')
  `;
}

beforeEach(async () => {
  holder.sql = createSql(await freshDb());
  cookieJar.clear();
});

describe("sessions", () => {
  it("has no fallback user: no cookie means signed out, without touching the DB", async () => {
    await seedLegacyUser();
    holder.sql!.log.length = 0;
    expect(await getSessionUserId()).toBeNull();
    expect(holder.sql!.log).toHaveLength(0);
    await expect(requireUserId()).rejects.toThrow("NEXT_REDIRECT /auth");
  });

  it("rejects the old raw-user-id cookie and forged tokens", async () => {
    await seedLegacyUser();
    cookieJar.set(LEGACY_SESSION_COOKIE, "usr_legacy");
    cookieJar.set(SESSION_COOKIE, "usr_legacy");
    expect(await getSessionUserId()).toBeNull();
    cookieJar.set(SESSION_COOKIE, "A".repeat(43));
    expect(await getSessionUserId()).toBeNull();
  });

  it("logs in, re-hashes a legacy plain-text password, and logs out", async () => {
    await seedLegacyUser();

    expect(await loginUser({ identifier: "oldtimer", password: "wrong" })).toMatchObject({
      success: false,
    });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);

    const res = await loginUser({ identifier: "OLD@repiq.app", password: "plain-pass", timeZone: "Europe/London" });
    expect(res).toEqual({ success: true });
    expect(await getSessionUserId()).toBe("usr_legacy");

    const [row] = await holder.sql!`SELECT password_hash, timezone FROM user_profiles WHERE user_id = 'usr_legacy'`;
    expect(isBcryptHash(String(row.password_hash))).toBe(true);
    expect(row.timezone).toBe("Europe/London");

    // The token in the cookie is not what the DB stores.
    const token = cookieJar.get(SESSION_COOKIE)!;
    const stored = await holder.sql!`SELECT token_hash FROM sessions`;
    expect(stored[0].token_hash).not.toBe(token);

    // Still works with the new hash.
    expect((await loginUser({ identifier: "oldtimer", password: "plain-pass" })).success).toBe(true);

    await expect(logoutUser()).rejects.toThrow("NEXT_REDIRECT /auth");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("expired sessions are not accepted", async () => {
    await seedLegacyUser();
    await loginUser({ identifier: "oldtimer", password: "plain-pass" });
    await holder.sql!`UPDATE sessions SET expires_at = now() - interval '1 minute'`;
    expect(await getSessionUserId()).toBeNull();
  });

  it("password change signs out other devices", async () => {
    await seedLegacyUser();
    await loginUser({ identifier: "oldtimer", password: "plain-pass" });
    const otherDevice = cookieJar.get(SESSION_COOKIE)!;
    await loginUser({ identifier: "oldtimer", password: "plain-pass" });
    const thisDevice = cookieJar.get(SESSION_COOKIE)!;

    expect(await changePassword({ currentPassword: "nope", newPassword: "new-password-1" })).toMatchObject({ success: false });
    expect(await changePassword({ currentPassword: "plain-pass", newPassword: "short" })).toMatchObject({ success: false });
    expect(await changePassword({ currentPassword: "plain-pass", newPassword: "new-password-1" })).toEqual({ success: true });

    expect(await getSessionUserId()).toBe("usr_legacy");
    cookieJar.set(SESSION_COOKIE, otherDevice);
    expect(await getSessionUserId()).toBeNull();
    cookieJar.set(SESSION_COOKIE, thisDevice);
  });
});

describe("registration", () => {
  const base = {
    name: "Alex",
    username: "alexm",
    email: "alex@example.com",
    password: "long-password",
    age: 28,
    notify_workout_reminders: false,
    notify_rest_day_alerts: true,
    timeZone: "Europe/Amsterdam",
  };

  it("creates user, hashed profile and a 7-day schedule, and signs in", async () => {
    expect(await registerAndOnboard(base)).toEqual({ success: true });
    const userId = await getSessionUserId();
    expect(userId).toMatch(/^usr_/);

    const [profile] = await holder.sql!`SELECT password_hash FROM user_profiles WHERE user_id = ${userId}`;
    expect(isBcryptHash(String(profile.password_hash))).toBe(true);
    const days = await holder.sql!`SELECT day_label FROM workouts WHERE user_id = ${userId}`;
    expect(days).toHaveLength(7);
  });

  it("enforces the minimum password length on the server", async () => {
    expect(await registerAndOnboard({ ...base, password: "1234567" })).toMatchObject({ success: false });
    const users = await holder.sql!`SELECT id FROM users`;
    expect(users).toHaveLength(0);
  });

  it("rejects duplicate usernames and emails with friendly errors", async () => {
    await registerAndOnboard(base);
    cookieJar.clear();
    expect(await registerAndOnboard({ ...base, email: "other@example.com" })).toEqual({
      success: false,
      error: "Username is already taken.",
    });
    expect(await registerAndOnboard({ ...base, username: "someoneelse" })).toEqual({
      success: false,
      error: "Email is already registered.",
    });
  });

  it("rolls back everything if part of sign-up fails", async () => {
    // Make the schedule insert fail: the user and profile must not be left behind.
    await holder.sql!`ALTER TABLE workouts ADD CONSTRAINT no_inserts CHECK (false) NOT VALID`;
    const res = await registerAndOnboard(base);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Couldn't create your account. Please try again.");
    expect(await holder.sql!`SELECT id FROM users`).toHaveLength(0);
    expect(await holder.sql!`SELECT user_id FROM user_profiles`).toHaveLength(0);
  });

  it("username check fails closed when the database errors", async () => {
    const original = holder.sql!;
    holder.sql = Object.assign(
      (() => Promise.reject(new Error("db down"))) as unknown as typeof original,
      { transaction: original.transaction, query: original.query, log: original.log }
    );
    expect(await checkUsernameAvailable("freename")).toEqual({
      available: false,
      error: "Couldn't check that username right now. Please try again.",
    });
    holder.sql = original;
    expect(await checkUsernameAvailable("freename")).toEqual({ available: true });
    expect((await checkUsernameAvailable("ab")).available).toBe(false);
  });
});
