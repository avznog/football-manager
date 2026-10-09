/**
 * The four équipes types of the cahier des charges (decisions 171 and 172): **offensive**,
 * **défensive**, **7 de légende**, and the **notes** seven the owner kept (Q7).
 *
 * Pure. Every seven is the same machine as before — `solveAssignment`, the exact bitmask DP of
 * `best-seven.ts`, with its positional objective first (slots filled, then filled by a post the coach
 * declared, then by his primary post) and its tie-breaks last (minutes, then shirt). What changes is the
 * **cell**: each slot can now be scored by its own figure, and a cell can carry several figures ranked
 * one after the other (`SquadCell.keys`). That generalises the one special case the old file had — the
 * GB slot reading the keeper's clean-sheet pair — into a rule per seven:
 *
 * | seven      | outfield slots                                         | GB slot                         |
 * |------------|--------------------------------------------------------|---------------------------------|
 * | offensive  | goals per 60, then assists per 60                      | fewest conceded per 60 in goal  |
 * | défensive  | fewest conceded per 60 as an outfielder                | fewest conceded per 60 in goal  |
 * | légende    | impact at that post, AT → AIL → MC → DC                | in goal, never below average    |
 * | notes      | average rating received (the old `ratings` criterion)  | the same                        |
 *
 * **No new model.** Goals and assists are `best-seven.ts`'s own Gamma–Poisson cells (`evaluateSquad`
 * on `goals` and `assists`); conceded rates and impact are S12's (`lib/stats/impact.ts`): the same
 * `fitShrinkage` on the `goals` criterion, fed a different count.
 *
 * ## The order of the keys, which is the order of the cahier's sentences
 *
 * The keys of a seven are compared lexicographically, so a key only ever decides between teams that
 * are equal on every key before it. That is how « on priorise les joueurs de champ … ensuite, parmi
 * ceux qui ont joué au goal » is written: the outfield keys come first and the GB key last, so the DP
 * picks the best outfield six it can (with positions respected) and only then the best keeper among
 * the men left. A man who is both the best scorer and the best keeper plays outfield, as the cahier
 * says.
 *
 * - **Offensive, goals then assists.** The goals key is the shrunk rate **rounded to the tenth the
 *   screen prints** (`GOALS_KEY_RESOLUTION`), and assists break ties at that resolution. Unrounded,
 *   two shrunk rates are never equal, so « puis de passes D » would never decide anything; rounded to
 *   what the reader sees, two men the screen shows as « 0,4/h » are equal scorers for him, and the one
 *   with more assists goes first. A combined figure (goals + k × assists) was the alternative and was
 *   refused: any k lets enough assists outweigh a goal, which is not « buts, puis passes ».
 * - **Légende, attack first.** One key per position group, in the order AT, AIL, MC, DC, GB: the DP
 *   maximises the striker's impact first, then the wingers', and so on down to the goal. This is the
 *   cahier's fill order **without** greedy's failure: the positional objective still comes first, so
 *   the attack can never take a man the defence needed to have its posts declared, and within a group
 *   of two slots (two DC, two AIL) the pair is still chosen exactly. `best-seven.test.ts` keeps its
 *   proof that greedy loses on the criterion total; under lexicographic keys that test does not apply,
 *   because a tier-by-tier fill *is* the objective — what remains of greedy's defect is the positional
 *   one, and the DP still avoids it.
 *
 * ## Who may keep goal
 *
 * In all three new sevens the GB slot goes to **somebody who has played in goal** (`gkMinutes > 0`),
 * outfielders included — « parmi ceux qui ont joué au goal ». The others are refused there
 * (`allowed: false`), unless nobody has any minutes in goal at all, in which case nobody is refused and
 * the slot is filled by position and tie-breaks. In the légende a keeper is also refused when his
 * shrunk conceded rate is **worse than the squad's average keeper** (Q8): the pooled rate of everybody
 * who has kept goal. The pooled rate is a weighted mean of the keepers' own rates, so at least one of
 * them is at or below it and the slot can always be filled.
 */

import {
  candidateOrder,
  evaluateSquad,
  solveAssignment,
  type BestSevenCandidate,
  type BestSevenSlot,
  type ObservedFigure,
  type ShrinkageReport,
  type SlotFit,
  type SquadCell,
} from "./best-seven";
import {
  fitCountModel,
  fitPositionModels,
  impactAt,
  shrunkPer60,
  type PositionSeason,
} from "./impact";
import { positionGroupOf, type PositionGroup } from "./positions";

/* -------------------------------------------------------------------------- */
/* Inputs and outputs                                                         */
/* -------------------------------------------------------------------------- */

export const SEVEN_KINDS = ["offensive", "defensive", "legende", "notes"] as const;
export type SevenKind = (typeof SEVEN_KINDS)[number];

/** What a cell's figure is, which is what the screen formats it as. */
export type SevenFigure = "goals" | "keeperConceded" | "outfieldConceded" | "impact" | "ratings";

/** A candidate with the season figures the new sevens read on top of `best-seven.ts`'s. */
export type SevenCandidate = BestSevenCandidate & {
  /** `minutes − gkMinutes`. */
  outfieldMinutes: number;
  /** `concededWhileOn − concededWhileGk`. */
  concededOutfield: number;
  concededWhileGk: number;
  /** Per position group, from `match_player_positions` (decision 160). */
  positions: readonly PositionSeason[];
};

/** The raw record behind a cell. `secondary` is assists on a goals cell and goals against on impact. */
export type SevenObserved = ObservedFigure & { secondary?: number };

export type SevenCell = SquadCell & {
  figure: SevenFigure;
  observed: SevenObserved;
  /** Always present here, so the screen can say why a man cannot go in goal. */
  allowed: boolean;
};

export type SevenPick = {
  slotId: string;
  positionCode: string;
  player: { id: string; displayName: string; jerseyNumber: number | null } | null;
  fit: SlotFit;
  cell: SevenCell | null;
};

export type SevenResult = {
  kind: SevenKind;
  /** The candidates in the DP's order; `cells` is indexed on this array. */
  candidates: SevenCandidate[];
  /** `cells[candidateIndex][slotIndex]`. */
  cells: SevenCell[][];
  /** In slot order. */
  picks: SevenPick[];
  outOfPositionCount: number;
  /** The keeper model, for the « moyenne des gardiens » sentence. Null on `notes`. */
  keeperModel: ShrinkageReport | null;
  /** Men with minutes in goal; and, in the légende, how many of them were refused (Q8). */
  keepersConsidered: number;
  keepersRefused: number;
  /** The notes seven keeps its own report, for `shrinkageSentenceFr`. */
  ratingsModel: ShrinkageReport | null;
};

/** Two goal rates the screen prints alike are equal for the reader: it prints them to the tenth. */
export const GOALS_KEY_RESOLUTION = 0.1;

/** Légende: the order the cahier fills the posts in. */
const LEGEND_ORDER: readonly PositionGroup[] = ["AT", "AIL", "MC", "DC", "GB"];

/** Within this much of the keepers' average, a keeper is not « worse » than it (float noise). */
const KEEPER_EPSILON = 1e-9;

/* -------------------------------------------------------------------------- */
/* The machine                                                                */
/* -------------------------------------------------------------------------- */

export function solveSeven(
  kind: SevenKind,
  input: { candidates: readonly SevenCandidate[]; slots: readonly BestSevenSlot[] },
): SevenResult {
  const candidates = [...input.candidates].sort(candidateOrder);
  const { slots } = input;
  const built = buildCells(kind, candidates, slots);
  const assignment = solveAssignment(built.cells, candidates, slots.length);

  const picks: SevenPick[] = slots.map((slot, slotIndex) => {
    const index = assignment.slotToCandidate[slotIndex];
    if (index < 0) {
      return { slotId: slot.id, positionCode: slot.positionCode, player: null, fit: "none", cell: null };
    }
    const candidate = candidates[index];
    const cell = built.cells[index][slotIndex];
    return {
      slotId: slot.id,
      positionCode: slot.positionCode,
      player: { id: candidate.id, displayName: candidate.displayName, jerseyNumber: candidate.jerseyNumber },
      fit: cell.fit,
      cell,
    };
  });

  return {
    kind,
    candidates,
    cells: built.cells,
    picks,
    outOfPositionCount: picks.filter((pick) => pick.player !== null && pick.fit === "none").length,
    keeperModel: built.keeperModel,
    keepersConsidered: built.keepersConsidered,
    keepersRefused: built.keepersRefused,
    ratingsModel: built.ratingsModel,
  };
}

/* -------------------------------------------------------------------------- */
/* The cells, seven by seven                                                  */
/* -------------------------------------------------------------------------- */

function buildCells(
  kind: SevenKind,
  candidates: readonly SevenCandidate[],
  slots: readonly BestSevenSlot[],
): {
  cells: SevenCell[][];
  keeperModel: ShrinkageReport | null;
  keepersConsidered: number;
  keepersRefused: number;
  ratingsModel: ShrinkageReport | null;
} {
  const fitOf = (candidate: SevenCandidate, slot: BestSevenSlot): SlotFit =>
    candidate.declarations[slot.positionCode] ?? "none";

  if (kind === "notes") {
    const evaluation = evaluateSquad(candidates, slots, "ratings");
    return {
      cells: evaluation.cells.map((row) =>
        row.map((cell) => ({ ...cell, figure: "ratings" as const, allowed: true })),
      ),
      keeperModel: null,
      keepersConsidered: 0,
      keepersRefused: 0,
      ratingsModel: evaluation.shrinkage,
    };
  }

  /* ---- the keeper: shared by the three new sevens ------------------------ */

  const keepers = candidates.filter((candidate) => candidate.gkMinutes > 0);
  const keeperModel = fitCountModel(
    keepers.map((candidate) => ({
      ...identityOf(candidate),
      minutes: candidate.gkMinutes,
      count: candidate.concededWhileGk,
    })),
  );
  const keeperRate = (candidate: SevenCandidate) =>
    shrunkPer60(candidate.concededWhileGk, candidate.gkMinutes, keeperModel);
  const keeperAverage = keeperModel.squadMean;
  /** Q8, légende only: worse than the average keeper is refused. */
  const belowAverage = (candidate: SevenCandidate) => {
    const rate = keeperRate(candidate);
    return keeperAverage !== null && rate !== null && rate > keeperAverage + KEEPER_EPSILON;
  };
  const anyKeeper = keepers.length > 0;
  const mayKeep = (candidate: SevenCandidate) =>
    !anyKeeper || (candidate.gkMinutes > 0 && !(kind === "legende" && belowAverage(candidate)));
  const keepersRefused = kind === "legende" ? keepers.filter(belowAverage).length : 0;

  const keeperCell = (candidate: SevenCandidate, slot: BestSevenSlot, keys: number[]): SevenCell => {
    const rate = keeperRate(candidate);
    return {
      fit: fitOf(candidate, slot),
      figure: "keeperConceded",
      // No minutes in goal, no keeper figure: the squad's average printed under an outfielder's name in
      // the goal picker would read as his own record in goal. The DP never ranks him there anyway.
      adjusted: candidate.gkMinutes > 0 ? rate : null,
      observed: observedCount(candidate.concededWhileGk, candidate.gkMinutes),
      figureSource: "goalkeeper",
      keys,
      allowed: mayKeep(candidate),
    };
  };

  /* ---- offensive ---------------------------------------------------------- */

  if (kind === "offensive") {
    const goals = evaluateSquad(candidates, slots, "goals");
    const assists = evaluateSquad(candidates, slots, "assists");
    const cells = candidates.map((candidate, c) =>
      slots.map((slot, s): SevenCell => {
        if (slot.isGoalkeeper) {
          return keeperCell(candidate, slot, [0, 0, -(keeperRate(candidate) ?? 0)]);
        }
        const goalCell = goals.cells[c][s];
        const assistCell = assists.cells[c][s];
        const goalRate = goalCell.adjusted ?? 0;
        return {
          ...goalCell,
          figure: "goals",
          observed: { ...goalCell.observed, secondary: candidate.assists },
          keys: [Math.round(goalRate / GOALS_KEY_RESOLUTION), assistCell.adjusted ?? 0, 0],
          allowed: true,
        };
      }),
    );
    return { cells, keeperModel, keepersConsidered: keepers.length, keepersRefused, ratingsModel: null };
  }

  /* ---- défensive ---------------------------------------------------------- */

  if (kind === "defensive") {
    const outfield = candidates.filter((candidate) => candidate.outfieldMinutes > 0);
    const outfieldModel = fitCountModel(
      outfield.map((candidate) => ({
        ...identityOf(candidate),
        minutes: candidate.outfieldMinutes,
        count: candidate.concededOutfield,
      })),
    );
    const cells = candidates.map((candidate) =>
      slots.map((slot): SevenCell => {
        if (slot.isGoalkeeper) {
          return keeperCell(candidate, slot, [0, -(keeperRate(candidate) ?? 0)]);
        }
        const rate = shrunkPer60(candidate.concededOutfield, candidate.outfieldMinutes, outfieldModel);
        return {
          fit: fitOf(candidate, slot),
          figure: "outfieldConceded",
          adjusted: rate,
          observed: observedCount(candidate.concededOutfield, candidate.outfieldMinutes),
          figureSource: "allPitch",
          keys: [-(rate ?? 0), 0],
          allowed: true,
        };
      }),
    );
    return { cells, keeperModel, keepersConsidered: keepers.length, keepersRefused, ratingsModel: null };
  }

  /* ---- légende ------------------------------------------------------------ */

  const models = fitPositionModels(
    candidates.map((candidate) => ({ ...identityOf(candidate), positions: candidate.positions })),
  );
  const keyIndex = (group: PositionGroup) => LEGEND_ORDER.indexOf(group);
  const cells = candidates.map((candidate) =>
    slots.map((slot): SevenCell => {
      const keys = LEGEND_ORDER.map(() => 0);
      if (slot.isGoalkeeper) {
        keys[keyIndex("GB")] = -(keeperRate(candidate) ?? 0);
        return keeperCell(candidate, slot, keys);
      }
      const group = positionGroupOf(slot.positionCode);
      const season = group ? candidate.positions.find((position) => position.group === group) : undefined;
      const impact = group ? impactAt(season, models[group]) : null;
      if (group !== null && impact !== null) keys[keyIndex(group)] = impact;
      return {
        fit: fitOf(candidate, slot),
        figure: "impact",
        adjusted: impact,
        observed: {
          ...observedCount(season?.goalsFor ?? 0, season?.minutes ?? 0),
          secondary: season?.goalsAgainst ?? 0,
        },
        figureSource: "allPitch",
        keys,
        allowed: true,
      };
    }),
  );
  return { cells, keeperModel, keepersConsidered: keepers.length, keepersRefused, ratingsModel: null };
}

function identityOf(candidate: SevenCandidate) {
  return {
    teamMemberId: candidate.id,
    displayName: candidate.displayName,
    jerseyNumber: candidate.jerseyNumber,
    hasLeft: false,
  };
}

/** A count over minutes, as an `ObservedFigure` per 60. */
function observedCount(count: number, minutes: number): SevenObserved {
  const exposure = minutes / 60;
  return {
    rate: exposure > 0 ? count / exposure : null,
    numerator: count,
    denominator: minutes,
    denominatorUnit: "minutes",
    exposure,
  };
}
