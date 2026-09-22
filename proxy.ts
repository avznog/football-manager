/**
 * Optimistic routing guard (Next 16: what used to be `middleware.ts`).
 *
 * This file only ever *reads a cookie*. It never queries the database and never decides
 * anything that matters — it runs on prefetches and on every navigation, and a forged cookie
 * would sail straight through it. The real guard is `requireTeamContext()` in the
 * `(app)` layout, backed by `can()` on every mutation (`docs/NEXTJS16.md` §6).
 *
 * Its only job is to save a round trip: send a visitor with no session token to the login
 * screen, and a visitor who has one away from it.
 */

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/cookies";

/** Reachable without a session. */
const PUBLIC_PATHS = ["/connexion", "/rejoindre"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSessionCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    // Remember where they were going, so login can land them there.
    if (pathname !== "/") url.searchParams.set("suivant", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // `/rejoindre` stays open to a signed-in player: that is how you join a second team, and
  // how a user with no team gets one at all.
  if (hasSessionCookie && pathname === "/connexion") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except Next's own assets and the files served from `public/`. Matching the
   * manifest or an icon would cost a redirect on every install prompt.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml).*)"],
};
