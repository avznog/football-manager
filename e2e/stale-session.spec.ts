/**
 * A session cookie that identifies nobody must not brick the app (decision 143).
 *
 * ## The bug this pins
 *
 * `proxy.ts` asks « is there a session cookie » and never touches the database; the `(app)` layout
 * guard resolves the cookie against the `sessions` table. For a cookie whose row has gone — pruned,
 * or a database rebuilt under a browser that kept its cookie — the two disagreed permanently:
 * `GET /` → 307 `/connexion` (the guard found nobody) → 307 `/` (the proxy saw a cookie) → forever.
 * The cookie is `httpOnly`, so nothing in the page could clear it, and `/moi` — the only logout
 * button — sat behind the loop. Reproduced against production with nothing more than
 * `curl -H 'Cookie: fm_session=x'`.
 *
 * ## Why this spec, and not only a unit test
 *
 * `lib/auth/session-state.test.ts` asserts the decision — a stale cookie routes to the clearing
 * path — and that is the logic. What it cannot assert is the thing that actually failed: that the
 * **browser**, following real `Set-Cookie` and real 30x responses through a proxy, a Route Handler
 * and a layout guard, *stops*. A loop is a property of the whole chain, and only a browser walks
 * the whole chain. That is why the assertions below are about arriving somewhere, and about the
 * number of hops it took.
 *
 * ## The forged cookie
 *
 * `e2e/helpers/app.ts` says specs log in through the login screen and never forge a session, and it
 * is right — for every other spec. Here the forgery *is* the subject: the state under test is a
 * cookie with no row behind it, and the honest way to produce it would be to log in and then delete
 * the row out from under the browser, which needs a second database connection to say exactly what
 * garbage already says. Garbage also covers the attacker's version of the same request for free.
 *
 * No fixture team and no login: this needs no data at all, only a cookie. So it touches nothing the
 * other specs own (decision 044) and drives `localhost` (decision 043).
 */

import { expect, test } from "@playwright/test";

/** Must match `SESSION_COOKIE` in `lib/auth/cookies.ts`. */
const SESSION_COOKIE = "fm_session";

/**
 * Four hops is already more than the fix needs — `/` → `/deconnexion` → `/connexion` is two — and
 * far fewer than a loop, which only ends when the browser gives up at twenty. The slack is for a
 * `/` → `/calendrier` style redirect being added later; the point of the bound is to fail loudly if
 * the chain ever becomes unbounded again, not to pin the exact itinerary.
 */
const MAX_REDIRECTS = 4;

test("une session fantôme ne boucle pas : elle ramène à la connexion, déconnecté", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      // Not a valid token, and not the SHA-256 of anything in `sessions`.
      value: "e2e-session-fantome",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  /** Every navigation the browser made, in order, so a loop shows up as a repeat. */
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });

  await test.step("the app does not loop: it lands on the login screen", async () => {
    // `waitUntil: "commit"` rather than the default: if the loop ever came back, waiting for a
    // loaded document would time out at 60 s with a useless message, where this fails on the
    // assertions below with the itinerary in hand.
    await page.goto("/", { waitUntil: "commit" });

    await expect(page).toHaveURL(/\/connexion/);
    // The form, not just the URL: a 200 that rendered an error boundary would also be « /connexion ».
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  await test.step("it took a bounded number of hops", () => {
    expect(visited.length, `itinéraire : ${visited.join(" → ")}`).toBeLessThanOrEqual(
      MAX_REDIRECTS,
    );
  });

  await test.step("the user is told why, in French and tutoyé", async () => {
    // A silent logout reads as the app having forgotten them.
    await expect(page.getByText("Ta session a expiré, reconnecte-toi.")).toBeVisible();
  });

  await test.step("the dead cookie is actually gone, so the next navigation is clean", async () => {
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();

    // And the proof that it is gone is that `/connexion` now *stays* put: with the cookie still
    // there, the proxy would bounce this back to `/` and the loop would simply resume one click
    // later.
    await page.goto("/connexion");
    await expect(page).toHaveURL(/\/connexion$/);
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });
});
