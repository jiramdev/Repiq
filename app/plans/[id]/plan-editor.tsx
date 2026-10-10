// app/plans/[id]/plan-editor.tsx
"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, X } from "lucide-react";
import {
  BackButton,
  Section,
  Action,
  input,
  row,
  value,
  bodyText,
  hint,
  label,
  meta,
  pill,
  pillText,
  segment,
  circleButton,
  t,
  error as errorText,
} from "@/components/ui";
import { str } from "@/lib/strings";
import { reloadIfLocked } from "@/lib/client/locked";
import {
  EXERCISE_TYPES,
  TYPE_DEFAULTS,
  formatDuration,
  guessExerciseType,
  type ExerciseType,
} from "@/lib/exercise-types";
import {
  hasExactMatch,
  recentExercises,
  searchExercises,
  normalizeName,
  type PickerExercise,
} from "@/lib/exercise-search";
import { LIMITS } from "@/lib/validation";
import {
  updatePlanTitle,
  addExerciseToPlan,
  updatePlanExercise,
  reorderPlanExercises,
  deleteExercise,
  deletePlan,
  type ExerciseInput,
} from "./actions";
import type { Plan, PlanExercise } from "./types";

function formatRest(sec: number) {
  if (sec <= 0) return "0s";
  if (sec < 60) return `${sec}s`;
  return formatDuration(sec);
}

function targetText(type: ExerciseType, reps: number | null, seconds: number | null) {
  if (type === "static") return str.plan.targetHold(formatDuration(seconds ?? TYPE_DEFAULTS.static.seconds!));
  if (type === "bodyweight") return str.plan.targetBodyweight(reps ?? TYPE_DEFAULTS.bodyweight.reps!);
  return str.plan.targetReps(reps ?? TYPE_DEFAULTS.weighted.reps!);
}

function summaryOf(e: { exercise_type: ExerciseType; sets: number; reps: number | null; seconds: number | null; rest: number }) {
  return `${str.plan.types[e.exercise_type]} · ${str.plan.summary(
    e.sets,
    targetText(e.exercise_type, e.reps, e.seconds),
    formatRest(e.rest)
  )}`;
}

function toInput(e: PlanExercise): ExerciseInput {
  return {
    name: e.name,
    type: e.exercise_type,
    sets: e.sets,
    reps: e.exercise_type === "static" ? null : e.reps,
    seconds: e.exercise_type === "static" ? (e.target_seconds ?? TYPE_DEFAULTS.static.seconds) : null,
    rest: e.rest_seconds,
  };
}

function libraryInput(e: PickerExercise): ExerciseInput {
  const d = TYPE_DEFAULTS[e.exercise_type];
  return {
    name: e.name,
    type: e.exercise_type,
    sets: e.default_sets || d.sets,
    reps: e.exercise_type === "static" ? null : e.default_reps || d.reps,
    seconds: e.exercise_type === "static" ? (e.default_seconds ?? d.seconds) : null,
    rest: e.default_rest_seconds ?? d.rest,
  };
}

/** − value + : big thumb targets instead of dropdowns. */
function Stepper({
  label: name,
  value: current,
  min,
  max,
  step,
  format = String,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className={`${row} px-1.5 py-1.5 flex items-center justify-between gap-1`}>
      <button
        type="button"
        aria-label={str.plan.decrease(name)}
        disabled={current <= min}
        onClick={() => onChange(clamp(current - step))}
        className={`${circleButton} border-none`}
      >
        <Minus className={`${t.body} stroke-[2]`} />
      </button>
      <div className="flex flex-col items-center min-w-0" aria-live="polite">
        <span className={meta}>{name}</span>
        <span className={`${value} tabular-nums`}>{format(current)}</span>
      </div>
      <button
        type="button"
        aria-label={str.plan.increase(name)}
        disabled={current >= max}
        onClick={() => onChange(clamp(current + step))}
        className={`${circleButton} border-none`}
      >
        <Plus className={`${t.body} stroke-[2]`} />
      </button>
    </div>
  );
}

function TypeSelector({ type, onChange }: { type: ExerciseType; onChange: (t: ExerciseType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={str.plan.type}>
      {EXERCISE_TYPES.map((option) => {
        const active = option === type;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={`${segment} !px-2 ${
              active
                ? "bg-[#baa3d0] text-[#141416]"
                : "bg-[#141416] border border-white/[0.08] text-[#baa3d0]"
            }`}
          >
            {str.plan.types[option]}
          </button>
        );
      })}
    </div>
  );
}

type Draft = {
  name: string;
  type: ExerciseType;
  sets: number;
  reps: number;
  seconds: number;
  rest: number;
};

function draftFrom(e: PlanExercise): Draft {
  return {
    name: e.name,
    type: e.exercise_type,
    sets: e.sets,
    reps: e.exercise_type === "static" ? TYPE_DEFAULTS.weighted.reps! : e.reps,
    seconds: e.target_seconds ?? TYPE_DEFAULTS.static.seconds!,
    rest: e.rest_seconds,
  };
}

function ExerciseEditor({
  exercise,
  pending,
  error,
  onSave,
  onRemove,
  onCancel,
}: {
  exercise: PlanExercise;
  pending: boolean;
  error: string | null;
  onSave: (input: ExerciseInput) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(exercise));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: draft.name,
      type: draft.type,
      sets: draft.sets,
      reps: draft.type === "static" ? null : draft.reps,
      seconds: draft.type === "static" ? draft.seconds : null,
      rest: draft.rest,
    });
  };

  return (
    <form onSubmit={submit} className={`${row} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={str.plan.exerciseName}
          maxLength={LIMITS.exerciseName}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          className={input}
        />
        <button type="button" aria-label={str.common.close} onClick={onCancel} className={circleButton}>
          <X className={`${t.body} stroke-[1.8]`} />
        </button>
      </div>

      <TypeSelector type={draft.type} onChange={(type) => set({ type })} />
      <p className={`${hint} px-2`}>{str.plan.typeHints[draft.type]}</p>

      <Stepper label={str.plan.sets} value={draft.sets} min={LIMITS.sets.min} max={LIMITS.sets.max} step={1} onChange={(sets) => set({ sets })} />
      {draft.type === "static" ? (
        <Stepper
          label={str.plan.hold}
          value={draft.seconds}
          min={5}
          max={LIMITS.holdSeconds.max}
          step={5}
          format={formatDuration}
          onChange={(seconds) => set({ seconds })}
        />
      ) : (
        <Stepper label={str.plan.reps} value={draft.reps} min={LIMITS.reps.min} max={LIMITS.reps.max} step={1} onChange={(reps) => set({ reps })} />
      )}
      <Stepper
        label={str.plan.rest}
        value={draft.rest}
        min={0}
        max={LIMITS.restSeconds.max}
        step={15}
        format={formatRest}
        onChange={(rest) => set({ rest })}
      />

      {error && <p className={`${errorText} px-1`} role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Action type="submit" variant="primary" disabled={pending || !draft.name.trim()}>
          {str.common.save}
        </Action>
        <Action type="button" variant="secondary" disabled={pending} onClick={onRemove}>
          {str.plan.remove}
        </Action>
      </div>
    </form>
  );
}

type Toast = { text: string; undo?: () => void };

function ExercisePicker({
  library,
  countInPlan,
  addingKey,
  onAdd,
  onClose,
  toast,
}: {
  library: PickerExercise[];
  countInPlan: (name: string) => number;
  addingKey: string | null;
  onAdd: (key: string, input: ExerciseInput) => void;
  onClose: () => void;
  toast: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim().replace(/\s+/g, " ");

  const results = useMemo(() => (trimmed ? searchExercises(library, trimmed) : []), [library, trimmed]);
  const recent = useMemo(() => recentExercises(library), [library]);
  const own = useMemo(() => library.filter((e) => e.own), [library]);
  const shared = useMemo(() => library.filter((e) => !e.own), [library]);
  const canCreate = trimmed.length > 0 && trimmed.length <= LIMITS.exerciseName && !hasExactMatch(library, trimmed);
  const guess = guessExerciseType(trimmed);
  const createOrder = [guess, ...EXERCISE_TYPES.filter((x) => x !== guess)];

  const add = (key: string, exercise: ExerciseInput) => {
    onAdd(key, exercise);
    setQuery("");
  };

  const renderItem = (e: PickerExercise, section: string) => {
    const key = `lib:${e.id}`;
    const n = countInPlan(e.name);
    const input = libraryInput(e);
    const busy = addingKey === key;
    return (
      <li key={`${section}-${e.id}`}>
        <button
          type="button"
          disabled={addingKey !== null}
          aria-label={str.plan.addLabel(e.name)}
          onClick={() => add(key, input)}
          className={`${row} w-full min-h-14 pl-5 pr-2 py-2 flex items-center justify-between gap-3 text-left apple-press disabled:opacity-60`}
        >
          <span className="flex flex-col min-w-0">
            <span className={`${bodyText} font-medium truncate`}>{e.name}</span>
            <span className={`${meta} truncate`}>
              {str.plan.types[e.exercise_type]} ·{" "}
              {targetText(e.exercise_type, input.reps ?? null, input.seconds ?? null)}
              {n > 0 ? ` · ${str.plan.inPlan(n)}` : ""}
            </span>
          </span>
          <span className={`${circleButton} ${n > 0 ? "text-[#baa3d0]" : ""}`} aria-hidden="true">
            {busy ? <span className={`${t.label}`}>…</span> : <Plus className={`${t.body} stroke-[2]`} />}
          </span>
        </button>
      </li>
    );
  };

  const group = (title: string, items: PickerExercise[], section: string) =>
    items.length === 0 ? null : (
      <div className="space-y-1.5">
        <p className={`${label} px-2 pt-2`}>{title}</p>
        <ul className="space-y-1.5">{items.map((e) => renderItem(e, section))}</ul>
      </div>
    );

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={str.plan.pickerTitle}
        className={`fixed inset-x-0 bottom-0 z-[75] mx-auto max-w-md max-h-[88dvh] flex flex-col bg-[#1b1b1e] border border-white/[0.08] rounded-t-[30px] shadow-[0_-12px_36px_rgba(0,0,0,0.45)]`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <span className={label}>{str.plan.pickerTitle}</span>
          <button type="button" onClick={onClose} className={`${pill} !px-5`}>
            <span className={`${pillText} text-[#baa3d0]`}>{str.plan.pickerDone}</span>
          </button>
        </div>

        <div className="px-4 pb-2">
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={str.plan.searchLabel}
            placeholder={str.plan.searchPlaceholder}
            value={query}
            maxLength={LIMITS.exerciseName}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // Enter adds the best match, or creates the typed name.
              if (results[0] && normalizeName(results[0].name) === normalizeName(trimmed)) {
                add(`lib:${results[0].id}`, libraryInput(results[0]));
              } else if (canCreate) {
                const d = TYPE_DEFAULTS[guess];
                add(`new:${guess}`, { name: trimmed, type: guess, ...d });
              } else if (results[0]) {
                add(`lib:${results[0].id}`, libraryInput(results[0]));
              }
            }}
            className={input}
          />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-2">
          {trimmed ? (
            results.length > 0 ? (
              group(str.plan.results, results, "results")
            ) : (
              !canCreate && <p className={`${hint} px-2`}>{str.plan.noResults}</p>
            )
          ) : (
            <>
              {group(str.plan.recent, recent, "recent")}
              {group(str.plan.yourExercises, own, "own")}
              {group(str.plan.library, shared, "library")}
            </>
          )}

          {canCreate && (
            <div className={`${row} p-3 space-y-2`}>
              <p className={`${bodyText} font-medium px-2 truncate`}>{str.plan.create(trimmed)}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {createOrder.map((type, i) => (
                  <button
                    key={type}
                    type="button"
                    disabled={addingKey !== null}
                    onClick={() => add(`new:${type}`, { name: trimmed, type, ...TYPE_DEFAULTS[type] })}
                    className={`${segment} !px-2 flex flex-col items-center leading-tight disabled:opacity-60 ${
                      i === 0
                        ? "bg-[#baa3d0] text-[#141416]"
                        : "bg-[#141416] border border-white/[0.08] text-[#baa3d0]"
                    }`}
                  >
                    <span>{str.plan.types[type]}</span>
                  </button>
                ))}
              </div>
              <p className={`${hint} px-2`}>{str.plan.typeHints[guess]}</p>
            </div>
          )}

        </div>
        {toast}
      </div>
    </>
  );
}

export function PlanEditor({
  plan,
  exercises,
  library,
}: {
  plan: Plan;
  exercises: PlanExercise[];
  library: PickerExercise[];
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(plan.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const movesInFlight = useRef(0);

  // What's on screen: server order, with a pending reorder and removals applied.
  const visible = useMemo(() => {
    let list = exercises.filter((e) => !hidden.has(e.id));
    if (localOrder) {
      const pos = new Map(localOrder.map((id, i) => [id, i]));
      list = [...list].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    }
    return list;
  }, [exercises, hidden, localOrder]);

  const countInPlan = (name: string) => {
    const key = normalizeName(name);
    return visible.filter((e) => normalizeName(e.name) === key).length;
  };

  const showToast = (next: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };

  const handleTitleBlur = () => {
    if (title.trim() && title !== plan.title) {
      startTransition(async () => {
        reloadIfLocked(await updatePlanTitle(plan.id, title));
      });
    }
  };

  const handleAdd = (key: string, exercise: ExerciseInput) => {
    setAddingKey(key);
    setListError(null);
    startTransition(async () => {
      try {
        const res = await addExerciseToPlan(plan.id, exercise);
        if (reloadIfLocked(res)) return;
        if (!res.success) {
          setListError(res.error ?? str.plan.invalidInput);
          return;
        }
        const newId = res.id;
        showToast({
          text: str.plan.added(exercise.name),
          undo:
            newId === undefined
              ? undefined
              : () => {
                  setToast(null);
                  startTransition(async () => {
                    reloadIfLocked(await deleteExercise(plan.id, newId));
                  });
                },
        });
      } catch {
        setListError(str.common.genericError);
      } finally {
        setAddingKey(null);
      }
    });
  };

  const handleSave = (target: PlanExercise, exercise: ExerciseInput) => {
    setEditError(null);
    startTransition(async () => {
      const res = await updatePlanExercise(plan.id, target.id, exercise);
      if (reloadIfLocked(res)) return;
      if (!res.success) {
        setEditError(res.error ?? str.plan.invalidInput);
        return;
      }
      setEditingId(null);
    });
  };

  const handleRemove = (target: PlanExercise) => {
    const index = visible.findIndex((e) => e.id === target.id);
    setHidden((h) => new Set(h).add(target.id));
    if (editingId === target.id) setEditingId(null);
    startTransition(async () => {
      const res = await deleteExercise(plan.id, target.id);
      if (reloadIfLocked(res)) return;
      if (!res.success) {
        setHidden((h) => {
          const next = new Set(h);
          next.delete(target.id);
          return next;
        });
        setListError(res.error ?? str.common.genericError);
        return;
      }
      showToast({
        text: str.plan.removed(target.name),
        undo: () => {
          setToast(null);
          startTransition(async () => {
            // Put it back where it was.
            reloadIfLocked(await addExerciseToPlan(plan.id, toInput(target), index));
          });
        },
      });
    });
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= visible.length) return;
    const ids = visible.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setLocalOrder(ids);
    setListError(null);
    movesInFlight.current += 1;
    startTransition(async () => {
      try {
        const res = await reorderPlanExercises(plan.id, ids);
        if (reloadIfLocked(res)) return;
        if (!res.success) setListError(res.error ?? str.common.genericError);
      } catch {
        setListError(str.common.genericError);
      } finally {
        // Once the last move is saved the server order is the truth again.
        movesInFlight.current -= 1;
        if (movesInFlight.current === 0) setLocalOrder(null);
      }
    });
  };

  const handleDeletePlan = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    startTransition(async () => {
      reloadIfLocked(await deletePlan(plan.id));
    });
  };

  const toastView = toast ? (
    <div className="px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]" role="status" aria-live="polite">
      <div className={`${row} min-h-11 pl-5 pr-2 py-1 flex items-center justify-between gap-3`}>
        <span className={`${bodyText} truncate`}>{toast.text}</span>
        {toast.undo && (
          <button type="button" onClick={toast.undo} className={`${meta} text-[#baa3d0] min-h-11 px-3`}>
            {str.plan.undo}
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-[100dvh] bg-[#baa3d0] text-white pb-40 pt-4 px-4 select-none">
      <main className="max-w-sm mx-auto space-y-3.5">
        <header className="flex items-center justify-between px-1 py-1">
          <BackButton href="/schedule" />
          <div className={pill}>
            <span className="w-2 h-2 rounded-full bg-[#baa3d0]" />
            <span className={pillText}>{str.plan.badge}</span>
          </div>
        </header>

        <Section label={str.plan.name} meta={str.plan.nameMeta}>
          <div className="pt-1">
            <input
              type="text"
              value={title}
              aria-label={str.schedule.planTitle}
              maxLength={LIMITS.planTitle}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className={input}
            />
          </div>
        </Section>

        <Section
          label={str.plan.exercises}
          meta={
            visible.length > 1 ? (
              <button
                type="button"
                aria-pressed={reordering}
                onClick={() => {
                  setReordering((r) => !r);
                  setEditingId(null);
                }}
                className={`${meta} min-h-11 px-2 ${reordering ? "text-[#baa3d0]" : ""}`}
              >
                {reordering ? str.plan.reorderDone : `${str.plan.reorder} · ${str.plan.total(visible.length)}`}
              </button>
            ) : (
              str.plan.total(visible.length)
            )
          }
        >
          <ul className="space-y-2 pt-1">
            {visible.length === 0 && <li className={`${hint} px-2`}>{str.plan.emptyPlan}</li>}
            {visible.map((ex, i) => {
              const summary = summaryOf({
                exercise_type: ex.exercise_type,
                sets: ex.sets,
                reps: ex.reps,
                seconds: ex.target_seconds,
                rest: ex.rest_seconds,
              });
              if (editingId === ex.id && !reordering) {
                return (
                  <li key={ex.id}>
                    <ExerciseEditor
                      exercise={ex}
                      pending={isPending}
                      error={editError}
                      onSave={(input) => handleSave(ex, input)}
                      onRemove={() => handleRemove(ex)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                );
              }
              if (reordering) {
                return (
                  <li key={ex.id} className={`${row} min-h-14 pl-5 pr-1.5 py-1.5 flex items-center justify-between gap-2`}>
                    <span className="flex flex-col min-w-0">
                      <span className={`${bodyText} truncate font-medium`}>{ex.name}</span>
                      <span className={`${meta} truncate`}>{summary}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" aria-label={str.plan.moveUp(ex.name)} disabled={i === 0} onClick={() => move(i, -1)} className={`${circleButton} disabled:opacity-30`}>
                        <ArrowUp className={`${t.body} stroke-[2]`} />
                      </button>
                      <button type="button" aria-label={str.plan.moveDown(ex.name)} disabled={i === visible.length - 1} onClick={() => move(i, 1)} className={`${circleButton} disabled:opacity-30`}>
                        <ArrowDown className={`${t.body} stroke-[2]`} />
                      </button>
                      <button type="button" aria-label={str.plan.removeLabel(ex.name)} onClick={() => handleRemove(ex)} className={circleButton}>
                        <X className={`${t.body} stroke-[2]`} />
                      </button>
                    </span>
                  </li>
                );
              }
              return (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditError(null);
                      setEditingId(ex.id);
                    }}
                    className={`${row} w-full text-left min-h-14 px-5 py-3 flex items-center justify-between gap-3 transition apple-press hover:border-white/20`}
                  >
                    <span className="flex flex-col min-w-0">
                      <span className={`${bodyText} truncate font-medium`}>{ex.name}</span>
                      <span className={`${meta} truncate`}>{summary}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {listError && <p className={`${errorText} px-1`} role="alert">{listError}</p>}

          {!reordering && (
            <div className="pt-1">
              <Action variant="primary" type="button" onClick={() => setPickerOpen(true)}>
                {str.plan.addExercise}
              </Action>
            </div>
          )}
        </Section>

        <div className="pt-2">
          <Action variant="secondary" type="button" disabled={isPending} onClick={handleDeletePlan}>
            {confirmDelete ? str.plan.confirmDeletePlan : str.plan.deletePlan}
          </Action>
        </div>
      </main>

      {pickerOpen ? (
        <ExercisePicker
          library={library}
          countInPlan={countInPlan}
          addingKey={addingKey}
          onAdd={handleAdd}
          onClose={() => setPickerOpen(false)}
          toast={toastView}
        />
      ) : (
        toastView && (
          <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-sm">{toastView}</div>
        )
      )}
    </div>
  );
}
