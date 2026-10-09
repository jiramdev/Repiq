// app/schedule/schedule-view.tsx
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
import { str } from "@/lib/strings";

interface ScheduleItem {
  day_label: string;
  plan_id: number | null;
  plan_title: string | null;
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
        <Header title={str.schedule.title} />

        <Section label={str.schedule.week} meta={str.schedule.weekMeta}>
          <div className="space-y-2 pt-1">
            {scheduleList.map((item) => {
              const hasPlan = item.plan_id != null;
              return (
                <div
                  key={item.day_label}
                  className={`relative ${hasPlan ? rowDone : row} min-h-11 px-5 py-3 flex items-center justify-between gap-3`}
                >
                  <span className={`${value} truncate pointer-events-none`}>{item.day_label}</span>
                  <span
                    className={`${hasPlan ? bodyText : bodyMuted} truncate font-medium pointer-events-none`}
                  >
                    {item.plan_title ?? str.common.rest}
                  </span>

                  <select
                    aria-label={str.schedule.selectFor(item.day_label)}
                    disabled={isPending}
                    value={item.plan_id != null ? String(item.plan_id) : "rest"}
                    onChange={(e) => handleSelect(item, e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed text-[16px]"
                  >
                    <option value="rest">{str.common.rest}</option>
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

        <Section label={str.schedule.plans} meta={str.schedule.plansMeta}>
          <div className="space-y-2 pt-1">
            {planList.length > 0 ? (
              planList.map((plan) => (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}`}
                  className={`${row} min-h-11 px-5 py-3 flex items-center justify-between gap-3 transition apple-press`}
                >
                  <span className={`${value} truncate`}>{plan.title}</span>
                  <span className={bodyText}>{plan.exercise_count}</span>
                </Link>
              ))
            ) : (
              <div className={`${row} px-5 py-3`}>
                <span className={bodyMuted}>{str.schedule.noPlans}</span>
              </div>
            )}

            {isAdding ? (
              <form onSubmit={handleAddPlan} className="space-y-2 pt-1">
                <input
                  type="text"
                  autoFocus
                  maxLength={60}
                  aria-label={str.schedule.planTitle}
                  placeholder={str.schedule.newPlanPlaceholder}
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  className={input}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Action type="submit" variant="primary" disabled={isPending || !newPlanTitle.trim()}>
                    {str.common.save}
                  </Action>
                  <Action
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIsAdding(false);
                      setNewPlanTitle("");
                    }}
                  >
                    {str.common.cancel}
                  </Action>
                </div>
              </form>
            ) : (
              <div className="pt-1">
                <Action variant="primary" type="button" onClick={() => setIsAdding(true)}>
                  {str.schedule.addPlan}
                </Action>
              </div>
            )}
          </div>
        </Section>
      </main>
    </div>
  );
}
