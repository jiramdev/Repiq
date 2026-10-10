"use client";

import { str } from "@/lib/strings";

/**
 * Server actions refuse to run while a workout is active. If that happens
 * (e.g. a stale tab), reload: the server then sends the user to the workout.
 * Returns true when it handled the result.
 */
export function reloadIfLocked(result: { error?: string | null } | null | undefined): boolean {
  if (result?.error === str.workout.locked) {
    window.location.reload();
    return true;
  }
  return false;
}
