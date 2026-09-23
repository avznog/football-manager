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
