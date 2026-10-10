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
    expect(await verifyPassword("correct horse", hash)).toEqual({ ok: true, needsRehash: false });
    expect(await verifyPassword("wrong horse", hash)).toEqual({ ok: false, needsRehash: false });
  });

  it("accepts a legacy plain-text password once and asks for a rehash", async () => {
    expect(await verifyPassword("hunter22", "hunter22")).toEqual({ ok: true, needsRehash: true });
    expect(await verifyPassword("hunter23", "hunter22")).toEqual({ ok: false, needsRehash: false });
    expect(await verifyPassword("", "")).toEqual({ ok: false, needsRehash: false });
  });

  it("fails without a stored password", async () => {
    expect(await verifyPassword("anything", null)).toEqual({ ok: false, needsRehash: false });
  });

  it("enforces a minimum length", () => {
    expect(validateNewPassword("short")).toMatch(String(MIN_PASSWORD_LENGTH));
    expect(validateNewPassword("        x       ")).not.toBeNull(); // trimmed to 1 char
    expect(validateNewPassword("long enough")).toBeNull();
    expect(validateNewPassword("x".repeat(100))).not.toBeNull();
  });
});
