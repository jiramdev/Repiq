// app/api/push/schedule/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { LIMITS, toIntInRange } from "@/lib/validation";
import {
  appBaseUrl,
  cancelRestTimers,
  isRestPushAvailable,
  scheduleRestTimer,
} from "@/lib/rest-timers";

/** Schedule the "rest complete" push. Body: { restSeconds, workoutId }. */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { restSeconds, workoutId } = (body ?? {}) as Record<string, unknown>;
  const seconds = toIntInRange(restSeconds, LIMITS.timerSeconds.min, LIMITS.timerSeconds.max);
  const workout = toIntInRange(workoutId, 1, 2_147_483_647);
  if (seconds === null || workout === null) {
    return NextResponse.json({ error: "Invalid restSeconds or workoutId" }, { status: 400 });
  }

  const owned = await sql`
    SELECT 1 FROM workouts WHERE id = ${workout} AND user_id = ${userId} LIMIT 1
  `;
  if (owned.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isRestPushAvailable()) {
    // Degrade gracefully: the client falls back to its in-app alarm.
    return NextResponse.json({ scheduled: false, reason: "not_configured" });
  }

  try {
    const timerId = await scheduleRestTimer({
      userId,
      workoutId: workout,
      seconds,
      baseUrl: appBaseUrl(req.url),
    });
    return NextResponse.json({ scheduled: true, timerId });
  } catch (err) {
    console.error("Rest timer schedule error:", err);
    return NextResponse.json({ scheduled: false, reason: "provider_error" }, { status: 502 });
  }
}

/** Cancel the user's pending rest push. Body: { timerId? } (omit to cancel all). */
export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let timerId: string | undefined;
  try {
    const body = (await req.json()) as { timerId?: unknown };
    if (typeof body?.timerId === "string" && /^[0-9a-f-]{36}$/i.test(body.timerId)) {
      timerId = body.timerId;
    }
  } catch {
    // No body: cancel all.
  }

  const cancelled = await cancelRestTimers(userId, timerId);
  return NextResponse.json({ cancelled });
}
