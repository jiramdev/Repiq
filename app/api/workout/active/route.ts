// app/api/workout/active/route.ts
// The signed-in user's active workout, for the client-side lock-in guard.
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getActiveWorkout } from "@/lib/active-workout";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveWorkout(userId);
  return NextResponse.json(
    { workoutId: active?.workoutId ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
