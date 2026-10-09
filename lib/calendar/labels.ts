/**
 * The French vocabulary of the calendar, in one place.
 *
 * Hardcoded French with no i18n layer (decision 012). Keeping the strings here rather than inline
 * in the JSX means « à l’extérieur » is spelled the same on the pinned card, the match page and the
 * statistics — and that a typo is fixed once.
 */

import type { EntryMode, MatchStatus } from "@/db/schema";

/**
 * There is no competition label map here any more, and that is decision 107.
 *
 * « Championnat », « Coupe », « Amical » and « Tournoi » used to be four enum values translated on
 * this line. They are now rows of the team's own `competitions` table, so the label a screen prints
 * is the one the coach typed — carried on the row (`competitionLabel`), never looked up. The four
 * words survive as the defaults a new team starts with, in `lib/competition/defaults.ts`.
 */

/**
 * A match that is over with an empty log, in the words the recap already used.
 *
 * Not an empty space, which is what the calendar row was: the one match asking to be filled in was
 * the only silent row of the history. Not « 0 – 0 » either — the invention decisions 013 and 061
 * exist to have removed — because nobody has said what the score was, and a match ending 0 – 0 is a
 * different statement from a match nobody wrote down.
 *
 * Exported rather than written twice: the recap's scoreboard has said « rien saisi » under « ? – ? »
 * since decision 041, and two screens describing one state describe it in the same words
 * (decision 085). The calendar capitalises it, as it does every badge on a row.
 */
export const NOT_RECORDED_FR = "rien saisi";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: "À venir",
  live: "En cours",
  finished: "Terminé",
};

/**
 * « saisi après le match » — or nothing at all.
 *
 * Only one of the two modes is worth saying. A live log is the normal case and the badge would be
 * noise on every card of the season; a match typed up afterwards is the case where a number on the
 * screen was not observed by anybody, and decision 013 put `matches.entry_mode` in the database
 * precisely so the UI could say so.
 *
 * `recorded` is the second half of the rule, and the reason this is a function rather than a map.
 * `entry_mode` is **a label on a log** — `lib/retro/actions.ts` sets it as it writes one — so with an
 * empty log it describes nothing, and « saisi après le match » about a match nobody has saisi is the
 * same invention as « 0 – 0 » for its score (decision 013). The demo season contains exactly that
 * row: nine men named on the sheet for FC des Deux-Ponts and not one event.
 */
export function entryModeBadgeFr(mode: EntryMode, options: { recorded: boolean }): string | null {
  return mode === "retro" && options.recorded ? "saisi après le match" : null;
}

/**
 * What being typed up afterwards costs, in the words the entry form already uses.
 *
 * Decision 048: an action whose minute the coach cannot remember is stamped at the midpoint of the
 * spell it has to fall inside, « au mieux ». That makes the minutes played a good estimate and the
 * score exact, and a player reading « 43’ » next to his name is entitled to know which of the two
 * he is looking at. The form says it while he types; this says it to everybody who reads it after.
 */
export const RETRO_MINUTES_NOTE =
  "Ce match a été saisi après coup : les actions sans minute précise ont été placées au mieux, donc les temps de jeu sont approximatifs. Le score et les buts, eux, sont exacts.";

/** « à domicile » / « à l’extérieur ». */
export function venueSideLabel(isHome: boolean): string {
  return isHome ? "à domicile" : "à l’extérieur";
}

/** « Dom. » / « Ext. » — for a badge on a dense row. */
export function venueSideShortLabel(isHome: boolean): string {
  return isHome ? "Dom." : "Ext.";
}

/**
 * How a team names one of its own fixtures: « contre Étoile du Parc » at home, « à Étoile du Parc »
 * away.
 *
 * This is the one place the two are told apart in a heading, and it is a preposition rather than a
 * badge because that is what fits: on the calendar row the fixture is a single truncating line at
 * 390 px, and « à » instead of « contre » costs five characters while a pill costs forty. It is also
 * how the coach says it out loud, which is the test that matters for a tool a dozen people use on a
 * Sunday morning.
 *
 * Every screen that prints an opponent's name inside a sentence goes through here, so the app cannot
 * say « contre » about a match played at the opponent's ground — which it did, on `/stats`, in game
 * mode's final whistle and in the (since removed, decision 156) availability control's own label.
 */
export function matchNameFr(opponentName: string, isHome: boolean): string {
  return `${isHome ? "contre" : "à"} ${opponentName}`;
}

/**
 * Where the match is played, in one phrase: « à domicile, Stade des Tilleuls ».
 *
 * `venue` is free text and optional, and the two fields have to be read together or not at all. A
 * bare venue says nothing about *whose* ground it is — « Stade du Parc » is our pitch or theirs
 * depending on a boolean the row never showed — and a venue nobody filled in is not a reason to say
 * nothing: « à domicile » on its own is still true and still the fact the reader came for. So the
 * side always leads, and the venue is only ever the detail appended to it.
 */
export function venuePhraseFr(isHome: boolean, venue: string | null): string {
  const side = venueSideLabel(isHome);
  return venue ? `${side}, ${venue}` : side;
}

/**
 * What « Terrain » means on the match form, which depends on the side chosen just above it.
 *
 * The field used to sit under the home/away control with no hint at all, and the two could be filled
 * in to tell different stories — the opponent's ground typed on a match marked « à domicile ». The
 * form cannot verify a free-text pitch name, but it can say which one it is asking for.
 */
export function venueFieldHintFr(isHome: boolean): string {
  return isHome ? "Le terrain où tu reçois." : "Le terrain de l’adversaire.";
}

/**
 * What `scoreLineFr` joins the two figures with, spaces included — an en dash, not a hyphen, because
 * a score is not a range of two numbers.
 *
 * It is exported for the one caller that cannot use the whole string: game mode's bar underlines
 * *our* figure, so it renders the two goals as two elements with this between them. Typing « – » a
 * second time there is how a second convention starts, which is what the function below exists to
 * prevent.
 */
export const SCORE_SEPARATOR_FR = " – ";

/**
 * A scoreline: **our goals first, always**, whether the match was at home or away.
 *
 * There is no `isHome` parameter, and that is the decision this function exists to hold. Two
 * conventions had grown up side by side: the calendar pill and the match page wrote our goals first,
 * while both scoreboards — game mode's and the recap's — put the *home* side first, the way a
 * broadcast does. An audit of the recap at 390 px caught what that costs: the scoreboard read
 * « CS Morvan — Nous · 0 – 2 » over a timeline reading « 2 – 0 », one screen, one match, two
 * scorelines, and the big numerals handed the win to the opponent.
 *
 * Broadcast convention is the wrong one here. This is one team's tool, not a league table: every
 * number on every screen is about *this* team. In game mode the score is 36 px and the caption that
 * names the sides is 12 px and truncates, so a coach reading it at arm's length in daylight would
 * have to work out which figure was his — at 58’, while the ball is in play. Who is at home is said
 * in words instead, by `venueSideLabel` and the badges that use it.
 */
export function scoreLineFr(goalsFor: number, goalsAgainst: number): string {
  return `${goalsFor}${SCORE_SEPARATOR_FR}${goalsAgainst}`;
}

/** « Victoire » / « Défaite » / « Match nul », from a derived score. */
export function resultLabel(goalsFor: number, goalsAgainst: number): string {
  if (goalsFor > goalsAgainst) return "Victoire";
  if (goalsFor < goalsAgainst) return "Défaite";
  return "Match nul";
}

/** `V` / `N` / `D`, the single letter a form guide uses. */
export function resultLetter(goalsFor: number, goalsAgainst: number): "V" | "N" | "D" {
  if (goalsFor > goalsAgainst) return "V";
  if (goalsFor < goalsAgainst) return "D";
  return "N";
}

/** A plural `s` only when it is needed: `pluralize(1, "joueur")` → « 1 joueur ». */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

/** « 2×30 minutes », as a coach says it. */
export function periodsLabel(periodsCount: number, periodMinutes: number): string {
  return `${periodsCount}×${periodMinutes} minutes`;
}

/**
 * What the two numbers on the match form actually mean: « 2×30 minutes : 60 minutes de jeu, et la
 * 2ᵉ période va de la 30ᵉ à la 60ᵉ minute. »
 *
 * The form used to hint « 2 par défaut. » and « 30 par défaut. » under fields already holding 2 and
 * 30 — a sentence that says nothing when creating a match and is false when editing one that runs
 * 3×20. Neither said the thing a coach might get wrong: « Minutes » is *per period*, and the clock
 * this app shows is continuous (decision 009), so the last period ends at the total and not at
 * `periodMinutes`. Stating both here is cheaper than a coach discovering it in game mode.
 *
 * Returns `null` while the pair cannot be read — an emptied field, a half-typed number — because a
 * duration computed from `NaN` is exactly the kind of sentence this function exists to prevent.
 */
export function matchLengthHintFr(periodsCount: number, periodMinutes: number): string | null {
  if (!Number.isInteger(periodsCount) || !Number.isInteger(periodMinutes)) return null;
  if (periodsCount < 1 || periodMinutes < 1) return null;

  const total = periodsCount * periodMinutes;
  const head = `${periodsLabel(periodsCount, periodMinutes)} : ${pluralize(total, "minute")} de jeu`;
  // One period runs 0′→total, so there is nothing to warn about: the continuous clock and a clock
  // that resets are the same clock, and the sentence would only be noise.
  if (periodsCount === 1) return `${head}.`;

  return (
    `${head}, et la ${periodsCount}ᵉ période va de la ${total - periodMinutes}ᵉ ` +
    `à la ${total}ᵉ minute.`
  );
}
