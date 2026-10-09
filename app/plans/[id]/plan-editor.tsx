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
} from "@/components/ui";
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
  };

  const handleTitleBlur = () => {
    if (title.trim() && title !== plan.title) {
      startTransition(async () => {
        await updatePlanTitle(plan.id, title);
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

    startTransition(async () => {
      const parsedSets = parseInt(setsValue, 10) || 3;
      const parsedReps = parseInt(repsValue, 10) || 10;
      const parsedRest = parseInt(restSeconds, 10) || 90;

      if (editingExerciseId !== null) {
        await updatePlanExercise(
          plan.id,
          editingExerciseId,
          exerciseName,
          parsedSets,
          parsedReps,
          parsedRest
        );
      } else {
        await addExerciseToPlan(
          plan.id,
          exerciseName,
          parsedSets,
          parsedReps,
          parsedRest
        );
      }
      resetForm();
    });
  };

  const handleDeleteExercise = (exerciseId: number) => {
    startTransition(async () => {
      await deleteExercise(plan.id, exerciseId);
      if (editingExerciseId === exerciseId) {
        resetForm();
      }
    });
  };

  const handleDeletePlan = () => {
    if (confirm("Are you sure you want to delete this plan?")) {
      startTransition(async () => {
        await deletePlan(plan.id);
      });
    }
  };

  const formatRest = (sec: number) => {
    if (sec >= 60 && sec % 60 === 0) return `${sec / 60}m`;
    if (sec >= 60) return `${(sec / 60).toFixed(1)}m`;
    return `${sec}s`;
  };

  const chosenExerciseTitle =
    selectedLibraryId === "custom"
      ? exerciseName || "Custom Exercise"
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
            placeholder="Exercise name (e.g. Incline Bench)"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            className={input}
          />
          <CloseButton
            label="Back to selection"
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
            {chosenExerciseTitle || "Choose Exercise"}
          </span>

          <select
            aria-label="Choose Exercise"
            value={selectedLibraryId}
            onChange={(e) => handleLibrarySelect(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="" disabled>
              Choose Exercise
            </option>
            <option value="custom">+ New Exercise</option>
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
          <span className={meta}>Sets</span>
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
              className={`${value} bg-transparent w-full text-center outline-none`}
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
                <option value="other">Other...</option>
              </select>
            </>
          )}
        </div>

        {/* Reps */}
        <div className={`${row} px-3 py-2 relative flex flex-col justify-center items-center`}>
          <span className={meta}>Reps</span>
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
              className={`${value} bg-transparent w-full text-center outline-none`}
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
                <option value="other">Other...</option>
              </select>
            </>
          )}
        </div>

        {/* Rest */}
        <div className={`${row} px-3 py-2 relative flex flex-col justify-center items-center`}>
          <span className={meta}>Rest</span>
          <span className={`${value} pointer-events-none`}>
            {formatRest(parseInt(restSeconds, 10))}
          </span>
          <select
            aria-label="Rest duration"
            value={restSeconds}
            onChange={(e) => setRestSeconds(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {REST_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conditional Buttons: Save & Delete for existing, Save & Cancel for new */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Action
          type="submit"
          variant="primary"
          disabled={isPending || !exerciseName.trim()}
        >
          Save
        </Action>
        {isEditing && targetId !== undefined ? (
          <Action
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => handleDeleteExercise(targetId)}
          >
            Delete
          </Action>
        ) : (
          <Action
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={resetForm}
          >
            Cancel
          </Action>
        )}
      </div>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#baa3d0] text-white pb-32 pt-4 px-4 select-none">
      <main className="max-w-sm mx-auto space-y-3.5">
        <header className="flex items-center justify-between px-1 py-1">
          <BackButton href="/schedule" />
          <div className={pill}>
            <span className="w-2 h-2 rounded-full bg-[#baa3d0]" />
            <span className={pillText}>Plan</span>
          </div>
        </header>

        {/* Plan Name */}
        <Section label="Plan Name" meta="tap to edit">
          <div className="pt-1">
            <input
              type="text"
              value={title}
              aria-label="Plan title"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className={input}
            />
          </div>
        </Section>

        {/* Exercises */}
        <Section label="Exercises" meta={`${exercises.length} total`}>
          <div className="space-y-2 pt-1">
            {exercises.map((ex) =>
              editingExerciseId === ex.id ? (
                <div key={ex.id}>{renderExerciseForm(true, ex.id)}</div>
              ) : (
                <div
                  key={ex.id}
                  onClick={() => handleStartEdit(ex)}
                  className={`${row} px-5 py-3 flex items-center justify-between gap-3 cursor-pointer transition apple-press hover:border-white/20`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className={`${bodyText} truncate font-medium`}>
                      {ex.name}
                    </span>
                    <span className={meta}>
                      {ex.sets} sets × {ex.reps} reps · {formatRest(ex.rest_seconds)} rest
                    </span>
                  </div>
                  <span className={`${meta} text-[11px] text-[#baa3d0]`}>Edit</span>
                </div>
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
                  Add Exercise
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
            Delete Plan
          </Action>
        </div>
      </main>
    </div>
  );
}