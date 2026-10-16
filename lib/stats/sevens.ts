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
 * | seven      | outfield slots                                          | GB slot                        |
 * |------------|---------------------------------------------------------|--------------------------------|
 * | offensive  | the **team's** goals per 60 while he is on, shrunk       | fewest conceded per 60 in goal |
 * | défensive  | fewest conceded per 60 as an outfielder                 | fewest conceded per 60 in goal |
 * | légende    | **one criterion per post**, see below, AT → AIL → MC → DC | in goal, never below average  |
 * | notes      | average rating received (the old `ratings` criterion)   | the same                       |
 *
 * ## What « la meilleure attaque » counts, and why it is not his own goals
 *
 * The owner's words: « pour la meilleure attaque, il faut que ce soit les joueurs, qui, lorsqu'à chaque
 * poste, l'équipe marque le plus. » So the offensive seven ranks on `goalsForWhileOn` — the goals **the
 * team** scored while he was on the pitch, over his own minutes — and not on the goals he scored
 * himself. A right back who never shoots and whose presence turns an attack on is the man this seven is
 * looking for, and the old criterion could not see him. His own goals survive as the tie-break, in the
 * only place a tie-break is honest: between two men the screen prints the same waiting time for.
 *
 * ## Légende: one criterion per post, « chaque meilleur à chaque poste »
 *
 * | post | criterion                                                                      |
 * |------|--------------------------------------------------------------------------------|
 * | AT   | **his own goals**, per outfield minute, shrunk — the one figure not read at the post |
 * | AIL  | the team's goals **at AIL**, per minute there, shrunk                          |
 * | MC   | the goal difference **at MC**, per minute there, raw (`rawImpactPer60`)         |
 * | DC   | the goals conceded **at DC**, per minute there, shrunk — fewest wins            |
 * | GB   | fewest conceded in goal, per minute, shrunk, never below the keepers' average   |
 *
 * **AT is the one that cannot be measured at the post, and that is a data-model fact, not a choice.**
 * `match_player_positions` stores `minutes`, `goalsFor` and `goalsAgainst` per position group — the
 * **team's** goals, both ways, never the player's own. There is nowhere in this schema that says « he
 * scored this one while he was playing AT », so « attaquant → plus de buts marqués » is his season's
 * goals over his outfield minutes, and the copy says « ses buts » rather than « ses buts à ce poste ».
 * The other four are read at the post, from `PositionSeason`.
 *
 * **No new model.** Every shrunk rate above is `fitCountModel` / `shrunkPer60` (`lib/stats/impact.ts`)
 * — the same `fitShrinkage` on the `goals` criterion, fed a different count over a different stretch of
 * minutes. **The impact is not a model at all since decision 198** — it is the raw goal difference per
 * 60 at the post, which is what the owner reads in the table on `/stats`, and the two screens may not
 * print different numbers for the same man at the same post. Each of the légende's shrunk criteria is
 * fitted over **its own population**: the men with minutes at that post, never the whole squad, because
 * the squad mean a thin record is pulled towards has to be the mean of the thing being measured.
 *
 * ## « Relativiser avec le nombre de minutes », which is the shrinkage and not a threshold
 *
 * « Si je joue 5 mn, et qu'il y a 8 buts, ça n'est pas représentatif » — the Gamma–Poisson shrinkage is
 * the answer, and it is continuous: five minutes is pulled almost all the way back to the mean and
 * fifteen a little less. There is no minimum-minutes gate anywhere here, and decision 187's note says
 * why the owner refused one.
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
 * - **Offensive, the team's goals then his own.** The first key is the shrunk team rate **as the screen
 *   prints it**: the whole minutes between two of the team's goals while he is on (`scoringKey`, and
 *   `minutesPerCount` is the one conversion). Unrounded, two shrunk rates are never equal, so a second
 *   key would never decide anything; at the resolution the reader sees, two men both shown « 1 but
 *   toutes les 133′ » are equally good for the attack, and the one who scored more of those goals
 *   himself goes first. **Assists are not a key any more**: there are five in the whole season, so they
 *   cannot rank anybody, and the owner's sentence about this seven does not mention them. A combined
 *   figure (team goals + k × his own) is refused for the reason it always was: any k lets the second
 *   figure outweigh the first, which is not « puis ».
 * - **Légende, attack first.** Two keys per position group, in the order AT, AIL, MC, DC, GB: the DP
 *   maximises the striker's figure first, then the wingers', and so on down to the goal. This is the
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
  minutesPerCount,
  rawImpactPer60,
  shrunkPer60,
  type PositionSeason,
} from "./impact";
import { positionGroupOf, type PositionGroup } from "./positions";

/* -------------------------------------------------------------------------- */
/* Inputs and outputs                                                         */
/* -------------------------------------------------------------------------- */

export const SEVEN_KINDS = ["offensive", "defensive", "legende", "notes"] as const;
export type SevenKind = (typeof SEVEN_KINDS)[number];

/**
 * What a cell's figure is, which is what the screen formats it as.
 *
 * `goals` is the man's own goals; `teamGoalsFor` is **the team's**, scored while he was on — two
 * different claims that happen to be printed in the same unit, so they are two names and never one.
 */
export type SevenFigure =
  | "goals"
  | "teamGoalsFor"
  | "keeperConceded"
  | "outfieldConceded"
  | "impact"
  | "ratings";

/** A candidate with the season figures the new sevens read on top of `best-seven.ts`'s. */
export type SevenCandidate = BestSevenCandidate & {
  /** `minutes − gkMinutes`. */
  outfieldMinutes: number;
  /** `concededWhileOn − concededWhileGk`. */
  concededOutfield: number;
  concededWhileGk: number;
  /**
   * The goals **the team** scored while he was on the pitch — `goalsForWhileOn`, never his own
   * `goals`. The offensive seven ranks on this.
   */
  goalsForWhileOn: number;
  /** Per position group, from `match_player_positions` (decision 160). */
  positions: readonly PositionSeason[];
};

/**
 * The raw record behind a cell. `secondary` is his own goals on a `teamGoalsFor` cell and the goals
 * against on an `impact` one.
 */
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

/**
 * Worse than any waiting time the screen can print, for a man with no goal rate at all.
 *
 * The key is `−minutes between two goals`, so « never » has to be a very large wait rather than a
 * missing one — and it has to be finite: seven of them are summed. A shrunk rate is zero only when the
 * whole squad's is, so this is reached on a selection where nobody has scored.
 */
const NEVER_SCORES_KEY = -1e9;

/** The goals key: the waiting time the screen prints, negated so that the shortest wait wins. */
export function scoringKey(ratePer60: number | null): number {
  if (ratePer60 === null || ratePer60 <= 0) return NEVER_SCORES_KEY;
  return -minutesPerCount(ratePer60);
}

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
  const picks = assignmentToPicks(slots, candidates, built.cells, assignment.slotToCandidate);

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

/**
 * A solved assignment, as the picks the screen reads.
 *
 * Exported because the LLM path of decision 204 produces its own `slotToCandidate` — from a model's
 * answer rather than from the DP — and must turn it into picks through this exact function. Two
 * mappings would drift, and the drift would be a disc on the pitch whose figure is not the one the
 * seven claims to rank on.
 */
export function assignmentToPicks(
  slots: readonly BestSevenSlot[],
  candidates: readonly SevenCandidate[],
  cells: readonly SevenCell[][],
  slotToCandidate: readonly number[],
): SevenPick[] {
  return slots.map((slot, slotIndex) => {
    const index = slotToCandidate[slotIndex];
    if (index < 0) {
      return { slotId: slot.id, positionCode: slot.positionCode, player: null, fit: "none", cell: null };
    }
    const candidate = candidates[index];
    const cell = cells[index][slotIndex];
    return {
      slotId: slot.id,
      positionCode: slot.positionCode,
      player: { id: candidate.id, displayName: candidate.displayName, jerseyNumber: candidate.jerseyNumber },
      fit: cell.fit,
      cell,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* The cells, seven by seven                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Exported for the LLM path of decision 204: the model is shown the very matrix the DP would have
 * been scored on, so the two paths rank on the same figures and the screen can print either one's
 * answer with the same cell under the name.
 */
export function buildCells(
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
    /**
     * The team's goals while he was on, over his own minutes, shrunk towards the squad's rate.
     *
     * Over **all** his minutes, not only his outfield ones: `goalsForWhileOn` counts what the team did
     * whenever he was on the pitch, the goal included, and splitting it would need a numerator this
     * schema does not hold. A keeper's hour in goal is an hour the team was scoring or not.
     */
    const teamModel = fitCountModel(
      candidates
        .filter((candidate) => candidate.minutes > 0)
        .map((candidate) => ({
          ...identityOf(candidate),
          minutes: candidate.minutes,
          count: candidate.goalsForWhileOn,
        })),
    );
    /** His own goals per outfield minute, the tie-break only. */
    const ownGoals = evaluateSquad(candidates, slots, "goals");
    const cells = candidates.map((candidate, c) =>
      slots.map((slot, s): SevenCell => {
        if (slot.isGoalkeeper) {
          return keeperCell(candidate, slot, [0, 0, -(keeperRate(candidate) ?? 0)]);
        }
        const rate = shrunkPer60(candidate.goalsForWhileOn, candidate.minutes, teamModel);
        return {
          fit: fitOf(candidate, slot),
          figure: "teamGoalsFor",
          adjusted: rate,
          observed: {
            ...observedCount(candidate.goalsForWhileOn, candidate.minutes),
            secondary: candidate.goals,
          },
          figureSource: "allPitch",
          keys: [scoringKey(rate), ownGoals.cells[c][s].adjusted ?? 0, 0],
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

  /**
   * One criterion per post (the table at the top of this file), and **two keys per post** since
   * decision 198: whether he has played it at all, then his figure there.
   *
   * The first key is the house rule « unknown is neither best nor worst », stated in the one way that
   * does not invent a number. A man with no minute at the post has **no figure at all** — the impact is
   * raw, and the three shrunk criteria are fitted over the men who have played the post, so neither has
   * a mean that is *his* to print. A bare `0` in its place would promote him above every real record
   * below zero (or every real conceded rate above zero), putting a disc reading « — » in a seven whose
   * whole claim is « le meilleur à ce poste ».
   *
   * The second key is always « more is better », so the two conceded criteria are negated: fewest
   * conceded at DC, fewest conceded in goal.
   */
  const strikerModel = fitCountModel(
    candidates
      .filter((candidate) => candidate.outfieldMinutes > 0)
      .map((candidate) => ({
        ...identityOf(candidate),
        minutes: candidate.outfieldMinutes,
        count: candidate.goals,
      })),
  );
  /**
   * AT: his own goals per outfield minute. **Not measured at the post**, because
   * `match_player_positions` holds only the team's goals for and against per position group and never
   * the player's own — see this file's header. The post's minutes are therefore not the denominator
   * here; his outfield minutes are.
   */
  const strikerRate = (candidate: SevenCandidate) =>
    candidate.outfieldMinutes > 0
      ? shrunkPer60(candidate.goals, candidate.outfieldMinutes, strikerModel)
      : null;
  /** AIL: the team's goals at AIL. DC: the goals conceded at DC. Both per minute there, both shrunk. */
  const wingerRate = fitGroupRate(candidates, "AIL", (season) => season.goalsFor);
  const centreBackRate = fitGroupRate(candidates, "DC", (season) => season.goalsAgainst);

  const keyIndex = (group: PositionGroup) => LEGEND_ORDER.indexOf(group) * 2;
  const cells = candidates.map((candidate) =>
    slots.map((slot): SevenCell => {
      const keys = LEGEND_ORDER.flatMap(() => [0, 0]);
      if (slot.isGoalkeeper) {
        keys[keyIndex("GB")] = candidate.gkMinutes > 0 ? 1 : 0;
        keys[keyIndex("GB") + 1] = -(keeperRate(candidate) ?? 0);
        return keeperCell(candidate, slot, keys);
      }
      const group = positionGroupOf(slot.positionCode);
      const measured = group === null ? null : legendOutfieldCell(candidate, group);
      if (group !== null && measured !== null && measured.adjusted !== null) {
        keys[keyIndex(group)] = 1;
        keys[keyIndex(group) + 1] = measured.key;
      }
      return {
        fit: fitOf(candidate, slot),
        // A slot whose code belongs to no group has no criterion to be judged on; it reads as the
        // impact with no figure, which is what the screen already knows how to print.
        figure: measured?.figure ?? "impact",
        adjusted: measured?.adjusted ?? null,
        observed: measured?.observed ?? observedCount(0, 0),
        figureSource: "allPitch",
        keys,
        allowed: true,
      };
    }),
  );
  return { cells, keeperModel, keepersConsidered: keepers.length, keepersRefused, ratingsModel: null };

  /** The figure, the record and the « more is better » key of one outfield post of the légende. */
  function legendOutfieldCell(
    candidate: SevenCandidate,
    group: PositionGroup,
  ): { figure: SevenFigure; adjusted: number | null; observed: SevenObserved; key: number } {
    const season = seasonAt(candidate, group);
    switch (group) {
      case "AT": {
        const rate = strikerRate(candidate);
        return {
          figure: "goals",
          adjusted: rate,
          observed: observedCount(candidate.goals, candidate.outfieldMinutes),
          key: rate ?? 0,
        };
      }
      case "AIL": {
        const rate = wingerRate(candidate);
        return {
          figure: "teamGoalsFor",
          adjusted: rate,
          observed: observedCount(season?.goalsFor ?? 0, season?.minutes ?? 0),
          key: rate ?? 0,
        };
      }
      case "DC": {
        const rate = centreBackRate(candidate);
        return {
          figure: "outfieldConceded",
          adjusted: rate,
          observed: observedCount(season?.goalsAgainst ?? 0, season?.minutes ?? 0),
          key: -(rate ?? 0),
        };
      }
      case "MC":
      case "GB": {
        // MC is the raw goal difference at the post, decision 198's own figure. GB never reaches this
        // function — a goalkeeper slot is answered above — but a `MC`-shaped default is the honest one
        // for a `GB` code sitting in a non-goalkeeper slot.
        const impact = rawImpactPer60(season);
        return {
          figure: "impact",
          adjusted: impact,
          observed: {
            ...observedCount(season?.goalsFor ?? 0, season?.minutes ?? 0),
            secondary: season?.goalsAgainst ?? 0,
          },
          key: impact ?? 0,
        };
      }
    }
  }
}

/** His season at one post, or undefined when he has never held it. Zero minutes is « never ». */
function seasonAt(candidate: SevenCandidate, group: PositionGroup): PositionSeason | undefined {
  const season = candidate.positions.find((position) => position.group === group);
  return season !== undefined && season.minutes > 0 ? season : undefined;
}

/**
 * A shrunk count-per-60 at one post, fitted over **the men who have played that post** and nobody
 * else.
 *
 * The population matters as much as the arithmetic: the mean a thin record is pulled towards has to be
 * the mean of the same thing. Pooling the whole squad would drag a winger's rate towards a figure that
 * includes men who have never stood there, and the shrinkage would then be stating something about the
 * squad under his name — the defect decision 198 removed from the impact.
 *
 * Returns null for a man with no minute at the post: there is no figure of his to print, and the
 * légende's first key is what orders him.
 */
function fitGroupRate(
  candidates: readonly SevenCandidate[],
  group: PositionGroup,
  count: (season: PositionSeason) => number,
): (candidate: SevenCandidate) => number | null {
  const model = fitCountModel(
    candidates.flatMap((candidate) => {
      const season = seasonAt(candidate, group);
      return season === undefined
        ? []
        : [{ ...identityOf(candidate), minutes: season.minutes, count: count(season) }];
    }),
  );
  return (candidate) => {
    const season = seasonAt(candidate, group);
    return season === undefined ? null : shrunkPer60(count(season), season.minutes, model);
  };
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
