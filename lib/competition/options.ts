/**
 * What the match form's « Compétition » `<select>` is allowed to offer.
 *
 * Two rules, and both are about not lying to the coach:
 *
 *  1. **An archived competition is not proposed.** Archiving is how a coach retires « Coupe 2024 »
 *     without deleting the matches that were played in it, so an archived row that kept appearing in
 *     the dropdown would make the control pointless.
 *  2. **Except the one the match being edited already points at.** Otherwise opening « Modifier » on
 *     a cup match from last autumn would silently re-file it under the championship on save — a
 *     screen quietly rewriting a fact nobody touched. It is offered, and it says it is archived.
 *
 * Pure, so Vitest reads it (`lib/**` only).
 */

export type CompetitionSummary = {
  id: string;
  labelFr: string;
  sort: number;
  archived: boolean;
  /** Matches pointing at it. Drives the delete card on `/equipe`; ignored here. */
  matchCount: number;
};

export type CompetitionOption = {
  id: string;
  /** What the `<option>` reads, « (archivée) » included when it applies. */
  labelFr: string;
};

/** `sort` first — the league stays at the top — then the label, so ties are stable and readable. */
function byDisplayOrder(a: CompetitionSummary, b: CompetitionSummary): number {
  if (a.sort !== b.sort) return a.sort - b.sort;
  return a.labelFr.localeCompare(b.labelFr, "fr-FR");
}

export function competitionOptions(
  all: readonly CompetitionSummary[],
  selectedId: string | null = null,
): CompetitionOption[] {
  return [...all]
    .filter((competition) => !competition.archived || competition.id === selectedId)
    .sort(byDisplayOrder)
    .map((competition) => ({
      id: competition.id,
      labelFr: competition.archived ? `${competition.labelFr} (archivée)` : competition.labelFr,
    }));
}

/**
 * The option a new match lands on: the first one offered, which is the lowest `sort` — the league.
 * Null when the team has none, which the form has to say rather than show an empty dropdown.
 */
export function defaultCompetitionId(options: readonly CompetitionOption[]): string | null {
  return options[0]?.id ?? null;
}

/**
 * The chips on `/stats`, which is a different question from the match form's.
 *
 * Only competitions that **have matches**: a chip leading to « Aucun match terminé dans cette
 * sélection » is a filter that exists to disappoint, and a coach who has just created « Coupe 2026 »
 * for next spring does not want it between « Toutes » and his championship. Archived ones stay,
 * marked: last season's cup is precisely the thing a season's statistics are read by.
 */
export function statsFilterOptions(all: readonly CompetitionSummary[]): CompetitionOption[] {
  return [...all]
    .filter((competition) => competition.matchCount > 0)
    .sort(byDisplayOrder)
    .map((competition) => ({
      id: competition.id,
      labelFr: competition.archived ? `${competition.labelFr} (archivée)` : competition.labelFr,
    }));
}

/**
 * The label of an id, or null if the id names nothing — a stale bookmark, a competition deleted
 * since, a hand-typed query string. The caller then falls back to « toutes compétitions » rather
 * than printing a heading about a competition that no longer exists.
 */
export function competitionLabelOf(
  options: readonly CompetitionOption[],
  id: string | null,
): string | null {
  if (id === null) return null;
  return options.find((option) => option.id === id)?.labelFr ?? null;
}
