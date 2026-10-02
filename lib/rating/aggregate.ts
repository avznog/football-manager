/**
 * Player ratings, aggregated — the one place in the repository that answers
 * "what is this player's average".
 *
 * A **pure module**: no database, no `Date.now()`, no React. It takes rating rows and gives back
 * averages, a ranking and the man of the match. That makes it testable against fixtures, and it
 * makes it shareable: the post-match recap (M6) and the season statistics (M5) must not each
 * invent their own arithmetic, or the « meilleure moyenne » of the stats screen would disagree with
 * the « homme du match » of the recap for the same set of rows.
 *
 * Man of the match is **derived, never stored** (decision 007, and `docs/DATA_MODEL.md` §
 * "Derived, never stored"). Nothing here writes anything.
 *
 * ## Rules that neither the plan nor the decision log settled
 *
 * Each is a judgement call, written down because a number nobody can explain is worse than a
 * number that is merely debatable. Each is pinned by a test in `aggregate.test.ts`.
 *
 * 1. **There are no self-ratings to count.** Decision 007 required a player to rate himself and this
 *    module used to expose that note separately as `selfScore`, so the UI could print « il s'est mis
 *    8 ». Decision 137 drops it: a player's figure is the mean of the notes *the others* gave him,
 *    `ratings_no_self` says so in the database, and a row where rater and rated are the same member
 *    is now dropped here as well — not because it would bias the mean, but because it cannot exist,
 *    and a module that silently averaged one in would hide the day something wrote one.
 *
 * 2. **Averages are compared exactly, not as displayed.** `24/3` and `16/2` are the same average
 *    and tie; `22/3` and `7.3` do not, even though both print « 7,3 ». Comparison is integer
 *    cross-multiplication (`sum × count`), so no floating-point crumb can decide a man of the
 *    match, and a tie is a real tie.
 *
 * 3. **A tie is reported as a tie.** `manOfTheMatch` returns *every* player on the top average.
 *    Two names on the recap is the honest answer; picking one by alphabet would invent a winner.
 *
 * 4. **Three notes minimum to be man of the match, and to print a mean at all.** One mate handing out
 *    a 10 must not outrank an 8.4 agreed by nine. The floor was two (decision 025); decision 137
 *    raises it to three and makes it the same floor the match mean uses, because the two cannot
 *    sensibly disagree — a figure too thin to show a player is too thin to crown him. When nobody
 *    reaches it the function returns `null` and the recap says « pas encore assez de notes ».
 *
 * 5. **A player with no rating is not last, he is unrated.** His `average` is `null`, he sorts
 *    after everybody who has one, and he is never eligible for a distinction.
 */

/** One row of `ratings`, reduced to what the arithmetic needs. A full `Rating` is assignable. */
export type RatingRecord = {
  raterMemberId: string;
  ratedMemberId: string;
  /** 0–10 in half-points (decision 137). Rows off the step are ignored — see `aggregateRatings`. */
  score: number;
  /** Present when the records span several matches, as they do for a season aggregate. */
  matchId?: string | null;
};

/** Everything the ratings say about one rated player. */
export type PlayerRatingAggregate = {
  memberId: string;
  /** How many teammates rated him. Never includes a note of his own (rule 1). */
  count: number;
  /** Sum of the scores. Kept so averages can be compared and merged without rounding (rule 2). */
  sum: number;
  /** Exact mean, or null when nobody rated him (rule 5). */
  average: number | null;
  /** `« 7,3 »` — French decimal comma, one decimal. `« — »` when there is no average. */
  averageLabel: string;
  best: number | null;
  worst: number | null;
};

export type RatingAggregate = {
  /** Best average first, then most ratings, then member id — deterministic (see `compareRated`). */
  players: readonly PlayerRatingAggregate[];
  byMember: ReadonlyMap<string, PlayerRatingAggregate>;
  /** Rows counted. */
  ratingCount: number;
  /** Distinct raters, sorted — how many people took part. */
  raterIds: readonly string[];
  /** Mean of every score in the set, or null when there is none. */
  average: number | null;
};

export type AggregateOptions = {
  /**
   * Members who must appear even with no rating — the match sheet, or the squad for a season
   * table. Without it the aggregate only knows the players somebody rated.
   */
  members?: readonly string[] | null;
};

export const RATING_SCORE_MIN = 0;
export const RATING_SCORE_MAX = 10;

/** Half-points (decision 137). The slider's `step`, and `ratings_score_half_step` in the database. */
export const RATING_SCORE_STEP = 0.5;

/**
 * **Three notes before a figure is a figure** (rule 4): the floor under a match mean and under the
 * man of the match, deliberately the same number in both places. It is also `MIN_RATINGS` in
 * `lib/stats/aggregate.ts`, where it guards a season average — « three is the smallest number that
 * needs a second opinion to agree » holds at both scales.
 *
 * It matters most for a match the coach published with notes still owed: two teammates' opinions are
 * not a verdict, and « pas encore assez de notes » is the honest screen.
 */
export const MIN_NOTES_FOR_MEAN = 3;

/**
 * A score the database could not hold is not a score: `ratings_score_range` says 0..10 and
 * `ratings_score_half_step` says the step is a half.
 *
 * The step is checked by `score * 2` being whole rather than with a modulo on `0.5`, because `0.5` is
 * exact in binary floating point and so the doubling is exact too — no tolerance, and the same
 * expression the check constraint uses.
 */
export function isValidScore(score: number): boolean {
  if (!Number.isFinite(score)) return false;
  if (score < RATING_SCORE_MIN || score > RATING_SCORE_MAX) return false;
  return Number.isInteger(score * 2);
}

type Acc = {
  memberId: string;
  count: number;
  sum: number;
  best: number | null;
  worst: number | null;
};

/**
 * Group rating rows by the player they are about.
 *
 * Works for one match or for a whole season: nothing here looks at `matchId`, so the same call
 * gives the recap its per-match averages and the stats screen its per-season ones. Rows whose
 * score is off the scale or off the half-step are dropped rather than trusted, and so is a row where
 * a member rated himself — the column has check constraints, but a fixture or a future import path
 * might not, and under decision 137 a self-note is not a row the mean can reinterpret.
 */
export function aggregateRatings(
  records: readonly RatingRecord[],
  options: AggregateOptions = {},
): RatingAggregate {
  const accumulators = new Map<string, Acc>();
  const raters = new Set<string>();
  let ratingCount = 0;
  let total = 0;

  const accFor = (memberId: string): Acc => {
    const existing = accumulators.get(memberId);
    if (existing) return existing;
    const created: Acc = {
      memberId,
      count: 0,
      sum: 0,
      best: null,
      worst: null,
    };
    accumulators.set(memberId, created);
    return created;
  };

  for (const memberId of options.members ?? []) accFor(memberId);

  for (const record of records) {
    if (!isValidScore(record.score)) continue;
    // Nobody rates himself (rule 1). The member still gets an accumulator — he is rated by others.
    if (record.raterMemberId === record.ratedMemberId) continue;
    const acc = accFor(record.ratedMemberId);
    acc.count += 1;
    acc.sum += record.score;
    acc.best = acc.best === null ? record.score : Math.max(acc.best, record.score);
    acc.worst = acc.worst === null ? record.score : Math.min(acc.worst, record.score);
    raters.add(record.raterMemberId);
    ratingCount += 1;
    total += record.score;
  }

  const players = [...accumulators.values()].map(toAggregate).sort(compareRated);

  return {
    players,
    byMember: new Map(players.map((player) => [player.memberId, player])),
    ratingCount,
    raterIds: [...raters].sort(),
    average: ratingCount === 0 ? null : total / ratingCount,
  };
}

function toAggregate(acc: Acc): PlayerRatingAggregate {
  const average = acc.count === 0 ? null : acc.sum / acc.count;
  return {
    memberId: acc.memberId,
    count: acc.count,
    sum: acc.sum,
    average,
    averageLabel: formatAverage(average),
    best: acc.best,
    worst: acc.worst,
  };
}

/**
 * Best average first; an unrated player last. Ties are broken by the number of notes (a figure
 * agreed by more people comes first) and then by member id, so two identical rows never swap
 * between two renders of the same page.
 */
export function compareRated(a: PlayerRatingAggregate, b: PlayerRatingAggregate): number {
  const byAverage = -compareAverages(a, b);
  if (byAverage !== 0) return byAverage;
  if (a.count !== b.count) return b.count - a.count;
  return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
}

/**
 * Compare two averages **exactly** (rule 2): `a.sum / a.count` against `b.sum / b.count` without
 * ever dividing. Returns a negative number when `a` is the lower average, 0 when they are equal.
 * An unrated player is lower than everybody, including another unrated player (equal).
 */
export function compareAverages(
  a: Pick<PlayerRatingAggregate, "sum" | "count">,
  b: Pick<PlayerRatingAggregate, "sum" | "count">,
): number {
  if (a.count === 0 || b.count === 0) {
    if (a.count === b.count) return 0;
    return a.count === 0 ? -1 : 1;
  }
  const left = a.sum * b.count;
  const right = b.sum * a.count;
  return left < right ? -1 : left > right ? 1 : 0;
}

export type RankOptions = {
  /** Minimum notes received to appear. Defaults to 1 — anybody somebody rated. */
  minRatings?: number;
  /** Keep only the first `limit` players. */
  limit?: number;
};

/**
 * The ranking behind « meilleures moyennes » — and, with `minRatings`, behind the man of the
 * match. Separate from `manOfTheMatch` because M5's season table wants the whole list.
 */
export function rankByAverage(
  aggregate: RatingAggregate,
  options: RankOptions = {},
): readonly PlayerRatingAggregate[] {
  const minRatings = Math.max(1, options.minRatings ?? 1);
  const eligible = aggregate.players
    .filter((player) => player.count >= minRatings)
    .sort(compareRated);
  return options.limit !== undefined ? eligible.slice(0, Math.max(0, options.limit)) : eligible;
}

export type ManOfTheMatch = {
  /** Every player on the top average — more than one when it is a tie (rule 3). */
  members: readonly PlayerRatingAggregate[];
  average: number;
  averageLabel: string;
  tied: boolean;
};

/**
 * The man of the match, derived from the averages (decision 007). `null` when nobody has enough
 * notes to deserve the title (rule 4) — the recap then says that out loud rather than crowning
 * whoever one teammate liked.
 */
export function manOfTheMatch(
  aggregate: RatingAggregate,
  options: { minRatings?: number } = {},
): ManOfTheMatch | null {
  const minRatings = options.minRatings ?? MIN_NOTES_FOR_MEAN;
  const eligible = rankByAverage(aggregate, { minRatings });
  const best = eligible[0];
  if (!best || best.average === null) return null;

  const members = eligible.filter((player) => compareAverages(player, best) === 0);

  return {
    members,
    average: best.average,
    averageLabel: best.averageLabel,
    tied: members.length > 1,
  };
}

/**
 * `7.333…` → `« 7,3 »`. French decimal comma, one decimal, and `« — »` for no average.
 *
 * Done by hand rather than with `Intl.NumberFormat` so the string is identical in every engine and
 * in the unit tests, ICU build or not.
 */
export function formatAverage(average: number | null): string {
  if (average === null || !Number.isFinite(average)) return "—";
  return average.toFixed(1).replace(".", ",");
}

/** `« 7,3 / 10 »` — the long form, for a headline figure. */
export function formatAverageOutOfTen(average: number | null): string {
  if (average === null || !Number.isFinite(average)) return "—";
  return `${formatAverage(average)} / ${RATING_SCORE_MAX}`;
}
