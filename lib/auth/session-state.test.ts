/**
 * The one decision that was missing when the app bricked itself (decision 143).
 *
 * The redirect loop was not a bug in a query or in a guard: both guards were individually right.
 * It was that the authoritative one had **only two answers to give** — signed in, or go to
 * `/connexion` — while the cheap one could tell a third state apart from neither of them. So the
 * assertions below are about exactly that third state, and the one that matters is the second: a
 * cookie that resolves to nothing must *not* be sent to `/connexion`, because that is the leg of
 * the loop the proxy closes.
 */

import { describe, expect, it } from "vitest";

import { EXPIRED_REASON_PARAM, EXPIRED_REASON_VALUE, signedOutDestination } from "./session-state";

describe("signedOutDestination", () => {
  it("sends a visitor with no cookie to the login screen", () => {
    expect(signedOutDestination({ status: "anonymous" })).toBe("/connexion");
  });

  it("sends a cookie that resolves to nothing to the route that deletes it, never to /connexion", () => {
    const destination = signedOutDestination({ status: "stale" });

    expect(destination.startsWith("/deconnexion")).toBe(true);
    // The whole bug, in one assertion: `/connexion` with a session cookie is what `proxy.ts`
    // bounces back to `/`, and `/` is what sent us here.
    expect(destination.startsWith("/connexion")).toBe(false);
  });

  it("tells /deconnexion that the logout was not asked for, so /connexion can say why", () => {
    expect(signedOutDestination({ status: "stale" })).toContain(
      `${EXPIRED_REASON_PARAM}=${EXPIRED_REASON_VALUE}`,
    );
  });

  it("clears the cookie of a live session with no user behind it rather than trusting it", () => {
    // A `users` row deleted under a live `sessions` row: there is no actor, so some guard will
    // redirect, and the cookie is as unusable as a pruned one. Falling back to `/connexion` here
    // would re-open the loop for that case alone.
    expect(signedOutDestination({ status: "active", userId: "u-1" })).toBe(
      signedOutDestination({ status: "stale" }),
    );
  });
});
