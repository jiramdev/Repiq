// app/account/account-view.tsx
"use client";

import { useState, useTransition } from "react";
import {
  Header,
  Section,
  Action,
  card,
  row,
  value,
  bodyText,
  label,
  display,
  error as errorText,
  s,
} from "@/components/ui";
import {
  updateAccountDetails,
  toggleNotification,
  resetWorkoutHistory,
} from "./actions";
import { logoutUser } from "@/app/auth/actions";

export interface UserProfileData {
  name: string;
  username: string;
  email: string;
  age: number;
  password_hash: string;
  unit_system: string;
  notify_workout_reminders: boolean;
  notify_rest_day_alerts: boolean;
}

interface AccountStats {
  totalWorkouts: number;
  totalPlans: number;
  latestWeight: number | null;
}

export function AccountView({
  profile,
  stats,
}: {
  profile: UserProfileData;
  stats: AccountStats;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [formData, setFormData] = useState({
    name: profile.name,
    age: profile.age,
    email: profile.email,
    username: profile.username.replace(/^@+/, ""),
  });

  const handleNotifyToggle = async (
    key: "notify_workout_reminders" | "notify_rest_day_alerts",
    currentVal: boolean
  ) => {
    const nextVal = !currentVal;

    if (nextVal && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          return;
        }
      } else if (Notification.permission === "denied") {
        alert("Notificaties zijn geblokkeerd in je browser instellingen.");
        return;
      }
    }

    startTransition(async () => {
      await toggleNotification(key, currentVal);
    });
  };

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveSuccess(false);

    startTransition(async () => {
      const res = await updateAccountDetails({
        ...formData,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });

      if (!res.success && res.error) {
        setErrorMessage(res.error);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setErrorMessage(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    });
  };

  const handleResetForm = () => {
    setFormData({
      name: profile.name,
      age: profile.age,
      email: profile.email,
      username: profile.username.replace(/^@+/, ""),
    });
    setCurrentPassword("");
    setNewPassword("");
    setErrorMessage(null);
    setSaveSuccess(false);
  };

  const handleResetHistory = () => {
    if (
      confirm(
        "Are you sure you want to reset your completed workout history? This cannot be undone."
      )
    ) {
      startTransition(async () => {
        await resetWorkoutHistory();
      });
    }
  };

  const handleLogout = () => {
    startTransition(async () => {
      await logoutUser();
    });
  };

  const cleanUsernameDisplay = profile.username.replace(/^@+/, "");

  return (
    <div className="min-h-[100dvh] max-w-sm mx-auto p-4 flex flex-col justify-start select-none pb-28">
      <main className={`max-w-sm mx-auto ${s.stack}`}>
        <Header title="Account" />

        {/* 1. Athlete Profile Card */}
        <section className={card}>
          <p className={label}>Athlete Profile</p>
          <div className="py-2">
            <h1 className={display}>{cleanUsernameDisplay}</h1>
          </div>
        </section>

        {/* 2. Account Details */}
        <Section label="Account Details">
          <form onSubmit={handleAccountSubmit} className="space-y-2 pt-1">
            {/* Name */}
            <div className={`${row} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className={value}>Name</span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errorMessage) setErrorMessage(null);
                }}
                className="bg-transparent text-right font-medium text-white outline-none flex-1 truncate"
              />
            </div>

            {/* Age */}
            <div className={`${row} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className={value}>Age</span>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    age: parseInt(e.target.value, 10) || 0,
                  });
                  if (errorMessage) setErrorMessage(null);
                }}
                className="bg-transparent text-right font-medium text-white outline-none w-24"
              />
            </div>

            {/* Email */}
            <div className={`${row} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className={value}>Email</span>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (errorMessage) setErrorMessage(null);
                }}
                className="bg-transparent text-right font-medium text-white outline-none flex-1 truncate max-w-[200px]"
              />
            </div>

            {/* Username */}
            <div className={`${row} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className={value}>Username</span>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    username: e.target.value.replace(/^@+/, "").trim(),
                  });
                  if (errorMessage) setErrorMessage(null);
                }}
                className="bg-transparent text-right font-medium text-white outline-none flex-1 truncate"
              />
            </div>

            {/* Current Password */}
            <div className={`${row} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className={value}>Current Password</span>
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="bg-transparent text-right font-medium text-white placeholder:text-white/30 outline-none flex-1 truncate"
              />
            </div>

            {/* New Password */}
            <div className={`${row} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className={value}>New Password</span>
              <input
                type="password"
                placeholder="Leave blank to keep"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="bg-transparent text-right font-medium text-white placeholder:text-white/30 outline-none flex-1 truncate"
              />
            </div>

            {errorMessage && (
              <p className={`${errorText} px-1 pt-1`}>{errorMessage}</p>
            )}

            {saveSuccess && (
              <p className="text-emerald-400 text-xs font-semibold px-1 pt-1">
                Account details saved successfully.
              </p>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Action variant="primary" type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Action>
              <Action
                variant="secondary"
                type="button"
                disabled={isPending}
                onClick={handleResetForm}
              >
                Cancel
              </Action>
            </div>
          </form>
        </Section>

        {/* 3. Notification Preferences */}
        <Section label="Notifications" meta="alerts">
          <div className="space-y-2 pt-1">
            {/* Morning Workout Reminder */}
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handleNotifyToggle(
                  "notify_workout_reminders",
                  profile.notify_workout_reminders
                )
              }
              className={`${row} w-full px-5 py-3 flex items-center justify-between transition apple-press text-left`}
            >
              <span className={value}>Workout Reminders</span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  profile.notify_workout_reminders
                    ? "bg-[#baa3d0] text-[#141416]"
                    : "bg-white/[0.08] text-white/50"
                }`}
              >
                {profile.notify_workout_reminders ? "AAN" : "UIT"}
              </span>
            </button>

            {/* Live Rest Timer Alerts */}
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handleNotifyToggle(
                  "notify_rest_day_alerts",
                  profile.notify_rest_day_alerts
                )
              }
              className={`${row} w-full px-5 py-3 flex items-center justify-between transition apple-press text-left`}
            >
              <span className={value}>Rusttimer Meldingen</span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  profile.notify_rest_day_alerts
                    ? "bg-[#baa3d0] text-[#141416]"
                    : "bg-white/[0.08] text-white/50"
                }`}
              >
                {profile.notify_rest_day_alerts ? "AAN" : "UIT"}
              </span>
            </button>
          </div>
        </Section>

        {/* 4. Activity Summary */}
        <Section label="Activity Summary" meta="database">
          <div className="space-y-2 pt-1">
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>Completed Sessions</span>
              <span className={bodyText}>{stats.totalWorkouts}</span>
            </div>
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>Saved Plans</span>
              <span className={bodyText}>{stats.totalPlans}</span>
            </div>
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>Current Weight</span>
              <span className={bodyText}>
                {stats.latestWeight != null
                  ? `${stats.latestWeight} ${profile.unit_system}`
                  : "—"}
              </span>
            </div>
          </div>
        </Section>

        {/* 5. Danger Zone */}
        <Section label="Data Management" meta="danger">
          <div className="pt-1 flex flex-col gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleResetHistory}
              className="w-full py-3.5 px-4 rounded-full font-bold bg-[#baa3d0] text-[#141416] transition apple-press disabled:opacity-50 text-center text-sm shadow-sm font-editorial tracking-wider uppercase leading-none"
            >
              Reset Workout History
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={handleLogout}
              className="w-full py-3.5 px-4 rounded-full font-semibold border border-white/[0.08] text-[#71717a] hover:text-white transition apple-press disabled:opacity-50 text-center text-sm font-editorial tracking-wider uppercase leading-none"
            >
              Uitloggen
            </button>
          </div>
        </Section>
      </main>
    </div>
  );
}