// app/auth/auth-form.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Action,
  input,
  label,
  display,
  s,
  error as errorText,
  row,
  value,
  hint,
  toggleBadge,
} from "@/components/ui";
import { str } from "@/lib/strings";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { loginUser, registerAndOnboard, checkUsernameAvailable } from "./actions";
import { clearPageCaches } from "@/components/pwa";

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function AuthForm() {
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<"login" | "onboarding">("login");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    age: 24,
    notify_workout_reminders: false,
    notify_rest_day_alerts: false,
  });

  // Whoever signs in next must never see the previous user's cached pages.
  useEffect(() => {
    void clearPageCaches();
  }, []);

  const goHome = () => {
    // Full navigation so the service worker and server components start fresh
    // with the new session cookie.
    window.location.replace("/");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await loginUser({
          identifier: formData.email,
          password: formData.password,
          timeZone: browserTimeZone(),
        });
        if (!res.success) {
          setErrorMessage(res.error || str.auth.loginFailed);
          return;
        }
        goHome();
      } catch {
        setErrorMessage(str.auth.loginFailed);
      }
    });
  };

  const handleUsernameBlur = async () => {
    if (!formData.username.trim()) return;
    try {
      const res = await checkUsernameAvailable(formData.username);
      setErrorMessage(res.available ? null : res.error || str.auth.usernameTaken);
    } catch {
      setErrorMessage(str.auth.usernameCheckFailed);
    }
  };

  const handleToggleNotification = async (
    field: "notify_workout_reminders" | "notify_rest_day_alerts"
  ) => {
    const nextVal = !formData[field];
    if (nextVal && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => "default");
    }
    setFormData((prev) => ({ ...prev, [field]: nextVal }));
  };

  const handleContinue = () => {
    setErrorMessage(null);

    if (step === 1) {
      if (!formData.email || !formData.password) {
        setErrorMessage(str.auth.enterEmailAndPassword);
        return;
      }
      if (formData.password.trim().length < MIN_PASSWORD_LENGTH) {
        setErrorMessage(str.auth.passwordPlaceholder(MIN_PASSWORD_LENGTH));
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!formData.name || !formData.username) {
        setErrorMessage(str.auth.enterNameAndUsername);
        return;
      }
      startTransition(async () => {
        try {
          const check = await checkUsernameAvailable(formData.username);
          if (!check.available) {
            setErrorMessage(check.error || str.auth.usernameTaken);
            return;
          }
          setStep(3);
        } catch {
          setErrorMessage(str.auth.usernameCheckFailed);
        }
      });
    }
  };

  const handleFinishOnboarding = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await registerAndOnboard({ ...formData, timeZone: browserTimeZone() });
        if (!res.success) {
          setErrorMessage(res.error || str.auth.registrationFailed);
          return;
        }
        goHome();
      } catch {
        setErrorMessage(str.auth.registrationFailed);
      }
    });
  };

  const title =
    mode === "login"
      ? str.auth.signIn
      : step === 1
        ? str.auth.createAccount
        : step === 2
          ? str.auth.athleteProfile
          : str.auth.notifications;

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-[#baa3d0] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm space-y-3">
        <div className={`bg-[#141416] text-white rounded-3xl p-6 shadow-2xl border border-white/[0.08] ${s.stack}`}>
          <div className="flex items-center justify-between">
            <h1 className={`${display} text-2xl text-white`}>{title}</h1>
            {mode === "onboarding" && (
              <span className="text-xs text-[#71717a] font-medium">{str.auth.step(step, 3)}</span>
            )}
          </div>

          {mode === "login" && (
            <form onSubmit={handleLogin} className={s.stack}>
              <div className={s.stack}>
                <label className={`block ${s.tight}`}>
                  <span className={label}>{str.auth.usernameOrEmail}</span>
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    placeholder={str.auth.usernameOrEmailPlaceholder}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={input}
                  />
                </label>

                <label className={`block ${s.tight}`}>
                  <span className={label}>{str.auth.password}</span>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={input}
                  />
                </label>
              </div>

              {errorMessage && <p className={errorText} role="alert">{errorMessage}</p>}

              <div className="pt-1">
                <Action variant="primary" type="submit" disabled={isPending}>
                  {isPending ? str.auth.signingIn : str.auth.signIn}
                </Action>
              </div>
            </form>
          )}

          {mode === "onboarding" && (
            <div className={s.stack}>
              {step === 1 && (
                <div className={s.stack}>
                  <label className={`block ${s.tight}`}>
                    <span className={label}>{str.auth.email}</span>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      autoCapitalize="none"
                      placeholder={str.auth.emailPlaceholder}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={input}
                    />
                  </label>

                  <label className={`block ${s.tight}`}>
                    <span className={label}>{str.auth.password}</span>
                    <input
                      type="password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      placeholder={str.auth.passwordPlaceholder(MIN_PASSWORD_LENGTH)}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className={input}
                    />
                  </label>
                </div>
              )}

              {step === 2 && (
                <div className={s.stack}>
                  <label className={`block ${s.tight}`}>
                    <span className={label}>{str.auth.fullName}</span>
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      placeholder={str.auth.fullNamePlaceholder}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={input}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3.5">
                    <label className={`block ${s.tight}`}>
                      <span className={label}>{str.auth.username}</span>
                      <input
                        type="text"
                        required
                        autoCapitalize="none"
                        autoComplete="username"
                        placeholder={str.auth.usernamePlaceholder}
                        value={formData.username}
                        onBlur={handleUsernameBlur}
                        onChange={(e) => {
                          setFormData({ ...formData, username: e.target.value });
                          if (errorMessage) setErrorMessage(null);
                        }}
                        className={input}
                      />
                    </label>
                    <label className={`block ${s.tight}`}>
                      <span className={label}>{str.auth.age}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={13}
                        max={120}
                        value={formData.age}
                        onChange={(e) =>
                          setFormData({ ...formData, age: parseInt(e.target.value, 10) || 0 })
                        }
                        className={input}
                      />
                    </label>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    aria-pressed={formData.notify_workout_reminders}
                    onClick={() => handleToggleNotification("notify_workout_reminders")}
                    className={`${row} w-full min-h-11 px-4 py-3 flex items-center justify-between transition apple-press text-left`}
                  >
                    <div className="flex flex-col pr-2">
                      <span className={value}>{str.auth.workoutReminders}</span>
                      <span className={hint}>{str.auth.workoutRemindersHint}</span>
                    </div>
                    <span className={toggleBadge(formData.notify_workout_reminders)}>
                      {formData.notify_workout_reminders ? str.common.on : str.common.off}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={formData.notify_rest_day_alerts}
                    onClick={() => handleToggleNotification("notify_rest_day_alerts")}
                    className={`${row} w-full min-h-11 px-4 py-3 flex items-center justify-between transition apple-press text-left`}
                  >
                    <div className="flex flex-col pr-2">
                      <span className={value}>{str.auth.restTimerAlerts}</span>
                      <span className={hint}>{str.auth.restTimerAlertsHint}</span>
                    </div>
                    <span className={toggleBadge(formData.notify_rest_day_alerts)}>
                      {formData.notify_rest_day_alerts ? str.common.on : str.common.off}
                    </span>
                  </button>
                </div>
              )}

              {errorMessage && <p className={errorText} role="alert">{errorMessage}</p>}

              <div className={`pt-1 ${step > 1 ? "grid grid-cols-2 gap-2" : ""}`}>
                {step > 1 && (
                  <Action
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setStep((prev) => (prev - 1) as 1 | 2);
                    }}
                  >
                    {str.common.back}
                  </Action>
                )}

                {step < 3 ? (
                  <Action variant="primary" type="button" disabled={isPending} onClick={handleContinue}>
                    {isPending && step === 2 ? str.auth.checking : str.common.continue}
                  </Action>
                ) : (
                  <Action variant="primary" type="button" disabled={isPending} onClick={handleFinishOnboarding}>
                    {isPending ? str.auth.creating : str.auth.finish}
                  </Action>
                )}
              </div>
            </div>
          )}
        </div>

        {mode === "login" ? (
          <Action
            variant="secondary"
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setMode("onboarding");
              setStep(1);
            }}
          >
            {str.auth.createAccount}
          </Action>
        ) : step === 1 ? (
          <Action
            variant="secondary"
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setMode("login");
            }}
          >
            {str.auth.backToSignIn}
          </Action>
        ) : null}
      </div>
    </div>
  );
}
