// app/morning-notifier.tsx
"use client";

import { useEffect } from "react";
import { str } from "@/lib/strings";

/**
 * Shows today's workout as a notification once per day, the first time the
 * app is opened. (A true scheduled morning push would need a cron job; this is
 * a reminder on open.)
 */
export function MorningWorkoutNotifier({
  enabled,
  todayDate,
  workoutName,
  exerciseCount,
}: {
  enabled: boolean;
  /** "YYYY-MM-DD" in the user's timezone, computed on the server. */
  todayDate: string;
  workoutName: string | null;
  exerciseCount: number;
}) {
  useEffect(() => {
    if (!enabled || !workoutName) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;

    const todayKey = `repiq:morning-reminder:${todayDate}`;
    try {
      if (localStorage.getItem(todayKey)) return;
    } catch {
      return;
    }

    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(str.reminders.title, {
          body: str.reminders.body(workoutName, exerciseCount),
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          tag: "repiq-morning-reminder",
          data: { url: "/" },
        })
      )
      .then(() => localStorage.setItem(todayKey, "true"))
      .catch(() => {});
  }, [enabled, todayDate, workoutName, exerciseCount]);

  return null;
}
