// app/dashboard-view.tsx
"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { toggleWorkoutCompleted, assignPlanFromDashboard } from "./actions";
import {
  Header,
  Section,
  card,
  row,
  rowDone,
  value,
  bodyText,
  bodyMuted,
  label,
  meta,
  display,
  circleButton,
  t,
  dock,
  dockPill,
} from "@/components/ui";

interface ScheduleItem {
  id: number | null;
  name: string;
  day_label: string;
  scheduled_date: string;
  completed: boolean;
  exercise_count: number;
  plan_id: number | null;
}

interface Plan {
  id: number;
  title: string;
  exercise_count: number;
}

export function DashboardView({
  todayItem,
  weekSchedule,
  plans,
}: {
  todayItem: ScheduleItem;
  weekSchedule: ScheduleItem[];
  plans: Plan[];
}) {
  const [isPending, startTransition] = useTransition();

  const isTodayRest =
    !todayItem.name || todayItem.name.trim().toLowerCase() === "rest";

  const handleToggleComplete = () => {
    if (!todayItem.id || isTodayRest) return;
    startTransition(async () => {
      await toggleWorkoutCompleted(todayItem.id!, todayItem.completed);
    });
  };

  const handleSelectPlan = (item: ScheduleItem, planValue: string) => {
    startTransition(async () => {
      await assignPlanFromDashboard(
        item.day_label,
        item.scheduled_date,
        planValue,
        item.id
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#baa3d0] text-white pb-32 pt-4 px-4 select-none">
      <main className="max-w-sm mx-auto space-y-3.5">
        <Header title="repiq" />

        {/* Hero Today Widget */}
        <section
          className={`${card} relative overflow-hidden transition apple-press`}
        >
          <div className="flex items-center justify-between">
            <span className={label}>Today · {todayItem.day_label}</span>
            <span className={meta}>
              {isTodayRest
                ? "Recovery"
                : `${todayItem.exercise_count} exercises`}
            </span>
          </div>

          <div className="py-2">
            {todayItem.plan_id ? (
              <Link
                href={`/plans/${todayItem.plan_id}`}
                className="block group"
              >
                <h1 className={`${display} group-hover:text-[#baa3d0] transition`}>
                  {todayItem.name}
                </h1>
              </Link>
            ) : (
              <h1 className={display}>{todayItem.name}</h1>
            )}
          </div>

          {!isTodayRest && (
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.08]">
              <span className={todayItem.completed ? value : bodyMuted}>
                {todayItem.completed ? "Workout completed" : "Mark as completed"}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={handleToggleComplete}
                className={`${circleButton} w-10 h-10 ${
                  todayItem.completed ? "bg-[#baa3d0] text-[#141416]" : ""
                }`}
                aria-label="Toggle workout completion"
              >
                <Check className={`${t.body} stroke-[2.5]`} />
              </button>
            </div>
          )}
        </section>

        {/* Week Schedule */}
        <Section label="Week Schedule" meta="Select day to change">
          <div className="space-y-2 pt-1">
            {weekSchedule.map((item) => {
              const nameClean = item.name ? item.name.trim() : "";
              const isRest = !nameClean || nameClean.toLowerCase() === "rest";
              const hasPlan = !isRest;
              const currentPlan = plans.find(
                (p) => p.title.trim().toLowerCase() === nameClean.toLowerCase()
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
                    } truncate pointer-events-none font-medium`}
                  >
                    {item.name}
                  </span>

                  {/* Native dropdown */}
                  <select
                    aria-label={`Select plan for ${item.day_label}`}
                    disabled={isPending}
                    value={currentValue}
                    onChange={(e) => handleSelectPlan(item, e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <option value="rest">Rest</option>
                    {plans.map((plan) => (
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

        {/* Workout Plans */}
        <Section label="Workout Plans" meta="templates">
          <div className="space-y-2 pt-1">
            {plans.length > 0 ? (
              plans.map((plan) => (
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
          </div>
        </Section>

        {/* Bottom Dock */}
        <div className={dock}>
          <div className={dockPill}>
            <Link href="/" aria-label="Dashboard">
              <span className="w-2 h-2 rounded-full bg-[#baa3d0] block" />
            </Link>
            <Link href="/schedule" aria-label="Schedule">
              <span className="w-2 h-2 rounded-full bg-[#71717a] block" />
            </Link>
            <span
              className="w-2 h-2 rounded-full bg-[#71717a] block"
              aria-hidden
            />
            <span
              className="w-2 h-2 rounded-full bg-[#71717a] block"
              aria-hidden
            />
          </div>
        </div>
      </main>
    </div>
  );
}