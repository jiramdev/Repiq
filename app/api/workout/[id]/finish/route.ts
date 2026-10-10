// app/api/workout/[id]/finish/route.ts
// Escape hatch: finish the open session without a server action.
import type { NextRequest } from "next/server";
import { finishOpenSession } from "@/lib/workout-finish";
import { handleWorkoutEscape } from "@/lib/workout-escape-route";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleWorkoutEscape(request, params, finishOpenSession);
}
