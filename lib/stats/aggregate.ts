/**
 * Season aggregation — pure, and the only place a season number is decided.
 *
 * Input: the per-match lines from `match-lines.ts` (cache or reduction, already resolved), the
 * match sheets, the trainings that were marked, and the ratings the viewer is allowed to see.
 * Output: one row per member plus the team's own tally. No database, no clock, no `Date.now()` —
 * the same season always aggregates to the same numbers, which is what makes them arguable.
 *
 * ## The rules that neither the plan nor the notes settled
 *
 * 1. **A number nobody has yet is `null`, never `0`.** An average rating with no ratings, an
 *    attendance rate with nothing marked: both come out as `null` so the screen can say « pas
 *    encore de données » instead of publishing a zero that reads as a fact. There is exactly one
 *    division in this file and it cannot be by zero.
 *
 * 2. **Attendance is `présent / marqué`, never `présent / effectif`** (decision 020). A player
 *    nobody marked is not an absent player, so he is in neither the numerator nor the denominator.
 *    The denominator travels with the rate so the UI can state it out loud.
 *
 * 3. **"Played" means `minutes > 0`.** The cache stores whole minutes, so that is the only
 *    definition that reads identically whether the line came from the cache or from the log
 *    (`match-lines.ts`). A substitute who came on for the last twenty seconds is on the match
 *    sheet and counted as a selection, but not as an appearance. Rounding a cameo up would inflate
 *    a season, which the reducer already refused to do.
 *
 * 4. **Selections and appearances are different facts, and come from different places.** Titulaire
 *    / remplaçant / supporter is what the coach wrote on the sheet, so it is counted from
 *    `match_squad`. Gardien is not a sheet role — 7-a-side keepers change mid-match — so it is
 *    counted from the lines, as `gkMinutes > 0`.
 *
 * 5. **A goalkeeper clean sheet is `gkMinutes > 0 && concededWhileGk === 0`** (decision 018), a
 *    per-match count. `gkCleanMinutes` is the finer figure that keeps crediting a keeper who was
 *    replaced at half time in a match we then lost.
 *
 * 6. **The scorers do not have to add up to the score** (decision 017). A goal may have no scorer,
 *    so the team's `goalsFor` is counted from the log while `goals` is credited per player, and the
 *    difference is reported as `unattributedGoals` rather than hidden. Never derive one from the
 *    other.
 *
 * 7. **A finished match with nothing logged is counted nowhere.** No events means no score, and a
 *    0-0 would be an invention; it is surfaced as `unrecordedMatches` so the coach knows a retro
 *    entry is owed (decision 013).
 *
 * 8. **Members who have left keep their history.** They are included, flagged `hasLeft`, because a
 *    season table that silently loses a player who scored in September is wrong
 *    (`docs/DATA_MODEL.md`).
 */

import type { SquadRole } from "@/db/schema";

import type { MatchStatLine } from "./match-lines";

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

export type StatsMember = {
  /** `team_members.id`. */
  teamMemberId: string;
  displayName: string;
  jerseyNumber: number | null;
  /** A non-playing coach has a membership but no season of football. */
  isPlayer: boolean;
  hasLeft: boolean;
};

export type MatchScore = { goalsFor: number; goalsAgainst: number };

export type StatsMatch = {
  id: string;
  /** ISO 8601 — display is `lib/calendar/time.ts`'s job, and it pins Europe/Paris. */
  kickoffAt: string;
  opponentName: string;
  isHome: boolean;
  /** The team's own label for the competition (decision 107). */
  competitionLabel: string;
  /** Derived from the log (decision 003). Null when nothing was ever logged (rule 7). */
  score: MatchScore | null;
};

export type SquadAppearanceRow = {
  matchId: string;
  teamMemberId: string;
  role: SquadRole;
};

export type AttendanceMarkRow = {
  teamMemberId: string;
  present: boolean;
};

export type RatingRow = {
  matchId: string;
  ratedMemberId: string;
  score: number;
};

export type SeasonInput = {
  members: readonly StatsMember[];
  /** Finished matches, already filtered by competition. */
  matches: readonly StatsMatch[];
  lines: readonly MatchStatLine[];
  squad: readonly SquadAppearanceRow[];
  /** One row per judged player per session — trainings have no competition (decision 020). */
  attendance: readonly AttendanceMarkRow[];
  /** Already filtered to what this viewer may see (decision 007). */
  ratings: readonly RatingRow[];
  /** Matches whose ratings exist but are hidden from this viewer, so the UI can say why. */
  hiddenRatingMatches?: number;
};

/* -------------------------------------------------------------------------- */
/* Outputs                                                                    */
/* -------------------------------------------------------------------------- */

export type PlayerAppearances = {
  /** On the match sheet, whatever the role. */
  selected: number;
  starter: number;
  substitute: number;
  supporter: number;
  /** Matches with time in the `GB` slot — not a sheet role (rule 4). */
  goalkeeper: number;
};

export type PlayerRating = {
  /** 0–10, un-rounded. Null when nobody has rated them yet (rule 1). */
  average: number | null;
  /** How many ratings the average is built on. */
  count: number;
  /**
   * Population variance of the same scores — how much the team disagreed about this player, or how
   * much he varied from one Sunday to the next. Exposed because an average alone cannot be ranked
   * fairly: `lib/stats/best-seven.ts` shrinks a thin average towards the team's mean, and the
   * strength of that shrinkage is a ratio of within-player spread to between-player spread. Without
   * this field the ranking would have to re-read the ratings, and decision 021's gate would have to
   * be trusted a second time in a second place.
   *
   * Null below two scores (rule 1): one score has no spread, and `0` would claim perfect agreement
   * where there is simply no second opinion. Genuinely `0` when every score is identical — that is
   * a measurement, not a missing number.
   */
  variance: number | null;
};

export type PlayerAttendance = {
  present: number;
  /** Sessions somebody judged them at. The denominator, stated out loud (rule 2). */
  marked: number;
  /** `present / marked`, 0..1. Null when nothing was marked. */
  rate: number | null;
};

export type PlayerSeasonStats = {
  teamMemberId: string;
  displayName: string;
  jerseyNumber: number | null;
  isPlayer: boolean;
  hasLeft: boolean;
  matchesPlayed: number;
  minutes: number;
  appearances: PlayerAppearances;
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesScored: number;
  penaltiesMissed: number;
  fouls: number;
  gkMinutes: number;
  /** Matches kept clean while in goal: `gkMinutes > 0 && concededWhileGk === 0` (rule 5). */
  gkCleanSheets: number;
  gkCleanMinutes: number;
  concededWhileGk: number;
  /** Minutes on the pitch with the sheet still unbroken, every player (decision 011). */
  cleanMinutes: number;
  concededWhileOn: number;
  rating: PlayerRating;
  attendance: PlayerAttendance;
  /** False for a member who appears nowhere in this filtered season. */
  hasData: boolean;
};

export type FormEntry = {
  matchId: string;
  kickoffAt: string;
  opponentName: string;
  isHome: boolean;
  competitionLabel: string;
  goalsFor: number;
  goalsAgainst: number;
  result: "win" | "draw" | "loss";
};

export type TeamSeasonStats = {
  /** Matches with a recorded score. */
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  /** Matches we conceded nothing in — the team's clean sheets, not a keeper's. */
  cleanSheets: number;
  /** Points per the usual 3/1/0, purely informative: there is no league table (`docs/PLAN.md`). */
  points: number;
  /** Goals with nobody credited (decision 017, rule 6). */
  unattributedGoals: number;
  /** Most recent first, at most `FORM_LENGTH`. */
  form: FormEntry[];
  /** Finished matches with an empty log: counted nowhere (rule 7). */
  unrecordedMatches: number;
};

export type LeaderboardEntry = {
  teamMemberId: string;
  displayName: string;
  jerseyNumber: number | null;
  hasLeft: boolean;
  value: number;
  /** Secondary figure, e.g. the number of ratings behind an average. */
  count: number;
};

export type SeasonStats = {
  team: TeamSeasonStats;
  /** Every member with something to show, plus every active player. Sorted by minutes. */
  players: PlayerSeasonStats[];
  topScorers: LeaderboardEntry[];
  topAssists: LeaderboardEntry[];
  /** Best average received, over `MIN_RATINGS` ratings at least. */
  topRated: LeaderboardEntry[];
  /** Players who spent time in goal, best clean-sheet record first. */
  keepers: PlayerSeasonStats[];
  /** True when not one match, rating or marked session survives the filter. */
  isEmpty: boolean;
  hiddenRatingMatches: number;
};

/** A form guide is five matches. Enough to see a run, short enough to fit a phone. */
export const FORM_LENGTH = 5;

/**
 * An average over one or two ratings is noise, and putting it at the top of the table would make
 * the leaderboard a lottery. Three is the smallest number that needs a second opinion to agree.
 */
export const MIN_RATINGS = 3;

/** How many rows a leaderboard shows. */
export const LEADERBOARD_SIZE = 5;

/* -------------------------------------------------------------------------- */
/* Small pure helpers, exported because the screen and the tests both want them */
/* -------------------------------------------------------------------------- */

/** `présent / marqué` (decision 020). Null rather than `NaN` when nothing was marked. */
export function attendanceRate(present: number, marked: number): number | null {
  if (marked <= 0) return null;
  return present / marked;
}

/** Null rather than `0` when there is nothing to average (rule 1). */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Mean squared deviation about the set's own mean — the **population** variance, dividing by `n`.
 *
 * `n` and not `n - 1`: these are not a sample of some larger pool of opinions about a player, they
 * are every opinion that exists and that this viewer may read (decision 021). Bessel's correction
 * estimates a population from a sample; there is no population beyond the scores themselves, so
 * correcting for one would inflate the spread of exactly the thin sets — two or three ratings — that
 * the shrinkage it feeds exists to distrust.
 *
 * Null under two values (rule 1): a single score has no spread to measure, and `0` there would read
 * as unanimity. Zero for identical scores, which is the real answer.
 */
export function variance(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
}

export function resultOf(score: MatchScore): "win" | "draw" | "loss" {
  if (score.goalsFor > score.goalsAgainst) return "win";
  if (score.goalsFor < score.goalsAgainst) return "loss";
  return "draw";
}

/* -------------------------------------------------------------------------- */
/* The aggregation                                                            */
/* -------------------------------------------------------------------------- */

type Accumulator = {
  member: StatsMember;
  matchesPlayed: number;
  minutes: number;
  appearances: PlayerAppearances;
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesScored: number;
  penaltiesMissed: number;
  fouls: number;
  gkMinutes: number;
  gkCleanSheets: number;
  gkCleanMinutes: number;
  concededWhileGk: number;
  cleanMinutes: number;
  concededWhileOn: number;
  ratings: number[];
  present: number;
  marked: number;
};

function newAccumulator(member: StatsMember): Accumulator {
  return {
    member,
    matchesPlayed: 0,
    minutes: 0,
    appearances: { selected: 0, starter: 0, substitute: 0, supporter: 0, goalkeeper: 0 },
    goals: 0,
    assists: 0,
    ownGoals: 0,
    penaltiesScored: 0,
    penaltiesMissed: 0,
    fouls: 0,
    gkMinutes: 0,
    gkCleanSheets: 0,
    gkCleanMinutes: 0,
    concededWhileGk: 0,
    cleanMinutes: 0,
    concededWhileOn: 0,
    ratings: [],
    present: 0,
    marked: 0,
  };
}

export function aggregateSeason(input: SeasonInput): SeasonStats {
  const matchIds = new Set(input.matches.map((match) => match.id));

  /* ---- members ----------------------------------------------------------- */

  const accumulators = new Map<string, Accumulator>();
  for (const member of input.members) {
    accumulators.set(member.teamMemberId, newAccumulator(member));
  }
  /**
   * A line, a sheet or a rating may name somebody the member list does not (a membership deleted
   * outright, for instance). Their numbers are still real, so they get a placeholder rather than
   * being silently dropped — a lost goal is worse than an ugly name.
   */
  const accumulatorFor = (teamMemberId: string): Accumulator => {
    const existing = accumulators.get(teamMemberId);
    if (existing) return existing;
    const created = newAccumulator({
      teamMemberId,
      displayName: "Joueur inconnu",
      jerseyNumber: null,
      isPlayer: true,
      hasLeft: true,
    });
    accumulators.set(teamMemberId, created);
    return created;
  };

  /* ---- match sheets: selections (rule 4) --------------------------------- */

  for (const row of input.squad) {
    if (!matchIds.has(row.matchId)) continue;
    const acc = accumulatorFor(row.teamMemberId);
    acc.appearances.selected += 1;
    acc.appearances[row.role] += 1;
  }

  /* ---- lines: everything that happened on the pitch ---------------------- */

  for (const line of input.lines) {
    if (!matchIds.has(line.matchId)) continue;
    const acc = accumulatorFor(line.teamMemberId);

    if (line.minutes > 0) acc.matchesPlayed += 1; // rule 3
    acc.minutes += line.minutes;
    acc.goals += line.goals;
    acc.assists += line.assists;
    acc.ownGoals += line.ownGoals;
    acc.penaltiesScored += line.penaltiesScored;
    acc.penaltiesMissed += line.penaltiesMissed;
    acc.fouls += line.fouls;
    acc.cleanMinutes += line.cleanMinutes;
    acc.concededWhileOn += line.concededWhileOn;
    acc.gkMinutes += line.gkMinutes;
    acc.gkCleanMinutes += line.gkCleanMinutes;
    acc.concededWhileGk += line.concededWhileGk;

    if (line.gkMinutes > 0) {
      acc.appearances.goalkeeper += 1;
      if (line.concededWhileGk === 0) acc.gkCleanSheets += 1; // rule 5
    }
  }

  /* ---- ratings and attendance -------------------------------------------- */

  for (const rating of input.ratings) {
    if (!matchIds.has(rating.matchId)) continue;
    accumulatorFor(rating.ratedMemberId).ratings.push(rating.score);
  }

  for (const mark of input.attendance) {
    const acc = accumulatorFor(mark.teamMemberId);
    acc.marked += 1;
    if (mark.present) acc.present += 1;
  }

  /* ---- shape the players ------------------------------------------------- */

  const players: PlayerSeasonStats[] = [...accumulators.values()]
    .map((acc): PlayerSeasonStats => {
      const hasData =
        acc.appearances.selected > 0 ||
        acc.minutes > 0 ||
        acc.goals > 0 ||
        acc.assists > 0 ||
        acc.ownGoals > 0 ||
        acc.fouls > 0 ||
        acc.penaltiesMissed > 0 ||
        acc.ratings.length > 0 ||
        acc.marked > 0;

      return {
        teamMemberId: acc.member.teamMemberId,
        displayName: acc.member.displayName,
        jerseyNumber: acc.member.jerseyNumber,
        isPlayer: acc.member.isPlayer,
        hasLeft: acc.member.hasLeft,
        matchesPlayed: acc.matchesPlayed,
        minutes: acc.minutes,
        appearances: acc.appearances,
        goals: acc.goals,
        assists: acc.assists,
        ownGoals: acc.ownGoals,
        penaltiesScored: acc.penaltiesScored,
        penaltiesMissed: acc.penaltiesMissed,
        fouls: acc.fouls,
        gkMinutes: acc.gkMinutes,
        gkCleanSheets: acc.gkCleanSheets,
        gkCleanMinutes: acc.gkCleanMinutes,
        concededWhileGk: acc.concededWhileGk,
        cleanMinutes: acc.cleanMinutes,
        concededWhileOn: acc.concededWhileOn,
        rating: {
          average: average(acc.ratings),
          count: acc.ratings.length,
          variance: variance(acc.ratings),
        },
        attendance: {
          present: acc.present,
          marked: acc.marked,
          rate: attendanceRate(acc.present, acc.marked),
        },
        hasData,
      };
    })
    // Everyone with something to show, plus the active players who have nothing yet — a squad list
    // that quietly omits a player who has not been selected reads as a bug. A non-playing coach
    // with nothing recorded is not a row in a player table (rule 8 keeps the departures).
    .filter((player) => player.hasData || (player.isPlayer && !player.hasLeft))
    .sort(comparePlayers("minutes"));

  /* ---- the team ---------------------------------------------------------- */

  const recorded = input.matches.filter(
    (match): match is StatsMatch & { score: MatchScore } => match.score !== null,
  );

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  for (const match of recorded) {
    goalsFor += match.score.goalsFor;
    goalsAgainst += match.score.goalsAgainst;
    if (match.score.goalsAgainst === 0) cleanSheets += 1;
    const result = resultOf(match.score);
    if (result === "win") wins += 1;
    else if (result === "draw") draws += 1;
    else losses += 1;
  }

  const creditedGoals = players.reduce((total, player) => total + player.goals, 0);

  const form: FormEntry[] = [...recorded]
    .sort((a, b) => (a.kickoffAt < b.kickoffAt ? 1 : a.kickoffAt > b.kickoffAt ? -1 : 0))
    .slice(0, FORM_LENGTH)
    .map((match) => ({
      matchId: match.id,
      kickoffAt: match.kickoffAt,
      opponentName: match.opponentName,
      isHome: match.isHome,
      competitionLabel: match.competitionLabel,
      goalsFor: match.score.goalsFor,
      goalsAgainst: match.score.goalsAgainst,
      result: resultOf(match.score),
    }));

  const team: TeamSeasonStats = {
    played: recorded.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    cleanSheets,
    points: wins * 3 + draws,
    // Never negative: a credited goal the team score has not seen would be a bug elsewhere, and
    // reporting « -1 but sans buteur » would be nonsense on this screen.
    unattributedGoals: Math.max(0, goalsFor - creditedGoals),
    form,
    unrecordedMatches: input.matches.length - recorded.length,
  };

  /* ---- leaderboards ------------------------------------------------------ */

  const topScorers = leaderboard(players, {
    valueOf: (player) => player.goals,
    tieBreak: (player) => player.assists,
  });
  const topAssists = leaderboard(players, {
    valueOf: (player) => player.assists,
    tieBreak: (player) => player.goals,
  });
  const topRated = leaderboard(players, {
    valueOf: (player) => player.rating.average ?? 0,
    tieBreak: (player) => player.rating.count,
    countOf: (player) => player.rating.count,
    // Enough ratings to mean something — and an honest 0.0 still belongs in the ranking, which is
    // why this is a predicate rather than "value > 0".
    include: (player) => player.rating.count >= MIN_RATINGS,
  });

  const keepers = players
    .filter((player) => player.gkMinutes > 0)
    .sort(
      (a, b) =>
        b.gkCleanSheets - a.gkCleanSheets ||
        b.gkCleanMinutes - a.gkCleanMinutes ||
        b.gkMinutes - a.gkMinutes ||
        a.displayName.localeCompare(b.displayName, "fr"),
    );

  const isEmpty =
    team.played === 0 &&
    input.lines.length === 0 &&
    input.ratings.length === 0 &&
    players.every((player) => player.attendance.marked === 0);

  return {
    team,
    players,
    topScorers,
    topAssists,
    topRated,
    keepers,
    isEmpty,
    hiddenRatingMatches: input.hiddenRatingMatches ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Sorting and ranking                                                        */
/* -------------------------------------------------------------------------- */

export type PlayerSortKey = "minutes" | "goals" | "assists" | "rating" | "attendance";

export const PLAYER_SORT_KEYS: readonly PlayerSortKey[] = [
  "minutes",
  "goals",
  "assists",
  "rating",
  "attendance",
];

export function isPlayerSortKey(value: string | null | undefined): value is PlayerSortKey {
  return value !== null && value !== undefined && PLAYER_SORT_KEYS.includes(value as PlayerSortKey);
}

/**
 * Descending on the chosen key, with minutes as the first tie-break and the name as the last, so
 * two identical rows never swap between two renders.
 *
 * A player with no value for the key (no rating, nothing marked) sorts last rather than first:
 * `null` is "unknown", and unknown is not "worst" — but it cannot head a ranking either.
 */
export function comparePlayers(key: PlayerSortKey) {
  const valueOf = (player: PlayerSeasonStats): number | null => {
    switch (key) {
      case "goals":
        return player.goals;
      case "assists":
        return player.assists;
      case "rating":
        return player.rating.count > 0 ? player.rating.average : null;
      case "attendance":
        return player.attendance.rate;
      case "minutes":
        return player.minutes;
    }
  };

  return (a: PlayerSeasonStats, b: PlayerSeasonStats): number => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== null && right !== null && left !== right) return right - left;
    if (a.minutes !== b.minutes) return b.minutes - a.minutes;
    return a.displayName.localeCompare(b.displayName, "fr");
  };
}

export function sortPlayers(
  players: readonly PlayerSeasonStats[],
  key: PlayerSortKey,
): PlayerSeasonStats[] {
  return [...players].sort(comparePlayers(key));
}

type LeaderboardSpec = {
  valueOf: (player: PlayerSeasonStats) => number;
  tieBreak: (player: PlayerSeasonStats) => number;
  /** The secondary figure shown next to the value. Defaults to the value itself. */
  countOf?: (player: PlayerSeasonStats) => number;
  /** Who is eligible at all. Defaults to "has a non-zero value". */
  include?: (player: PlayerSeasonStats) => boolean;
};

function leaderboard(
  players: readonly PlayerSeasonStats[],
  spec: LeaderboardSpec,
): LeaderboardEntry[] {
  const { valueOf, tieBreak } = spec;
  const countOf = spec.countOf ?? valueOf;
  const include = spec.include ?? ((player: PlayerSeasonStats) => valueOf(player) > 0);

  return players
    .filter(include)
    .sort(
      (a, b) =>
        valueOf(b) - valueOf(a) ||
        tieBreak(b) - tieBreak(a) ||
        a.displayName.localeCompare(b.displayName, "fr"),
    )
    .slice(0, LEADERBOARD_SIZE)
    .map((player) => ({
      teamMemberId: player.teamMemberId,
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber,
      hasLeft: player.hasLeft,
      value: valueOf(player),
      count: countOf(player),
    }));
}
