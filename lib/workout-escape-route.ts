// lib/workout-escape-route.ts (server only)
// Shared POST handler for /api/workout/[id]/finish and /discard.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { toId } from "@/lib/validation";

const noStore = { "Cache-Control": "no-store" };

/** Same-origin only: a cross-site form can't finish or discard someone's workout. */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

export async function handleWorkoutEscape(
  request: NextRequest,
  params: Promise<{ id: string }>,
  run: (userId: string, workoutId: number) => Promise<void>
): Promise<NextResponse> {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403, headers: noStore });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  const { id } = await params;
  const workoutId = toId(/^\d+$/.test(id) ? Number(id) : NaN);
  if (workoutId === null) return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  await run(userId, workoutId);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
