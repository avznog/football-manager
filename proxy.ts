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
   * Everything except Next's own build output and any path that names a file.
   *
   * This used to enumerate the static files — `favicon.ico`, `icon.svg`, `manifest.webmanifest`
   * and friends — and the enumeration was a claim about the whole of `public/` that nobody
   * maintained: the three PWA icons `app/manifest.ts` points at were never in it, so every
   * `GET /icon-192.png` answered `307 /connexion?suivant=%2Ficon-192.png`, the browser followed
   * it, got HTML, and reported an invalid image. The install prompt had no icon from the first
   * day, in production too. Nothing caught it because a missing manifest icon breaks nothing a
   * test asserts on — the list failed silently, which is what lists that must be maintained do.
   *
   * So the exclusion is the *class* instead: a trailing file extension. Every route in this app
   * is a French word with no dot in it (`/calendrier`, `/match/1/jeu`), so excluding anything
   * ending in `.<ext>` loses nothing routable, and a fourth file dropped into `public/` is
   * served without this file having to be edited. `proxy.test.ts` asserts that by reading the
   * directory rather than naming its contents.
   */
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
