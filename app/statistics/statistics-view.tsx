// app/statistics/statistics-view.tsx
"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Header,
  Section,
  card,
  label,
  metric,
  bodyMuted,
  Action,
  input,
} from "@/components/ui";
import { logWeight } from "./actions";

interface CompletedDateEntry {
  date_str: string;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function StatisticsView({
  totalWorkouts,
  currentWeight,
  completedDates,
}: {
  totalWorkouts: number;
  currentWeight: number | null;
  completedDates: CompletedDateEntry[];
}) {
  const [isPending, startTransition] = useTransition();
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [displayedWeight, setDisplayedWeight] = useState<number | null>(currentWeight);
  const [weightInput, setWeightInput] = useState(
    currentWeight != null ? String(currentWeight) : ""
  );

  // Sync state when server props revalidate
  useEffect(() => {
    setDisplayedWeight(currentWeight);
    if (currentWeight != null) {
      setWeightInput(String(currentWeight));
    }
  }, [currentWeight]);

  const completedSet = new Set(completedDates.map((d) => d.date_str));

  // Current Month Calendar
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDateStr = now.toISOString().split("T")[0];
  const monthName = now.toLocaleString("default", { month: "long" });

  const firstDay = new Date(year, month, 1);
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const formatted = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      d
    ).padStart(2, "0")}`;
    calendarCells.push({
      dayNumber: d,
      dateStr: formatted,
      isCompleted: completedSet.has(formatted),
      isToday: formatted === todayDateStr,
    });
  }

  const handleWeightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(weightInput);
    if (!val || isNaN(val)) return;

    // Optimistic UI update
    setDisplayedWeight(val);
    setIsEditingWeight(false);

    startTransition(async () => {
      await logWeight(val);
    });
  };

  return (
    <div className="min-h-screen bg-[#baa3d0] text-white pb-32 pt-4 px-4 select-none">
      <main className="max-w-sm mx-auto space-y-3.5">
        <Header title="Statistics" />

        {/* 2-Column Metric Grid */}
        <div className="grid grid-cols-2 gap-3.5">
          <div
            className={`${card} text-center flex flex-col justify-between items-center aspect-square`}
          >
            <span className={label}>Total</span>
            <span className={metric}>{totalWorkouts}</span>
            <span className={bodyMuted}>workouts</span>
          </div>

          <div
            onClick={() => !isEditingWeight && setIsEditingWeight(true)}
            className={`${card} text-center flex flex-col justify-between items-center aspect-square cursor-pointer transition apple-press`}
          >
            <span className={label}>Weight</span>
            <span className={metric}>{displayedWeight ?? "—"}</span>
            <span className={bodyMuted}>kg · tap to log</span>
          </div>
        </div>

        {/* Weight Input Drawer */}
        {isEditingWeight && (
          <form
            onSubmit={handleWeightSubmit}
            className={`${card} space-y-2.5 pt-3`}
          >
            <span className={label}>Log Today&apos;s Weight</span>
            <input
              type="number"
              step="0.1"
              autoFocus
              placeholder="e.g. 78.5"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className={input}
            />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Action
                variant="primary"
                type="submit"
                disabled={isPending || !weightInput}
              >
                Save
              </Action>
              <Action
                variant="secondary"
                type="button"
                onClick={() => {
                  setWeightInput(displayedWeight != null ? String(displayedWeight) : "");
                  setIsEditingWeight(false);
                }}
              >
                Cancel
              </Action>
            </div>
          </form>
        )}

        {/* Activity Calendar Card */}
        <Section label="Activity" meta={`${monthName} ${year}`}>
          <div className={`${card} p-4 space-y-3`}>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-semibold text-white/40 uppercase"
                >
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="h-8 w-8" />;
                }

                return (
                  <div
                    key={cell.dateStr}
                    className="flex items-center justify-center h-8 w-8 mx-auto"
                  >
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
                );
              })}
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}