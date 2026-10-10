// app/workout/[id]/error.tsx
"use client";

// If the workout screen itself fails to render (a server error, a missing
// migration), the lock-in would send every page back here. So this screen
// always offers a way out: Finish and Discard go through plain POST routes
// that only touch the session tables.
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header, Action, card, hint, error as errorText, s } from "@/components/ui";
import { str } from "@/lib/strings";
import { setActiveWorkoutMarker } from "@/lib/client/active-workout-marker";

export default function WorkoutError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const leave = async (kind: "finish" | "discard") => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/workout/${encodeURIComponent(id)}/${kind}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.ok) {
        setActiveWorkoutMarker(null);
        window.location.replace("/");
        return;
      }
    } catch {
      // offline
    }
    setFailed(true);
    setBusy(false);
  };

  return (
    <div className="min-h-[100dvh] p-4 max-w-sm mx-auto select-none">
      <main className={`w-full ${s.stack}`}>
        <Header title={str.workout.title} />
        <section className={`${card} ${s.tight}`}>
          <p className={hint}>{str.workout.leaveError}</p>
          {failed && (
            <p className={errorText} role="alert">
              {str.workout.actionFailed}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Action
              variant="secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                reset();
                router.refresh();
              }}
            >
              {str.workout.tryAgain}
            </Action>
            <Action variant="primary" type="button" disabled={busy} onClick={() => void leave("finish")}>
              {str.workout.finish}
            </Action>
          </div>
          {confirmDiscard ? (
            <div className={s.tight}>
              <p className={hint}>{str.workout.discardQuestion}</p>
              <div className="grid grid-cols-2 gap-2">
                <Action variant="secondary" type="button" onClick={() => setConfirmDiscard(false)}>
                  {str.common.cancel}
                </Action>
                <Action variant="primary" type="button" disabled={busy} onClick={() => void leave("discard")}>
                  {str.workout.discardConfirm}
                </Action>
              </div>
            </div>
          ) : (
            <Action variant="secondary" type="button" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              {str.workout.discardTitle}
            </Action>
          )}
        </section>
      </main>
    </div>
  );
}
