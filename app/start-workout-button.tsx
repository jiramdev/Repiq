// app/start-workout-button.tsx
"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { startWorkout } from "@/app/workout/[id]/actions";
import { error as errorText } from "@/components/ui";
import { LoadingScreen } from "@/components/loading-screen";
import { str } from "@/lib/strings";

/**
 * Starts today's workout. Starting is an explicit action: the workout page
 * only ever shows a session that already exists, so nothing (a refresh, a
 * prefetch, the redirect after Finish) can start one by accident.
 */
export function StartWorkoutButton({
  workoutId,
  className,
  children,
}: {
  workoutId: number;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await startWorkout(workoutId);
        if (res.ok) {
          router.push(`/workout/${res.workoutId}`);
          return;
        }
        // An empty plan: the workout page explains how to fix that.
        if (res.planId) {
          router.push(`/workout/${workoutId}`);
          return;
        }
        setError(res.error);
      } catch (err) {
        // A new version was deployed since this page loaded.
        if (unstable_isUnrecognizedActionError(err)) window.location.reload();
        else setError(str.workout.actionFailed);
      }
    });
  };

  return (
    <>
      {pending && <LoadingScreen />}
      <button type="button" onClick={start} disabled={pending} className={`${className} w-full`}>
        {children}
      </button>
      {error && (
        <p className={`${errorText} px-1`} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
