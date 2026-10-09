/**
 * The two kinds of season figure that divide by minutes and so need shrinking before they are ranked
 * (decision 162): « 1 but encaissé toutes les X min », and the impact per position.
 *
 * Pure. **No new model**: both reuse the Gamma–Poisson fit of `best-seven.ts` — `fitShrinkage` on the
 * `goals` criterion, whose exposure is 60-minute blocks and whose prior strength is measured from the
 * squad and clamped to `[1, 6]` blocks — and its `shrink`. A goal conceded while a man is on the pitch
 * is a Poisson count over his minutes exactly as a goal scored is, so the model fits as it stands; the
 * adapter below only feeds it a different count.
 *
 * ## « 1 but encaissé toutes les X min »
 *
 * The rate is shrunk **per 60** (goals per 60 minutes, towards the squad's pooled rate) and only then
 * turned into minutes per goal, `60 / rate`. Two consequences, both wanted:
 *
 * - **five minutes cannot win.** A man with five clean minutes is pulled almost all the way to the
 *   squad's rate (with `m` ≥ 1 hour, his own five minutes weigh less than a twelfth), so he lands in
 *   the middle of the table rather than on top of it with « ∞ »;
 * - **no infinity is ever printed.** A shrunk rate is never zero while somebody in the squad has
 *   conceded, so the ranked figure is always a number of minutes. The *raw* figure can be « aucun but
 *   encaissé », and the screen prints that sentence beside the ranked one rather than ∞.
 *
 * Outfield and goalkeeper are two populations with two fits: a keeper's minutes in goal are measured
 * against keepers, never pooled with ten outfielders (the same reasoning as rule 4 of `best-seven.ts`).
 * The outfield figure is `concededWhileOn − concededWhileGk` over `minutes − gkMinutes`, which is exact
 * because the reducer increments both counters in the same `concede()`.
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

/** How many names each position's impact table lists. Five positions, three each: one phone screen. */
export const IMPACT_SIZE = 3;

/** How many names a rate table lists — the same as every other leaderboard on `/stats`. */
export const RATE_BOARD_SIZE = 5;

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
  /** Goals conceded in those minutes, raw. */
  conceded: number;
  /** The ranked figure: minutes per goal conceded, after shrinking. Higher is better. */
  minutesPerGoal: number;
  /** The raw figure, `minutes / conceded` — null when he conceded nothing (« aucun but encaissé »). */
  rawMinutesPerGoal: number | null;
};

export type ConcededRateBoard = {
  entries: ConcededRateEntry[];
  /** What the shrinkage did, so the screen can say « ramené vers l'équipe à hauteur de N h ». */
  model: ShrinkageReport;
  /** Players with minutes in this population, ranked or not. */
  considered: number;
};

/**
 * Best first: the most minutes per goal conceded, shrunk. Nobody without minutes is listed. Empty when
 * the squad has conceded nothing at all in this population — every rate would be the squad's zero, and
 * minutes per goal would be infinite for everyone; the screen says « aucun but encaissé » instead.
 */
export function concededRateBoard(
  rows: readonly CountSample[],
  size = RATE_BOARD_SIZE,
): ConcededRateBoard {
  const samples = rows.filter((row) => row.minutes > 0);
  const model = fitCountModel(samples);
  const entries = samples
    .flatMap((row): ConcededRateEntry[] => {
      const rate = shrunkPer60(row.count, row.minutes, model);
      if (rate === null || rate <= 0) return [];
      return [
        {
          teamMemberId: row.teamMemberId,
          displayName: row.displayName,
          jerseyNumber: row.jerseyNumber,
          hasLeft: row.hasLeft,
          minutes: row.minutes,
          conceded: row.count,
          minutesPerGoal: MINUTES_PER_BLOCK / rate,
          rawMinutesPerGoal: row.count > 0 ? row.minutes / row.count : null,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.minutesPerGoal - a.minutesPerGoal ||
        b.minutes - a.minutes ||
        a.displayName.localeCompare(b.displayName, "fr"),
    )
    .slice(0, size);
  return { entries, model, considered: samples.length };
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
  /** Best first, at most `IMPACT_SIZE`. */
  entries: ImpactEntry[];
  /** Everybody with minutes at this position, ranked or not. */
  considered: number;
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
  size = IMPACT_SIZE,
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
      entries: entries.slice(0, size),
      considered: atGroup.length,
      goalsForModel,
      goalsAgainstModel,
    };
  });
}
