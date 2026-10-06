/**
 * What a session cookie turned out to be worth, and where to send its owner.
 *
 * This module exists because collapsing "no cookie" and "a cookie that resolves to nothing" into
 * one `null` bricked production (decision 143). `proxy.ts` sniffs the cookie's *presence* and
 * optimistically bounces `/connexion` → `/` for anybody holding one; the `(app)` layout guard
 * *resolves* it against the `sessions` table and bounced the unresolvable ones back to
 * `/connexion`. Two guards, two different questions, and for a cookie whose row had disappeared —
 * pruned, or a rebuilt database — their answers disagreed forever: 307 `/` → 307 `/connexion` →
 * 307 `/` … The cookie is `httpOnly`, so the browser could not drop it either, and every page
 * including the one with the logout button was behind the loop.
 *
 * The fix is to make the two guards answer the *same* question, by giving the authoritative one a
 * third outcome: a cookie that resolves to nothing is not anonymity, it is a cookie that must be
 * **deleted**. Deleting it is a cookie write, which a Server Component may not do — hence
 * `/deconnexion` (`app/deconnexion/route.ts`), a Route Handler that can. Once it has run, the
 * proxy's cheap presence check and the layout's expensive lookup agree again, because there is no
 * cookie left for them to disagree about.
 *
 * It is a leaf on purpose, like `cookies.ts`: types and one pure function, no database, no
 * `next/headers`, so the mapping below is unit-testable without mocking a request.
 */

/** The three things a request's session cookie can be. */
export type SessionState =
  /** No session cookie at all. A first-time visitor, or someone who has logged out. */
  | { status: "anonymous" }
  /**
   * A session cookie that identifies nobody: no matching row, an expired one, or a row pointing
   * at a user who no longer exists. Indistinguishable from `anonymous` to the proxy, and the
   * reason this type exists.
   */
  | { status: "stale" }
  /** A live session. */
  | { status: "active"; userId: string };

/** Query string that makes `/deconnexion` say why, so `/connexion` can tell the user. */
export const EXPIRED_REASON_PARAM = "raison";
export const EXPIRED_REASON_VALUE = "expiree";

/** Flag `/deconnexion` adds to `/connexion`, so the login screen can explain the logout. */
export const EXPIRED_FLAG_PARAM = "expiree";

/**
 * Where to send a request we could not identify.
 *
 * Never call this for an `active` state — that is a caller bug, and sending a signed-in user to
 * `/deconnexion` would log them out. `active` maps to `/deconnexion` rather than to `/connexion`
 * so that a future caller which gets this wrong fails loudly (logged out) instead of quietly
 * recreating the loop (`/connexion` with a live cookie is exactly what the proxy bounces).
 */
export function signedOutDestination(state: SessionState): string {
  if (state.status === "anonymous") return "/connexion";
  return `/deconnexion?${EXPIRED_REASON_PARAM}=${EXPIRED_REASON_VALUE}`;
}
