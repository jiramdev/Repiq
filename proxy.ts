// proxy.ts (Next 16 renamed middleware.ts to proxy.ts; it runs on Node.js)
//
// For page requests this validates the session against the database (one
// query) and enforces the workout lock-in: while a workout is active, every
// page redirects to it. It also slides the session expiry forward once a day.
//
// It is a first gate only. Pages, Server Actions and API routes check the
// session (and the lock) themselves, so if this lookup ever fails we let the
// request through rather than lock users out.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  looksLikeSessionToken,
} from "@/lib/session-token";
import { lookupSession, renewSession, shouldRenew } from "@/lib/session-lookup";

/** API routes that authenticate in another way (signed QStash callbacks). */
const PUBLIC_API_PATHS = ["/api/push/deliver"];

function isAuthPath(pathname: string) {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

function redirectTo(request: NextRequest, path: string, clearCookie = false) {
  const res = NextResponse.redirect(new URL(path, request.url));
  if (clearCookie) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (pathname.startsWith("/api")) {
    if (PUBLIC_API_PATHS.includes(pathname) || token) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const onAuthPage = isAuthPath(pathname);

  if (!looksLikeSessionToken(token)) {
    if (onAuthPage) return NextResponse.next();
    return redirectTo(request, "/auth", Boolean(token));
  }

  // Server Actions are POSTs to the page they live on; they check the session
  // and the workout lock themselves and must not be redirected.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  let session: Awaited<ReturnType<typeof lookupSession>>;
  try {
    session = await lookupSession(token);
  } catch (err) {
    console.error("proxy session lookup failed:", err);
    return NextResponse.next();
  }

  if (!session) {
    // Expired or revoked: drop the cookie and sign in again.
    if (onAuthPage) {
      const res = NextResponse.next();
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    return redirectTo(request, "/auth", true);
  }

  const workoutPath = session.active ? `/workout/${session.active.workoutId}` : null;
  let res: NextResponse;
  if (workoutPath && pathname !== workoutPath) {
    res = redirectTo(request, workoutPath);
  } else if (onAuthPage) {
    res = redirectTo(request, workoutPath ?? "/");
  } else {
    res = NextResponse.next();
  }

  if (shouldRenew(session.expiresAt)) {
    try {
      await renewSession(token);
      res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    } catch (err) {
      console.error("session renewal failed:", err);
    }
  }
  return res;
}

export const config = {
  // Skip Next internals and any file with an extension (icons, manifest, sw.js, offline.html).
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
