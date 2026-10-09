// proxy.ts (Next 16 renamed middleware.ts to proxy.ts)
//
// A fast first gate only: it checks that a session cookie is present. The
// cookie is validated against the sessions table in lib/auth.ts by every page,
// server action and API route, so a forged cookie gets nowhere.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-token";

/** API routes that authenticate in another way (signed QStash callbacks). */
const PUBLIC_API_PATHS = ["/api/push/deliver"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api")) {
    if (PUBLIC_API_PATHS.includes(pathname) || hasSession) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The sign-in page decides itself whether to bounce signed-in users, because
  // only it can tell a valid session from a stale cookie (avoids redirect loops).
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and any file with an extension (icons, manifest, sw.js, offline.html).
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
