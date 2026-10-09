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
  rond,
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
    unit_system: "kg" as "kg" | "lbs",
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
    <div className="min-h-screen bg-[#baa3d0] flex items-center justify-center p-4">
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
                : "Units"}
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
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, unit_system: "kg" })
                    }
                    className={`py-3 px-4 ${rond} border text-center font-semibold text-xs tracking-wider uppercase transition apple-press ${
                      formData.unit_system === "kg"
                        ? "bg-[#baa3d0] border-[#baa3d0] text-[#141416]"
                        : "bg-[#141416] border-white/[0.08] text-white"
                    }`}
                  >
                    Metric (kg)
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, unit_system: "lbs" })
                    }
                    className={`py-3 px-4 ${rond} border text-center font-semibold text-xs tracking-wider uppercase transition apple-press ${
                      formData.unit_system === "lbs"
                        ? "bg-[#baa3d0] border-[#baa3d0] text-[#141416]"
                        : "bg-[#141416] border-white/[0.08] text-white"
                    }`}
                  >
                    Imperial (lbs)
                  </button>
                </div>
              )}

              {errorMessage && <p className={errorText}>{errorMessage}</p>}

              <div
                className={`pt-1 ${step > 1 ? "grid grid-cols-2 gap-2" : ""}`}
              >
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
                        setErrorMessage(
                          "Please enter both email and password."
                        );
                        return;
                      }
                      if (step === 2 && (!formData.name || !formData.username)) {
                        setErrorMessage(
                          "Please enter your name and username."
                        );
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