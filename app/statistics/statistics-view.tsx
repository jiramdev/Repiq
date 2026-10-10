// app/statistics/statistics-view.tsx
"use client";

import { useState, useTransition } from "react";
import { MainPage } from "@/components/main-page";
import {
  Section,
  card,
  label,
  metric,
  bodyMuted,
  Action,
  input,
  error as errorText,
} from "@/components/ui";
import { str } from "@/lib/strings";
import { reloadIfLocked } from "@/lib/client/locked";
import type { WeightUnit } from "@/lib/units";
import { logWeight } from "./actions";

export function StatisticsView({
  totalWorkouts,
  currentWeight,
  unit,
  today,
  completedDates,
}: {
  totalWorkouts: number;
  currentWeight: number | null;
  unit: WeightUnit;
  /** Today in the user's timezone (month is 1-12). */
  today: { date: string; year: number; month: number };
  completedDates: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [displayedWeight, setDisplayedWeight] = useState<number | null>(currentWeight);
  const [weightInput, setWeightInput] = useState(currentWeight != null ? String(currentWeight) : "");
  const [weightError, setWeightError] = useState<string | null>(null);

  const completedSet = new Set(completedDates);

  const { year, month } = today;
  const monthIndex = month - 1;
  const monthName = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const totalDaysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDayIndex = firstDay === 0 ? 6 : firstDay - 1;

  const calendarCells: ({ dayNumber: number; dateStr: string; isCompleted: boolean; isToday: boolean } | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) calendarCells.push(null);
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calendarCells.push({
      dayNumber: d,
      dateStr,
      isCompleted: completedSet.has(dateStr),
      isToday: dateStr === today.date,
    });
  }

  const handleWeightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(weightInput.replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) {
      setWeightError(str.statistics.invalidWeight);
      return;
    }

    const previous = displayedWeight;
    setDisplayedWeight(val);
    setIsEditingWeight(false);
    setWeightError(null);

    startTransition(async () => {
      try {
        const res = await logWeight(val);
        if (reloadIfLocked(res)) return;
        if (!res.success) throw new Error("rejected");
      } catch {
        setDisplayedWeight(previous);
        setIsEditingWeight(true);
        setWeightError(str.statistics.invalidWeight);
      }
    });
  };

  return (
    <MainPage title={str.statistics.title}>

        <div className="grid grid-cols-2 gap-3.5">
          <div className={`${card} text-center flex flex-col justify-between items-center aspect-square`}>
            <span className={label}>{str.statistics.total}</span>
            <span className={metric}>{totalWorkouts}</span>
            <span className={bodyMuted}>{str.statistics.workouts}</span>
          </div>

          <button
            type="button"
            onClick={() => !isEditingWeight && setIsEditingWeight(true)}
            className={`${card} text-center flex flex-col justify-between items-center aspect-square cursor-pointer transition apple-press`}
          >
            <span className={label}>{str.statistics.weight}</span>
            <span className={metric}>{displayedWeight ?? "—"}</span>
            <span className={bodyMuted}>{str.statistics.tapToLog(unit)}</span>
          </button>
        </div>

        {isEditingWeight && (
          <form onSubmit={handleWeightSubmit} className={`${card} space-y-2.5 pt-3`}>
            <span className={label}>{str.statistics.logWeight}</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              aria-label={str.statistics.logWeight}
              placeholder={str.statistics.weightPlaceholder(unit)}
              value={weightInput}
              onChange={(e) => {
                setWeightInput(e.target.value);
                setWeightError(null);
              }}
              className={input}
            />
            {weightError && <p className={`${errorText} px-1`} role="alert">{weightError}</p>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Action variant="primary" type="submit" disabled={isPending || !weightInput}>
                {str.common.save}
              </Action>
              <Action
                variant="secondary"
                type="button"
                onClick={() => {
                  setWeightInput(displayedWeight != null ? String(displayedWeight) : "");
                  setIsEditingWeight(false);
                  setWeightError(null);
                }}
              >
                {str.common.cancel}
              </Action>
            </div>
          </form>
        )}

        <Section label={str.statistics.activity} meta={`${monthName} ${year}`}>
          <div className={`${card} p-4 space-y-3`}>
            <div className="grid grid-cols-7 gap-1 text-center">
              {str.statistics.weekdays.map((w, idx) => (
                <span key={idx} className="text-[11px] font-semibold text-white/40 uppercase">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarCells.map((cell, idx) =>
                !cell ? (
                  <div key={`empty-${idx}`} className="h-8 w-8" />
                ) : (
                  <div key={cell.dateStr} className="flex items-center justify-center h-8 w-8 mx-auto">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition ${
                        cell.isCompleted
                          ? "bg-[#baa3d0] text-[#141416] font-bold shadow-sm"
                          : cell.isToday
                            ? "border border-[#baa3d0] text-white"
                            : "text-white/70"
                      }`}
                    >
                      {cell.dayNumber}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </Section>
    </MainPage>
  );
}
