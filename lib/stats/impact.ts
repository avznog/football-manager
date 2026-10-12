/**
 * The two season figures that divide by minutes: « 1 but encaissé toutes les X min », and the impact per
 * position. **Neither is smoothed any more** — the first since decision 177, the second since decision
 * 198.
 *
 * Pure. The Gamma–Poisson fit of `best-seven.ts` is still reached from here (`fitCountModel`,
 * `shrunkPer60`), because the équipe type's conceded rates in `sevens.ts` are shrunk: `fitShrinkage` on
 * the `goals` criterion, whose exposure is 60-minute blocks and whose prior strength is measured from
 * the squad and clamped to `[1, 6]` blocks, and its `shrink`. A goal conceded while a man is on the
 * pitch is a Poisson count over his minutes exactly as a goal scored is, so the model fits as it
 * stands; the adapter below only feeds it a different count.
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
 * ## Impact per position (the owner's Q7, as decision 198 rewrites it)
 *
 * « Goal difference while he held that post, per 60 minutes of his own play, **raw**. »
 *
 *     (goalsFor − goalsAgainst) ÷ minutes × 60
 *
 * and nothing else: `+0 / −0` is exactly `0,0`, and `+1 / −0` in 10′ is `+6,0`. Every figure the screen
 * prints is reproducible by hand from the two counts and the minutes printed beside it.
 *
 * It used to be two shrunk Poisson rates — goals for and goals against, each fitted over the players
 * who held the post — and their difference. The arithmetic was defensible and the screen was not: over
 * three matches the team's own difference is negative, so the shrinkage dragged **every** figure below
 * zero. A man with `+1 / −0` read `−1,8` and a man with `+0 / −0` read `−2,4`, which is not a cautious
 * estimate of his impact, it is a statement about the team printed under his name. The owner read both
 * and rejected the whole construction (2026-10-12).
 *
 * **Where smoothing still applies, and why that is not a contradiction.** Decision 162's reasoning
 * stands everywhere it was aimed: a figure used to *rank* men against each other needs a thin
 * denominator held back, which is why the équipe type's conceded rates (`sevens.ts`) are still shrunk
 * and why the rating leaderboard still has its threshold. This table is not that: it is a per-post
 * record, printed beside its own numerator, denominator and minutes, and a reader who can redo the
 * division is not being asked to trust an estimate. So the rule is about the *print*, not about the
 * statistics — **a figure the reader can check by hand is never smoothed; a figure that only exists to
 * order a list may be.** Decision 198 says it in those terms, so neither entry can be undone by citing
 * the other.
 *
 * A short spell can therefore top a post: Benjamin's ten minutes at `MC` lead it at `+6,0`. The minutes
 * are printed next to the figure, always, and that is what makes it honest rather than hidden.
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

/**
 * A rate per 60 read back as a waiting time: « 1 but toutes les X′ » (decision 199).
 *
 * The one unit the owner reads — « X but every X minutes » are his own words — and the only place the
 * conversion is written, so the figure the équipe type prints and the key it ranks on cannot drift
 * apart: two men the screen shows the same waiting time for are equal for the reader, and the key is
 * this number.
 *
 * Rounded to the whole minute, and never below one: the screen has no use for « toutes les 0′ », and a
 * rate high enough to produce it (more than a goal a minute) is not a thing this app will ever print.
 * The caller owes a rate above zero — « jamais » is not a number of minutes, and the two callers say so
 * in words instead.
 */
export function minutesPerCount(ratePer60: number): number {
  return Math.max(1, Math.round(MINUTES_PER_BLOCK / ratePer60));
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
  /** The ranked figure, raw (decision 198): `(goalsFor − goalsAgainst) ÷ minutes × 60`. */
  impactPer60: number;
};

export type PositionImpact = {
  group: PositionGroup;
  /** Everybody with minutes at this position, best first. The screen shows five, then the rest. */
  entries: ImpactEntry[];
};

/**
 * One man's impact at one position, raw: his goal difference there per 60 minutes of his own play
 * (decision 198).
 *
 * **Null when he has no minute at that post**, and that is the honest answer rather than a cautious one:
 * there is no longer a position mean to stand in for him, and a `0` would be a figure — « l'équipe est à
 * l'équilibre quand il y joue » — about minutes that do not exist. Callers that have to order such a man
 * against men who *have* played there say so themselves (`sevens.ts`, the légende's keys).
 */
export function rawImpactPer60(season: PositionSeason | undefined): number | null {
  if (season === undefined || season.minutes <= 0) return null;
  return ((season.goalsFor - season.goalsAgainst) * MINUTES_PER_BLOCK) / season.minutes;
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
  return POSITION_GROUPS.map((group) => {
    const atGroup = players.flatMap((player) => {
      const season = player.positions.find((position) => position.group === group);
      return season && season.minutes > 0 ? [{ player, season }] : [];
    });

    const entries = atGroup
      .flatMap(({ player, season }): ImpactEntry[] => {
        const impact = rawImpactPer60(season);
        // Unreachable: `atGroup` already kept only the men with minutes there, which is exactly when
        // `rawImpactPer60` has an answer. Narrowed rather than asserted.
        if (impact === null) return [];
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
          },
        ];
      })
      .sort(
        (a, b) =>
          b.impactPer60 - a.impactPer60 ||
          // Equal figures: the longer record first, so « 0,0 en 10′ » sits above « 0,0 en 6′ » rather
          // than being ordered by a name. The same tie-break the conceded board uses.
          b.minutes - a.minutes ||
          a.displayName.localeCompare(b.displayName, "fr"),
      );

    return { group, entries };
  });
}
