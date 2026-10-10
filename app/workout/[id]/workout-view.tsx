// app/workout/[id]/workout-view.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Header,
  Section,
  Action,
  card,
  metric,
  row,
  rowDone,
  numberInput,
  label,
  meta,
  display,
  hint,
  error as errorText,
  s,
  t,
  rond,
  primary,
  buttonText,
} from "@/components/ui";
import { str } from "@/lib/strings";
import type { WeightUnit } from "@/lib/units";
import { useSetSaver, type SaveStatus } from "@/lib/client/use-set-saver";
import { useRestTimer } from "@/lib/client/use-rest-timer";
import { useWakeLock } from "@/lib/client/use-wake-lock";
import { ensurePushSubscription } from "@/lib/client/push";
import { setActiveWorkoutMarker } from "@/lib/client/active-workout-marker";
import type { WorkoutDetail, WorkoutLog } from "./types";
import { completeWorkout, discardWorkout } from "./actions";

type Draft = { weight?: string; reps?: string };

function parseDecimal(raw: string): number | null | undefined {
  const cleaned = raw.replace(",", ".").trim();
  if (cleaned === "") return null;
  if (!/^\d{0,4}(\.\d{0,2})?$/.test(cleaned)) return undefined; // not a number (yet)
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseWhole(raw: string): number | null | undefined {
  const cleaned = raw.trim();
  if (cleaned === "") return null;
  if (!/^\d{1,4}$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

function formatTimer(secs: number) {
  const m = Math.floor(secs / 60);
  const r = secs % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

function formatStartedOn(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Plan without exercises: nothing was started, so the user is free to leave. */
export function EmptyPlanView({ name, planId }: { name: string; planId: number }) {
  return (
    <div className="min-h-[100dvh] p-4 max-w-sm mx-auto">
      <main className={`w-full ${s.stack}`}>
        <Header title={name} />
        <section className={card}>
          <p className={hint}>{str.workout.empty}</p>
          <Link href={`/plans/${planId}`} className={`${primary} block`}>
            <span className={`${buttonText} text-[#141416]`}>{str.workout.editPlan}</span>
          </Link>
          <Link href="/" className={`${meta} mt-2 flex min-h-11 items-center justify-center`}>
            {str.workout.backToDashboard}
          </Link>
        </section>
      </main>
    </div>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  if (status === "error" || status === "offline") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={`${meta} min-h-11 px-2 text-white`}
        aria-live="polite"
      >
        {status === "offline" ? str.workout.saveOffline : `${str.workout.saveFailed} · ${str.workout.saveRetry}`}
      </button>
    );
  }
  return (
    <span className={`${meta} px-2`} aria-live="polite">
      {status === "saving" ? str.workout.saveSaving : str.workout.saveSaved}
    </span>
  );
}

export function WorkoutView({
  workout,
  logs: initialLogs,
  unit,
  allowRestNotification = false,
}: {
  workout: WorkoutDetail;
  logs: WorkoutLog[];
  unit: WeightUnit;
  allowRestNotification?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [logs, setLogs] = useState<WorkoutLog[]>(initialLogs);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const pushReady = useRef(false);

  // Remember the active workout on this device (for the offline/back-button
  // lock-in) until it's finished or discarded.
  useEffect(() => {
    setActiveWorkoutMarker(`/workout/${workout.id}`);
  }, [workout.id]);

  const saver = useSetSaver(workout.sessionId);
  const timer = useRestTimer(workout.id, allowRestNotification);
  useWakeLock(true);

  // Re-apply edits that were saved on this device but never reached the server.
  const { restore } = saver;
  useEffect(() => {
    const stored = restore();
    if (Object.keys(stored).length === 0) return;
    void Promise.resolve().then(() =>
      setLogs((prev) =>
        prev.map((l) => {
          const p = stored[l.id];
          if (!p) return l;
          return {
            ...l,
            ...("actual_weight" in p ? { actual_weight: p.actual_weight ?? null } : {}),
            ...("actual_reps" in p ? { actual_reps: p.actual_reps ?? null } : {}),
            ...("completed" in p ? { completed: Boolean(p.completed) } : {}),
          };
        })
      )
    );
  }, [restore]);

  // Group by the exercise's position in the plan, so the same exercise twice
  // in one plan stays two separate blocks.
  const slots = Array.from(new Set(logs.map((l) => l.order_index)));
  const exercises = slots.map((slot) => {
    const sets = logs.filter((l) => l.order_index === slot);
    return { name: sets[0]?.exercise_name ?? "", sets };
  });
  const step = Math.min(currentStep, Math.max(0, exercises.length - 1));
  const currentExercise = exercises[step];
  const isFirstExercise = step === 0;
  const isLastExercise = step >= exercises.length - 1;

  const handleWeight = (log: WorkoutLog, raw: string) => {
    setDrafts((d) => ({ ...d, [log.id]: { ...d[log.id], weight: raw } }));
    const parsed = parseDecimal(raw);
    if (parsed === undefined) return;
    setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, actual_weight: parsed } : l)));
    saver.queue(log.id, { actual_weight: parsed, unit });
  };

  const handleReps = (log: WorkoutLog, raw: string) => {
    setDrafts((d) => ({ ...d, [log.id]: { ...d[log.id], reps: raw } }));
    const parsed = parseWhole(raw);
    if (parsed === undefined) return;
    setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, actual_reps: parsed } : l)));
    saver.queue(log.id, { actual_reps: parsed });
  };

  const handleToggleComplete = async (log: WorkoutLog) => {
    const nextVal = !log.completed;
    setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, completed: nextVal } : l)));
    saver.queue(log.id, { completed: nextVal }, true);

    if (!nextVal) {
      timer.stop();
      return;
    }

    timer.start(log.rest_seconds || 90);

    if (allowRestNotification && !pushReady.current && "Notification" in window) {
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission === "granted") {
        pushReady.current = await ensurePushSubscription();
      }
    }
  };

  const handleFinish = () => {
    setFinishError(null);
    startTransition(async () => {
      // Every set must be on the server before the workout can be finished.
      const saved = await saver.flushNow();
      if (!saved) {
        setFinishError(str.workout.unsavedBeforeFinish);
        return;
      }
      try {
        await completeWorkout(workout.id);
        timer.stop();
        saver.forget();
        setActiveWorkoutMarker(null);
        router.replace("/");
      } catch {
        setFinishError(str.common.genericError);
      }
    });
  };

  const handleDiscard = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      window.setTimeout(() => setConfirmDiscard(false), 4000);
      return;
    }
    setFinishError(null);
    startTransition(async () => {
      try {
        await discardWorkout(workout.id);
      } catch {
        setFinishError(str.common.genericError);
        return;
      }
      timer.stop();
      saver.forget();
      setActiveWorkoutMarker(null);
      router.replace("/");
    });
  };

  const discardButton = (
    <button
      type="button"
      disabled={isPending}
      onClick={handleDiscard}
      className={`w-full min-h-11 ${meta} ${confirmDiscard ? "text-white" : ""} disabled:opacity-50`}
    >
      {confirmDiscard ? str.workout.discardConfirm : str.workout.discard}
    </button>
  );

  const staleNotice = workout.stale ? (
    <p className={`${card} ${hint}`} role="note">
      {str.workout.staleNotice(formatStartedOn(workout.startedOn))}
    </p>
  ) : null;

  if (!currentExercise) {
    // An open session without sets (e.g. its plan was emptied): the only way
    // out is discarding it.
    return (
      <div className="min-h-[100dvh] p-4 max-w-sm mx-auto">
        <main className={`w-full ${s.stack}`}>
          <Header title={workout.name} />
          {staleNotice}
          <section className={card}>
            <p className={hint}>{str.workout.emptySession}</p>
            {finishError && <p className={`${errorText} px-1`} role="alert">{finishError}</p>}
            {discardButton}
          </section>
        </main>
      </div>
    );
  }

  const prevWeight = currentExercise.sets.find((x) => x.last_weight != null)?.last_weight;

  return (
    <div className="min-h-[100dvh] p-4 flex flex-col justify-between max-w-sm mx-auto select-none pb-[calc(1.5rem+env(safe-area-inset-bottom,16px))]">
      <main className={`w-full ${s.stack}`}>
        <Header title={workout.name}>
          <SaveIndicator status={saver.status} onRetry={() => void saver.retryNow()} />
        </Header>

        {staleNotice}

        {timer.remaining !== null && (
          <div className={`${card} text-left`} role="timer" aria-live="off">
            <p className={label}>{str.workout.rest}</p>
            <p className={`${metric} tracking-tight tabular-nums`}>{formatTimer(timer.remaining)}</p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                aria-label={str.workout.restSubtractLabel}
                onClick={() => timer.adjust(-15)}
                className={`min-h-11 ${rond} border border-white/[0.08] text-[#baa3d0] font-semibold apple-press`}
              >
                {str.workout.restSubtract}
              </button>
              <button
                type="button"
                aria-label={str.workout.restAddLabel}
                onClick={() => timer.adjust(15)}
                className={`min-h-11 ${rond} border border-white/[0.08] text-[#baa3d0] font-semibold apple-press`}
              >
                {str.workout.restAdd}
              </button>
              <button
                type="button"
                aria-label={str.workout.restSkipLabel}
                onClick={timer.stop}
                className={`min-h-11 ${rond} bg-[#baa3d0] text-[#141416] font-semibold apple-press`}
              >
                {str.workout.restSkip}
              </button>
            </div>
          </div>
        )}

        <Section
          label={<span className={display}>{currentExercise.name}</span>}
          meta={
            prevWeight != null
              ? `${str.workout.prev(`${prevWeight} ${unit}`)} · ${str.workout.progress(step + 1, exercises.length)}`
              : str.workout.progress(step + 1, exercises.length)
          }
        >
          <div className="grid grid-cols-12 gap-2 text-center items-center px-2 pt-1">
            <span className={`${label} col-span-2 text-left`}>{str.workout.set}</span>
            <span className={`${label} col-span-4`}>{unit}</span>
            <span className={`${label} col-span-4`}>{str.workout.reps}</span>
            <span className={`${label} col-span-2 text-right`}>{str.workout.done}</span>
          </div>

          <div className={s.tight}>
            {currentExercise.sets.map((set) => {
              const draft = drafts[set.id] ?? {};
              const weightValue =
                draft.weight ?? (set.actual_weight != null ? String(set.actual_weight) : "");
              const repsValue =
                draft.reps ?? (set.actual_reps != null ? String(set.actual_reps) : "");

              return (
                <div
                  key={set.id}
                  className={`${set.completed ? rowDone : row} p-2 grid grid-cols-12 gap-2 items-center transition`}
                >
                  <span className={`col-span-2 ${t.body} font-semibold text-[#71717a] pl-2`}>
                    {set.set_number}
                  </span>

                  <div className="col-span-4">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="next"
                      aria-label={str.workout.weightFor(set.set_number, unit)}
                      placeholder={set.last_weight != null ? String(set.last_weight) : "—"}
                      value={weightValue}
                      onChange={(e) => handleWeight(set, e.target.value)}
                      className={`${numberInput} text-white placeholder:text-[#71717a] focus:placeholder:text-transparent`}
                    />
                  </div>

                  <div className="col-span-4">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      enterKeyHint="done"
                      aria-label={str.workout.repsFor(set.set_number)}
                      placeholder={String(set.last_reps ?? set.target_reps ?? 10)}
                      value={repsValue}
                      onChange={(e) => handleReps(set, e.target.value)}
                      className={`${numberInput} text-white placeholder:text-[#71717a] focus:placeholder:text-transparent`}
                    />
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <button
                      type="button"
                      aria-pressed={set.completed}
                      aria-label={
                        set.completed
                          ? str.workout.markSetNotDone(set.set_number)
                          : str.workout.markSetDone(set.set_number)
                      }
                      onClick={() => void handleToggleComplete(set)}
                      className={`w-11 h-11 ${rond} flex items-center justify-center border transition apple-press ${
                        set.completed
                          ? "bg-[#baa3d0] border-[#baa3d0] text-[#141416]"
                          : "border-white/[0.08] bg-[#141416] text-white/20"
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
      </main>

      <div className={`pt-4 ${s.tight}`}>
        {finishError && <p className={`${errorText} px-1`} role="alert">{finishError}</p>}
        <div className={!isFirstExercise ? "grid grid-cols-2 gap-2" : ""}>
          {!isFirstExercise && (
            <Action variant="secondary" type="button" onClick={() => setCurrentStep(step - 1)}>
              {str.common.back}
            </Action>
          )}

          {isLastExercise ? (
            <Action variant="primary" type="button" disabled={isPending} onClick={handleFinish}>
              {isPending ? str.workout.finishing : str.workout.finish}
            </Action>
          ) : (
            <Action variant="secondary" type="button" onClick={() => setCurrentStep(step + 1)}>
              {str.common.next}
            </Action>
          )}
        </div>
        {discardButton}
      </div>
    </div>
  );
}
