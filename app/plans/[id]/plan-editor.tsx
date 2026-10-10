// app/plans/[id]/plan-editor.tsx
"use client";

import { useState, useTransition } from "react";
import {
  BackButton,
  CloseButton,
  Section,
  Action,
  input,
  row,
  value,
  bodyText,
  bodyMuted,
  meta,
  pill,
  pillText,
  error as errorText,
} from "@/components/ui";
import { str } from "@/lib/strings";
import { reloadIfLocked } from "@/lib/client/locked";
import {
  updatePlanTitle,
  addExerciseToPlan,
  updatePlanExercise,
  deleteExercise,
  deletePlan,
} from "./actions";

interface Exercise {
  id: number;
  exercise_id: number | null;
  name: string;
  sets: number;
  reps: number;
  rest_seconds: number;
}

interface LibraryExercise {
  id: number;
  name: string;
  default_sets: number;
  default_reps: number;
  default_rest_seconds: number;
}

interface Plan {
  id: number;
  title: string;
  exercise_count: number;
}

const SET_OPTIONS = [1, 2, 3, 4, 5, 6];
const REP_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const REST_OPTIONS = [
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
  { label: "2m", value: 120 },
  { label: "2.5m", value: 150 },
  { label: "3m", value: 180 },
];

export function PlanEditor({
  plan,
  exercises,
  library,
}: {
  plan: Plan;
  exercises: Exercise[];
  library: LibraryExercise[];
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(plan.title);
  const [isAdding, setIsAdding] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<number | null>(null);

  // Form field state
  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [setsValue, setSetsValue] = useState("3");
  const [isCustomSets, setIsCustomSets] = useState(false);
  const [repsValue, setRepsValue] = useState("10");
  const [isCustomReps, setIsCustomReps] = useState(false);
  const [restSeconds, setRestSeconds] = useState("90");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const resetForm = () => {
    setIsAdding(false);
    setEditingExerciseId(null);
    setSelectedLibraryId("");
    setExerciseName("");
    setSetsValue("3");
    setIsCustomSets(false);
    setRepsValue("10");
    setIsCustomReps(false);
    setRestSeconds("90");
    setFormError(null);
  };

  const handleTitleBlur = () => {
    if (title.trim() && title !== plan.title) {
      startTransition(async () => {
        reloadIfLocked(await updatePlanTitle(plan.id, title));
      });
    }
  };

  const handleStartEdit = (ex: Exercise) => {
    setIsAdding(false);
    setEditingExerciseId(ex.id);
    setExerciseName(ex.name);
    setSetsValue(String(ex.sets));
    setIsCustomSets(!SET_OPTIONS.includes(ex.sets));
    setRepsValue(String(ex.reps));
    setIsCustomReps(!REP_OPTIONS.includes(ex.reps));
    setRestSeconds(String(ex.rest_seconds));

    const matchLib = library.find(
      (l) => l.name.toLowerCase() === ex.name.toLowerCase()
    );
    setSelectedLibraryId(matchLib ? String(matchLib.id) : "custom");
  };

  const handleStartAdd = () => {
    setEditingExerciseId(null);
    setIsAdding(true);
    setSelectedLibraryId("");
    setExerciseName("");
    setSetsValue("3");
    setIsCustomSets(false);
    setRepsValue("10");
    setIsCustomReps(false);
    setRestSeconds("90");
  };

  const handleLibrarySelect = (libIdStr: string) => {
    if (libIdStr === "divider") return;

    setSelectedLibraryId(libIdStr);

    if (libIdStr === "custom") {
      setExerciseName("");
      return;
    }

    const item = library.find((l) => String(l.id) === libIdStr);
    if (item) {
      setExerciseName(item.name);
      setSetsValue(String(item.default_sets));
      setRepsValue(String(item.default_reps));
      setRestSeconds(String(item.default_rest_seconds));
      setIsCustomSets(!SET_OPTIONS.includes(item.default_sets));
      setIsCustomReps(!REP_OPTIONS.includes(item.default_reps));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciseName.trim()) return;
    setFormError(null);

    startTransition(async () => {
      const parsedSets = parseInt(setsValue, 10) || 3;
      const parsedReps = parseInt(repsValue, 10) || 10;
      const parsedRest = Number.isFinite(parseInt(restSeconds, 10)) ? parseInt(restSeconds, 10) : 90;

      let res: { success: boolean; error?: string };
      if (editingExerciseId !== null) {
        res = await updatePlanExercise(
          plan.id,
          editingExerciseId,
          exerciseName,
          parsedSets,
          parsedReps,
          parsedRest
        );
      } else {
        res = await addExerciseToPlan(
          plan.id,
          exerciseName,
          parsedSets,
          parsedReps,
          parsedRest
        );
      }
      if (reloadIfLocked(res)) return;
      if (!res.success) {
        setFormError(str.plan.invalidInput);
        return;
      }
      resetForm();
    });
  };

  const handleDeleteExercise = (exerciseId: number) => {
    startTransition(async () => {
      if (reloadIfLocked(await deleteExercise(plan.id, exerciseId))) return;
      if (editingExerciseId === exerciseId) {
        resetForm();
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

  const formatRest = (sec: number) => {
    if (sec >= 60 && sec % 60 === 0) return `${sec / 60}m`;
    if (sec >= 60) return `${(sec / 60).toFixed(1)}m`;
    return `${sec}s`;
  };

  const chosenExerciseTitle =
    selectedLibraryId === "custom"
      ? exerciseName || str.plan.customExercise
      : library.find((l) => String(l.id) === selectedLibraryId)?.name ||
        exerciseName;

  // Reusable inline form component
  const renderExerciseForm = (isEditing: boolean, targetId?: number) => (
    <form onSubmit={handleSubmit} className="space-y-2 pt-2">
      {selectedLibraryId === "custom" ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            maxLength={80}
            placeholder={str.plan.exerciseNamePlaceholder}
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            className={input}
          />
          <CloseButton
            label={str.plan.backToSelection}
            onClick={() => {
              setSelectedLibraryId("");
              setExerciseName("");
            }}
          />
        </div>
      ) : (
        <div
          className={`relative ${row} px-5 py-3 flex items-center justify-between transition apple-press`}
        >
          <span
            className={`${
              chosenExerciseTitle ? bodyText : bodyMuted
            } truncate pointer-events-none font-medium`}
          >
            {chosenExerciseTitle || str.plan.chooseExercise}
          </span>

          <select
            aria-label={str.plan.chooseExercise}
            value={selectedLibraryId}
            onChange={(e) => handleLibrarySelect(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="" disabled>
              {str.plan.chooseExercise}
            </option>
            <option value="custom">{str.plan.newExercise}</option>
            <option value="divider" disabled>
              ──────────
            </option>
            {library.map((lib) => (
              <option key={lib.id} value={String(lib.id)}>
                {lib.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Parameters */}
      <div className="grid grid-cols-3 gap-2">
        {/* Sets */}
        <div className={`${row} px-3 py-2 relative flex flex-col justify-center items-center`}>
          <span className={meta}>{str.plan.sets}</span>
          {isCustomSets ? (
            <input
              type="number"
              min="1"
              autoFocus
              value={setsValue}
              onChange={(e) => setSetsValue(e.target.value)}
              onBlur={() => {
                if (!setsValue) setSetsValue("3");
              }}
              className={`${value} !text-[16px] bg-transparent w-full text-center outline-none select-text`}
            />
          ) : (
            <>
              <span className={`${value} pointer-events-none`}>{setsValue}</span>
              <select
                aria-label="Sets count"
                value={setsValue}
                onChange={(e) => {
                  if (e.target.value === "other") {
                    setIsCustomSets(true);
                    setSetsValue("");
                  } else {
                    setSetsValue(e.target.value);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {SET_OPTIONS.map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
                <option value="other">{str.plan.other}</option>
              </select>
            </>
          )}
        </div>

        {/* Reps */}
        <div className={`${row} px-3 py-2 relative flex flex-col justify-center items-center`}>
          <span className={meta}>{str.plan.reps}</span>
          {isCustomReps ? (
            <input
              type="number"
              min="1"
              autoFocus
              value={repsValue}
              onChange={(e) => setRepsValue(e.target.value)}
              onBlur={() => {
                if (!repsValue) setRepsValue("10");
              }}
              className={`${value} !text-[16px] bg-transparent w-full text-center outline-none select-text`}
            />
          ) : (
            <>
              <span className={`${value} pointer-events-none`}>{repsValue}</span>
              <select
                aria-label="Reps count"
                value={repsValue}
                onChange={(e) => {
                  if (e.target.value === "other") {
                    setIsCustomReps(true);
                    setRepsValue("");
                  } else {
                    setRepsValue(e.target.value);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {REP_OPTIONS.map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
                <option value="other">{str.plan.other}</option>
              </select>
            </>
          )}
        </div>

        {/* Rest */}
        <div className={`${row} px-3 py-2 relative flex flex-col justify-center items-center`}>
          <span className={meta}>{str.plan.rest}</span>
          <span className={`${value} pointer-events-none`}>
            {formatRest(parseInt(restSeconds, 10))}
          </span>
          <select
            aria-label="Rest duration"
            value={restSeconds}
            onChange={(e) => setRestSeconds(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {!REST_OPTIONS.some((o) => String(o.value) === restSeconds) && (
              <option value={restSeconds}>{formatRest(parseInt(restSeconds, 10) || 0)}</option>
            )}
            {REST_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {formError && <p className={`${errorText} px-1`} role="alert">{formError}</p>}

      {/* Conditional Buttons: Save & Delete for existing, Save & Cancel for new */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Action
          type="submit"
          variant="primary"
          disabled={isPending || !exerciseName.trim()}
        >
          {str.common.save}
        </Action>
        {isEditing && targetId !== undefined ? (
          <Action
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => handleDeleteExercise(targetId)}
          >
            {str.common.delete}
          </Action>
        ) : (
          <Action
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={resetForm}
          >
            {str.common.cancel}
          </Action>
        )}
      </div>
    </form>
  );

  return (
    <div className="min-h-[100dvh] bg-[#baa3d0] text-white pb-32 pt-4 px-4 select-none">
      <main className="max-w-sm mx-auto space-y-3.5">
        <header className="flex items-center justify-between px-1 py-1">
          <BackButton href="/schedule" />
          <div className={pill}>
            <span className="w-2 h-2 rounded-full bg-[#baa3d0]" />
            <span className={pillText}>{str.plan.badge}</span>
          </div>
        </header>

        {/* Plan Name */}
        <Section label={str.plan.name} meta={str.plan.nameMeta}>
          <div className="pt-1">
            <input
              type="text"
              value={title}
              aria-label={str.schedule.planTitle}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className={input}
            />
          </div>
        </Section>

        {/* Exercises */}
        <Section label={str.plan.exercises} meta={str.plan.total(exercises.length)}>
          <div className="space-y-2 pt-1">
            {exercises.map((ex) =>
              editingExerciseId === ex.id ? (
                <div key={ex.id}>{renderExerciseForm(true, ex.id)}</div>
              ) : (
                <button
                  type="button"
                  key={ex.id}
                  onClick={() => handleStartEdit(ex)}
                  className={`${row} w-full text-left min-h-11 px-5 py-3 flex items-center justify-between gap-3 cursor-pointer transition apple-press hover:border-white/20`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className={`${bodyText} truncate font-medium`}>
                      {ex.name}
                    </span>
                    <span className={meta}>
                      {str.plan.summary(ex.sets, ex.reps, formatRest(ex.rest_seconds))}
                    </span>
                  </div>
                  <span className={`${meta} text-[11px] text-[#baa3d0]`}>{str.common.edit}</span>
                </button>
              )
            )}

            {isAdding ? (
              renderExerciseForm(false)
            ) : (
              <div className="pt-1">
                <Action
                  variant="primary"
                  type="button"
                  onClick={handleStartAdd}
                >
                  {str.plan.addExercise}
                </Action>
              </div>
            )}
          </div>
        </Section>

        {/* Delete Plan */}
        <div className="pt-2">
          <Action
            variant="secondary"
            type="button"
            disabled={isPending}
            onClick={handleDeletePlan}
          >
            {confirmDelete ? str.plan.confirmDeletePlan : str.plan.deletePlan}
          </Action>
        </div>
      </main>
    </div>
  );
}