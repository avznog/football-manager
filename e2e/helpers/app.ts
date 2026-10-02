/**
 * The few things every spec does, and would otherwise get subtly wrong.
 *
 * Two rules the helpers below exist to keep:
 *
 * - **Log in through the login screen.** No forged session cookie, no seeded `sessions` row: the
 *   point of an end-to-end test is that the password verifies, the cookie is set the way the app
 *   sets it, and the redirect lands where a human lands.
 * - **Select on what a French-speaking user can see.** ARIA roles and visible French text, never a
 *   CSS class and never a `data-testid` — a test that only passes because of a test id proves that
 *   the test id is still there, not that the app still works.
 */

import { expect, type Locator, type Page } from "@playwright/test";

export const MS_PER_MINUTE = 60_000;

/* -------------------------------------------------------------------------- */
/* Session                                                                    */
/* -------------------------------------------------------------------------- */

export async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Nom d’utilisateur").fill(username);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  // `/` redirects to the calendar: landing there is the proof the session was created.
  await expect(page.getByRole("heading", { level: 1, name: "Calendrier" })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.goto("/moi");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
}

/* -------------------------------------------------------------------------- */
/* Controls the app builds out of screen-reader-only radios                    */
/* -------------------------------------------------------------------------- */

/**
 * `SegmentedControl` hides its radios (`sr-only`) and dresses the `<label>` up as the button. A 1×1
 * clipped input is not what a user taps, so neither do we: the label carries the `for`, and the ids
 * are derived from the field name — `status-yes`, `role:<membershipId>-starter`.
 *
 * It no longer reaches the ratings. Notation used to be an eleven-radio pad per teammate and is one
 * slider each now (decision 137): a range has no label to tap in its place, so it is driven by its
 * accessible name and `fill` (`rateEveryone` in `happy-path.spec.ts`).
 */
export function segment(scope: Page | Locator, inputId: string): Locator {
  return scope.locator(`label[for="${cssAttrValue(inputId)}"]`);
}

/** Escapes a `"` in an attribute-selector value. Ids here are ids and uuids, but be exact. */
function cssAttrValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

/* -------------------------------------------------------------------------- */
/* Pitches                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A pitch, addressed by the accessible name of its graphic.
 *
 * `Pitch` renders `<div><svg role="img" aria-label="…"/>{markers}</div>`, so the label is on a
 * *sibling* of the discs — hence the `:has(> svg[…])` on the wrapper. This matters: game mode shows
 * the real pitch (« Joueurs sur le terrain ») and, right above it, the proposed one
 * (« … (proposition) »). Asserting on the wrong one is how a test would "prove" that a composition
 * was applied when in fact it was only proposed.
 */
export function pitch(page: Page, pitchLabel: string): Locator {
  return page.locator(`div:has(> svg[aria-label="${cssAttrValue(pitchLabel)}"])`);
}

/** The accessible name `PlayerDisc` gives a healthy player standing in a slot. */
export function discName(name: string, jerseyNumber: number, positionFr: string): string {
  return `${name}, numéro ${jerseyNumber}, ${positionFr}`;
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `YYYY-MM-DD` for a date **as Paris sees it**, which is what `<input type="datetime-local">`
 * expects and what the server reads it back as (`lib/calendar/time.ts`).
 */
export function parisDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  // fr-CA gives ISO-ordered `2026-09-22`.
  return parts;
}
