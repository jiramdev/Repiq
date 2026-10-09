// app/workout/[id]/workout-view.tsx
"use client";

import { useState, useEffect, useTransition } from "react";
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
import { saveSubscription } from "@/app/actions/push";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const subJson = sub.toJSON();
    if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
      await saveSubscription({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      });
    }
  } catch (err) {
    console.error("Push subscription error:", err);
  }
}

export function WorkoutView({
  workout,
  logs: initialLogs,
  allowRestNotification = true,
}: {
  workout: WorkoutDetail;
  logs: WorkoutLog[];
  allowRestNotification?: boolean;
}) {
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

  // Absolute end timestamp in ms for screen UI
  const [targetEndTimestamp, setTargetEndTimestamp] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Register Service Worker on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  // Visual countdown timer for screen display
  useEffect(() => {
    if (!targetEndTimestamp) {
      setRemainingSeconds(null);
      return;
    }

    const checkTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((targetEndTimestamp - now) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        setTargetEndTimestamp(null);
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

    startTransition(async () => {
      await updateLogSet(logId, { completed: nextVal });
    });

    if (nextVal) {
      const duration = restSeconds || 90;
      setTargetEndTimestamp(Date.now() + duration * 1000);

      if (
        allowRestNotification &&
        typeof window !== "undefined" &&
        "Notification" in window
      ) {
        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }

        if (permission === "granted") {
          await subscribeToPush();

          // Dispatch background timer to API route
          fetch("/api/push/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              restSeconds: duration,
              workoutId: workout.id,
            }),
          }).catch(console.error);
        }
      }
    } else {
      setTargetEndTimestamp(null);
    }
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
    startTransition(async () => {
      await completeWorkout(workout.id);
      window.location.href = "/";
    });
  };

  const handleDiscard = () => {
    if (confirm("Discard this workout session?")) {
      setTargetEndTimestamp(null);
      setRemainingSeconds(null);
      setLogs([]);
      setCurrentStep(0);

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

        {remainingSeconds !== null && (
          <div className={`${card} text-left`}>
            <p className={label}>Rest</p>
            <p className={`${metric} tracking-tight`}>
              {formatTimer(remainingSeconds)}
            </p>
          </div>
        )}

        <Section
          label={<span className={display}>{currentExercise.name}</span>}
          meta={
            prevWeight != null
              ? `Prev: ${prevWeight}kg · ${currentStep + 1}/${exercises.length}`
              : `${currentStep + 1}/${exercises.length}`
          }
        >
          <div className="grid grid-cols-12 gap-2 text-center items-center px-2 pt-1">
            <span className={`${label} col-span-2 text-left`}>Set</span>
            <span className={`${label} col-span-4`}>Kg</span>
            <span className={`${label} col-span-4`}>Reps</span>
            <span className={`${label} col-span-2 text-right`}>Done</span>
          </div>

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
                  className={`${
                    set.completed ? rowDone : row
                  } p-2.5 grid grid-cols-12 gap-2 items-center transition`}
                >
                  <span
                    className={`col-span-2 ${t.body} font-semibold text-[#71717a] pl-2`}
                  >
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

        <div
          className={`pt-2 ${
            !isFirstExercise ? "grid grid-cols-2 gap-2" : ""
          }`}
        >
          {!isFirstExercise && (
            <Action variant="secondary" type="button" onClick={handleBack}>
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
            <Action variant="secondary" type="button" onClick={handleNext}>
              Next
            </Action>
          )}
        </div>
      </main>
    </div>
  );
}