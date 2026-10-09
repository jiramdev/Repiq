import { describe, expect, it } from "vitest";
import { todayIn, isValidTimeZone, resolveTimeZone, DEFAULT_TIMEZONE } from "@/lib/time";
import { convertWeight, normalizeUnit } from "@/lib/units";
import { toIntInRange, toNumberInRange, cleanText, normalizeUsername } from "@/lib/validation";
import {
  generateSessionToken,
  hashSessionToken,
  looksLikeSessionToken,
} from "@/lib/session-token";

describe("todayIn", () => {
  it("uses the user's timezone, not UTC, around midnight", () => {
    // 23:30 UTC on Friday 9 Oct 2026 is already Saturday 01:30 in Amsterdam.
    const now = new Date("2026-10-09T23:30:00Z");
    expect(todayIn("Europe/Amsterdam", now)).toMatchObject({ date: "2026-10-10", dayLabel: "SAT" });
    expect(todayIn("UTC", now)).toMatchObject({ date: "2026-10-09", dayLabel: "FRI" });
    expect(todayIn("America/New_York", now)).toMatchObject({ date: "2026-10-09", dayLabel: "FRI" });
  });

  it("falls back to Europe/Amsterdam for unknown zones", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(resolveTimeZone("Mars/Olympus")).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimeZone(undefined)).toBe("Europe/Amsterdam");
  });
});

describe("units", () => {
  it("converts between kg and lbs", () => {
    expect(convertWeight(100, "kg", "lbs")).toBe(220.5);
    expect(convertWeight(225, "lbs", "kg")).toBe(102.1);
    expect(convertWeight(80, "kg", "kg")).toBe(80);
    expect(convertWeight(null, "kg", "lbs")).toBeNull();
    expect(convertWeight(60, null, "kg")).toBe(60); // legacy rows have no unit: kg
  });

  it("normalises unknown units to kg", () => {
    expect(normalizeUnit("lbs")).toBe("lbs");
    expect(normalizeUnit("stone")).toBe("kg");
  });
});

describe("validation", () => {
  it("accepts only integers in range", () => {
    expect(toIntInRange(5, 1, 10)).toBe(5);
    expect(toIntInRange("7", 1, 10)).toBe(7);
    expect(toIntInRange(3.5, 1, 10)).toBeNull();
    expect(toIntInRange(11, 1, 10)).toBeNull();
    expect(toIntInRange("abc", 1, 10)).toBeNull();
    expect(toIntInRange(null, 1, 10)).toBeNull();
  });

  it("accepts decimals in range", () => {
    expect(toNumberInRange(82.5, 0, 2000)).toBe(82.5);
    expect(toNumberInRange(-1, 0, 2000)).toBeNull();
    expect(toNumberInRange(Infinity, 0, 2000)).toBeNull();
  });

  it("cleans text and usernames", () => {
    expect(cleanText("  Push   Day ", 60)).toBe("Push Day");
    expect(cleanText("   ", 60)).toBeNull();
    expect(cleanText("x".repeat(61), 60)).toBeNull();
    expect(normalizeUsername("@@Marijn ")).toBe("marijn");
  });
});

describe("session tokens", () => {
  it("are random, URL-safe and stored only as a hash", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(looksLikeSessionToken(a)).toBe(true);
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).not.toContain(a);
    expect(hashSessionToken(a)).toBe(hashSessionToken(a));
  });

  it("rejects things that aren't tokens, like a raw user id", () => {
    expect(looksLikeSessionToken("usr_1234567890abcdef")).toBe(false);
    expect(looksLikeSessionToken("")).toBe(false);
    expect(looksLikeSessionToken(undefined)).toBe(false);
  });
});
