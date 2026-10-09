/**
 * Season aggregation — pure, and the only place a season number is decided.
 *
 * Input: the per-match lines from `match-lines.ts` (cache or reduction, already resolved), the
 * match sheets, and the notes of the matches whose means are out.
 * Output: one row per member plus the team's own tally. No database, no clock, no `Date.now()` —
 * the same season always aggregates to the same numbers, which is what makes them arguable.
 *
 * ## The rules that neither the plan nor the notes settled
 *
 * 1. **A number nobody has yet is `null`, never `0`.** An average rating with no ratings comes out
 *    as `null` so the screen can say « pas encore de données » instead of publishing a zero that
 *    reads as a fact. No division in this file can be by zero.
 *
 * 2. *(Retired.)* Attendance — `présent / marqué` — went with the trainings (decision 155). The
 *    number is kept free so the rules below keep the numbers the rest of the code cites.
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
 *
 * 9. **A season of ratings is a run of per-match means, not a bag of notes** (decision 137). The
 *    notes of one match collapse to one figure — the figure the whole team reads on that recap — and
 *    the season average is the mean of those. A match with fewer than `MIN_NOTES_FOR_MEAN` notes
 *    contributes nothing at all: it has no mean to contribute. See `PlayerRating`.
 */

import type { SquadRole } from "@/db/schema";

import { MIN_NOTES_FOR_MEAN } from "@/lib/rating/aggregate";
import { meanOfNotes } from "@/lib/rating/published";
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

/**
 * One note, from one unnamed teammate, about one player, in one match.
 *
 * The rater is deliberately absent: this layer never needs to know who wrote what, and decision 137
 * makes that the coach's business alone. `queries.ts` selects no `rater_member_id` here, and the only
 * thing done with these rows is grouping them by match to take their mean.
 */
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
  /**
   * The notes of the matches whose means are **out** — and of no others. `lib/stats/ratings.ts`
   * decides which those are and `queries.ts` selects nothing from the rest, so there is no filtering
   * left to do here and no way for this module to leak a note it should not have had.
   */
  ratings: readonly RatingRow[];
  /** Matches holding notes that are still waiting on somebody, so the UI can say so. */
  pendingRatingMatches?: number;
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

/**
 * A player's season, in ratings. **One mean per match, then the mean of those** — not the mean of
 * every note ever written about him.
 *
 * That is decision 137's unit, and it changes what two of these three numbers mean. A match where
 * eleven teammates rated him and a match where four did now count the same, which is right: the
 * figure the whole team reads for a match is its mean, and a season is a run of those figures. The
 * old unit let one well-attended Sunday outvote three thin ones.
 */
export type PlayerRating = {
  /** 0–10, un-rounded. Null when no match of his has a mean yet (rule 1). */
  average: number | null;
  /**
   * How many **matches** the average is built on — not how many notes. A match whose mean rests on
   * fewer than `MIN_NOTES_FOR_MEAN` notes is not counted at all: it has no mean to average.
   */
  count: number;
  /**
   * Population variance of the same per-match means — how much he varied from one Sunday to the next.
   * Exposed because an average alone cannot be ranked fairly: `lib/stats/best-seven.ts` shrinks a thin
   * average towards the team's mean, and the strength of that shrinkage is a ratio of within-player
   * spread to between-player spread. Without this field the ranking would have to re-read the notes,
   * and the publication rule would have to be trusted a second time in a second place.
   *
   * Under decision 137 this is **match-to-match variation**, where it used to be rater-to-rater
   * disagreement. It is the better quantity for the shrinkage: form that swings is what makes an
   * average over three matches a poor forecast, and two raters who disagree about one afternoon say
   * nothing about the next one.
   *
   * Null below two matches (rule 1): one figure has no spread, and `0` would claim a metronome where
   * there is simply no second Sunday. Genuinely `0` when every match's mean is identical — that is a
   * measurement, not a missing number.
   */
  variance: number | null;
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
  /** Secondary figure, e.g. the number of rated matches behind an average. */
  count: number;
};

export type SeasonStats = {
  team: TeamSeasonStats;
  /** Every member with something to show, plus every active player. Sorted by minutes. */
  players: PlayerSeasonStats[];
  topScorers: LeaderboardEntry[];
  topAssists: LeaderboardEntry[];
  /** Best average received, over `MIN_RATED_MATCHES` matches at least. */
  topRated: LeaderboardEntry[];
  /** Players who spent time in goal, best clean-sheet record first. */
  keepers: PlayerSeasonStats[];
  /** True when not one match or rating survives the filter. */
  isEmpty: boolean;
  /**
   * How many matches hold notes that are not out yet — identical for every reader (decision 137), and
   * the reason a season average can be one or two matches short of the matches played. The screens
   * say it so that a figure that moves on Thursday does not read as a bug.
   */
  pendingRatingMatches: number;
};

/** A form guide is five matches. Enough to see a run, short enough to fit a phone. */
export const FORM_LENGTH = 5;

/**
 * An average over one or two **matches** is noise, and putting it at the top of the table would make
 * the leaderboard a lottery. Three is the smallest number that needs a second Sunday to agree.
 *
 * It was three *notes* until decision 137, and the rename is the whole of the change: the unit of a
 * season average is now one mean per match, so « sur 3 notes » and « sur 3 matchs » are different
 * thresholds and a constant called `MIN_RATINGS` would have been read as the first while enforcing
 * the second. The three-note floor still exists — it is `MIN_NOTES_FOR_MEAN`, and it guards the mean
 * of a single match rather than of a season.
 */
export const MIN_RATED_MATCHES = 3;

/** How many rows a leaderboard shows. */
export const LEADERBOARD_SIZE = 5;

/* -------------------------------------------------------------------------- */
/* Small pure helpers, exported because the screen and the tests both want them */
/* -------------------------------------------------------------------------- */

/** Null rather than `0` when there is nothing to average (rule 1). */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Mean squared deviation about the set's own mean — the **population** variance, dividing by `n`.
 *
 * `n` and not `n - 1`: these are not a sample of some larger pool of Sundays, they are every match
 * this player has a mean for. Bessel's correction estimates a population from a sample; there is no
 * population beyond the figures themselves, so correcting for one would inflate the spread of exactly
 * the thin sets — two or three matches — that the shrinkage it feeds exists to distrust.
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
  /** matchId → the notes this player received in it. Collapsed to one mean per match at the end. */
  notesByMatch: Map<string, number[]>;
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
    notesByMatch: new Map(),
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

  /* ---- ratings ----------------------------------------------------------- */

  for (const rating of input.ratings) {
    if (!matchIds.has(rating.matchId)) continue;
    const byMatch = accumulatorFor(rating.ratedMemberId).notesByMatch;
    const notes = byMatch.get(rating.matchId);
    if (notes) notes.push(rating.score);
    else byMatch.set(rating.matchId, [rating.score]);
  }

  /* ---- shape the players ------------------------------------------------- */

  const players: PlayerSeasonStats[] = [...accumulators.values()]
    .map((acc): PlayerSeasonStats => {
      /*
       * One figure per match, in the order the matches were given, and only for the matches that have
       * enough notes to have a mean at all. `meanOfNotes` is the same function the recap prints from
       * — rounding to one decimal in exactly one place, so « 7,5 » on the recap and « 7,5 » in the
       * season table are the same arithmetic and cannot drift apart.
       */
      const matchMeans = [...acc.notesByMatch.values()].flatMap((notes) => {
        if (notes.length < MIN_NOTES_FOR_MEAN) return [];
        const mean = meanOfNotes(notes);
        return mean === null ? [] : [mean];
      });

      const hasData =
        acc.appearances.selected > 0 ||
        acc.minutes > 0 ||
        acc.goals > 0 ||
        acc.assists > 0 ||
        acc.ownGoals > 0 ||
        acc.fouls > 0 ||
        acc.penaltiesMissed > 0 ||
        // A note received is something to show even where there are too few for a mean: the row is
        // how he finds out the match exists in the ratings at all.
        acc.notesByMatch.size > 0;

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
          average: average(matchMeans),
          count: matchMeans.length,
          variance: variance(matchMeans),
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
    // Enough rated matches to mean something — and an honest 0.0 still belongs in the ranking, which
    // is why this is a predicate rather than "value > 0".
    include: (player) => player.rating.count >= MIN_RATED_MATCHES,
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

  const isEmpty = team.played === 0 && input.lines.length === 0 && input.ratings.length === 0;

  return {
    team,
    players,
    topScorers,
    topAssists,
    topRated,
    keepers,
    isEmpty,
    pendingRatingMatches: input.pendingRatingMatches ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Sorting and ranking                                                        */
/* -------------------------------------------------------------------------- */

export type PlayerSortKey = "minutes" | "goals" | "assists" | "rating";

export const PLAYER_SORT_KEYS: readonly PlayerSortKey[] = ["minutes", "goals", "assists", "rating"];

export function isPlayerSortKey(value: string | null | undefined): value is PlayerSortKey {
  return value !== null && value !== undefined && PLAYER_SORT_KEYS.includes(value as PlayerSortKey);
}

/**
 * Descending on the chosen key, with minutes as the first tie-break and the name as the last, so
 * two identical rows never swap between two renders.
 *
 * A player with no value for the key (no rating) sorts last rather than first:
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
