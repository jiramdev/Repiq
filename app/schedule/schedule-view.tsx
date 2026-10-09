"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { assignPlanToWorkout, createPlan } from "./actions";
import {
  Header,
  Section,
  Action,
  input,
  row,
  rowDone,
  value,
  bodyText,
  bodyMuted,
} from "@/components/ui";

interface ScheduleItem {
  id: number | null;
  name: string;
  day_label: string;
}

interface Plan {
  id: number;
  title: string;
  exercise_count: number;
}

export function ScheduleView({
  scheduleList,
  planList,
}: {
  scheduleList: ScheduleItem[];
  planList: Plan[];
}) {
  const [isPending, startTransition] = useTransition();
  const [isAdding, setIsAdding] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");

  const handleSelect = (item: ScheduleItem, planValue: string) => {
    startTransition(async () => {
      await assignPlanToWorkout(item.day_label, planValue);
    });
  };

  const handleAddPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanTitle.trim()) return;

    startTransition(async () => {
      await createPlan(newPlanTitle);
      setNewPlanTitle("");
      setIsAdding(false);
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[#baa3d0] text-white pb-28 pt-4 px-4 select-none">
      <main className="max-w-sm mx-auto space-y-3.5">
        <Header title="Schedule" />

        <Section label="Week Schedule" meta="Select day to change">
          <div className="space-y-2 pt-1">
            {scheduleList.map((item) => {
              const nameClean = item.name ? item.name.trim() : "";
              const isRest = !nameClean || nameClean.toLowerCase() === "rest";
              const hasPlan = !isRest;
              const currentPlan = planList.find(
                (p) => p.title.toLowerCase() === nameClean.toLowerCase()
              );
              const currentValue = isRest
                ? "rest"
                : currentPlan
                ? String(currentPlan.id)
                : "";

              return (
                <div
                  key={item.day_label}
                  className={`relative ${
                    hasPlan ? rowDone : row
                  } px-5 py-3 flex items-center justify-between gap-3`}
                >
                  <span className={`${value} truncate pointer-events-none`}>
                    {item.day_label}
                  </span>

                  <span
                    className={`${
                      hasPlan ? bodyText : bodyMuted
                    } truncate font-medium pointer-events-none`}
                  >
                    {item.name}
                  </span>

                  <select
                    aria-label={`Select plan for ${item.day_label}`}
                    disabled={isPending}
                    value={currentValue}
                    onChange={(e) => handleSelect(item, e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <option value="rest">Rest</option>
                    {planList.map((plan) => (
                      <option key={plan.id} value={String(plan.id)}>
                        {plan.title}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </Section>

        <Section label="Workout Plans" meta="templates">
          <div className="space-y-2 pt-1">
            {planList.length > 0 ? (
              planList.map((plan) => (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}`}
                  className={`${row} px-5 py-3 flex items-center justify-between gap-3 transition apple-press block`}
                >
                  <span className={`${value} truncate`}>{plan.title}</span>
                  <span className={bodyText}>{plan.exercise_count}</span>
                </Link>
              ))
            ) : (
              <div className={`${row} px-5 py-3`}>
                <span className={bodyMuted}>No plans yet</span>
              </div>
            )}

            {isAdding ? (
              <form onSubmit={handleAddPlan} className="space-y-2 pt-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Upper Body"
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  className={input}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Action
                    type="submit"
                    variant="primary"
                    disabled={isPending || !newPlanTitle.trim()}
                  >
                    Save
                  </Action>
                  <Action
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIsAdding(false);
                      setNewPlanTitle("");
                    }}
                  >
                    Cancel
                  </Action>
                </div>
              </form>
            ) : (
              <div className="pt-1">
                <Action
                  variant="primary"
                  type="button"
                  onClick={() => setIsAdding(true)}
                >
                  Add Plan
                </Action>
              </div>
            )}
          </div>
        </Section>
      </main>
    </div>
  );
}