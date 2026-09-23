/**
 * The end-to-end happy path of `docs/PLAN.md` (« Verification »), in one scenario:
 *
 *   seed a team → the coach logs in → creates a match → two players declare their availability →
 *   the coach picks the squad and builds a composition plus a planned change at the 30th minute →
 *   starts game mode → logs a goal with an assist, a goal conceded, and applies the planned change →
 *   final whistle → score and minutes played are right → a player submits his ratings →
 *   the recap shows the man of the match.
 *
 * ## What it is here to catch
 *
 * Not "the page rendered". The assertions are aimed at the five things that would be *wrong*:
 *
 * 1. the score after the two goals (1 – 1, « Match nul »);
 * 2. the **continuous** clock: with 2×30 the second half kicks off at `30:00`, never `00:00`
 *    (`CLAUDE.md`, decision 009) — this is asserted on the reading *immediately after* the second
 *    kick-off, which is precisely where a reset would show;
 * 3. the minutes played per player after the final whistle: 60 for whoever played throughout, 30
 *    each for the player replaced at the 30th minute and for the substitute who came on;
 * 4. that the planned change was applied **only after confirmation** (invariant 3): while the
 *    prompt is on screen the pitch still shows the man who is about to come off, and the substitute
 *    is nowhere on it;
 * 5. the man of the match on the recap.
 *
 * ## Where its data comes from
 *
 * `e2e/fixtures/seed.ts`, run in a child process before the browser opens. It creates a team of its
 * own — one coach, eight players, run-scoped names — and prunes the previous run's. `db/seed.ts` is
 * never imported and the demo season is never assumed: another session may be editing it right now.
 * Everything else in the scenario (the match, the sheet, the compositions, the events, the ratings)
 * is created here, through the interface, the way a human would.
 *
 * ## Two deliberate departures from the sentence in `docs/PLAN.md`
 *
 * - **Two raters, not one.** `MOTM_MIN_RATINGS` is 2 (decision 025): after a single player's notes,
 *   the recap *correctly* refuses to crown anybody. The spec asserts that refusal first — it is the
 *   decision working — then has a second player rate, and only then asserts the man of the match.
 * - **The starting composition is confirmed in game mode before kick-off.** A composition is never
 *   applied automatically (invariant 3), so without that confirmation nobody is on the pitch and
 *   nobody accrues a minute. The prompt is answered, not bypassed.
 *
 * The match clock is driven by `page.clock.setFixedTime()`: the app stamps events with `Date.now()`
 * on the device, so faking the browser's clock is what lets a 60-minute match be played in a few
 * seconds — with real waits on visible French text, never a `waitForTimeout`.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { playerOf, provisionFixture } from "./fixtures/provision";
import type { Fixture, FixturePlayer, FixturePlayerKey } from "./fixtures/types";
import { MS_PER_MINUTE, discName, login, logout, parisDate, pitch, segment } from "./helpers/app";

const OPPONENT = "US Vallonnée";

/** The starting seven, and the French position name each one is placed on in the 1-3-2-1. */
const STARTERS: readonly (readonly [FixturePlayerKey, string])[] = [
  ["gk", "gardien de but"],
  ["lb", "défenseur gauche"],
  ["cb", "défenseur central"],
  ["rb", "défenseur droit"],
  ["cm1", "milieu central"],
  ["cm2", "milieu central"],
  ["st", "attaquant"],
];


test("le parcours complet : match, composition, mode match, notation, résumé", async ({ page }) => {
  const fixture = provisionFixture();

  const coach = fixture.coach;
  const gk = playerOf(fixture, "gk");
  const cm1 = playerOf(fixture, "cm1");
  const cm2 = playerOf(fixture, "cm2");
  const striker = playerOf(fixture, "st");
  const sub = playerOf(fixture, "sub");

  /* ---------------------------------------------------------------------- */
  /* The coach creates the match                                            */
  /* ---------------------------------------------------------------------- */

  let matchUrl = "";

  await test.step("the coach logs in and creates a 2×30 match", async () => {
    await login(page, coach.username, fixture.password);

    await page.getByRole("link", { name: "Nouveau match" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Nouveau match" })).toBeVisible();

    await page.getByLabel("Adversaire").fill(OPPONENT);
    // A bare Paris wall clock, which is how the app reads a `datetime-local` (decision 013).
    // Tomorrow rather than today: a match still to come whatever hour the suite is run at, so no
    // screen ever has to decide whether the kick-off is behind us.
    await page.getByLabel("Coup d’envoi").fill(`${parisDate(tomorrow())}T15:00`);
    await page.getByRole("button", { name: "Créer le match" }).click();

    await expect(page.getByRole("heading", { level: 1, name: OPPONENT })).toBeVisible();
    // The whole continuity assertion below rests on the format, so state it out loud.
    await expect(page.getByText("2×30 minutes")).toBeVisible();

    matchUrl = new URL(page.url()).pathname;
    expect(matchUrl).toMatch(/^\/match\/[0-9a-f-]{36}$/);
  });

  /* ---------------------------------------------------------------------- */
  /* Two players declare their availability                                 */
  /* ---------------------------------------------------------------------- */

  await test.step("two players declare themselves available", async () => {
    for (const [rank, player] of [striker, gk].entries()) {
      await logout(page);
      await login(page, player.username, fixture.password);
      await page.goto(matchUrl);

      // One tap is the whole interaction: the control submits on change once hydrated, and its
      // « Valider ma réponse » fallback disappears. Waiting for that is also this suite's canary —
      // if the page never hydrates, every later step would quietly exercise the no-JavaScript
      // fallbacks instead of the app.
      await expect(page.getByRole("button", { name: "Valider ma réponse" })).toHaveCount(0);
      await segment(page, "status-yes").click();

      // The tally is server-derived: it only moves if the answer was actually written, by the
      // player himself — a coach cannot answer on anybody's behalf (`docs/DATA_MODEL.md`).
      await expect(
        page.getByText(`${rank + 1} réponse${rank > 0 ? "s" : ""} sur 8 joueurs`),
      ).toBeVisible();
      await expect(availabilityGroup(page, "Dispo")).toContainText(player.displayName);
    }
  });

  /* ---------------------------------------------------------------------- */
  /* The coach picks the squad                                              */
  /* ---------------------------------------------------------------------- */

  await test.step("the coach fills the match sheet: seven starters and one substitute", async () => {
    await logout(page);
    await login(page, coach.username, fixture.password);
    await page.goto(matchUrl);

    await page.getByRole("link", { name: "Feuille de match" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Feuille de match" })).toBeVisible();

    for (const [key] of STARTERS) {
      await segment(page, `role:${playerOf(fixture, key).membershipId}-starter`).click();
    }
    await segment(page, `role:${sub.membershipId}-substitute`).click();

    await page.getByRole("button", { name: "Enregistrer la feuille" }).click();

    await expect(page.getByText("Feuille enregistrée.")).toBeVisible();
    await expect(page.getByText("7 / 7 titulaires")).toBeVisible();
  });

  /* ---------------------------------------------------------------------- */
  /* Compositions: the starting seven, then the change at the 30th minute    */
  /* ---------------------------------------------------------------------- */

  await test.step("the coach builds the starting composition", async () => {
    await page.getByRole("link", { name: "Compositions" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Compositions" })).toBeVisible();
    await expect(page.getByText("Le terrain est vide")).toBeVisible();

    await page.getByRole("link", { name: "Composition de départ" }).click();
    await expect(page.getByLabel("Minute", { exact: true })).toHaveValue("0");

    for (const [key, slot] of STARTERS) {
      await place(page, playerOf(fixture, key), slot);
    }
    // The bench strip states what is left rather than heading a section per squad role: with the seven
    // placed, the only thing left to say is that the postes are taken (`benchHintFr`).
    await expect(page.getByText("tous les postes pris")).toBeVisible();

    await page.getByRole("button", { name: "Créer la composition" }).click();

    const card = compositionCard(page, "Composition de départ");
    await expect(card).toBeVisible();
    await expect(card.getByText("enregistrée")).toBeVisible();
  });

  await test.step("the coach plans one change at the 30th minute", async () => {
    await page.getByRole("link", { name: "Nouvelle composition" }).click();
    // Half of a 2×30 — the app proposes the minute, and the scenario needs exactly this one.
    await expect(page.getByLabel("Minute", { exact: true })).toHaveValue("30");

    /*
     * The editor opens on the team in force at the 30th minute — the starting seven — so the coach
     * makes one substitution instead of placing seven players again (decision NNN). Two things are
     * asserted before he touches anything, because they are the two ways a pre-filled pitch could
     * lie: it must not claim to be saved (nothing exists until the submit below, invariant 3), and
     * the deduced changes must be empty rather than « 7 changements ».
     */
    await expect(page.getByText("Rien n’est encore enregistré.")).toBeVisible();
    await expect(page.getByText("déplace seulement ce qui change")).toBeVisible();
    await expect(page.getByText("Aucun changement.")).toBeVisible();

    await swap(page, sub, cm2, "milieu central");
    await expect(page.getByText(`${cm2.displayName} → ${sub.displayName}`)).toBeVisible();

    await page.getByRole("button", { name: "Créer la composition" }).click();

    const card = compositionCard(page, "À partir de la 30ᵉ minute");
    await expect(card).toBeVisible();
    // Deduced from the two compositions, never typed in (decision 006).
    await expect(card.getByText(`${cm2.displayName} → ${sub.displayName}`)).toBeVisible();
    // A plan, not a record: it has not been applied and can still be edited.
    await expect(card.getByText("30'")).toBeVisible();
    await expect(card.getByRole("link", { name: "Modifier" })).toBeVisible();
  });

  /* ---------------------------------------------------------------------- */
  /* Game mode                                                              */
  /* ---------------------------------------------------------------------- */

  const t0 = Date.now();
  const at = (minutes: number) => t0 + minutes * MS_PER_MINUTE;

  const scoreboard = page.getByRole("region", { name: "Chrono et score" });
  const clock = scoreboard.locator('span[aria-label^="Chrono"]');
  const score = scoreboard.locator("span").filter({ hasText: /^\d+ – \d+$/ });
  const onPitch = pitch(page, "Joueurs sur le terrain");

  await test.step("game mode opens with the composition proposed, not applied", async () => {
    // Fix the browser's clock before the page loads: from here on, match time is ours to set.
    await page.clock.setFixedTime(t0);

    await page.getByRole("link", { name: `← ${OPPONENT}` }).click();
    await page.getByRole("link", { name: "Ouvrir le mode match" }).click();

    await expect(scoreboard).toBeVisible();
    await expect(clock).toHaveText("00:00");
    await expect(scoreboard).toContainText("Avant le coup d’envoi");

    // Invariant 3, before a single event exists: the composition is on screen as a proposal, and
    // the pitch is empty until the coach confirms it.
    const prompt = promptCard(page, "Composition de départ");
    await expect(prompt).toContainText(
      "Proposée, pas appliquée : rien ne change avant ta confirmation.",
    );
    // The empty pitch says why it is empty, and it is not « aucune composition enregistrée » — one is
    // saved and is on screen right above this line. That copy is what this assertion used to pin.
    await expect(page.getByText("Personne n’est encore sur le terrain.")).toBeVisible();
    await expect(page.getByText("attend ta confirmation")).toBeVisible();
    await expect(page.getByText("Aucune composition enregistrée.")).toHaveCount(0);
    await expect(onPitch).toHaveCount(0);

    await prompt.getByRole("button", { name: "Appliquer" }).click();

    await expect(onPitch).toBeVisible();
    for (const [key, slot] of STARTERS) {
      const player = playerOf(fixture, key);
      await expect(
        onPitch.getByRole("img", { name: discName(player.displayName, player.jerseyNumber, slot) }),
      ).toBeVisible();
    }
  });

  await test.step("a goal with an assist, then a goal conceded", async () => {
    await page.getByRole("button", { name: "Coup d’envoi" }).click();
    await expect(scoreboard).toContainText("1re période");

    await page.clock.setFixedTime(at(11));
    await expect(clock).toHaveText("11:00");

    await action(page, "But buteur");
    await picker(page, "Qui a marqué ?").getByRole("button", { name: striker.displayName }).click();
    await picker(page, "Passe décisive ?").getByRole("button", { name: cm1.displayName }).click();
    await expect(score).toHaveText("1 – 0");

    await page.clock.setFixedTime(at(24));
    await expect(clock).toHaveText("24:00");

    await action(page, "But encaissé");
    await expect(score).toHaveText("1 – 1");
  });

  await test.step("the second half kicks off at 30:00 — the clock never resets", async () => {
    await page.clock.setFixedTime(at(30));
    await expect(clock).toHaveText("30:00");

    await page.getByRole("button", { name: "Mi-temps" }).click();
    await expect(scoreboard).toContainText("Mi-temps");

    await page.clock.setFixedTime(at(35));
    await page.getByRole("button", { name: "Coup d’envoi 2e période" }).click();

    // Decision 009 and `CLAUDE.md`: match minutes are continuous. A reset would read 00:00 here.
    await expect(clock).toHaveText("30:00");
    await expect(clock).toHaveAttribute("aria-label", "Chrono 30’");
    await expect(clock).not.toHaveText("00:00");
    await expect(scoreboard).toContainText("2e période");
  });

  await test.step("the planned change is applied only once the coach confirms it", async () => {
    const prompt = promptCard(page, "Composition prévue à la 30’");
    await expect(prompt).toContainText(`${cm2.displayName} → ${sub.displayName}`);

    // Invariant 3. The plan is due, it is on screen — and nothing has changed on the pitch: the
    // man being replaced is still on it, and the substitute is not.
    const replaced = onPitch.getByRole("img", {
      name: discName(cm2.displayName, cm2.jerseyNumber, "milieu central"),
    });
    const coming = onPitch.getByRole("img", { name: sub.displayName });
    await expect(replaced).toBeVisible();
    await expect(coming).toHaveCount(0);

    await prompt.getByRole("button", { name: "Appliquer" }).click();

    await expect(
      onPitch.getByRole("img", {
        name: discName(sub.displayName, sub.jerseyNumber, "milieu central"),
      }),
    ).toBeVisible();
    await expect(replaced).toHaveCount(0);
  });

  await test.step("the final whistle freezes the match", async () => {
    await page.clock.setFixedTime(at(65));
    await expect(clock).toHaveText("60:00");

    await page.getByRole("button", { name: "Fin du match" }).click();
    await page.getByRole("button", { name: "Coup de sifflet final" }).click();

    const confirm = page.getByRole("dialog", { name: "Coup de sifflet final" });
    await expect(confirm).toContainText(`contre ${OPPONENT}`);
    await confirm.getByRole("button", { name: "Terminer le match" }).click();

    await expect(page.getByRole("heading", { name: "Match terminé" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ACTION" })).toHaveCount(0);
    // Every action reached the server: the outbox never had to give up on one.
    await expect(page.getByText("Actions refusées")).toHaveCount(0);

    await page.getByRole("link", { name: "Revenir au match" }).click();
    // Wait for the navigation before asking for the score: game mode's own scoreboard and its
    // timeline both read « 1 – 1 » now that the two agree on the character (decision 061), so an
    // unscoped `getByText` matches two elements on the page we are leaving. The match page states
    // the score and the result on one line in its header — that line is the assertion.
    await expect(page).toHaveURL(new RegExp(`${matchUrl}$`));
    const headline = page.locator("header p").filter({ hasText: /^\d+ – \d+/ });
    await expect(headline).toContainText("1 – 1");
    await expect(headline).toContainText("Match nul");
  });

  /* ---------------------------------------------------------------------- */
  /* Ratings and the recap                                                  */
  /* ---------------------------------------------------------------------- */

  // Back to a clock that agrees with the server's, now that the match is over.
  await page.clock.setFixedTime(Date.now());

  await test.step("the striker rates the squad; one rater is not enough to crown anybody", async () => {
    await logout(page);
    await login(page, striker.username, fixture.password);
    await page.goto(matchUrl);

    await page.getByRole("link", { name: "Noter mes coéquipiers" }).click();
    await rateEveryone(page, fixture, striker);

    await page.getByRole("button", { name: "Terminer et voir le résumé" }).click();
    await expect(page).toHaveURL(new RegExp(`${matchUrl}/recap$`));

    // Scoped to the scoreboard, because the equaliser's « 1 – 1 » is *also* on the timeline three
    // cards below — since the two agree on the character, which is decision 061's point, an
    // unscoped `getByText` would match both and Playwright's strict mode would refuse.
    const finalScore = page.getByRole("region", { name: "Score du match" });
    await expect(finalScore).toContainText("1 – 1");
    await expect(finalScore).toContainText("Match nul");

    // Decision 025: one teammate's opinion does not make a man of the match.
    await expect(page.getByText("Pas encore assez de notes")).toBeVisible();

    await assertMinutes(page, [
      [gk, 60],
      [cm1, 60],
      [cm2, 30],
      [striker, 60],
      [sub, 30],
    ]);
    await expect(minutesRow(page, striker.displayName).getByRole("cell").nth(1)).toHaveText("1");
    await expect(minutesRow(page, cm1.displayName).getByRole("cell").nth(2)).toHaveText("1");
  });

  await test.step("a second rater completes the vote and the recap crowns the striker", async () => {
    await logout(page);
    await login(page, gk.username, fixture.password);
    await page.goto(matchUrl);

    await page.getByRole("link", { name: "Noter mes coéquipiers" }).click();
    await rateEveryone(page, fixture, striker);
    await page.getByRole("button", { name: "Terminer et voir le résumé" }).click();

    const motm = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Homme du match" }) })
      .last();
    await expect(motm).toContainText(striker.displayName);
    await expect(motm).toContainText("9,0 de moyenne sur 2 notes");
  });

  await test.step("a coach-only screen is a French dead end for a player, with a way out", async () => {
    // Still the goalkeeper, so still a player: `match:amend` is coach-only, and the retro-entry
    // screen answers `notFound()` rather than 403 precisely so that it does not confirm the match
    // exists. What a player must therefore see is a 404 — in French, inside the shell.
    await page.goto(`${matchUrl}/saisie`);
    await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
    // The sentence, not just the heading: Next keeps the layouts that matched, so removing
    // `app/(app)/not-found.tsx` falls through to the root one — same heading, inside the same shell,
    // and only the copy gives it away. « Réservée aux coachs » is the half that is true here.
    await expect(page.getByText("réservée aux coachs")).toBeVisible();
    // And what all of this replaced: Next's built-in page, « This page could not be found. », in
    // English, in an app that is French everywhere else.
    await expect(page.getByText("This page could not be found")).toHaveCount(0);

    await page.getByRole("link", { name: "Retour au calendrier" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Calendrier" })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Steps that are worth a name                                               */
/* -------------------------------------------------------------------------- */

/**
 * Places a player on a slot the way a coach does on a phone: tap the player, tap the position.
 * The editor supports dragging too, but tapping is the documented equivalent and does not depend on
 * pointer-move heuristics.
 */
async function place(page: Page, player: FixturePlayer, positionFr: string): Promise<void> {
  // `exact: false`: a bench disc now says its squad role too — « …, numéro 8, remplaçant » — because
  // the strip carries titulaire-or-remplaçant by its order alone, which a screen reader cannot see.
  // The pitch buttons name themselves « Nom, poste », with no number, so this cannot match two.
  await page
    .getByRole("button", {
      name: `${player.displayName}, numéro ${player.jerseyNumber}`,
      exact: false,
    })
    .first()
    .click();
  // The 1-3-2-1 has two « milieu central » slots; the first free one is the earlier of the two.
  const slot = page.getByRole("button", { name: `Poste libre : ${positionFr}` }).first();
  // Centred explicitly, not left to Playwright's scroll-if-needed: the bench and the confirm button
  // are a sticky dock over the bottom ~270 px of a 390 × 844 viewport, and « if needed » counts an
  // occluded element as visible and scrolls nothing. Centring puts the slot at y ≈ 420, clear of
  // both the dock and the sticky app header.
  await slot.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await slot.click();
  await expect(
    page.getByRole("button", { name: `${player.displayName}, ${positionFr}` }),
  ).toBeVisible();
}

/**
 * Replaces the player standing in `positionFr` by one from the bench: tap the substitute, tap the
 * occupied post. The one gesture a pre-filled editor exists for.
 */
async function swap(
  page: Page,
  incoming: FixturePlayer,
  outgoing: FixturePlayer,
  positionFr: string,
): Promise<void> {
  await expect(
    page.getByRole("button", { name: `${outgoing.displayName}, ${positionFr}` }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `${incoming.displayName}, numéro ${incoming.jerseyNumber}` })
    .click();
  await page.getByRole("button", { name: `${outgoing.displayName}, ${positionFr}` }).click();
  await expect(
    page.getByRole("button", { name: `${incoming.displayName}, ${positionFr}` }),
  ).toBeVisible();
}

/** Opens the ACTION menu and picks a tile by its French label. */
async function action(page: Page, tile: string): Promise<void> {
  await page.getByRole("button", { name: "ACTION" }).click();
  await page.getByRole("dialog", { name: "Action" }).getByRole("button", { name: tile }).click();
}

function tomorrow(): Date {
  return new Date(Date.now() + 24 * 60 * MS_PER_MINUTE);
}

function picker(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title });
}

/**
 * Gives every player on the sheet a note, in the order the flow presents them: 9 to the man of the
 * match, 5 to everybody else. The card on screen is read rather than assumed, so the loop cannot
 * silently rate the same player eight times.
 *
 * Two taps per teammate, not one: selecting a note no longer advances (decision 102). Tapping the
 * number and asserting it is checked *before* tapping « Suivant » is the regression this suite owes
 * the owner's report — the old flow replaced the card so fast that no state existed in which the
 * chosen number was visibly chosen.
 */
async function rateEveryone(page: Page, fixture: Fixture, best: FixturePlayer): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Noter mes coéquipiers" })).toBeVisible();

  const cards = page.locator("form > ul > li:not([hidden])");
  // Pagination starts at hydration: one card at a time is the sign the client has taken over.
  await expect(cards).toHaveCount(1);

  const rated = new Set<string>();
  for (let step = 0; step < fixture.players.length; step += 1) {
    const card = cards.first();
    const name = (await card.getByRole("heading", { level: 2 }).innerText()).trim();
    const player = fixture.players.find((candidate) => candidate.displayName === name);
    if (!player) throw new Error(`Carte de notation inattendue : « ${name} ».`);
    if (rated.has(player.membershipId)) {
      throw new Error(`« ${name} » est proposé deux fois à la notation.`);
    }
    rated.add(player.membershipId);

    const note = player.membershipId === best.membershipId ? 9 : 5;
    await segment(card, `score:${player.membershipId}-${note}`).click();

    // Still on the same teammate, with the note visibly his: the card did not move under the thumb.
    await expect(card.getByRole("heading", { level: 2 })).toHaveText(name);
    // An attribute selector, not `#id`: these ids contain a `:`, which a CSS id selector would read
    // as the start of a pseudo-class.
    await expect(card.locator(`input[id="score:${player.membershipId}-${note}"]`)).toBeChecked();
    await expect(card.getByText(`Note choisie : ${note} / 10`)).toBeVisible();

    const isLast = step === fixture.players.length - 1;
    if (isLast) {
      // Nothing to press on: the last card offers no forward button, only the submit below.
      await expect(page.getByRole("button", { name: "Suivant" })).toHaveCount(0);
    } else {
      await page.getByRole("button", { name: "Suivant", exact: true }).click();
    }
  }

  await expect(page.getByText(`${fixture.players.length} / ${fixture.players.length} notés`)).toBeVisible();
  await expect(page.getByText("Prêt à envoyer")).toBeVisible();
}

/* -------------------------------------------------------------------------- */
/* Locators                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `Card` is a `<section>` and so is each group inside the availability grid, so a filter on a
 * heading matches the card *and* the group nested in it. `.last()` is the inner one — the whole
 * point of scoping here is to assert on one group rather than on the card's full text.
 */
function availabilityGroup(page: Page, label: string): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 3, name: label }) })
    .last();
}

function compositionCard(page: Page, title: string): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) })
    .last();
}

function promptCard(page: Page, title: string): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Appliquer" }) })
    .last();
}

function minutesRow(page: Page, name: string): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("rowheader", { name }) });
}

/** The column the whole game-mode step exists to justify: minutes played, per player. */
async function assertMinutes(
  page: Page,
  expected: readonly (readonly [FixturePlayer, number])[],
): Promise<void> {
  await expect(page.getByRole("heading", { name: "Temps de jeu" })).toBeVisible();
  for (const [player, minutes] of expected) {
    await expect(minutesRow(page, player.displayName).getByRole("cell").first()).toHaveText(
      String(minutes),
    );
  }
}
