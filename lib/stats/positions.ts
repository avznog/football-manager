/**
 * The five positions the statistics speak of, and the one function every per-position figure goes
 * through (decision 162).
 *
 * The cache keeps the slot's own `position_code` as the log had it — `MG`, `MD`, `AIL`, `DG`… — because
 * a cache stores what happened and the catalogue is changing under it (the cahier's Q4: exactly GB, DC,
 * MC, AIL, AT, with « Ailier » `AIL` replacing MG/MD). The screens group here, at read time, so a match
 * played on a 1-2-3-1 with an `MG` and one played after the switch with an `AIL` land in the same
 * « Ailier » row, and so the Q10 mapping (DG/DD → DC; AG/AD/MG/MD → AIL) is written once.
 *
 * Pure, no imports: the statistics layer and the profile card both call it.
 */

/** The groups, in the order a team sheet reads them. */
export const POSITION_GROUPS = ["GB", "DC", "MC", "AIL", "AT"] as const;

export type PositionGroup = (typeof POSITION_GROUPS)[number];

const GROUP_OF: Readonly<Record<string, PositionGroup>> = {
  GB: "GB",
  DC: "DC",
  DG: "DC",
  DD: "DC",
  MC: "MC",
  // The old catalogue's attacking midfielder: a central midfielder for every purpose this app has.
  MOC: "MC",
  AIL: "AIL",
  MG: "AIL",
  MD: "AIL",
  AG: "AIL",
  AD: "AIL",
  AT: "AT",
};

const LABEL_FR: Readonly<Record<PositionGroup, string>> = {
  GB: "Gardien",
  DC: "Défenseur central",
  MC: "Milieu central",
  AIL: "Ailier",
  AT: "Attaquant",
};

/**
 * The group a slot's code belongs to, or **null** for a code this app has never shipped (a team's own
 * formation could in principle carry one). Null rather than a guess: its minutes still count in the
 * player's total, and they are simply not filed under a position the reader would take for a fact.
 */
export function positionGroupOf(code: string): PositionGroup | null {
  return GROUP_OF[code] ?? null;
}

export function positionGroupLabelFr(group: PositionGroup): string {
  return LABEL_FR[group];
}

/** Rank in `POSITION_GROUPS`, for sorting. */
export function positionGroupRank(group: PositionGroup): number {
  return POSITION_GROUPS.indexOf(group);
}
