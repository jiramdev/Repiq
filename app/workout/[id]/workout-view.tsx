// app/workout/[id]/workout-view.tsx
"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Header,
  CloseButton,
  Section,
  Action,
  card,
  metric,
  row,
  rowDone,
  numberInput,
  label,
  display,
  page,
  s,
  t,
  rond,
} from "@/components/ui";
import { WorkoutDetail, WorkoutLog } from "./page";
import { completeWorkout, discardWorkout, updateLogSet } from "./actions";

export function WorkoutView({
  workout,
  logs: initialLogs,
  allowRestNotification = true,
}: {
  workout: WorkoutDetail;
  logs: WorkoutLog[];
  allowRestNotification?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [logs, setLogs] = useState<WorkoutLog[]>(() =>
    initialLogs.map((l) => ({
      ...l,
      actual_weight: l.completed ? l.actual_weight : (l.actual_weight ?? null),
      actual_reps: l.completed ? l.actual_reps : null,
    }))
  );

  useEffect(() => {
    setLogs(
      initialLogs.map((l) => ({
        ...l,
        actual_weight: l.completed ? l.actual_weight : (l.actual_weight ?? null),
        actual_reps: l.completed ? l.actual_reps : null,
      }))
    );
  }, [initialLogs]);

  const [currentStep, setCurrentStep] = useState(0);

  // Absolute end timestamp in ms for on-screen UI
  const [targetEndTimestamp, setTargetEndTimestamp] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Silent audio keep-alive
  const keepAliveAudioRef = useRef<HTMLAudioElement | null>(null);

  const startKeepAlive = () => {
    try {
      if (!keepAliveAudioRef.current) {
        keepAliveAudioRef.current = new Audio(
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=="
        );
        keepAliveAudioRef.current.loop = true;
      }
      keepAliveAudioRef.current.play().catch(() => {});
    } catch {}
  };

  const stopKeepAlive = () => {
    try {
      if (keepAliveAudioRef.current) {
        keepAliveAudioRef.current.pause();
        keepAliveAudioRef.current.currentTime = 0;
      }
    } catch {}
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      stopKeepAlive();
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CANCEL_REST_TIMER" });
      }
    };
  }, []);

  // UI display counter (runs while screen is on)
  useEffect(() => {
    if (!targetEndTimestamp) {
      setRemainingSeconds(null);
      stopKeepAlive();
      return;
    }

    const checkTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((targetEndTimestamp - now) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        setTargetEndTimestamp(null);
        stopKeepAlive();
      }
    };

    checkTimer();
    const interval = setInterval(checkTimer, 500);

    return () => clearInterval(interval);
  }, [targetEndTimestamp]);

  const exerciseNames = Array.from(new Set(logs.map((l) => l.exercise_name)));
  const exercises = exerciseNames.map((name) => ({
    name,
    sets: logs.filter((l) => l.exercise_name === name),
  }));

  const currentExercise = exercises[currentStep] || exercises[0];
  const isFirstExercise = currentStep === 0;
  const isLastExercise = currentStep === exercises.length - 1;

  const handleUpdate = (
    logId: number,
    field: "actual_weight" | "actual_reps",
    value: string
  ) => {
    const num = value === "" ? null : parseFloat(value);
    setLogs((prev) =>
      prev.map((l) => (l.id === logId ? { ...l, [field]: num } : l))
    );

    startTransition(async () => {
      await updateLogSet(logId, { [field]: num });
    });
  };

  const handleToggleComplete = async (
    logId: number,
    current: boolean,
    restSeconds: number
  ) => {
    const nextVal = !current;
    setLogs((prev) =>
      prev.map((l) => (l.id === logId ? { ...l, completed: nextVal } : l))
    );

    if (nextVal) {
      if (allowRestNotification && typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      }

      const duration = restSeconds || 90;
      setTargetEndTimestamp(Date.now() + duration * 1000);
      startKeepAlive();

      // Hand off the timer to the Service Worker so it fires in background/lock screen
      if (
        allowRestNotification &&
        typeof window !== "undefined" &&
        "serviceWorker" in navigator
      ) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.active?.postMessage({
            type: "SCHEDULE_REST_TIMER",
            restSeconds: duration,
            workoutId: workout.id,
          });
        });
      }
    } else {
      // Unchecked: stop the countdown and tell the service worker to cancel
      setTargetEndTimestamp(null);
      stopKeepAlive();

      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.active?.postMessage({ type: "CANCEL_REST_TIMER" });
        });
      }
    }

    startTransition(async () => {
      await updateLogSet(logId, { completed: nextVal });
    });
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleNext = () => {
    if (!isLastExercise) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstExercise) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleFinish = () => {
    stopKeepAlive();
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({ type: "CANCEL_REST_TIMER" });
      });
    }

    startTransition(async () => {
      await completeWorkout(workout.id);
      window.location.href = "/";
    });
  };

  const handleDiscard = () => {
    if (confirm("Discard this workout session?")) {
      stopKeepAlive();
      setTargetEndTimestamp(null);
      setRemainingSeconds(null);
      setLogs([]);
      setCurrentStep(0);

      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.active?.postMessage({ type: "CANCEL_REST_TIMER" });
        });
      }

      startTransition(async () => {
        await discardWorkout(workout.id);
        window.location.href = "/";
      });
    }
  };

  if (!currentExercise) return null;

  const prevWeight = currentExercise.sets[0]?.last_weight;

  return (
    <div className={page()}>
      <main className={`max-w-sm mx-auto ${s.stack}`}>
        <Header title={workout.name}>
          <CloseButton onClick={handleDiscard} label="Close" />
        </Header>

        {/* Top Hero Rest Timer */}
        {remainingSeconds !== null && (
          <div className={`${card} text-left`}>
            <p className={label}>Rest</p>
            <p className={`${metric} tracking-tight`}>{formatTimer(remainingSeconds)}</p>
          </div>
        )}

        {/* Active Exercise Card */}
        <Section
          label={<span className={display}>{currentExercise.name}</span>}
          meta={
            prevWeight != null
              ? `Prev: ${prevWeight}kg · ${currentStep + 1}/${exercises.length}`
              : `${currentStep + 1}/${exercises.length}`
          }
        >
          {/* Column Headers */}
          <div className="grid grid-cols-12 gap-2 text-center items-center px-2 pt-1">
            <span className={`${label} col-span-2 text-left`}>Set</span>
            <span className={`${label} col-span-4`}>Kg</span>
            <span className={`${label} col-span-4`}>Reps</span>
            <span className={`${label} col-span-2 text-right`}>Done</span>
          </div>

          {/* Sets for Current Exercise */}
          <div className={s.tight}>
            {currentExercise.sets.map((set) => {
              const weightPlaceholder =
                set.last_weight != null ? String(set.last_weight) : "—";
              const repsPlaceholder =
                set.last_reps != null
                  ? String(set.last_reps)
                  : String(set.target_reps || 10);

              const hasTypedWeight = set.actual_weight != null;
              const hasTypedReps = set.actual_reps != null;

              return (
                <div
                  key={set.id}
                  className={`${set.completed ? rowDone : row} p-2.5 grid grid-cols-12 gap-2 items-center transition`}
                >
                  <span className={`col-span-2 ${t.body} font-semibold text-[#71717a] pl-2`}>
                    {set.set_number}
                  </span>

                  <div className="col-span-4">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={weightPlaceholder}
                      value={hasTypedWeight ? set.actual_weight! : ""}
                      onChange={(e) =>
                        handleUpdate(set.id, "actual_weight", e.target.value)
                      }
                      className={`${numberInput} !py-2 text-white placeholder:text-[#71717a] focus:placeholder:text-transparent`}
                    />
                  </div>

                  <div className="col-span-4">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={repsPlaceholder}
                      value={hasTypedReps ? set.actual_reps! : ""}
                      onChange={(e) =>
                        handleUpdate(set.id, "actual_reps", e.target.value)
                      }
                      className={`${numberInput} !py-2 text-white placeholder:text-[#71717a] focus:placeholder:text-transparent`}
                    />
                  </div>

                  <div className="col-span-2 flex justify-end pr-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleComplete(
                          set.id,
                          set.completed,
                          set.rest_seconds
                        )
                      }
                      className={`w-8 h-8 ${rond} flex items-center justify-center border transition apple-press ${
                        set.completed
                          ? "bg-[#baa3d0] border-[#baa3d0] text-[#141416]"
                          : "border-white/[0.08] bg-[#141416] text-transparent"
                      }`}
                    >
                      <span className={`${t.body} font-bold`}>✓</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Navigation / Finish Controls */}
        <div className={`pt-2 ${!isFirstExercise ? "grid grid-cols-2 gap-2" : ""}`}>
          {!isFirstExercise && (
            <Action
              variant="secondary"
              type="button"
              onClick={handleBack}
            >
              Back
            </Action>
          )}

          {isLastExercise ? (
            <Action
              variant="secondary"
              type="button"
              disabled={isPending}
              onClick={handleFinish}
            >
              {isPending ? "Saving..." : "Finish Workout"}
            </Action>
          ) : (
            <Action
              variant="secondary"
              type="button"
              onClick={handleNext}
            >
              Next
            </Action>
          )}
        </div>
      </main>
    </div>
  );
}