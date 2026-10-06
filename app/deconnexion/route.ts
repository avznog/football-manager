/**
 * `GET /deconnexion` — the only place that can *delete* a session cookie on the way out.
 *
 * ## Why this route exists at all
 *
 * There is already a logout: the `logout` Server Action behind the button on `/moi`. This route is
 * not for the user who wants to log out, it is for the user who **cannot reach that button**.
 *
 * A session cookie whose `sessions` row has disappeared — pruned, or a database rebuilt under a
 * browser that kept its cookie — used to brick the app completely (decision 143). `proxy.ts` asks
 * only « is there a cookie » and bounced such a visitor off `/connexion` towards `/`; the `(app)`
 * layout guard resolved the cookie properly, found nobody, and bounced them back to `/connexion`.
 * Neither guard could end it, because neither could delete the cookie: the proxy must not touch the
 * database, and a Server Component is forbidden from writing cookies at all. The cookie is
 * `httpOnly`, so the browser could not drop it either, and `/moi` — the logout button — is behind
 * the loop. The only escape was clearing cookies by hand in the browser's settings.
 *
 * A Route Handler is the missing piece: it *may* write cookies. So the guard's answer to « this
 * cookie identifies nobody » is now « go here », and here deletes it. After that the proxy's cheap
 * presence check and the layout's authoritative lookup agree again, because there is no cookie left
 * to disagree about — which is why the loop cannot re-form rather than merely being papered over.
 *
 * ## Why `GET`, and why that is acceptable
 *
 * It is reached by `redirect()` from a Server Component, which can only produce a `GET`. A
 * `POST`-only handler would therefore be unreachable from the one caller that needs it, and we
 * would be back to the brick.
 *
 * That makes it forgeable: a third-party page can embed `<img src=".../deconnexion">` and log a
 * visitor out. Stated plainly rather than left unexamined — logging somebody out is a **nuisance,
 * not a privilege escalation**: it grants the attacker nothing, reveals nothing, and is undone by
 * typing a password. Weighed against the alternative, which is an application a user cannot load at
 * all and cannot repair from inside the browser, the nuisance wins easily. (The `logout` action on
 * `/moi` keeps its Server-Action POST and its automatic CSRF protection; nothing about it changes.)
 *
 * Two consequences we accept knowingly: a link-prefetching browser or a mail scanner that follows
 * `GET`s could log the user out, and so could a stray prefetch. Nothing in the app ever links here —
 * the only way in is a server-side redirect, or typing the URL — so there is no `<Link>` for Next to
 * prefetch.
 */

import { NextResponse } from "next/server";

import {
  EXPIRED_FLAG_PARAM,
  EXPIRED_REASON_PARAM,
  EXPIRED_REASON_VALUE,
} from "@/lib/auth/session-state";
import { destroySession } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  /**
   * Idempotent on purpose: `destroySession` deletes the row only if there is a token, and clearing
   * an absent cookie is a no-op. So hitting this with no cookie at all — a bookmark, a second tab
   * that got here after the first one already cleaned up — just lands on the login screen.
   */
  await destroySession();

  /**
   * Only say « expired » when the guard said so. Someone who typed the URL is logging out
   * deliberately and would be puzzled to be told their session had expired.
   */
  const reason = new URL(request.url).searchParams.get(EXPIRED_REASON_PARAM);
  const expired = reason === EXPIRED_REASON_VALUE;

  /**
   * 303, not the 307 `redirect()` would produce: a 307 replays the method, which is harmless for a
   * `GET` today and wrong the moment anything posts here. 303 means « the answer is over there, go
   * and `GET` it », which is exactly what this is.
   *
   * `NextResponse.redirect` rather than `redirect()` for the same reason it has to be a `Response`
   * at all: the status is part of the contract here, and `redirect()` does not let us set it.
   */
  const target = new URL(expired ? `/connexion?${EXPIRED_FLAG_PARAM}=1` : "/connexion", request.url);
  return NextResponse.redirect(target, 303);
}
