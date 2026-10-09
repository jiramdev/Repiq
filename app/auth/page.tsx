// app/auth/page.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { AuthForm } from "./auth-form";

/** Signed-in users with a *valid* session are sent home; stale cookies see the form. */
async function RedirectIfSignedIn() {
  const userId = await getSessionUserId();
  if (userId) redirect("/");
  return null;
}

export default function AuthPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <AuthForm />
    </>
  );
}
