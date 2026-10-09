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
  inlineInput,
  segment,
  toggleBadge,
  error as errorText,
  s,
} from "@/components/ui";
import { str } from "@/lib/strings";
import type { UserProfile } from "@/lib/user";
import type { WeightUnit } from "@/lib/units";
import { formatWeight } from "@/lib/units";
import { clearAppCaches } from "@/components/pwa";
import {
  updateAccountDetails,
  changePassword,
  setNotification,
  setUnitSystem,
  resetWorkoutHistory,
} from "./actions";
import { logoutUser } from "@/app/auth/actions";

interface AccountStats {
  totalWorkouts: number;
  totalPlans: number;
  latestWeight: number | null;
}

const successText = "text-emerald-400 text-xs font-semibold px-1 pt-1";

export function AccountView({ profile, stats }: { profile: UserProfile; stats: AccountStats }) {
  const [isPending, startTransition] = useTransition();

  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState(false);
  const initialForm = {
    name: profile.name,
    age: profile.age ?? 0,
    email: profile.email,
    username: profile.username,
  };
  const [formData, setFormData] = useState(initialForm);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleNotifyToggle = async (
    key: "notify_workout_reminders" | "notify_rest_day_alerts",
    currentVal: boolean
  ) => {
    setNotifyError(null);
    const nextVal = !currentVal;

    if (nextVal && "Notification" in window) {
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission().catch(() => "default");
        if (permission !== "granted") return;
      } else if (Notification.permission === "denied") {
        setNotifyError(str.account.notificationsBlocked);
        return;
      }
    }

    startTransition(async () => {
      try {
        await setNotification(key, nextVal);
      } catch {
        setNotifyError(str.common.genericError);
      }
    });
  };

  const handleUnit = (unit: WeightUnit) => {
    if (unit === profile.unit_system) return;
    startTransition(async () => {
      await setUnitSystem(unit);
    });
  };

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    setAccountSuccess(false);

    startTransition(async () => {
      try {
        const res = await updateAccountDetails(formData);
        if (!res.success) {
          setAccountError(res.error ?? str.common.genericError);
          return;
        }
        setAccountSuccess(true);
        setTimeout(() => setAccountSuccess(false), 2500);
      } catch {
        setAccountError(str.common.genericError);
      }
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) return setPasswordError(str.account.enterCurrentPassword);
    if (!newPassword) return setPasswordError(str.account.enterNewPassword);

    startTransition(async () => {
      try {
        const res = await changePassword({ currentPassword, newPassword });
        if (!res.success) {
          setPasswordError(res.error ?? str.common.genericError);
          return;
        }
        setCurrentPassword("");
        setNewPassword("");
        setPasswordSuccess(true);
        setTimeout(() => setPasswordSuccess(false), 4000);
      } catch {
        setPasswordError(str.common.genericError);
      }
    });
  };

  const handleResetHistory = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    startTransition(async () => {
      await resetWorkoutHistory();
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      await clearAppCaches();
      await logoutUser();
    });
  };

  const rowClass = `${row} px-5 py-1.5 flex items-center justify-between gap-3`;

  return (
    <div className="min-h-[100dvh] max-w-sm mx-auto p-4 flex flex-col justify-start select-none pb-28">
      <main className={`max-w-sm mx-auto w-full ${s.stack}`}>
        <Header title={str.account.title} />

        <section className={card}>
          <p className={label}>{str.account.profile}</p>
          <div className="py-2">
            <h1 className={`${display} break-all`}>{profile.username}</h1>
          </div>
        </section>

        <Section label={str.account.details}>
          <form onSubmit={handleAccountSubmit} className="space-y-2 pt-1">
            <label className={rowClass}>
              <span className={value}>{str.account.name}</span>
              <input
                type="text"
                autoComplete="name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  setAccountError(null);
                }}
                className={`${inlineInput} flex-1 min-w-0 truncate`}
              />
            </label>

            <label className={rowClass}>
              <span className={value}>{str.account.age}</span>
              <input
                type="number"
                inputMode="numeric"
                min={13}
                max={120}
                value={formData.age || ""}
                onChange={(e) => {
                  setFormData({ ...formData, age: parseInt(e.target.value, 10) || 0 });
                  setAccountError(null);
                }}
                className={`${inlineInput} w-24`}
              />
            </label>

            <label className={rowClass}>
              <span className={value}>{str.account.email}</span>
              <input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setAccountError(null);
                }}
                className={`${inlineInput} flex-1 min-w-0 truncate`}
              />
            </label>

            <label className={rowClass}>
              <span className={value}>{str.account.username}</span>
              <input
                type="text"
                autoCapitalize="none"
                autoComplete="username"
                value={formData.username}
                onChange={(e) => {
                  setFormData({ ...formData, username: e.target.value.replace(/^@+/, "").trim() });
                  setAccountError(null);
                }}
                className={`${inlineInput} flex-1 min-w-0 truncate`}
              />
            </label>

            {accountError && <p className={`${errorText} px-1 pt-1`} role="alert">{accountError}</p>}
            {accountSuccess && <p className={successText}>{str.account.detailsSaved}</p>}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Action variant="primary" type="submit" disabled={isPending}>
                {isPending ? str.common.saving : str.common.save}
              </Action>
              <Action
                variant="secondary"
                type="button"
                disabled={isPending}
                onClick={() => {
                  setFormData(initialForm);
                  setAccountError(null);
                  setAccountSuccess(false);
                }}
              >
                {str.common.cancel}
              </Action>
            </div>
          </form>
        </Section>

        <Section label={str.account.units} meta={str.account.unitsMeta}>
          <div className="grid grid-cols-2 gap-2 pt-1" role="radiogroup" aria-label={str.account.units}>
            {(["kg", "lbs"] as const).map((unit) => {
              const active = profile.unit_system === unit;
              return (
                <button
                  key={unit}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isPending}
                  onClick={() => handleUnit(unit)}
                  className={`${segment} ${
                    active
                      ? "bg-[#baa3d0] text-[#141416]"
                      : "bg-[#141416] border border-white/[0.08] text-[#baa3d0]"
                  }`}
                >
                  {unit}
                </button>
              );
            })}
          </div>
        </Section>

        <Section label={str.account.notifications} meta={str.account.notificationsMeta}>
          <div className="space-y-2 pt-1">
            {(
              [
                ["notify_workout_reminders", str.account.workoutReminders],
                ["notify_rest_day_alerts", str.account.restTimerAlerts],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                aria-pressed={profile[key]}
                disabled={isPending}
                onClick={() => handleNotifyToggle(key, profile[key])}
                className={`${row} w-full min-h-11 px-5 py-3 flex items-center justify-between transition apple-press text-left`}
              >
                <span className={value}>{text}</span>
                <span className={toggleBadge(profile[key])}>
                  {profile[key] ? str.common.on : str.common.off}
                </span>
              </button>
            ))}
            {notifyError && <p className={`${errorText} px-1`} role="alert">{notifyError}</p>}
          </div>
        </Section>

        <Section label={str.account.activity}>
          <div className="space-y-2 pt-1">
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>{str.account.completedSessions}</span>
              <span className={bodyText}>{stats.totalWorkouts}</span>
            </div>
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>{str.account.savedPlans}</span>
              <span className={bodyText}>{stats.totalPlans}</span>
            </div>
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>{str.account.currentWeight}</span>
              <span className={bodyText}>{formatWeight(stats.latestWeight, profile.unit_system)}</span>
            </div>
            <div className={`${row} px-5 py-3 flex items-center justify-between`}>
              <span className={value}>{str.account.timezone}</span>
              <span className={`${bodyText} truncate`}>{profile.timezone}</span>
            </div>
          </div>
        </Section>

        <Section label={str.account.password} meta={str.account.passwordMeta}>
          <form onSubmit={handlePasswordSubmit} className="space-y-2 pt-1">
            <input type="text" autoComplete="username" value={profile.username} readOnly hidden />
            <label className={rowClass}>
              <span className={`${value} shrink-0`}>{str.account.currentPassword}</span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordError(null);
                }}
                className={`${inlineInput} flex-1 min-w-0 placeholder:text-white/30`}
              />
            </label>

            <label className={rowClass}>
              <span className={`${value} shrink-0`}>{str.account.newPassword}</span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                }}
                className={`${inlineInput} flex-1 min-w-0 placeholder:text-white/30`}
              />
            </label>

            {passwordError && <p className={`${errorText} px-1 pt-1`} role="alert">{passwordError}</p>}
            {passwordSuccess && <p className={successText}>{str.account.passwordChanged}</p>}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Action variant="primary" type="submit" disabled={isPending}>
                {isPending ? str.account.updatingPassword : str.account.updatePassword}
              </Action>
              <Action
                variant="secondary"
                type="button"
                disabled={isPending}
                onClick={() => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setPasswordError(null);
                  setPasswordSuccess(false);
                }}
              >
                {str.common.cancel}
              </Action>
            </div>
          </form>
        </Section>

        <Section label={str.account.dataManagement} meta={str.account.dataMeta}>
          <div className="pt-1 flex flex-col gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleResetHistory}
              className="w-full min-h-11 py-3.5 px-4 rounded-full font-bold bg-[#baa3d0] text-[#141416] transition apple-press disabled:opacity-50 text-center text-sm shadow-sm font-editorial tracking-wider uppercase leading-none"
            >
              {confirmReset ? str.account.resetHistoryConfirm : str.account.resetHistory}
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={handleLogout}
              className="w-full min-h-11 py-3.5 px-4 rounded-full font-semibold border border-white/[0.08] text-[#71717a] hover:text-white transition apple-press disabled:opacity-50 text-center text-sm font-editorial tracking-wider uppercase leading-none"
            >
              {str.account.signOut}
            </button>
          </div>
        </Section>
      </main>
    </div>
  );
}
