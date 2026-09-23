/**
 * The French vocabulary of the calendar, in one place.
 *
 * Hardcoded French with no i18n layer (decision 012). Keeping the strings here rather than inline
 * in the JSX means « Peut-être » is spelled the same on the pinned card, the match page and the
 * WhatsApp reminder — and that a typo is fixed once.
 */

import type { SegmentOption } from "@/components/ui";
import type { AvailabilityStatus, Competition, EntryMode, MatchStatus } from "@/db/schema";

export const COMPETITION_LABELS: Record<Competition, string> = {
  league: "Championnat",
  cup: "Coupe",
  friendly: "Amical",
  tournament: "Tournoi",
};

/** In the order a coach picks them: the league is the common case. */
export const COMPETITION_ORDER: readonly Competition[] = ["league", "cup", "friendly", "tournament"];

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

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  yes: "Dispo",
  no: "Pas dispo",
  maybe: "Peut-être",
};

/**
 * The three segments of the availability control, in the order the owner wrote them:
 * **dispo / pas dispo / peut-être**. `SegmentedControl` was built for exactly this.
 */
export const AVAILABILITY_OPTIONS: readonly SegmentOption<AvailabilityStatus>[] = [
  { value: "yes", label: "Dispo", tone: "success" },
  { value: "no", label: "Pas dispo", tone: "danger" },
  { value: "maybe", label: "Peut-être", tone: "warning" },
];

/** « à domicile » / « à l’extérieur ». */
export function venueSideLabel(isHome: boolean): string {
  return isHome ? "à domicile" : "à l’extérieur";
}

/** « Dom. » / « Ext. » — for a badge on a dense row. */
export function venueSideShortLabel(isHome: boolean): string {
  return isHome ? "Dom." : "Ext.";
}

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
  return `${goalsFor} – ${goalsAgainst}`;
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

/**
 * « 11 présents sur 14 pointés » — the attendance of one session, denominator included.
 *
 * The denominator is the number of players the coach **marked**, never the size of the squad, and
 * the word « pointés » is what says so (decision 020). Without it the demo season's 29 August
 * session reads « 11 présents sur 14 » to a coach who has thirteen players — the fourteenth had left
 * by September, so the figure is right about that night and only the missing word makes it look
 * wrong. Both places that print this line, the calendar row and the coach's marking card, come
 * through here, and `labels.test.ts` pins the two plurals.
 */
export function attendanceCountFr(present: number, marked: number): string {
  return `${pluralize(present, "présent")} sur ${pluralize(marked, "pointé")}`;
}

/**
 * The présences of one session, on a list row — or the fact that there are none.
 *
 * `null` for a session still to come: nothing has happened, so there is nothing to say. But a
 * session that is **over** and was never pointed is a fact of its own, and the row used to print
 * nothing for it, which is how a player ended up scrolling a past session that shows a date, a
 * venue and silence. Silence is not the same statement as « 0 présent sur 13 pointés » — one says
 * the pitch was unplayable and nobody trained, the other says the coach never ticked the list — and
 * the list has room to say which (decision 076).
 *
 * « pas encore », because it stays true: a coach can point a session weeks later, and the card on
 * the session's own page offers exactly that.
 */
export function attendanceLineFr(
  present: number,
  marked: number,
  options: { isPast: boolean },
): string | null {
  if (marked > 0) return attendanceCountFr(present, marked);
  return options.isPast ? "Présences pas encore pointées" : null;
}

/**
 * What a player reads on a past session nobody pointed, where the whole page was otherwise empty.
 *
 * The second sentence is the one worth printing. « Personne n'a été pointé » on its own invites the
 * reading that everybody was absent — which is a real state the demo season also contains, and the
 * two are counted differently: an unpointed session is in nobody's denominator at all (decision 020).
 * A player who trained that evening should not have to wonder whether the app has him down as absent.
 */
export const unmarkedSessionNoteFr =
  "Aucune présence n’a été pointée pour cette séance. Elle ne compte donc dans aucun taux de présence.";

/**
 * What the coach reads where the pointage list will be, on a séance that has not started.
 *
 * The list used to be there, in the present indicative: « Présences », « Tout le monde est là »,
 * « Enregistrer les présences », on a session four days away. One tap put thirteen observations in
 * `training_attendance` about an evening nobody had lived, and `/stats` then said « 3 séances
 * pointées » in a season of two, with Brice at 1/3 instead of 0/2 (decision NNN).
 *
 * Hiding the card would leave a coach looking for it, so the card stays and says when it opens and
 * what to use instead. The second sentence is the one doing the work: it does not just refuse, it
 * points at the tool for the question he is actually asking, which is decision 090's distinction
 * said out loud to the one person who can blur it.
 */
export function attendanceNotOpenFr(minutesBefore: number): string {
  return (
    `Le pointage ouvre ${minutesBefore} minutes avant la séance. ` +
    "D’ici là, ce sont les disponibilités au-dessus qui disent qui vient : " +
    "ce que les joueurs annoncent est une intention, une présence est un fait."
  );
}

/**
 * Why « sur 14 pointés » can sit above a list of thirteen names.
 *
 * The attendance of a session is a fact about that evening and does not change when somebody leaves
 * the club, so the count is taken over the marks (the calendar row counts the same way). The list
 * underneath can only show players who are still in the squad — there is no présent/absent to set
 * for a man who has gone — and a coach counting the rows would otherwise be one short with no way to
 * find out why. That is the whole job of this sentence, and it is only printed when the two differ.
 */
export function departedMarksNoteFr(departed: number): string | null {
  if (departed <= 0) return null;
  return departed === 1
    ? "1 joueur pointé ce soir-là a quitté l’équipe depuis."
    : `${departed} joueurs pointés ce soir-là ont quitté l’équipe depuis.`;
}

/**
 * « 13 réponses sur 13 joueurs » — how far round the squad the question has got.
 *
 * The denominator is named for the same reason it is on `attendanceCountFr`: « 11 sur 13 » alone
 * leaves a coach guessing what the 13 counts. Here it is the players the question was put to, which
 * is the squad, and not the size of the match sheet.
 */
export function availabilityCountFr(answered: number, total: number): string {
  return `${pluralize(answered, "réponse")} sur ${pluralize(total, "joueur")}`;
}

/**
 * The same line once the event has happened: « Avant le match · 11 réponses sur 13 joueurs ».
 *
 * A list of who *said* they would come outlives the question it answered, and on a past event it is
 * the only thing on the screen that is no longer actionable — « Sans réponse : 2 » about a session
 * that finished on Tuesday is not a list to chase, it is a record. Naming the moment is what keeps a
 * reader from taking it for the present tense, and the pages that show it put the card *below* what
 * actually happened (decision 068).
 *
 * « la séance » rather than « l’entraînement » because the card is already inside a training page:
 * the shorter word is the one a coach says, and it does not repeat the page title.
 */
export function availabilitySubtitleFr(
  answered: number,
  total: number,
  past: "match" | "training" | null,
): string {
  const count = availabilityCountFr(answered, total);
  if (past === null) return count;
  return `${past === "match" ? "Avant le match" : "Avant la séance"} · ${count}`;
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
