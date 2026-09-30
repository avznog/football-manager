/**
 * The end-to-end happy path of `docs/PLAN.md` (« Verification »), in one scenario:
 *
 *   seed a team → the coach logs in → creates a match → two players declare their availability →
 *   the coach picks the squad and builds a composition plus a planned change at the 30th minute →
 *   starts game mode → logs a goal with an assist, a goal conceded, a missed penalty from behind
 *   « Autre… », two free-text comments, and applies the planned change →
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
 * 5. the man of the match on the recap;
 * 6. **the shape of the ACTION menu** (decision 114): four tiles and an « Autre… », with « Faute »
 *    offered nowhere. `FOUL` deliberately stays in the vocabulary, so nothing else in the repo can
 *    tell « no longer offered » from « still there, one tap further » — only the count of 0 below;
 * 7. **the comment round trip**, which is the one flow in the app with a keyboard: what is typed
 *    lands in the timeline at the minute ACTION was tapped, survives a `page.reload()` — so the
 *    payload schema, the ingest allow-list and the reducer are all covered, not just client state —
 *    and is still readable on the recap three weeks later.
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

/**
 * The two notes the coach types, in the one flow in the app that has a keyboard (decision 114).
 *
 * Long enough to be a real sentence rather than a token, because what is being proved is that a
 * free-text payload survives the schema, the ingest allow-list, the reducer and the recap — and a
 * three-letter note would pass through a `note.slice(0, 3)` that a coach's sentence would not.
 */
const NOTE_ALONE =
  "Coup franc dangereux à vingt mètres, le mur est mal placé et le ballon passe dessous.";
const NOTE_ABOUT_PLAYER =
  "Très bon appel dans le dos du défenseur central, il faut le servir plus tôt sur ce genre de course.";

/** Mirrors `MAX_NOTE` in `comment-sheet.tsx` and `noteSchema` in `lib/match/events.ts`. */
const MAX_NOTE = 280;

/** « Autre… », which records nothing and opens the second menu. Spelt once, used three times. */
const MORE_TILE = "Autre… CSC, penalty, blessure, poste";

/**
 * The clock button's accessible name before kick-off — `clockActionFr().name`, not its `label`.
 *
 * The button *shows* « Début », because that is what the thing is called, and it *announces* the
 * football term; WCAG 2.5.3 wants the visible word to be a word of the accessible name, so the name
 * carries both. Asserted `exact`, because « Coup d’envoi » alone is also a substring of the second
 * period's button and this step is about the first.
 */
const KICKOFF_NAME = "Début : coup d’envoi";

/**
 * The whole of the ACTION menu, in order, by accessible name — label then hint, which is how a
 * screen reader and a thumb both read a tile. `CHOICES` and `MORE_CHOICES` in `game-mode.tsx`.
 */
const FIRST_TIER: readonly string[] = [
  "But buteur, passeur",
  "But encaissé enregistré aussitôt",
  "Changement qui sort, qui entre",
  "Commentaire une note libre",
  MORE_TILE,
];

const SECOND_TIER: readonly string[] = [
  "CSC notre joueur",
  "Penalty marqué tireur",
  "Penalty manqué tireur",
  "Blessure notre joueur",
  "Changement de poste qui, vers quel poste",
];

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
     * makes one substitution instead of placing seven players again (decision 106). Two things are
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
  const score = scoreboard.locator('p[aria-label^="Score"]');
  const onPitch = pitch(page, "Joueurs sur le terrain");
  /** One line of « Déroulé du match », found by something it says. */
  const logLine = (text: string) => timelineLine(page, text);

  await test.step("game mode opens with the composition proposed, not applied", async () => {
    // Fix the browser's clock before the page loads: from here on, match time is ours to set.
    await page.clock.setFixedTime(t0);

    await page.getByRole("link", { name: `← ${OPPONENT}` }).click();
    await page.getByRole("link", { name: "Ouvrir le mode match" }).click();

    await expect(scoreboard).toBeVisible();
    await expect(clock).toHaveText("00:00");
    // The bar holds the time and the score and nothing else now (decision 112), so the phase is read
    // off the clock button — whose accessible name is `clockActionFr().name`, from the same state the
    // deleted « Avant le coup d’envoi » line came from. It carries the visible « Début » as well as the
    // football term, because WCAG 2.5.3 wants the word on the button to be a word of what it announces.
    await expect(page.getByRole("button", { name: KICKOFF_NAME, exact: true })).toBeVisible();

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
    await page.getByRole("button", { name: KICKOFF_NAME, exact: true }).click();
    // Period 1 of 2 is running: the only thing the clock button can offer is the end of it.
    await expect(page.getByRole("button", { name: "Mi-temps" })).toBeVisible();

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

  await test.step("the menu is four tiles and an « Autre… », and « Faute » is offered nowhere", async () => {
    await page.clock.setFixedTime(at(27));
    await expect(clock).toHaveText("27:00");

    await page.getByRole("button", { name: "ACTION" }).click();
    const first = menu(page);
    // The minute the action will carry is printed on the sheet, because it is the minute of *this*
    // tap and not of the answer three taps later (decision 031).
    await expect(first).toContainText("27’");

    // Each tile by its whole accessible name — label *and* hint. The hint is what says where the
    // tap leads, and it is the only thing distinguishing a tile that records something from
    // « Autre… », which records nothing.
    for (const name of FIRST_TIER) {
      await expect(first.getByRole("button", { name, exact: true })).toBeVisible();
    }
    // Five tiles and « Fermer », and nothing else: nine tiles is what decision 114 removed, and a
    // sixth tile creeping back into the row a thumb finds without reading is what this catches.
    await expect(first.getByRole("button")).toHaveCount(FIRST_TIER.length + 1);

    // Decision 114, the half nothing else can pin: `FOUL` stays in `MATCH_EVENT_TYPES`, in
    // `GAME_MODE_EVENT_TYPES` and in the retro-entry screen — because `match_events` is append-only
    // and the fouls already logged must still render — while leaving the one menu it appeared in.
    // Every type-level test therefore still passes with the tile put back.
    await expect(first.getByRole("button", { name: "Faute" })).toHaveCount(0);

    await first.getByRole("button", { name: MORE_TILE, exact: true }).click();

    const more = menu(page, "Autre action");
    await expect(more).toContainText("27’");
    for (const name of SECOND_TIER) {
      await expect(more.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(more.getByRole("button")).toHaveCount(SECOND_TIER.length + 1);
    await expect(more.getByRole("button", { name: "Faute" })).toHaveCount(0);

    // One of the five round-trips, which is what proves the generic `ActionChoice<T>` and the `MORE`
    // key actually reach `pickAction` rather than falling through its `default`. « Penalty manqué »
    // rather than « CSC » on purpose: it takes one player and moves no number, so it cannot disturb
    // the 1 – 1 and the « Match nul » that five later assertions in this file are built on.
    await more.getByRole("button", { name: "Penalty manqué tireur", exact: true }).click();
    await picker(page, "Qui a manqué ?").getByRole("button", { name: striker.displayName }).click();

    const missed = logLine("Penalty manqué");
    await expect(missed).toContainText("27’");
    await expect(missed).toContainText(striker.displayName);
    // A missed penalty is not a goal, and the reducer counts it in its own column.
    await expect(score).toHaveText("1 – 1");
  });

  await test.step("a comment about nobody, typed at the only keyboard in the app", async () => {
    await page.clock.setFixedTime(at(28));
    await expect(clock).toHaveText("28:00");

    await action(page, "Commentaire");
    const sheet = page.getByRole("dialog", { name: "Commentaire", exact: true });
    const field = sheet.getByRole("textbox", { name: "Ce qui s’est passé" });

    // `maxLength`, not a validation error: the field stops accepting characters at exactly the
    // length the server accepts, so there is no state in which the sheet holds a sentence the
    // server would refuse. Filled to 280 — which `fill` can do, since `maxLength` only constrains
    // typing — then one real keystroke, which must do nothing at all.
    await field.fill("a".repeat(MAX_NOTE));
    await expect(sheet.getByText("0 caractères restants")).toBeVisible();
    await field.pressSequentially("b");
    await expect(field).toHaveValue("a".repeat(MAX_NOTE));

    await field.fill(NOTE_ALONE);
    // Attaching a player is optional and unset until the coach chooses one: « À propos de… » is not
    // « qui », because a note about a player is not a note blaming one.
    await expect(sheet.getByRole("combobox", { name: "À propos de…" })).toHaveValue("");

    await sheet.getByRole("button", { name: "Enregistrer" }).click();

    const line = logLine(NOTE_ALONE);
    await expect(line).toContainText("Commentaire");
    // The minute of the tap that opened ACTION, like every other action (decision 031).
    await expect(line).toContainText("28’");
    // Inert by construction (decision 114): a note moves no score, no clock and nobody on the pitch.
    await expect(score).toHaveText("1 – 1");
    await expect(
      onPitch.getByRole("img", {
        name: discName(striker.displayName, striker.jerseyNumber, "attaquant"),
      }),
    ).toBeVisible();
  });

  await test.step("the second half kicks off at 30:00 — the clock never resets", async () => {
    await page.clock.setFixedTime(at(30));
    await expect(clock).toHaveText("30:00");

    await page.getByRole("button", { name: "Mi-temps" }).click();
    await expect(page.getByRole("button", { name: "Coup d’envoi 2e période" })).toBeVisible();

    await page.clock.setFixedTime(at(35));
    await page.getByRole("button", { name: "Coup d’envoi 2e période" }).click();

    // Decision 009 and `CLAUDE.md`: match minutes are continuous. A reset would read 00:00 here.
    await expect(clock).toHaveText("30:00");
    // The whole label, not a prefix: « en cours » is the screen saying the clock is really moving,
    // and a second period that kicked off and then sat still would pass a `/^Chrono 30’/`.
    await expect(clock).toHaveAttribute("aria-label", "Chrono 30’, en cours");
    await expect(clock).not.toHaveText("00:00");
    // The last period is running, so the button is now the final whistle rather than another break.
    await expect(page.getByRole("button", { name: "Fin du match" })).toBeVisible();
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

  await test.step("a comment about a player, and both comments survive the server", async () => {
    await page.clock.setFixedTime(at(55));
    await expect(clock).toHaveText("50:00");

    await action(page, "Commentaire");
    const sheet = page.getByRole("dialog", { name: "Commentaire", exact: true });
    await sheet.getByRole("textbox", { name: "Ce qui s’est passé" }).fill(NOTE_ABOUT_PLAYER);
    // A native `<select>` and not a second full-screen picker: a sheet on top of this one would have
    // to destroy it and take the half-typed sentence with it (decision 114).
    await sheet
      .getByRole("combobox", { name: "À propos de…" })
      .selectOption({ label: striker.displayName });
    await sheet.getByRole("button", { name: "Enregistrer" }).click();

    const about = logLine(NOTE_ABOUT_PLAYER);
    await expect(about).toContainText("50’");
    // « Nom : texte » — the same idiom the reducer's other labelled details use.
    await expect(about).toContainText(striker.displayName);

    /*
     * The reload is the assertion, the way it is in `offline.spec.ts`. Up to here every character on
     * screen could have come from React state and IndexedDB; afterwards the only source is the
     * server's own log replayed by the reducer — so this one line covers the `COMMENT` branch of
     * `matchEventPayloadSchema`, the ingest allow-list in `GAME_MODE_EVENT_TYPES`, the `note` column
     * of `TimelineEntry` and the fact that `reduceMatch` carries free text at all. None of that is
     * exercised by anything that stops at the client.
     */
    await page.reload();

    await expect(clock).toHaveText("50:00");
    await expect(score).toHaveText("1 – 1");
    await expect(logLine(NOTE_ALONE)).toContainText("28’");
    const replayed = logLine(NOTE_ABOUT_PLAYER);
    await expect(replayed).toContainText("50’");
    await expect(replayed).toContainText(striker.displayName);
    // Nothing was refused on the way through, and nothing is still on the device.
    await expect(page.getByText("Actions refusées")).toHaveCount(0);
    await expect(page.getByText("en attente d’envoi")).toHaveCount(0);
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

  /*
   * Last on purpose. A comment exists to be read after the match — decision 114's whole
   * justification is « the sentence that explains a scoreline three weeks later » — and the recap is
   * where that reading happens, by a player rather than by the coach who typed it.
   *
   * `buildTimeline` in `lib/rating/recap.ts` sets each entry's `detail` from `describeActors` alone,
   * and never from `entry.note`. So today the recap prints « Commentaire » with the minute, the dot,
   * and no text whatsoever: the note is on the server, the reducer carries it, and the one screen
   * that exists to show it drops it. That is a real defect and not a missing test, so the assertion
   * below is written for the correct behaviour and left to fail until `detail` reads the note.
   */
  await test.step("a comment is still readable on the recap, three weeks later", async () => {
    await page.goto(`${matchUrl}/recap`);
    await expect(page.getByRole("heading", { name: "Déroulé du match" })).toBeVisible();

    await expect(timelineLine(page, NOTE_ALONE)).toContainText("28’");
    const about = timelineLine(page, NOTE_ABOUT_PLAYER);
    await expect(about).toContainText("50’");
    await expect(about).toContainText(striker.displayName);
  });
});

/* -------------------------------------------------------------------------- */
/* The one gesture the scenario above never makes: a drag                     */
/* -------------------------------------------------------------------------- */

/**
 * **Dragging a player onto the bench takes him off the pitch.**
 *
 * A test of its own rather than a step in the scenario above, and worth the second fixture: the
 * happy path places every player by *tapping* (`place` / `swap` below), which is the documented
 * equivalent and the path that works in a glove — so it exercises `onTap` and not one line of the
 * drag. That is why this shipped broken. The bench was a drag *source* only: the dock is `sticky`
 * with `z-20` over a pitch at `z-auto`, so a finger on the bench is still inside the pitch's
 * rectangle, `pointOf` answered with a valid point near the goal line and `nearestSlot` put the
 * player in the nearest defender's slot.
 *
 * **The `pointerup` must land a tick after the `pointermove`, and the `expect` between them is what
 * guarantees it.** `usePitchDrag`'s `end` closes over the `drag` state of the render its handler was
 * attached to; released in the same task as the move, it would still see `moved: false`, call
 * `onTap`, and the test would pass or fail for a reason that has nothing to do with dragging.
 * Waiting on the drop hint is both that tick and the assertion that the dock says it is the target —
 * which it has to, because `Pitch` is `overflow-hidden` and clips the lifted disc away at the edge
 * of the turf.
 */
test("le banc est une cible : un joueur glissé dessus quitte le terrain", async ({ page }) => {
  const fixture = provisionFixture();
  const striker = playerOf(fixture, "st");
  const sub = playerOf(fixture, "sub");

  await login(page, fixture.coach.username, fixture.password);

  await page.getByRole("link", { name: "Nouveau match" }).first().click();
  await page.getByLabel("Adversaire").fill(OPPONENT);
  await page.getByLabel("Coup d’envoi").fill(`${parisDate(tomorrow())}T15:00`);
  await page.getByRole("button", { name: "Créer le match" }).click();
  await expect(page.getByRole("heading", { level: 1, name: OPPONENT })).toBeVisible();

  await page.getByRole("link", { name: "Feuille de match" }).first().click();
  for (const [key] of STARTERS) {
    await segment(page, `role:${playerOf(fixture, key).membershipId}-starter`).click();
  }
  await segment(page, `role:${sub.membershipId}-substitute`).click();
  await page.getByRole("button", { name: "Enregistrer la feuille" }).click();
  await expect(page.getByText("Feuille enregistrée.")).toBeVisible();

  await page.getByRole("link", { name: "Compositions" }).click();
  await page.getByRole("link", { name: "Composition de départ" }).click();

  // The attacker, not the goalkeeper: his slot is at the far end of the turf, which is the one end
  // the dock is guaranteed not to be drawn over. A source the drop target is covering would make
  // this a test of the stacking order and never reach the gesture.
  await place(page, striker, "attaquant");

  const disc = page.getByRole("button", { name: `${striker.displayName}, attaquant` });
  await disc.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const from = await disc.boundingBox();
  const bench = page.getByRole("list", { name: /^Banc/ });
  const onto = await bench.boundingBox();
  if (!from || !onto) throw new Error("Le disque ou le banc n’est pas à l’écran.");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(onto.x + onto.width / 2, onto.y + onto.height / 2, { steps: 10 });
  await expect(
    page.getByText(`Relâche ici : ${striker.displayName} retourne sur le banc.`),
  ).toBeVisible();
  await page.mouse.up();

  // He is off the pitch and back on the strip — and the post he was standing on is free again,
  // which is the half that used to fail: he landed on the nearest defender instead.
  await expect(page.getByRole("button", { name: "Poste libre : attaquant" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `${striker.displayName}, numéro`, exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: `${striker.displayName}, attaquant` })).toHaveCount(
    0,
  );
});

/**
 * The door decision 121 opened: a match played without the phone, closed and typed up without game
 * mode ever running.
 *
 * It is its own test because it needs a match in the **past**, and the fixture the two tests above
 * share is deliberately dated tomorrow so no screen has to decide whether the kick-off is behind us.
 * What it guards is the deadlock this used to be: the retro-entry card is gated on `finished`, and
 * until `finishMatch` existed the only thing that could write that column was a final whistle.
 */
test("un match joué sans le téléphone : terminer, saisir, rouvrir", async ({ page }) => {
  const fixture = provisionFixture();
  await login(page, fixture.coach.username, fixture.password);

  await page.getByRole("link", { name: "Nouveau match" }).first().click();
  await page.getByLabel("Adversaire").fill(OPPONENT);
  // Three weeks ago: the owner's own case, a match already played that nobody recorded.
  await page.getByLabel("Coup d’envoi").fill(`${parisDate(threeWeeksAgo())}T15:00`);
  await page.getByRole("button", { name: "Créer le match" }).click();
  await expect(page.getByRole("heading", { level: 1, name: OPPONENT })).toBeVisible();
  const matchUrl = new URL(page.url()).pathname;

  // Before this existed there was no way past here without starting a live clock.
  await expect(page.getByRole("heading", { level: 2, name: "Terminer le match" })).toBeVisible();
  await page.getByRole("button", { name: "Marquer comme terminé" }).click();

  // The retro card is now reachable, and game mode is not offered for a match with an empty log.
  await expect(page.getByRole("heading", { level: 2, name: "Saisir le match" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Mode match" })).toHaveCount(0);

  // The undo, which is what lets « Marquer comme terminé » skip a confirmation dialog.
  await page.getByRole("button", { name: /Rouvrir le match/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Terminer le match" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Mode match" })).toBeVisible();

  // And the one-tap shortcut: finish and land on the form, which must not refuse the match.
  await page.getByRole("button", { name: "Saisir le match" }).click();
  await expect(page).toHaveURL(new RegExp(`${matchUrl}/saisie$`));
  await expect(page.getByRole("heading", { level: 1, name: "Saisie du match" })).toBeVisible();
  await expect(page.getByText("Ce match n’a pas encore eu lieu")).toHaveCount(0);

  // Typing it up derives the score, so the row stops saying « Rien saisi » — and the fact that this
  // works at all is the whole point: nothing downstream knows the match never had a live clock.
  // Positionally and by value: the 1-3-2-1 has two slots both captioned « Milieu », and the options
  // are labelled « 8. Nom » rather than by name alone. Which post each player took is not what this
  // test is about — that one distinct player lands in each slot is.
  const slots = page.locator("select");
  for (const [index, [key]] of STARTERS.entries()) {
    await slots.nth(index).selectOption(playerOf(fixture, key).membershipId);
  }
  await page.getByRole("button", { name: "+ But pour nous" }).click();
  await page.getByRole("button", { name: "Enregistrer le match" }).click();

  // The action redirects here itself, so wait for *its* navigation rather than starting one: a
  // `goto` fired in the same tick cancels the POST still in flight, and the recap then truthfully
  // reports a submission that never landed.
  await expect(page).toHaveURL(new RegExp(`${matchUrl}/recap\\?saisie=1$`));
  await expect(page.getByText("rien saisi")).toHaveCount(0);
  await expect(page.getByText("1 – 0").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Terminer le match" })).toHaveCount(0);
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

/** A match well and truly played, for the retro door (decision 121). */
function threeWeeksAgo(): Date {
  return new Date(Date.now() - 21 * 24 * 60 * MS_PER_MINUTE);
}

function picker(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title });
}

/**
 * An ACTION menu by its French title. `exact`, unlike `picker`, because « Action » is a substring of
 * « Autre action » and the whole point of the second tier is that it is a different sheet.
 */
function menu(page: Page, title = "Action"): Locator {
  return page.getByRole("dialog", { name: title, exact: true });
}

/**
 * One line of « Déroulé du match », found by something it says.
 *
 * `Card` renders a bare `<section>`, so the log is not a landmark to ask for by role — the same
 * idiom `offline.spec.ts` uses. It matches game mode's timeline and the recap's, which are two
 * components rendering the same heading and, for a comment, must say the same thing.
 */
function timelineLine(page: Page, text: string): Locator {
  return page
    .locator("section")
    .filter({ hasText: "Déroulé du match" })
    .locator("ol > li")
    .filter({ hasText: text });
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
  await expect(
    page.getByRole("heading", { level: 1, name: "Noter mes coéquipiers" }),
  ).toBeVisible();

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

  await expect(
    page.getByText(`${fixture.players.length} / ${fixture.players.length} notés`),
  ).toBeVisible();
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
