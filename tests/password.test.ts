import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isBcryptHash,
  validateNewPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/password";

describe("passwords", () => {
  it("hashes with bcrypt and verifies", async () => {
    const hash = await hashPassword("correct horse");
    expect(isBcryptHash(hash)).toBe(true);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("  correct horse ", hash)).toBe(true); // trimmed like at sign-up
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never accepts a plain-text stored password (the legacy path is gone)", async () => {
    expect(await verifyPassword("hunter22", "hunter22")).toBe(false);
    expect(await verifyPassword("", "")).toBe(false);
  });

  it("fails without a stored password", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("enforces a minimum length", () => {
    expect(validateNewPassword("short")).toMatch(String(MIN_PASSWORD_LENGTH));
    expect(validateNewPassword("        x       ")).not.toBeNull(); // trimmed to 1 char
    expect(validateNewPassword("long enough")).toBeNull();
    expect(validateNewPassword("x".repeat(100))).not.toBeNull();
  });
});
