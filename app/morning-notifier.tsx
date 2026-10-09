// app/morning-notifier.tsx
"use client";

import { useEffect } from "react";

export function MorningWorkoutNotifier({
  enabled,
  workoutName,
  exerciseCount,
}: {
  enabled: boolean;
  workoutName: string | null;
  exerciseCount: number;
}) {
  useEffect(() => {
    if (!enabled || !workoutName || typeof window === "undefined") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    // Send once per calendar day
    const todayKey = `morning_reminder_${new Date().toISOString().split("T")[0]}`;
    if (localStorage.getItem(todayKey)) return;

    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification("Vandaag staat er een workout gepland!", {
        body: `${workoutName} (${exerciseCount} oefeningen). Tijd om te knallen!`,
        icon: "/icon.png",
        badge: "/icon.png",
        tag: "repiq-morning-reminder",
        data: { url: "/" },
      });
      localStorage.setItem(todayKey, "true");
    });
  }, [enabled, workoutName, exerciseCount]);

  return null;
}