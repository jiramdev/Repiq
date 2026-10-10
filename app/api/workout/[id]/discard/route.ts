// app/api/workout/[id]/discard/route.ts
// Escape hatch: discard the open session without a server action.
import type { NextRequest } from "next/server";
import { discardOpenSession } from "@/lib/workout-finish";
import { handleWorkoutEscape } from "@/lib/workout-escape-route";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleWorkoutEscape(request, params, discardOpenSession);
}
