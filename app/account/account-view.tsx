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
  bodyMuted,
  label,
  display,
  input,
  hint,
  error as errorText,
  page,
  s,
} from "@/components/ui";
import {
  toggleUnitSystem,
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
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [formData, setFormData] = useState({
    name: profile.name,
    age: profile.age,
    email: profile.email,
    username: profile.username.replace(/^@+/, ""),
  });

  const handleUnitToggle = () => {
    startTransition(async () => {
      await toggleUnitSystem(profile.unit_system);
    });
  };

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
      setIsEditingAccount(false);
    });
  };

  const handleReset = () => {
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

  const closeForm = () => {
    setIsEditingAccount(false);
    setCurrentPassword("");
    setNewPassword("");
    setErrorMessage(null);
    setFormData({
      name: profile.name,
      age: profile.age,
      email: profile.email,
      username: profile.username.replace(/^@+/, ""),
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
        <Section
          label="Account Details"
          meta={
            <button
              type="button"
              onClick={() => {
                if (isEditingAccount) {
                  closeForm();
                } else {
                  setIsEditingAccount(true);
                }
              }}
              className="text-[#baa3d0] text-xs font-semibold hover:underline"
            >
              {isEditingAccount ? "Close" : "Edit"}
            </button>
          }
        >
          {isEditingAccount ? (
            <form onSubmit={handleAccountSubmit} className={`${s.stack} pt-2`}>
              <div className={s.tight}>
                <span className={label}>Full Name</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={input}
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className={s.tight}>
                  <span className={label}>Age</span>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        age: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={input}
                  />
                </div>
                <div className={s.tight}>
                  <span className={label}>Username</span>
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
                    className={input}
                  />
                </div>
              </div>

              <div className={s.tight}>
                <span className={label}>Email</span>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className={input}
                />
              </div>

              <div className={s.tight}>
                <div className="flex items-center justify-between">
                  <span className={label}>Current Password</span>
                  <span className={hint}>Required to change password</span>
                </div>
                <input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className={input}
                />
              </div>

              <div className={s.tight}>
                <div className="flex items-center justify-between">
                  <span className={label}>New Password</span>
                  <span className={hint}>Leave blank to keep current</span>
                </div>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className={input}
                />
                {errorMessage && (
                  <p className={`${errorText} pt-1.5`}>{errorMessage}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Action variant="primary" type="submit" disabled={isPending}>
                  Save
                </Action>
                <Action variant="secondary" type="button" onClick={closeForm}>
                  Cancel
                </Action>
              </div>
            </form>
          ) : (
            <div className="space-y-2 pt-1">
              <div className={`${row} px-5 py-3 flex items-center justify-between`}>
                <span className={value}>Name</span>
                <span className={bodyText}>{profile.name}</span>
              </div>
              <div className={`${row} px-5 py-3 flex items-center justify-between`}>
                <span className={value}>Age</span>
                <span className={bodyText}>{profile.age}</span>
              </div>
              <div className={`${row} px-5 py-3 flex items-center justify-between`}>
                <span className={value}>Email</span>
                <span className={`${bodyText} truncate max-w-[180px]`}>{profile.email}</span>
              </div>
              <div className={`${row} px-5 py-3 flex items-center justify-between`}>
                <span className={value}>Username</span>
                <span className={bodyText}>{cleanUsernameDisplay}</span>
              </div>
              <div className={`${row} px-5 py-3 flex items-center justify-between`}>
                <span className={value}>Password</span>
                <span className={bodyMuted}>••••••••••••</span>
              </div>
            </div>
          )}
        </Section>

        {/* 3. Preferences */}
        <Section label="Preferences" meta="tap to toggle">
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isPending}
              onClick={handleUnitToggle}
              className={`${row} w-full px-5 py-3 flex items-center justify-between transition apple-press text-left`}
            >
              <span className={value}>Units</span>
              <span className="font-semibold text-[#baa3d0] uppercase tracking-wider text-sm">
                {profile.unit_system === "kg" ? "Metric (kg)" : "Imperial (lbs)"}
              </span>
            </button>
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>Theme</span>
              <span className={bodyMuted}>Apple Lavender</span>
            </div>
          </div>
        </Section>

        {/* 4. Notification Preferences */}
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
              <div className="flex flex-col">
                <span className={value}>Workout Reminders</span>
                <span className={hint}>Ochtendmelding van geplande training</span>
              </div>
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
              <div className="flex flex-col">
                <span className={value}>Rusttimer Meldingen</span>
                <span className={hint}>Melding wanneer timer afloopt</span>
              </div>
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

        {/* 5. Activity Summary */}
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

        {/* 6. Danger Zone */}
        <Section label="Data Management" meta="danger">
          <div className="pt-1 flex flex-col gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleReset}
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