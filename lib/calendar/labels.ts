/**
 * The French vocabulary of the calendar, in one place.
 *
 * Hardcoded French with no i18n layer (decision 012). Keeping the strings here rather than inline
 * in the JSX means « Peut-être » is spelled the same on the pinned card, the match page and the
 * WhatsApp reminder — and that a typo is fixed once.
 */

import type { SegmentOption } from "@/components/ui";
import type { AvailabilityStatus, Competition, MatchStatus } from "@/db/schema";

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
