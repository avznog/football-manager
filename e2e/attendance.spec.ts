/**
 * **The four taps that used to delete a pointage** — `D1` of the UX audit of 2026-10-01.
 *
 * The sequence is short, it is the one a coach makes every Tuesday, and before this spec existed
 * nothing in the suite walked it:
 *
 *   « Tout le monde est là » → flip the two who are missing → « Enregistrer les présences »
 *
 * On the old screen that left **two** rows in `training_attendance` instead of eight. The marking
 * list was a Server Component with two *separate* forms and uncontrolled radios: the shortcut
 * submitted its own little form, the action wrote eight rows and revalidated, the card re-rendered
 * saying « 8 présents sur 8 pointés » — and the eight radios below it still read « — », because
 * React re-renders onto the same keys and does not reset an uncontrolled input, and the only form it
 * resets on submit is the one that was submitted. So the next save posted `unset` for the six the
 * coach had never touched and the action deleted their rows, unable to tell « the coach cleared
 * this » from « the DOM is stale ».
 *
 * ## What makes this test able to catch it, where the rest of the suite could not
 *
 * 1. **It asserts on the radios, not only on the card.** The card was *right* at step 2; the whole
 *    defect lived in the disagreement between the card and the radios underneath it. A test that
 *    read the sentence alone would have passed throughout.
 * 2. **It reloads before the final count.** Everything on screen after a save could be client state
 *    telling itself a story, so the last word is a fresh page: what the server sends back is what is
 *    in the table.
 * 3. **It needs a session that has already begun.** Attendance opens thirty minutes before the
 *    séance and never closes again (`attendanceIsOpen`, decision 099), so the training is created
 *    ten minutes in the past — which is also the only honest version of this scenario, because a
 *    coach counting heads is standing in front of the people he is counting.
 *
 * `D1` was a **JavaScript-only** failure, which is the last reason this belongs in Playwright and
 * not in a unit test: with JS off the shortcut is a full page POST and the DOM is rebuilt from the
 * server, so the stale radios never happen. The suite drives `localhost` precisely so that the page
 * really hydrates (decision 043) — against `127.0.0.1` this spec would quietly test the fallback and
 * prove nothing.
 *
 * The arithmetic of the same four steps is a unit test, over the pure helpers the screen now holds
 * its marks in: `lib/training/attendance.test.ts`.
 */

import { expect, test, type Page } from "@playwright/test";

import { provisionFixture } from "./fixtures/provision";
import type { Fixture } from "./fixtures/types";
import { MS_PER_MINUTE, login, parisDateTime, segment } from "./helpers/app";

/** The two the coach flips after the shortcut — chosen by jersey, so the names stay readable. */
const MISSING = ["Basile Moreau", "Nathan Perrin"];

test("le pointage ne perd rien : tout le monde est là, deux absents, enregistrer", async ({
  page,
}) => {
  const fixture = provisionFixture();
  await login(page, fixture.coach.username, fixture.password);

  const trainingUrl = await createTrainingTenMinutesAgo(page);

  // ---- 1. nothing pointed yet.
  await expect(presences(page).getByText("Personne n’est encore pointé.")).toBeVisible();
  for (const player of fixture.players) {
    await expect(markOf(page, player.displayName, "Non pointé")).toBeChecked();
  }

  // ---- 2. « Tout le monde est là »: the card and the eight radios must say the same thing.
  await presences(page).getByRole("button", { name: "Tout le monde est là" }).click();
  await expect(presences(page).getByText("8 présents sur 8 pointés.")).toBeVisible();
  // The assertion the old screen failed, and the only one that could have caught it: the sentence
  // above was already right while every one of these still read « — ».
  for (const player of fixture.players) {
    await expect(markOf(page, player.displayName, "Présent")).toBeChecked();
  }

  // ---- 3. the two who are missing.
  for (const name of MISSING) {
    await segment(page, `presence:${membershipOf(fixture, name)}-absent`).click();
  }
  await expect(presences(page).getByText("6 présents sur 8 pointés.")).toBeVisible();
  // Said out loud, because the figures above are now ahead of the database.
  await expect(
    presences(page).getByText("2 présences modifiées, pas encore enregistrées."),
  ).toBeVisible();

  // ---- 4. « Enregistrer les présences ».
  await presences(page).getByRole("button", { name: "Enregistrer les présences" }).click();
  await expect(
    presences(page).getByText("présences modifiées, pas encore enregistrées."),
  ).toHaveCount(0);

  // The old code ended here at « 0 présent sur 2 pointés »: six rows had just been deleted.
  await expect(presences(page).getByText("6 présents sur 8 pointés.")).toBeVisible();

  // ---- And the last word to the server, not to this page's state.
  await page.goto(trainingUrl);
  await expect(presences(page).getByText("6 présents sur 8 pointés.")).toBeVisible();
  for (const player of fixture.players) {
    const expected = MISSING.includes(player.displayName) ? "Absent" : "Présent";
    await expect(markOf(page, player.displayName, expected)).toBeChecked();
  }
});

/**
 * **A save that does not land must not take the screen** — `D4`(a) of the same audit.
 *
 * The other way this screen lost a pointage, and the likelier one on a touchline: the action threw,
 * nothing caught it, so the error boundary replaced the whole page — thirteen marks included — and
 * offered a « Réessayer » that re-renders a segment rather than resubmitting anything. The coach's
 * only way back was to count the heads again.
 *
 * Driven by aborting the POST rather than by `context.setOffline`, because that is the failure with
 * a sharp edge: the request leaves and dies, which is what a dropped connection mid-submit looks
 * like, and it exercises the `catch` instead of a browser-level offline path.
 */
test("un enregistrement qui échoue garde les présences à l’écran", async ({ page }) => {
  const fixture = provisionFixture();
  await login(page, fixture.coach.username, fixture.password);
  await createTrainingTenMinutesAgo(page);

  await presences(page).getByRole("button", { name: "Tout le monde est là" }).click();
  await expect(presences(page).getByText("8 présents sur 8 pointés.")).toBeVisible();

  const absent = membershipOf(fixture, MISSING[0]);
  await segment(page, `presence:${absent}-absent`).click();

  await page.route("**/entrainements/**", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await presences(page).getByRole("button", { name: "Enregistrer les présences" }).click();

  // Scoped to the card: Next's route announcer is a `role="alert"` of its own, and a bare
  // `getByRole("alert")` matches both.
  await expect(presences(page).locator("p[role=alert]")).toHaveText(
    "Les présences n’ont pas été enregistrées. Tes réponses sont toujours là : réessaie.",
  );

  // The sentence is only true if this is: every mark the coach made is still on screen, so the
  // retry is one tap and not eight.
  await expect(markOf(page, MISSING[0], "Absent")).toBeChecked();
  for (const player of fixture.players) {
    if (player.displayName === MISSING[0]) continue;
    await expect(markOf(page, player.displayName, "Présent")).toBeChecked();
  }
  await expect(
    presences(page).getByText("1 présence modifiée, pas encore enregistrée."),
  ).toBeVisible();
});

/* -------------------------------------------------------------------------- */
/* Small helpers, local to this spec                                          */
/* -------------------------------------------------------------------------- */

/**
 * Creates a séance that began ten minutes ago and returns its URL.
 *
 * Ten minutes rather than an hour: the marking list opens thirty minutes *before* the start, so
 * anything inside the window would do — but a session well inside its own duration is the one a
 * coach is actually standing at, and the page draws « Ta réponse » and the marking list differently
 * once the window has elapsed.
 */
async function createTrainingTenMinutesAgo(page: Page): Promise<string> {
  await page.goto("/entrainements");
  await page.getByRole("link", { name: "Nouvel entraînement" }).first().click();
  await page.getByLabel("Début").fill(parisDateTime(new Date(Date.now() - 10 * MS_PER_MINUTE)));
  await page.getByLabel("Au programme").fill("Conservation à trois touches");
  await page.getByRole("button", { name: "Créer l’entraînement" }).click();
  await expect(page.getByRole("heading", { name: "Présences" })).toBeVisible();
  return page.url();
}

/** The marking card, so « 6 présents sur 8 pointés » is never read off some other screen. */
function presences(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "Présences" }) });
}

/**
 * One player's radio, addressed the way a screen reader does: the fieldset announces « Présence de
 * Basile Moreau », the three radios inside it « Présent », « Absent » and « Non pointé » — the last
 * one because « — » is a dash no screen reader can say out loud.
 */
function markOf(page: Page, displayName: string, mark: "Présent" | "Absent" | "Non pointé") {
  return page
    .getByRole("group", { name: `Présence de ${displayName}` })
    .getByRole("radio", { name: mark, exact: true });
}

function membershipOf(fixture: Fixture, displayName: string): string {
  const player = fixture.players.find((candidate) => candidate.displayName === displayName);
  if (!player) throw new Error(`Aucun joueur « ${displayName} » dans la fixture.`);
  return player.membershipId;
}
