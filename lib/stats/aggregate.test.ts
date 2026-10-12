import { describe, expect, it } from "vitest";

import type { MatchStatLine } from "./match-lines";
import {
  FORM_LENGTH,
  LEADERBOARD_SIZE,
  MIN_RATED_MATCHES,
  type PlayerSeasonStats,
  type SeasonInput,
  type StatsMatch,
  type StatsMember,
  aggregateSeason,
  average,
  comparePlayers,
  resultOf,
  sortPlayers,
  variance,
} from "./aggregate";
import { concededCountRowFr, concededRateLineFr, eventRateFr, GOAL_WORDS_FR } from "./format";

/* -------------------------------------------------------------------------- */
/* Fixtures — all hand-written, nothing read from a database                   */
/* -------------------------------------------------------------------------- */

function member(id: string, name: string, extra: Partial<StatsMember> = {}): StatsMember {
  return {
    teamMemberId: id,
    displayName: name,
    jerseyNumber: null,
    isPlayer: true,
    hasLeft: false,
    ...extra,
  };
}

function match(id: string, extra: Partial<StatsMatch> = {}): StatsMatch {
  return {
    id,
    kickoffAt: "2026-09-06T08:30:00.000Z",
    opponentName: "AS Cormeilles",
    isHome: true,
    competitionLabel: "Championnat",
    score: { goalsFor: 1, goalsAgainst: 0 },
    ...extra,
  };
}

/** A zeroed line, so each test only states the fields it is actually about. */
function line(matchId: string, teamMemberId: string, extra: Partial<MatchStatLine> = {}) {
  return {
    matchId,
    teamMemberId,
    minutes: 0,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    penaltiesScored: 0,
    penaltiesMissed: 0,
    fouls: 0,
    gkMinutes: 0,
    cleanMinutes: 0,
    concededWhileOn: 0,
    gkCleanMinutes: 0,
    concededWhileGk: 0,
    goalsForWhileOn: 0,
    squadRole: null,
    ...extra,
  } satisfies MatchStatLine;
}

function season(input: Partial<SeasonInput> = {}) {
  return aggregateSeason({
    members: [],
    matches: [],
    lines: [],
    squad: [],
    ratings: [],
    ...input,
  });
}

const playerNamed = (players: PlayerSeasonStats[], id: string) =>
  players.find((player) => player.teamMemberId === id)!;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

describe("average", () => {
  it("is null for an empty set, not zero", () => {
    expect(average([])).toBeNull();
  });

  it("does not round", () => {
    expect(average([6, 7])).toBe(6.5);
    expect(average([0, 0, 0])).toBe(0);
  });
});

describe("variance", () => {
  it("is null below two values, where there is no spread to measure", () => {
    expect(variance([])).toBeNull();
    expect(variance([7])).toBeNull();
  });

  it("is zero for identical scores — a measurement, not a missing number", () => {
    expect(variance([6, 6, 6])).toBe(0);
    expect(variance([0, 0])).toBe(0);
  });

  it("divides by n, not by n - 1", () => {
    // Mean 7; deviations -2, 0, +2; squares 4, 0, 4 → 8 / 3. A sample variance would say 4.
    expect(variance([5, 7, 9])).toBeCloseTo(8 / 3, 12);
    expect(variance([6, 8])).toBe(1);
  });
});

describe("resultOf", () => {
  it("reads the score from our point of view", () => {
    expect(resultOf({ goalsFor: 3, goalsAgainst: 2 })).toBe("win");
    expect(resultOf({ goalsFor: 1, goalsAgainst: 1 })).toBe("draw");
    expect(resultOf({ goalsFor: 0, goalsAgainst: 4 })).toBe("loss");
  });
});

/* -------------------------------------------------------------------------- */
/* The empty season                                                           */
/* -------------------------------------------------------------------------- */

describe("an empty season", () => {
  it("says so instead of publishing zeros as facts", () => {
    const stats = season({ members: [member("hugo", "Hugo")] });

    expect(stats.isEmpty).toBe(true);
    expect(stats.team.played).toBe(0);
    expect(stats.topScorers).toEqual([]);
    expect(stats.topRated).toEqual([]);
    expect(stats.topConcededGk).toEqual([]);
    expect(stats.scoringRate.entries).toEqual([]);

    // The active player is still listed — a squad that loses its unselected players reads as a bug —
    // but every derived number is null, not zero.
    const hugo = playerNamed(stats.players, "hugo");
    expect(hugo.hasData).toBe(false);
    expect(hugo.rating).toEqual({ average: null, count: 0, variance: null });
  });

  it("leaves out a non-playing coach with nothing recorded", () => {
    const stats = season({
      members: [member("admin", "Admin", { isPlayer: false }), member("hugo", "Hugo")],
    });
    expect(stats.players.map((player) => player.teamMemberId)).toEqual(["hugo"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Selections versus appearances                                              */
/* -------------------------------------------------------------------------- */

describe("a player who was a supporter twice and a starter once", () => {
  const members = [member("gerard", "Gérard")];
  const matches = [match("m1"), match("m2"), match("m3")];
  const squad = [
    { matchId: "m1", teamMemberId: "gerard", role: "supporter" as const },
    { matchId: "m2", teamMemberId: "gerard", role: "supporter" as const },
    { matchId: "m3", teamMemberId: "gerard", role: "starter" as const },
  ];
  const lines = [
    line("m1", "gerard", { squadRole: "supporter" }),
    line("m2", "gerard", { squadRole: "supporter" }),
    line("m3", "gerard", { squadRole: "starter", minutes: 60, goals: 1 }),
  ];

  const gerard = playerNamed(season({ members, matches, squad, lines }).players, "gerard");

  it("counts three selections split by role", () => {
    expect(gerard.appearances).toEqual({
      selected: 3,
      starter: 1,
      substitute: 0,
      supporter: 2,
      goalkeeper: 0,
    });
  });

  it("counts one match played, because the two touchline afternoons were not appearances", () => {
    expect(gerard.matchesPlayed).toBe(1);
    expect(gerard.minutes).toBe(60);
    expect(gerard.goals).toBe(1);
  });
});

describe("a substitute who never came on", () => {
  it("is a selection but not an appearance (rule 3)", () => {
    const stats = season({
      members: [member("momo", "Momo")],
      matches: [match("m1")],
      squad: [{ matchId: "m1", teamMemberId: "momo", role: "substitute" }],
      lines: [line("m1", "momo", { squadRole: "substitute", minutes: 0 })],
    });

    const momo = playerNamed(stats.players, "momo");
    expect(momo.appearances.selected).toBe(1);
    expect(momo.appearances.substitute).toBe(1);
    expect(momo.matchesPlayed).toBe(0);
    expect(momo.hasData).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Goalkeepers                                                                */
/* -------------------------------------------------------------------------- */

describe("goalkeepers", () => {
  // One match, one keeper each half, conceded in the second (decision 018's example).
  const stats = season({
    members: [member("hugo", "Hugo"), member("momo", "Momo")],
    matches: [match("m1", { score: { goalsFor: 2, goalsAgainst: 1 } })],
    squad: [
      { matchId: "m1", teamMemberId: "hugo", role: "starter" },
      { matchId: "m1", teamMemberId: "momo", role: "substitute" },
    ],
    lines: [
      line("m1", "hugo", {
        squadRole: "starter",
        minutes: 30,
        gkMinutes: 30,
        gkCleanMinutes: 30,
        concededWhileGk: 0,
        cleanMinutes: 30,
      }),
      line("m1", "momo", {
        squadRole: "substitute",
        minutes: 30,
        gkMinutes: 30,
        gkCleanMinutes: 10,
        concededWhileGk: 1,
        cleanMinutes: 10,
        concededWhileOn: 1,
      }),
    ],
  });

  it("counts a gardien appearance from the minutes in goal, not from a sheet role (rule 4)", () => {
    expect(playerNamed(stats.players, "hugo").appearances.goalkeeper).toBe(1);
    expect(playerNamed(stats.players, "hugo").appearances.starter).toBe(1);
    expect(playerNamed(stats.players, "momo").appearances.goalkeeper).toBe(1);
  });

  it("gives the clean sheet to the keeper who did not concede, in a match we did", () => {
    expect(playerNamed(stats.players, "hugo").gkCleanSheets).toBe(1);
    expect(playerNamed(stats.players, "momo").gkCleanSheets).toBe(0);
    // The team's own clean-sheet count is a different fact and stays at zero: we conceded.
    expect(stats.team.cleanSheets).toBe(0);
  });

  it("still credits the replaced keeper's clean minutes", () => {
    expect(playerNamed(stats.players, "momo").gkCleanMinutes).toBe(10);
  });

  it("ranks the keepers on what they conceded, fewest first (decision 195)", () => {
    // Hugo conceded nothing in his half hour, so he is first — the old « most conceded » ranking put
    // Momo there and listed Hugo nowhere at all.
    expect(stats.topConcededGk.map((entry) => [entry.teamMemberId, entry.value, entry.count])).toEqual([
      ["hugo", 0, 30],
      ["momo", 1, 30],
    ]);
  });

  it("leaves outfield players out of the two goalkeeping lists", () => {
    const outfield = season({
      members: [member("julien", "Julien")],
      matches: [match("m1")],
      lines: [line("m1", "julien", { minutes: 60 })],
    });
    expect(outfield.topConcededGk).toEqual([]);
    expect(outfield.topGkMinutes).toEqual([]);
    // And he is in the outfield list instead, with his whole hour (decision 196).
    expect(outfield.topOutfieldMinutes.map((entry) => entry.value)).toEqual([60]);
  });
});

/* -------------------------------------------------------------------------- */
/* Ratings                                                                    */
/* -------------------------------------------------------------------------- */

describe("ratings", () => {
  const members = [member("julien", "Julien"), member("karim", "Karim")];
  const matches = [
    match("m1"),
    match("m2", { kickoffAt: "2026-09-13T08:30:00.000Z" }),
    match("m3", { kickoffAt: "2026-09-20T08:30:00.000Z" }),
  ];

  /** `MIN_NOTES_FOR_MEAN` notes of the same value — the cheapest way to give a match a known mean. */
  const notes = (matchId: string, ratedMemberId: string, ...scores: number[]) =>
    scores.map((score) => ({ matchId, ratedMemberId, score }));

  it("averages one mean per match, un-rounded, and counts the matches", () => {
    // Decision 137's unit. Three matches, three means — 8, 6 and 7 — so the season average is 7 over
    // nine notes that are never averaged together: m1's four notes do not outweigh m2's three.
    const stats = season({
      members,
      matches,
      ratings: [
        ...notes("m1", "julien", 7, 8, 8, 9),
        ...notes("m2", "julien", 6, 6, 6),
        ...notes("m3", "julien", 7, 7, 7),
      ],
    });
    expect(playerNamed(stats.players, "julien").rating).toEqual({
      average: 7,
      count: 3,
      // Mean 7; deviations +1, −1, 0 → 2 / 3. Match-to-match variation, not rater disagreement.
      variance: 2 / 3,
    });
    expect(playerNamed(stats.players, "karim").rating).toEqual({
      average: null,
      count: 0,
      variance: null,
    });
  });

  it("ignores a note attached to a match outside the filter", () => {
    const stats = season({
      members,
      matches: [match("m1")],
      ratings: notes("m2", "julien", 9, 9, 9),
    });
    expect(playerNamed(stats.players, "julien").rating.count).toBe(0);
  });

  it("gives no mean at all to a match two people rated", () => {
    // The floor is `MIN_NOTES_FOR_MEAN`, and it is the same number that refuses to crown a man of the
    // match (`lib/rating/aggregate.ts`): a figure too thin to show is too thin to average. m2 has two
    // notes, so it contributes nothing — not a mean of 2, which would halve his season.
    const stats = season({
      members,
      matches,
      ratings: [...notes("m1", "julien", 8, 8, 8), ...notes("m2", "julien", 2, 2)],
    });
    expect(playerNamed(stats.players, "julien").rating).toEqual({
      average: 8,
      count: 1,
      variance: null,
    });
    // He still has a row: a note received is something to show, even where there are too few of them.
    expect(playerNamed(stats.players, "julien").hasData).toBe(true);
  });

  it("measures the spread over the matches in the filter, and no others", () => {
    // `queries.ts` never reads a score from an unpublished match (decision 137), so an unpublished
    // one simply is not in this input. What must not happen is the *matches* filter leaking into the
    // spread: m2's 2s are dropped here, and a variance that still counted them would be 9, not 0.
    const stats = season({
      members,
      matches: [match("m1"), match("m2", { kickoffAt: "2026-09-13T08:30:00.000Z" })],
      ratings: [
        ...notes("m1", "julien", 8, 8, 8),
        ...notes("m2", "julien", 8, 8, 8),
        ...notes("m3", "julien", 2, 2, 2),
      ],
      pendingRatingMatches: 1,
    });

    expect(playerNamed(stats.players, "julien").rating).toEqual({
      average: 8,
      count: 2,
      variance: 0,
    });
  });

  it(`keeps a thin average out of the leaderboard but not out of the table (${MIN_RATED_MATCHES} matches minimum)`, () => {
    const stats = season({
      members,
      matches,
      ratings: [
        // Karim: one glowing match. Real, shown on his row, not a ranking.
        ...notes("m1", "karim", 10, 10, 10),
        ...notes("m1", "julien", 6, 6, 6),
        ...notes("m2", "julien", 6, 6, 6),
        ...notes("m3", "julien", 6, 6, 6),
      ],
    });

    expect(playerNamed(stats.players, "karim").rating).toEqual({
      average: 10,
      count: 1,
      variance: null,
    });
    expect(stats.topRated.map((entry) => entry.teamMemberId)).toEqual(["julien"]);
    expect(stats.topRated[0]).toMatchObject({ value: 6, count: 3 });
  });

  it("ranks an honest 0.0 average rather than dropping it as a falsy value", () => {
    const stats = season({
      members,
      matches,
      ratings: [
        ...notes("m1", "julien", 0, 0, 0),
        ...notes("m2", "julien", 0, 0, 0),
        ...notes("m3", "julien", 0, 0, 0),
      ],
    });
    expect(stats.topRated).toHaveLength(1);
    expect(stats.topRated[0]).toMatchObject({ teamMemberId: "julien", value: 0, count: 3 });
  });

  it("passes the count of matches still waiting on their notes", () => {
    expect(season({ pendingRatingMatches: 2 }).pendingRatingMatches).toBe(2);
    expect(season().pendingRatingMatches).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The team                                                                   */
/* -------------------------------------------------------------------------- */

describe("the team's tally", () => {
  const stats = season({
    matches: [
      match("m1", { kickoffAt: "2026-09-06T08:30:00.000Z", score: { goalsFor: 3, goalsAgainst: 2 } }),
      match("m2", { kickoffAt: "2026-09-13T08:30:00.000Z", score: { goalsFor: 1, goalsAgainst: 1 } }),
      match("m3", { kickoffAt: "2026-09-20T08:30:00.000Z", score: { goalsFor: 0, goalsAgainst: 4 } }),
      match("m4", { kickoffAt: "2026-09-27T08:30:00.000Z", score: { goalsFor: 2, goalsAgainst: 0 } }),
    ],
  });

  it("counts wins, draws and losses", () => {
    expect(stats.team).toMatchObject({
      played: 4,
      wins: 2,
      draws: 1,
      losses: 1,
      goalsFor: 6,
      goalsAgainst: 7,
      goalDifference: -1,
      cleanSheets: 1,
      points: 7,
    });
  });

  it("puts the most recent match first in the form guide", () => {
    expect(stats.team.form.map((entry) => entry.matchId)).toEqual(["m4", "m3", "m2", "m1"]);
    expect(stats.team.form.map((entry) => entry.result)).toEqual(["win", "loss", "draw", "win"]);
  });

  it(`shows at most ${FORM_LENGTH} matches`, () => {
    const many = season({
      matches: Array.from({ length: 9 }, (_, index) =>
        match(`m${index}`, { kickoffAt: `2026-09-0${index + 1}T08:30:00.000Z` }),
      ),
    });
    expect(many.team.form).toHaveLength(FORM_LENGTH);
    expect(many.team.form[0]?.matchId).toBe("m8");
  });

  it("counts a finished match with nothing logged nowhere, and says how many (rule 7)", () => {
    const withGap = season({
      matches: [match("m1", { score: { goalsFor: 2, goalsAgainst: 0 } }), match("m2", { score: null })],
    });

    expect(withGap.team.played).toBe(1);
    expect(withGap.team.unrecordedMatches).toBe(1);
    // Not a draw, not a defeat, not a clean sheet: no score at all.
    expect(withGap.team.draws).toBe(0);
    expect(withGap.team.cleanSheets).toBe(1);
    expect(withGap.team.form.map((entry) => entry.matchId)).toEqual(["m1"]);
  });
});

describe("goals with no scorer (decision 017)", () => {
  it("reports the gap instead of forcing the scorers to add up to the score", () => {
    const stats = season({
      members: [member("julien", "Julien")],
      matches: [match("m1", { score: { goalsFor: 3, goalsAgainst: 1 } })],
      lines: [line("m1", "julien", { minutes: 60, goals: 1 })],
    });

    expect(stats.team.goalsFor).toBe(3);
    expect(playerNamed(stats.players, "julien").goals).toBe(1);
    expect(stats.team.unattributedGoals).toBe(2);
  });

  it("never reports a negative number of unattributed goals", () => {
    const stats = season({
      members: [member("julien", "Julien")],
      matches: [match("m1", { score: { goalsFor: 1, goalsAgainst: 0 } })],
      lines: [line("m1", "julien", { minutes: 60, goals: 2 })],
    });
    expect(stats.team.unattributedGoals).toBe(0);
  });

  it("does not add a scored penalty to the goal it already is (reducer rule 5)", () => {
    const stats = season({
      members: [member("julien", "Julien")],
      matches: [match("m1", { score: { goalsFor: 2, goalsAgainst: 0 } })],
      lines: [line("m1", "julien", { minutes: 60, goals: 2, penaltiesScored: 1 })],
    });

    const julien = playerNamed(stats.players, "julien");
    expect(julien.goals).toBe(2);
    expect(julien.penaltiesScored).toBe(1);
    expect(stats.team.unattributedGoals).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The competition filter                                                     */
/* -------------------------------------------------------------------------- */

describe("a competition filter that excludes somebody's only match", () => {
  const members = [member("julien", "Julien"), member("yanis", "Yanis")];
  // Two matches happened; the filter keeps only the league one. Yanis played only the cup match.
  const allLines = [
    line("m1", "julien", { squadRole: "starter", minutes: 60, goals: 1 }),
    line("m2", "yanis", { squadRole: "starter", minutes: 60, goals: 3, gkMinutes: 60 }),
  ];
  const allSquad = [
    { matchId: "m1", teamMemberId: "julien", role: "starter" as const },
    { matchId: "m2", teamMemberId: "yanis", role: "starter" as const },
  ];
  const allRatings = [
    { matchId: "m2", ratedMemberId: "yanis", score: 9 },
    { matchId: "m2", ratedMemberId: "yanis", score: 9 },
    { matchId: "m2", ratedMemberId: "yanis", score: 9 },
  ];

  // The query layer filters the *matches*; the lines, sheets and ratings it hands over may still
  // mention others, and the aggregate must ignore them rather than trust its caller.
  const stats = season({
    members,
    matches: [match("m1", { competitionLabel: "Championnat" })],
    lines: allLines,
    squad: allSquad,
    ratings: allRatings,
  });

  it("drops every number attached to the excluded match", () => {
    const yanis = playerNamed(stats.players, "yanis");
    expect(yanis.minutes).toBe(0);
    expect(yanis.goals).toBe(0);
    expect(yanis.gkMinutes).toBe(0);
    expect(yanis.appearances.selected).toBe(0);
    expect(yanis.rating).toEqual({ average: null, count: 0, variance: null });
    expect(yanis.hasData).toBe(false);
  });

  it("still lists him, so the filter reads as a filter and not as a disappearance", () => {
    expect(stats.players.map((player) => player.teamMemberId).sort()).toEqual(["julien", "yanis"]);
  });

  it("keeps him out of every leaderboard", () => {
    expect(stats.topScorers.map((entry) => entry.teamMemberId)).toEqual(["julien"]);
    expect(stats.topRated).toEqual([]);
    expect(stats.topConcededGk).toEqual([]);
  });

  it("gives him everything back when the filter is lifted", () => {
    const unfiltered = season({
      members,
      matches: [
        match("m1", { competitionLabel: "Championnat" }),
        match("m2", { competitionLabel: "Coupe" }),
      ],
      lines: allLines,
      squad: allSquad,
      ratings: allRatings,
    });

    const yanis = playerNamed(unfiltered.players, "yanis");
    expect(yanis.goals).toBe(3);
    expect(yanis.matchesPlayed).toBe(1);
    expect(unfiltered.topScorers.map((entry) => entry.teamMemberId)).toEqual(["yanis", "julien"]);
    expect(unfiltered.topConcededGk.map((entry) => entry.teamMemberId)).toEqual(["yanis"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Members who have left                                                      */
/* -------------------------------------------------------------------------- */

describe("a member who has left", () => {
  it("keeps the goals he scored in September (rule 8)", () => {
    const stats = season({
      members: [member("old", "Ancien", { hasLeft: true })],
      matches: [match("m1", { score: { goalsFor: 2, goalsAgainst: 0 } })],
      lines: [line("m1", "old", { squadRole: "starter", minutes: 60, goals: 2 })],
    });

    const old = playerNamed(stats.players, "old");
    expect(old.goals).toBe(2);
    expect(old.hasLeft).toBe(true);
    expect(stats.topScorers[0]).toMatchObject({ teamMemberId: "old", hasLeft: true });
  });

  it("disappears once the filter leaves him with nothing to show", () => {
    const stats = season({
      members: [member("old", "Ancien", { hasLeft: true })],
      matches: [match("m1")],
      lines: [],
    });
    expect(stats.players).toEqual([]);
  });
});

describe("a line naming somebody the member list does not", () => {
  it("keeps the numbers under a placeholder rather than losing them", () => {
    const stats = season({
      members: [],
      matches: [match("m1", { score: { goalsFor: 1, goalsAgainst: 0 } })],
      lines: [line("m1", "ghost", { minutes: 60, goals: 1 })],
    });

    expect(stats.players).toHaveLength(1);
    expect(stats.players[0]).toMatchObject({ teamMemberId: "ghost", goals: 1 });
    expect(stats.team.unattributedGoals).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

describe("sorting the table", () => {
  const stats = season({
    members: [member("a", "Alice"), member("b", "Bruno"), member("c", "Chloé")],
    matches: [match("m1")],
    lines: [
      line("m1", "a", { minutes: 60, goals: 1, assists: 3 }),
      line("m1", "b", { minutes: 30, goals: 4 }),
      line("m1", "c", { minutes: 45, goals: 1 }),
    ],
    // Three notes, because one does not make a mean any more (decision 137).
    ratings: [
      { matchId: "m1", ratedMemberId: "b", score: 8 },
      { matchId: "m1", ratedMemberId: "b", score: 8 },
      { matchId: "m1", ratedMemberId: "b", score: 8 },
    ],
  });

  it("defaults to minutes, descending", () => {
    expect(stats.players.map((player) => player.teamMemberId)).toEqual(["a", "c", "b"]);
  });

  it("sorts by goals, then by minutes", () => {
    expect(sortPlayers(stats.players, "goals").map((player) => player.teamMemberId)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("puts players with no value for the key last, not first", () => {
    // Only Bruno has a rating: the others sort behind him.
    expect(sortPlayers(stats.players, "rating")[0]?.teamMemberId).toBe("b");
  });

  it("breaks a full tie on the name, so two renders never disagree", () => {
    const tied = season({
      members: [member("z", "Zoé"), member("a", "Alice")],
      matches: [match("m1")],
      lines: [line("m1", "z", { minutes: 60 }), line("m1", "a", { minutes: 60 })],
    });
    expect(tied.players.map((player) => player.displayName)).toEqual(["Alice", "Zoé"]);
  });

  it("is a total order for every key", () => {
    for (const key of ["minutes", "goals", "assists", "rating"] as const) {
      const sorted = sortPlayers(stats.players, key);
      expect(sorted).toHaveLength(stats.players.length);
      expect(comparePlayers(key)(sorted[0]!, sorted[0]!)).toBe(0);
    }
  });
});

describe("leaderboards", () => {
  it(`rank everybody eligible, past the ${LEADERBOARD_SIZE} shown first, and nobody on zero`, () => {
    const stats = season({
      members: Array.from({ length: 8 }, (_, index) => member(`p${index}`, `Joueur ${index}`)),
      matches: [match("m1")],
      lines: Array.from({ length: 8 }, (_, index) =>
        line("m1", `p${index}`, { minutes: 60, goals: index }),
      ),
    });

    // Seven scorers: the screen shows five and folds two under « Tout afficher » (decision 176), so
    // the ranking itself must not stop at five.
    expect(stats.topScorers.length).toBeGreaterThan(LEADERBOARD_SIZE);
    expect(stats.topScorers.map((entry) => entry.value)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    // p0 scored none and is therefore not in a scorers' chart at all.
    expect(stats.topScorers.map((entry) => entry.teamMemberId)).not.toContain("p0");
    expect(stats.topScorers[0]).toMatchObject({ teamMemberId: "p7", value: 7 });
  });

  it("breaks a tie between scorers on assists", () => {
    const stats = season({
      members: [member("a", "Alice"), member("b", "Bruno")],
      matches: [match("m1")],
      lines: [
        line("m1", "a", { minutes: 60, goals: 2, assists: 0 }),
        line("m1", "b", { minutes: 60, goals: 2, assists: 1 }),
      ],
    });
    expect(stats.topScorers.map((entry) => entry.teamMemberId)).toEqual(["b", "a"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Decisions 160–162: goals for while on, outfield conceded, positions         */
/* -------------------------------------------------------------------------- */

describe("the figures of decision 162", () => {
  const stats = season({
    members: [member("hugo", "Hugo"), member("karim", "Karim")],
    matches: [match("m1"), match("m2")],
    lines: [
      // Hugo: 30′ in goal conceding 2, then 30′ outfield conceding 1.
      line("m1", "hugo", {
        minutes: 60,
        gkMinutes: 30,
        concededWhileOn: 3,
        concededWhileGk: 2,
        goalsForWhileOn: 2,
      }),
      line("m1", "karim", { minutes: 60, concededWhileOn: 3, goalsForWhileOn: 2 }),
      line("m2", "karim", { minutes: 40, concededWhileOn: 0, goalsForWhileOn: 1 }),
    ],
    positions: [
      { matchId: "m1", teamMemberId: "hugo", positionCode: "GB", minutes: 30, goalsFor: 1, goalsAgainst: 2 },
      { matchId: "m1", teamMemberId: "hugo", positionCode: "DC", minutes: 30, goalsFor: 1, goalsAgainst: 1 },
      // Two wing codes, two catalogues: one « Ailier » row.
      { matchId: "m1", teamMemberId: "karim", positionCode: "MG", minutes: 60, goalsFor: 2, goalsAgainst: 3 },
      { matchId: "m2", teamMemberId: "karim", positionCode: "AIL", minutes: 40, goalsFor: 1, goalsAgainst: 0 },
      // A match outside the filter is ignored like every other line.
      { matchId: "m9", teamMemberId: "karim", positionCode: "AT", minutes: 60, goalsFor: 9, goalsAgainst: 0 },
    ],
  });
  const hugo = playerNamed(stats.players, "hugo");
  const karim = playerNamed(stats.players, "karim");

  it("splits conceded on the pitch into outfield and goal by subtraction", () => {
    expect(hugo.outfieldMinutes).toBe(30);
    expect(hugo.concededOutfield).toBe(1);
    expect(hugo.concededWhileGk).toBe(2);
  });

  it("sums goals for while on across the season", () => {
    expect(karim.goalsForWhileOn).toBe(3);
  });

  it("groups the positions at read time, in team-sheet order", () => {
    expect(hugo.positions.map((p) => p.group)).toEqual(["GB", "DC"]);
    expect(karim.positions).toEqual([{ group: "AIL", minutes: 100, goalsFor: 3, goalsAgainst: 3 }]);
  });

  it("ranks who conceded fewest outfield, and carries the minutes beside it", () => {
    // Fewest first since decision 195: one goal in thirty minutes leads three in a hundred. That is
    // the count ranking, and it is not the rate — the rate card below has these two the other way up.
    expect(
      stats.topConcededOutfield.map((entry) => [entry.teamMemberId, entry.value, entry.count]),
    ).toEqual([
      ["hugo", 1, 30],
      ["karim", 3, 100],
    ]);
  });

  it("rates the keepers on their minutes in goal alone, raw", () => {
    expect(stats.keeperConcededRate.entries).toHaveLength(1);
    expect(stats.keeperConcededRate.entries[0]).toMatchObject({
      teamMemberId: "hugo",
      minutes: 30,
      conceded: 2,
      minutesPerGoal: 15,
    });
  });

  it("rates the outfield on outfield minutes, and lists everybody who has them", () => {
    expect(
      stats.outfieldConcededRate.entries.map((entry) => [entry.teamMemberId, entry.conceded, entry.minutes]),
    ).toEqual([
      // 3 in 100′ is fewer per minute than 1 in 30′.
      ["karim", 3, 100],
      ["hugo", 1, 30],
    ]);
  });

  it("builds the impact tables from the grouped positions", () => {
    const wing = stats.impact.find((position) => position.group === "AIL")!;
    expect(wing.entries.map((entry) => entry.teamMemberId)).toEqual(["karim"]);
  });

  it("ranks all the minutes, the minutes in goal and the minutes outfield (decision 196)", () => {
    expect(stats.topMinutes[0]).toMatchObject({ teamMemberId: "karim", value: 100 });
    expect(stats.topGkMinutes.map((entry) => [entry.teamMemberId, entry.value])).toEqual([
      ["hugo", 30],
    ]);
    // Hugo's hour is half in goal, so his outfield figure is the other half and not his total.
    expect(stats.topOutfieldMinutes.map((entry) => [entry.teamMemberId, entry.value])).toEqual([
      ["karim", 100],
      ["hugo", 30],
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Decision 184: the pairs the rate cards divide                               */
/* -------------------------------------------------------------------------- */

describe("the denominators the rate cards are built on (decision 184)", () => {
  /**
   * Léo plays a whole hour: half of it outfield, then half of it in goal, and the one goal is
   * conceded at the 40th minute, while he is wearing the gloves.
   *
   * So his pitch clean clock and his keeper clean clock both restart at 40′ and both read 20′ — while
   * the half-hour he spent outfield was entirely clean. That is why `cleanMinutes − gkCleanMinutes`
   * is **not** his outfield figure (rule 10): it is `0` here, and the truth is 30′.
   */
  const stats = season({
    members: [member("leo", "Léo")],
    matches: [match("m1", { score: { goalsFor: 0, goalsAgainst: 1 } })],
    lines: [
      line("m1", "leo", {
        minutes: 60,
        gkMinutes: 30,
        concededWhileOn: 1,
        concededWhileGk: 1,
        cleanMinutes: 20,
        gkCleanMinutes: 20,
      }),
    ],
  });
  const leo = playerNamed(stats.players, "leo");

  it("keeps the two clean clocks apart, and subtracts neither from the other", () => {
    // No screen divides these any more — decision 196 took « minutes d’invincibilité » and the
    // Gardiens card away — but the reducer still measures both, and the trap is still here: the
    // subtraction claims 0′ clean outfield where he actually kept thirty of them clean.
    expect(leo.cleanMinutes).toBe(20);
    expect(leo.gkCleanMinutes).toBe(20);
    expect(leo.cleanMinutes - leo.gkCleanMinutes).toBe(0);
    expect(leo.outfieldMinutes).toBe(30);
  });

  it("feeds each conceded total the minutes it was conceded in", () => {
    expect(concededRateLineFr(leo.concededWhileGk, leo.gkMinutes)).toBe(
      "1 but toutes les 30′ sur 30′",
    );
    // Nothing conceded outfield: the record, never a division by his thirty outfield minutes.
    expect(leo.concededOutfield).toBe(0);
    expect(concededRateLineFr(leo.concededOutfield, leo.outfieldMinutes)).toBe(
      "aucun but encaissé en 30′",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Decisions 195–197: fewest first, three minute lists, personal rates         */
/* -------------------------------------------------------------------------- */

describe("the reshaped rankings of the owner's fourth backlog", () => {
  /**
   * Three players and two matches, built so that every empty case the screen must word is in here:
   *
   * - **Nina** plays two whole matches outfield, concedes nothing, scores twice and gives one pass.
   * - **Momo** keeps goal for one match, concedes two, and never touches the ball at the other end.
   * - **Rémi** plays twenty minutes outfield, concedes one, and has scored nothing all season.
   */
  const stats = season({
    members: [member("nina", "Nina"), member("momo", "Momo"), member("remi", "Rémi")],
    matches: [
      match("m1", { score: { goalsFor: 2, goalsAgainst: 2 } }),
      match("m2", { score: { goalsFor: 1, goalsAgainst: 1 } }),
    ],
    lines: [
      line("m1", "nina", { minutes: 60, goals: 1, assists: 1 }),
      line("m2", "nina", { minutes: 60, goals: 1 }),
      line("m1", "momo", { minutes: 60, gkMinutes: 60, concededWhileOn: 2, concededWhileGk: 2 }),
      line("m2", "remi", { minutes: 20, concededWhileOn: 1 }),
    ],
  });

  it("puts the man who conceded nothing first, and says it as the owner says it", () => {
    expect(
      stats.topConcededOutfield.map((entry) => [entry.teamMemberId, entry.value, entry.count]),
    ).toEqual([
      ["nina", 0, 120],
      ["remi", 1, 20],
    ]);

    // « aucun but » over « encaissé en 120′ »: one sentence read downwards, in a 110 px column.
    const first = stats.topConcededOutfield[0];
    expect(concededCountRowFr(first.value, first.count)).toEqual({
      value: "aucun but",
      detail: "encaissé en 120′",
    });
    // Momo's hour was spent in goal, so he is not in the outfield list at all.
    expect(stats.topConcededOutfield.map((entry) => entry.teamMemberId)).not.toContain("momo");
  });

  it("ranks a goalkeeper who never conceded above one who did, over his own minutes", () => {
    const withTwoKeepers = season({
      members: [member("momo", "Momo"), member("nina", "Nina")],
      matches: [match("m1", { score: { goalsFor: 0, goalsAgainst: 2 } })],
      lines: [
        line("m1", "momo", { minutes: 30, gkMinutes: 30, concededWhileOn: 2, concededWhileGk: 2 }),
        line("m1", "nina", { minutes: 30, gkMinutes: 30 }),
      ],
    });
    expect(
      withTwoKeepers.topConcededGk.map((entry) => [entry.teamMemberId, entry.value, entry.count]),
    ).toEqual([
      ["nina", 0, 30],
      ["momo", 2, 30],
    ]);
  });

  it("prefers the longer record among two equal counts", () => {
    // Nothing conceded in 120′ is a better record than nothing conceded in 20′, so it leads — the
    // ascending order never lets a cameo head the card on a tie.
    const cameo = season({
      members: [member("nina", "Nina"), member("remi", "Rémi")],
      matches: [match("m1")],
      lines: [line("m1", "nina", { minutes: 120 }), line("m1", "remi", { minutes: 20 })],
    });
    expect(cameo.topConcededOutfield.map((entry) => entry.teamMemberId)).toEqual(["nina", "remi"]);
  });

  it("splits the minutes into three lists, each over its own population (decision 196)", () => {
    expect(stats.topMinutes.map((entry) => [entry.teamMemberId, entry.value])).toEqual([
      ["nina", 120],
      ["momo", 60],
      ["remi", 20],
    ]);
    // Momo kept goal for his whole hour, so he has no outfield minute and is in neither the outfield
    // list nor, for Nina and Rémi, the goal one.
    expect(stats.topOutfieldMinutes.map((entry) => [entry.teamMemberId, entry.value])).toEqual([
      ["nina", 120],
      ["remi", 20],
    ]);
    expect(stats.topGkMinutes.map((entry) => [entry.teamMemberId, entry.value])).toEqual([
      ["momo", 60],
    ]);
  });

  it("rates a player on his own goals, over his own minutes (decision 197)", () => {
    expect(
      stats.scoringRate.entries.map((entry) => [
        entry.teamMemberId,
        entry.count,
        entry.minutes,
        entry.minutesPerEvent,
      ]),
    ).toEqual([
      // One goal every sixty minutes, then the two men who have never scored — shortest record first,
      // so the longest goalless run is last rather than lost in the middle.
      ["nina", 2, 120, 60],
      ["remi", 0, 20, null],
      ["momo", 0, 60, null],
    ]);

    expect(eventRateFr(2, 120, GOAL_WORDS_FR)).toEqual({
      rate: "1 but toutes les 60′",
      record: "2 buts en 120′",
    });
    expect(eventRateFr(0, 20, GOAL_WORDS_FR)).toEqual({
      rate: "aucun but marqué",
      record: "en 20′",
    });
  });

  it("counts the passes he gave, not the goals the team scored while he was on", () => {
    expect(
      stats.assistRate.entries.map((entry) => [entry.teamMemberId, entry.count, entry.minutes]),
    ).toEqual([
      ["nina", 1, 120],
      ["remi", 0, 20],
      ["momo", 0, 60],
    ]);
    // The team's own figure is a different number and stays where it was.
    expect(playerNamed(stats.players, "nina").goalsForWhileOn).toBe(0);
  });

  it("lists nobody without a minute on either rate board", () => {
    const bench = season({
      members: [member("nina", "Nina")],
      matches: [match("m1")],
      squad: [{ matchId: "m1", teamMemberId: "nina", role: "substitute" }],
    });
    expect(bench.scoringRate.entries).toEqual([]);
    expect(bench.assistRate.entries).toEqual([]);
  });
});
