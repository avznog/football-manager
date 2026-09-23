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
 * 1. **Self-ratings count.** Decision 007 lets a player rate himself, so his own note is one note
 *    among the others. Excluding it would make the count depend on who happened to be rating, and
 *    silently discarding a row the app asked the player to write is worse than the small bias of
 *    keeping it. `selfScore` exposes it separately so the UI can show « il s'est mis 8 » — the
 *    wording itself lives in `labels.ts`, because it is « tu t'es mis 8 » on the reader's own row.
 *
 * 2. **Averages are compared exactly, not as displayed.** `24/3` and `16/2` are the same average
 *    and tie; `22/3` and `7.3` do not, even though both print « 7,3 ». Comparison is integer
 *    cross-multiplication (`sum × count`), so no floating-point crumb can decide a man of the
 *    match, and a tie is a real tie.
 *
 * 3. **A tie is reported as a tie.** `manOfTheMatch` returns *every* player on the top average.
 *    Two names on the recap is the honest answer; picking one by alphabet would invent a winner.
 *
 * 4. **Two ratings minimum to be man of the match.** One mate handing out a 10 must not outrank an
 *    8.4 agreed by nine. When nobody reaches the minimum the function returns `null` and the recap
 *    says so — a man of the match voted by one person is not a distinction.
 *
 * 5. **A player with no rating is not last, he is unrated.** His `average` is `null`, he sorts
 *    after everybody who has one, and he is never eligible for a distinction.
 */

/** One row of `ratings`, reduced to what the arithmetic needs. A full `Rating` is assignable. */
export type RatingRecord = {
  raterMemberId: string;
  ratedMemberId: string;
  /** Whole number, 0–10 (decision 007). Out-of-range rows are ignored — see `aggregateRatings`. */
  score: number;
  comment?: string | null;
  /** Present when the records span several matches, as they do for a season aggregate. */
  matchId?: string | null;
};

/** Everything the ratings say about one rated player. */
export type PlayerRatingAggregate = {
  memberId: string;
  /** How many teammates rated him, his own note included (rule 1). */
  count: number;
  /** Sum of the scores. Kept so averages can be compared and merged without rounding (rule 2). */
  sum: number;
  /** Exact mean, or null when nobody rated him (rule 5). */
  average: number | null;
  /** `« 7,3 »` — French decimal comma, one decimal. `« — »` when there is no average. */
  averageLabel: string;
  best: number | null;
  worst: number | null;
  /** The note he gave himself, if he rated himself. */
  selfScore: number | null;
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

/** Two notes minimum to be man of the match (rule 4). */
export const MOTM_MIN_RATINGS = 2;

/** A score the database could not hold is not a score: the check constraint says 0..10, integer. */
export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= RATING_SCORE_MIN && score <= RATING_SCORE_MAX;
}

type Acc = {
  memberId: string;
  count: number;
  sum: number;
  best: number | null;
  worst: number | null;
  selfScore: number | null;
};

/**
 * Group rating rows by the player they are about.
 *
 * Works for one match or for a whole season: nothing here looks at `matchId`, so the same call
 * gives the recap its per-match averages and the stats screen its per-season ones. Rows whose
 * score is not a whole 0–10 are dropped rather than trusted — the column has a check constraint,
 * but a fixture or a future import path might not.
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
      selfScore: null,
    };
    accumulators.set(memberId, created);
    return created;
  };

  for (const memberId of options.members ?? []) accFor(memberId);

  for (const record of records) {
    if (!isValidScore(record.score)) continue;
    const acc = accFor(record.ratedMemberId);
    acc.count += 1;
    acc.sum += record.score;
    acc.best = acc.best === null ? record.score : Math.max(acc.best, record.score);
    acc.worst = acc.worst === null ? record.score : Math.min(acc.worst, record.score);
    if (record.raterMemberId === record.ratedMemberId) acc.selfScore = record.score;
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
    selfScore: acc.selfScore,
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
  const minRatings = options.minRatings ?? MOTM_MIN_RATINGS;
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
