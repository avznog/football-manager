/**
 * The two season figures that divide by minutes: « 1 but encaissé toutes les X min », and the impact per
 * position. Only the second is shrunk before it is ranked (decision 162); the first is ranked on its raw
 * value since decision 177.
 *
 * Pure. **No new model**: the impact — and the équipe type's conceded rates, in `sevens.ts` — reuse the
 * Gamma–Poisson fit of `best-seven.ts`: `fitShrinkage` on the `goals` criterion, whose exposure is
 * 60-minute blocks and whose prior strength is measured from the squad and clamped to `[1, 6]` blocks,
 * and its `shrink`. A goal conceded while a man is on the pitch
 * is a Poisson count over his minutes exactly as a goal scored is, so the model fits as it stands; the
 * adapter below only feeds it a different count.
 *
 * ## « 1 but encaissé toutes les X min »
 *
 * Raw since decision 177: minutes over goals conceded, ranked as it stands, and « aucun but encaissé »
 * rather than ∞ for a man who conceded nothing. Decision 162 shrank it per 60 towards the squad's rate so
 * that five clean minutes could not head the table; the owner preferred the real figure, and the
 * tie-break on minutes is what keeps a whole clean match above five clean minutes.
 *
 * Outfield and goalkeeper are two populations: a keeper's minutes in goal are measured against keepers,
 * never pooled with ten outfielders. The outfield figure is `concededWhileOn − concededWhileGk` over
 * `minutes − gkMinutes`, which is exact because the reducer increments both counters in the same
 * `concede()`.
 *
 * ## Impact per position (the owner's Q7)
 *
 * « Goal difference while he played that position, per 60′, smoothed. » It is computed as **two**
 * shrunk Poisson rates — goals for per 60 and goals against per 60, each fitted over the players who
 * held that position — and their difference. Shrinking the two counts separately is what lets the
 * existing model be reused (a difference of counts is not Poisson and can be negative), and it is the
 * better estimate anyway: a man's ten minutes at a position pull both of his rates towards the
 * position's own, so his difference lands near the position's mean difference rather than on « +6 ».
 */

import {
  fitShrinkage,
  shrink,
  type BestSevenCandidate,
  type ShrinkageReport,
} from "./best-seven";
import { POSITION_GROUPS, type PositionGroup } from "./positions";

const MINUTES_PER_BLOCK = 60;

export type RankedMember = {
  teamMemberId: string;
  displayName: string;
  jerseyNumber: number | null;
  hasLeft: boolean;
};

/** A count over minutes, which is all a Poisson fit needs. */
type CountSample = RankedMember & { minutes: number; count: number };

/** `best-seven.ts` takes its own candidate shape; this is the narrowest one that fits it. */
function asCandidate(sample: CountSample): BestSevenCandidate {
  return {
    id: sample.teamMemberId,
    displayName: sample.displayName,
    jerseyNumber: sample.jerseyNumber,
    minutes: sample.minutes,
    goals: sample.count,
    assists: 0,
    cleanMinutes: 0,
    gkMinutes: 0,
    gkCleanMinutes: 0,
    ratingAverage: null,
    ratingCount: 0,
    ratingVariance: null,
    declarations: {},
  };
}

/** The squad's Gamma–Poisson model for one count, fitted the way `bestSeven` fits goals. */
export function fitCountModel(samples: readonly CountSample[]): ShrinkageReport {
  return fitShrinkage(samples.map(asCandidate), "goals", "allPitch");
}

/** His count per 60, shrunk towards the squad's. Null only when the squad has no figure at all. */
export function shrunkPer60(
  count: number,
  minutes: number,
  model: ShrinkageReport,
): number | null {
  const exposure = minutes / MINUTES_PER_BLOCK;
  return shrink(exposure > 0 ? count / exposure : null, exposure, model);
}

/* -------------------------------------------------------------------------- */
/* « 1 but encaissé toutes les X min »                                       */
/* -------------------------------------------------------------------------- */

export type ConcededRateEntry = RankedMember & {
  /** The minutes the rate is over: outfield minutes, or minutes in goal. */
  minutes: number;
  /** Goals conceded in those minutes. */
  conceded: number;
  /**
   * `minutes / conceded`, unrounded — null when he conceded nothing (« aucun but encaissé »), which is
   * the best record there is rather than an infinity to print.
   */
  minutesPerGoal: number | null;
};

export type ConcededRateBoard = {
  /** Every player with minutes in this population, best first. The screen shows five, then the rest. */
  entries: ConcededRateEntry[];
};

/**
 * Best first: the fewest goals conceded per minute on the pitch, **raw** (decision 177). Nobody without
 * minutes is listed.
 *
 * No smoothing: the owner wants « uniquement les vraies valeurs », so a man is ranked on exactly the
 * figure printed beside his name. Among equal rates the longer record ranks first — so among the men who
 * conceded nothing, the most clean minutes lead, and five clean minutes sit below a whole clean match.
 * The comparison is `conceded × other's minutes`, integers both, so two equal rates compare equal
 * without a division rounding them apart.
 */
export function concededRateBoard(rows: readonly CountSample[]): ConcededRateBoard {
  const entries = rows
    .filter((row) => row.minutes > 0)
    .map(
      (row): ConcededRateEntry => ({
        ...memberOf(row),
        minutes: row.minutes,
        conceded: row.count,
        minutesPerGoal: row.count > 0 ? row.minutes / row.count : null,
      }),
    )
    .sort(
      (a, b) =>
        a.conceded * b.minutes - b.conceded * a.minutes ||
        b.minutes - a.minutes ||
        a.displayName.localeCompare(b.displayName, "fr"),
    );
  return { entries };
}

/* -------------------------------------------------------------------------- */
/* Impact per position                                                        */
/* -------------------------------------------------------------------------- */

/** One player's season at one position group. */
export type PositionSeason = {
  group: PositionGroup;
  minutes: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type ImpactEntry = RankedMember & {
  minutes: number;
  goalsFor: number;
  goalsAgainst: number;
  /** The ranked figure: shrunk goals for per 60 minus shrunk goals against per 60. */
  impactPer60: number;
  /** `(goalsFor − goalsAgainst)` per 60 of his own minutes there, unshrunk. */
  rawPer60: number;
};

export type PositionImpact = {
  group: PositionGroup;
  /** Everybody with minutes at this position, best first. The screen shows five, then the rest. */
  entries: ImpactEntry[];
  goalsForModel: ShrinkageReport;
  goalsAgainstModel: ShrinkageReport;
};

/** The two Poisson models of one position: goals for and goals against while a man held it. */
export type PositionModels = { goalsForModel: ShrinkageReport; goalsAgainstModel: ShrinkageReport };

/** Every position's pair of models, fitted over the players who held it — what the impact is shrunk with. */
export function fitPositionModels(
  players: readonly (RankedMember & { positions: readonly PositionSeason[] })[],
): Record<PositionGroup, PositionModels> {
  const models = {} as Record<PositionGroup, PositionModels>;
  for (const group of POSITION_GROUPS) {
    const samples = (count: (season: PositionSeason) => number): CountSample[] =>
      players.flatMap((player) => {
        const season = player.positions.find((position) => position.group === group);
        return season && season.minutes > 0
          ? [{ ...memberOf(player), minutes: season.minutes, count: count(season) }]
          : [];
      });
    models[group] = {
      goalsForModel: fitCountModel(samples((season) => season.goalsFor)),
      goalsAgainstModel: fitCountModel(samples((season) => season.goalsAgainst)),
    };
  }
  return models;
}

/**
 * One man's smoothed impact at one position: shrunk goals for per 60 minus shrunk goals against per 60.
 *
 * **A man with no minutes there gets the position's own mean difference** — `shrink` lands exactly on
 * the squad mean at zero exposure, on both sides — which is the house rule (rule 2 of `best-seven.ts`)
 * rather than a new one: unknown is neither best nor worst. A side whose model has no mean at all (no
 * goal ever, either way, at that position) counts as a zero rate: nothing happened, and that was seen.
 */
export function impactAt(season: PositionSeason | undefined, models: PositionModels): number {
  const minutes = season?.minutes ?? 0;
  const forRate = shrunkPer60(season?.goalsFor ?? 0, minutes, models.goalsForModel);
  const againstRate = shrunkPer60(season?.goalsAgainst ?? 0, minutes, models.goalsAgainstModel);
  return (forRate ?? 0) - (againstRate ?? 0);
}

function memberOf(member: RankedMember): RankedMember {
  return {
    teamMemberId: member.teamMemberId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
    hasLeft: member.hasLeft,
  };
}

/** Every position in `POSITION_GROUPS` order, including the ones nobody has played yet (empty). */
export function impactByPosition(
  players: readonly (RankedMember & { positions: readonly PositionSeason[] })[],
): PositionImpact[] {
  const models = fitPositionModels(players);
  return POSITION_GROUPS.map((group) => {
    const atGroup = players.flatMap((player) => {
      const season = player.positions.find((position) => position.group === group);
      return season && season.minutes > 0 ? [{ player, season }] : [];
    });
    const { goalsForModel, goalsAgainstModel } = models[group];

    const entries = atGroup
      .flatMap(({ player, season }): ImpactEntry[] => {
        const impact = impactAt(season, models[group]);
        return [
          {
            teamMemberId: player.teamMemberId,
            displayName: player.displayName,
            jerseyNumber: player.jerseyNumber,
            hasLeft: player.hasLeft,
            minutes: season.minutes,
            goalsFor: season.goalsFor,
            goalsAgainst: season.goalsAgainst,
            impactPer60: impact,
            rawPer60: ((season.goalsFor - season.goalsAgainst) * MINUTES_PER_BLOCK) / season.minutes,
          },
        ];
      })
      .sort(
        (a, b) =>
          b.impactPer60 - a.impactPer60 ||
          b.minutes - a.minutes ||
          a.displayName.localeCompare(b.displayName, "fr"),
      );

    return {
      group,
      entries,
      goalsForModel,
      goalsAgainstModel,
    };
  });
}
