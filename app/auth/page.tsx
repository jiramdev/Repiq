// app/auth/page.tsx
"use client";

import { useState, useTransition } from "react";
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
} from "@/components/ui";
import { loginUser, registerAndOnboard } from "./actions";

export default function AuthPage() {
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<"login" | "onboarding">("login");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    age: 24,
    notify_workout_reminders: true,
    notify_rest_day_alerts: true,
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    startTransition(async () => {
      const res = await loginUser({
        identifier: formData.email,
        password: formData.password,
      });

      if (!res.success && res.error) {
        setErrorMessage(res.error);
        return;
      }

      window.location.href = "/";
    });
  };

  const handleToggleNotification = async (
    field: "notify_workout_reminders" | "notify_rest_day_alerts"
  ) => {
    const nextVal = !formData[field];

    if (nextVal && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
    }

    setFormData((prev) => ({ ...prev, [field]: nextVal }));
  };

  const handleFinishOnboarding = () => {
    setErrorMessage(null);

    startTransition(async () => {
      const res = await registerAndOnboard(formData);

      if (!res.success && res.error) {
        setErrorMessage(res.error);
        return;
      }

      window.location.href = "/";
    });
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-[#baa3d0] flex items-center justify-center p-4 overflow-hidden -mb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
      <div className="w-full max-w-sm space-y-3">
        {/* Main Card Block */}
        <div className={`bg-[#141416] text-white rounded-3xl p-6 shadow-2xl border border-white/[0.08] ${s.stack}`}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className={`${display} text-2xl text-white`}>
              {mode === "login"
                ? "Sign In"
                : step === 1
                ? "Create Account"
                : step === 2
                ? "Athlete Profile"
                : "Notifications"}
            </h1>
            {mode === "onboarding" && (
              <span className="text-xs text-[#71717a] font-medium">
                Step {step} of 3
              </span>
            )}
          </div>

          {/* SIGN IN FORM */}
          {mode === "login" && (
            <form onSubmit={handleLogin} className={s.stack}>
              <div className={s.stack}>
                <div className={s.tight}>
                  <span className={label}>Username or Email</span>
                  <input
                    type="text"
                    required
                    placeholder="athlete or athlete@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className={input}
                  />
                </div>

                <div className={s.tight}>
                  <span className={label}>Password</span>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className={input}
                  />
                </div>
              </div>

              {errorMessage && <p className={errorText}>{errorMessage}</p>}

              <div className="pt-1">
                <Action variant="primary" type="submit" disabled={isPending}>
                  {isPending ? "Signing in..." : "Sign In"}
                </Action>
              </div>
            </form>
          )}

          {/* ONBOARDING FLOW */}
          {mode === "onboarding" && (
            <div className={s.stack}>
              {step === 1 && (
                <div className={s.stack}>
                  <div className={s.tight}>
                    <span className={label}>Email</span>
                    <input
                      type="email"
                      required
                      placeholder="athlete@example.com"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className={input}
                    />
                  </div>

                  <div className={s.tight}>
                    <span className={label}>Password</span>
                    <input
                      type="password"
                      required
                      placeholder="At least 6 characters"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className={input}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className={s.stack}>
                  <div className={s.tight}>
                    <span className={label}>Full Name</span>
                    <input
                      type="text"
                      required
                      placeholder="Alex Miller"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className={input}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className={s.tight}>
                      <span className={label}>Username</span>
                      <input
                        type="text"
                        required
                        placeholder="alexm"
                        value={formData.username}
                        onChange={(e) =>
                          setFormData({ ...formData, username: e.target.value })
                        }
                        className={input}
                      />
                    </div>
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
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-2 pt-1">
                  {/* Workout Reminders Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleNotification("notify_workout_reminders")}
                    className={`${row} w-full px-4 py-3 flex items-center justify-between transition apple-press text-left`}
                  >
                    <div className="flex flex-col pr-2">
                      <span className={value}>Workout Reminders</span>
                      <span className={hint}>Morning notification for daily plan</span>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        formData.notify_workout_reminders
                          ? "bg-[#baa3d0] text-[#141416]"
                          : "bg-white/[0.08] text-white/50"
                      }`}
                    >
                      {formData.notify_workout_reminders ? "ON" : "OFF"}
                    </span>
                  </button>

                  {/* Rest Timer Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleNotification("notify_rest_day_alerts")}
                    className={`${row} w-full px-4 py-3 flex items-center justify-between transition apple-press text-left`}
                  >
                    <div className="flex flex-col pr-2">
                      <span className={value}>Rest Timer Alerts</span>
                      <span className={hint}>Notification when rest period ends</span>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        formData.notify_rest_day_alerts
                          ? "bg-[#baa3d0] text-[#141416]"
                          : "bg-white/[0.08] text-white/50"
                      }`}
                    >
                      {formData.notify_rest_day_alerts ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
              )}

              {errorMessage && <p className={errorText}>{errorMessage}</p>}

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
                    Back
                  </Action>
                )}

                {step < 3 ? (
                  <Action
                    variant="primary"
                    type="button"
                    onClick={() => {
                      if (step === 1 && (!formData.email || !formData.password)) {
                        setErrorMessage("Please enter both email and password.");
                        return;
                      }
                      if (step === 2 && (!formData.name || !formData.username)) {
                        setErrorMessage("Please enter your name and username.");
                        return;
                      }
                      setErrorMessage(null);
                      setStep((prev) => (prev + 1) as 2 | 3);
                    }}
                  >
                    Continue
                  </Action>
                ) : (
                  <Action
                    variant="primary"
                    type="button"
                    disabled={isPending}
                    onClick={handleFinishOnboarding}
                  >
                    {isPending ? "Creating..." : "Finish & Start"}
                  </Action>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Separate Switch Button Under the Card */}
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
            Create Account
          </Action>
        ) : (
          <Action
            variant="secondary"
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setMode("login");
            }}
          >
            Back to Sign In
          </Action>
        )}
      </div>
    </div>
  );
}