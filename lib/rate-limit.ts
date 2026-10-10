// lib/rate-limit.ts (server only)
//
// A small Postgres-backed fixed-window rate limiter. It needs no extra service
// or env vars: it uses the rate_limits table from migration 0007. If that table
// is missing or the database errors, it fails open (allows the request) and
// logs a warning, so a limiter problem never locks everyone out.
// Set RATE_LIMIT_DISABLED=1 to switch it off entirely.
import { createHash } from "crypto";
import { sql } from "@/lib/db";

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /** Sign-in attempts from one IP address. */
  loginIp: { name: "login-ip", limit: 30, windowSeconds: 15 * 60 },
  /** Sign-in attempts for one username/email, from anywhere. */
  loginAccount: { name: "login-account", limit: 10, windowSeconds: 15 * 60 },
  registerIp: { name: "register-ip", limit: 10, windowSeconds: 60 * 60 },
  usernameCheckIp: { name: "username-check-ip", limit: 60, windowSeconds: 10 * 60 },
  passwordUser: { name: "password-user", limit: 10, windowSeconds: 15 * 60 },
  restTimerUser: { name: "rest-timer-user", limit: 120, windowSeconds: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window ends (0 when allowed). */
  retryAfterSeconds: number;
}

function hashKey(rule: RateLimitRule, subject: string): string {
  const digest = createHash("sha256").update(`${rule.name}:${subject.toLowerCase()}`).digest("hex");
  return `${rule.name}:${digest.slice(0, 40)}`;
}

let warned = false;

/** Count one hit for `subject` under `rule` and say whether it's still allowed. */
export async function rateLimit(
  rule: RateLimitRule,
  subject: string,
  now: number = Date.now()
): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return { ok: true, retryAfterSeconds: 0 };

  const windowMs = rule.windowSeconds * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  const end = start + windowMs;

  try {
    const rows = await sql`
      INSERT INTO rate_limits (key, window_start, count, expires_at)
      VALUES (${hashKey(rule, subject)}, ${new Date(start).toISOString()}, 1, ${new Date(end).toISOString()})
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;
    // Occasional housekeeping instead of a cron job.
    if (Math.random() < 0.02) {
      await sql`DELETE FROM rate_limits WHERE expires_at < now() - interval '1 hour'`;
    }
    const count = Number(rows[0]?.count ?? 0);
    if (count <= rule.limit) return { ok: true, retryAfterSeconds: 0 };
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((end - now) / 1000)) };
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn("Rate limiter unavailable (did migration 0007 run?); allowing request.", err);
    }
    return { ok: true, retryAfterSeconds: 0 };
  }
}

/** Client IP as seen by Vercel's edge (which overwrites these headers). */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export function retryMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
