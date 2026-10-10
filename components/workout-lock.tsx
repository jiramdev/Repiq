"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getActiveWorkoutMarker, setActiveWorkoutMarker } from "@/lib/client/active-workout-marker";

/**
 * Client half of the workout lock-in. The proxy and every page already redirect
 * to the active workout on the server, but the browser can show other screens
 * without asking the server (back/forward from the router cache, offline).
 * When this device thinks a workout is active and another screen appears, ask
 * the server and go back to the workout.
 */
export function WorkoutLockGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const marker = getActiveWorkoutMarker();
    if (!marker || pathname === marker || pathname.startsWith("/auth")) return;

    let cancelled = false;
    fetch("/api/workout/active", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setActiveWorkoutMarker(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { workoutId: number | null };
        if (data.workoutId) router.replace(`/workout/${data.workoutId}`);
        else setActiveWorkoutMarker(null);
      })
      .catch(() => {
        // Offline: trust the device.
        if (!cancelled) router.replace(marker);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
