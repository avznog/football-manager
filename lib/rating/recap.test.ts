import { describe, expect, it } from "vitest";

import { periodOfClockMs, periodsConfig } from "@/lib/match/clock";
import type { MatchEventType } from "@/lib/match/events";
import type { SlotInfo } from "@/lib/match/lineup";
import { reduceMatch, type MatchEventRecord, type MatchReducerConfig } from "@/lib/match/reducer";
import { buildRecap, UNKNOWN_MEMBER_NAME, type RecapMember } from "./recap";

/* -------------------------------------------------------------------------- */
/* Fixtures — a log built by hand, like `reducer.test.ts` does                 */
/* -------------------------------------------------------------------------- */

const MIN = 60_000;
const T0 = Date.UTC(2026, 3, 11, 8, 0, 0);

const SLOT = { gb: "s-gb", dc: "s-dc", mc1: "s-mc1", mc2: "s-mc2", at: "s-at" } as const;

const SLOTS: SlotInfo[] = [
  { id: SLOT.gb, positionCode: "GB", sort: 1 },
  { id: SLOT.dc, positionCode: "DC", sort: 2 },
  { id: SLOT.mc1, positionCode: "MC", sort: 3 },
  { id: SLOT.mc2, positionCode: "MC", sort: 4 },
  { id: SLOT.at, positionCode: "AT", sort: 5 },
];

const SQUAD = [
  { teamMemberId: "hugo", role: "starter" as const },
  { teamMemberId: "nico", role: "starter" as const },
  { teamMemberId: "karim", role: "starter" as const },
  { teamMemberId: "leo", role: "starter" as const },
  { teamMemberId: "julien", role: "starter" as const },
  { teamMemberId: "momo", role: "substitute" as const },
  { teamMemberId: "ali", role: "substitute" as const },
];

const CONFIG: MatchReducerConfig = { slots: SLOTS, squad: SQUAD };

const MEMBERS: RecapMember[] = [
  { memberId: "hugo", displayName: "Hugo Leclerc", jerseyNumber: 1 },
  { memberId: "nico", displayName: "Nico Perrin", jerseyNumber: 4 },
  { memberId: "karim", displayName: "Karim Benali", jerseyNumber: 8 },
  { memberId: "leo", displayName: "Léo Martin", jerseyNumber: 6 },
  { memberId: "julien", displayName: "Julien Marchal", jerseyNumber: 9 },
  { memberId: "momo", displayName: "Momo Diarra", jerseyNumber: 11 },
  { memberId: "ali", displayName: "Ali Cherif", jerseyNumber: 12 },
];

type Fixture = {
  type: MatchEventType;
  min: number;
  period?: number;
  payload?: unknown;
  voids?: number;
};

function log(fixtures: Fixture[]): MatchEventRecord[] {
  const config = periodsConfig();
  return fixtures.map((fixture, index) => ({
    id: `e${index + 1}`,
    clientEventId: `c${index + 1}`,
    type: fixture.type,
    period: fixture.period ?? periodOfClockMs(fixture.min * MIN, config),
    minute: fixture.min,
    clockMs: fixture.min * MIN,
    occurredAt: new Date(T0 + fixture.min * MIN),
    payload: fixture.payload ?? {},
    voidsEventId: fixture.voids === undefined ? null : `e${fixture.voids}`,
    seq: index + 1,
  }));
}

const lineupPayload = (pairs: Record<string, string>) => ({
  lineupId: "l-initial",
  slots: Object.entries(pairs).map(([slotId, memberId]) => ({ slotId, memberId })),
});

const STARTERS = {
  [SLOT.gb]: "hugo",
  [SLOT.dc]: "nico",
  [SLOT.mc1]: "leo",
  [SLOT.mc2]: "karim",
  [SLOT.at]: "julien",
};

const FULL_MATCH = log([
  { type: "KICKOFF", min: 0, period: 1 },
  { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTERS) },
  { type: "GOAL_FOR", min: 11, payload: { scorerId: "julien", assistId: "karim" } },
  { type: "FOUL", min: 19, payload: { memberId: "nico" } },
  { type: "GOAL_AGAINST", min: 24 },
  { type: "GOAL_FOR", min: 27, payload: { scorerId: "leo" } },
  { type: "VOID", min: 27, voids: 6 },
  { type: "PERIOD_END", min: 30, period: 1 },
  { type: "PAUSE", min: 30, period: 1 },
  { type: "RESUME", min: 30, period: 2 },
  { type: "KICKOFF", min: 30, period: 2 },
  { type: "PENALTY_SCORED", min: 44, payload: { scorerId: "julien" } },
  { type: "OWN_GOAL", min: 51, payload: { scorerId: "nico" } },
  { type: "SUBSTITUTION", min: 55, payload: { outId: "julien", inId: "momo", slotId: SLOT.at } },
  { type: "PERIOD_END", min: 60, period: 2 },
  { type: "FINAL_WHISTLE", min: 60, period: 2 },
]);

const recapOf = (events: MatchEventRecord[], members = MEMBERS) =>
  buildRecap(reduceMatch(events, [], CONFIG), members);

/* -------------------------------------------------------------------------- */

describe("buildRecap — the scoreline", () => {
  it("reports the derived score and the result", () => {
    const recap = recapOf(FULL_MATCH);

    // 2 scored (11’ and the 44’ penalty; the 27’ goal was voided), 2 conceded (24’ and the own goal).
    expect(recap).toMatchObject({
      goalsFor: 2,
      goalsAgainst: 2,
      scoreLabel: "2 – 2",
      result: "draw",
      resultLabel: "Match nul",
      finished: true,
      cleanSheet: false,
    });
  });

  it("has no result to announce before the final whistle", () => {
    const recap = recapOf(FULL_MATCH.slice(0, 5));
    expect(recap.finished).toBe(false);
    expect(recap.result).toBeNull();
    expect(recap.resultLabel).toBeNull();
    expect(recap.cleanSheet).toBe(false);
  });

  it("celebrates a clean sheet only once the match is over", () => {
    const events = log([
      { type: "KICKOFF", min: 0, period: 1 },
      { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTERS) },
      { type: "GOAL_FOR", min: 20, payload: { scorerId: "julien" } },
      { type: "PERIOD_END", min: 60, period: 2 },
      { type: "FINAL_WHISTLE", min: 60, period: 2 },
    ]);

    expect(recapOf(events)).toMatchObject({ cleanSheet: true, result: "win", scoreLabel: "1 – 0" });
  });

  it("counts the players who actually came on", () => {
    const recap = recapOf(FULL_MATCH);
    // Five starters plus Momo; Ali never left the bench.
    expect(recap.playersUsed).toBe(6);
    expect(recap.playersUsedLabel).toBe("6 joueurs utilisés");
  });
});

describe("buildRecap — scorers", () => {
  it("lists a double scorer once, with a multiplier, and marks an own goal", () => {
    const scorers = recapOf(FULL_MATCH).scorers;

    expect(scorers.map((scorer) => scorer.label)).toEqual([
      "Julien Marchal ×2",
      "Nico Perrin (csc)",
    ]);
    expect(scorers[0]).toMatchObject({ goals: 2, assists: 0, ownGoals: 0 });
    expect(scorers[1]).toMatchObject({ goals: 0, ownGoals: 1 });
  });

  it("gives the passer his own line rather than mixing him into the scorers", () => {
    const recap = recapOf(FULL_MATCH);
    expect(recap.scorers.map((scorer) => scorer.memberId)).not.toContain("karim");
    expect(recap.assisters).toEqual([
      { memberId: "karim", name: "Karim Benali", assists: 1, label: "Karim Benali" },
    ]);
  });

  it("ignores a goal that was voided", () => {
    // Léo's 27’ goal was annulled: he is not a scorer.
    expect(recapOf(FULL_MATCH).scorers.map((scorer) => scorer.memberId)).not.toContain("leo");
  });

  it("falls back to a neutral name when the member is unknown", () => {
    const recap = recapOf(FULL_MATCH, []);
    expect(recap.scorers[0]?.name).toBe(UNKNOWN_MEMBER_NAME);
  });
});

describe("buildRecap — timeline", () => {
  const timeline = recapOf(FULL_MATCH).timeline;
  const at = (minuteLabel: string) => timeline.filter((entry) => entry.minuteLabel === minuteLabel);

  it("keeps the clock markers but drops pauses", () => {
    expect(timeline.some((entry) => entry.label === "Pause")).toBe(false);
    expect(timeline.some((entry) => entry.label === "Reprise")).toBe(false);
    expect(timeline.some((entry) => entry.label === "Coup de sifflet final")).toBe(true);
    expect(timeline.find((entry) => entry.label === "Coup d’envoi")?.tone).toBe("clock");
  });

  it("drops the VOID row and strikes the event it annuls", () => {
    expect(timeline.some((entry) => entry.label === "Annulation")).toBe(false);

    // No name: the reducer computes no actors for a voided event, and a goal that was not a goal
    // has no scorer.
    const voided = timeline.find((entry) => entry.voided);
    expect(voided).toMatchObject({ label: "But — annulé", detail: null, tone: "neutral" });
    expect(voided?.minuteLabel).toBe("27’");
  });

  it("does not turn the starting composition into a flurry of substitutions", () => {
    expect(timeline.some((entry) => entry.label === "Composition appliquée")).toBe(false);
  });

  it("names the scorer and the passer, in that order", () => {
    expect(at("11’")[0]).toMatchObject({
      label: "But",
      detail: "Julien Marchal, passe de Karim Benali",
      scoreAfter: "1 – 0",
      tone: "for",
    });
  });

  it("marks a goal conceded, with nobody to name", () => {
    expect(at("24’")[0]).toMatchObject({
      label: "But encaissé",
      detail: null,
      scoreAfter: "1 – 1",
      tone: "against",
    });
  });

  it("marks an own goal against us, and names who put it in", () => {
    expect(at("51’")[0]).toMatchObject({
      label: "But contre son camp",
      detail: "Nico Perrin (csc)",
      tone: "against",
    });
  });

  it("reads a substitution as who comes on and who goes off", () => {
    expect(at("55’")[0]).toMatchObject({
      label: "Changement",
      detail: "Momo Diarra entre, Julien Marchal sort",
      tone: "neutral",
    });
  });

  it("names the fouler", () => {
    expect(at("19’")[0]).toMatchObject({ label: "Faute", detail: "Nico Perrin" });
  });

  it("keeps a composition applied during the match, which is real news", () => {
    const events = log([
      { type: "KICKOFF", min: 0, period: 1 },
      { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTERS) },
      {
        type: "LINEUP_APPLIED",
        min: 30,
        period: 2,
        payload: {
          lineupId: "l-30",
          slots: [
            { slotId: SLOT.gb, memberId: "hugo" },
            { slotId: SLOT.at, memberId: "momo" },
          ],
        },
      },
      { type: "FINAL_WHISTLE", min: 60, period: 2 },
    ]);

    const applied = recapOf(events).timeline.find(
      (entry) => entry.label === "Composition appliquée",
    );
    expect(applied?.minuteLabel).toBe("30’");
    expect(applied?.detail).toContain("Momo Diarra entre");
  });

  /*
   * A comment is the one event whose content *is* the event (decision 114), and the recap is the
   * screen it exists for: a player reading the match back is the reader of « mur mal placé ». It
   * rendered as « 14’ · Commentaire » with an empty detail, because this module had its own actor
   * formatter that knew nothing about `note`. Both cases are pinned here and in `presenter.test.ts`,
   * against the one formatter they now share.
   */
  it("prints a comment's own words as its detail", () => {
    const note = "L’arbitre a laissé jouer sur le deuxième but";
    const events = log([
      { type: "KICKOFF", min: 0, period: 1 },
      { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTERS) },
      { type: "COMMENT", min: 14, payload: { note } },
    ]);

    expect(recapOf(events).timeline.at(-1)).toMatchObject({
      label: "Commentaire",
      detail: note,
      minuteLabel: "14’",
      scoreAfter: null,
      tone: "neutral",
    });
  });

  it("names the player a comment is about, before his own words", () => {
    const events = log([
      { type: "KICKOFF", min: 0, period: 1 },
      { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTERS) },
      { type: "COMMENT", min: 22, payload: { note: "trop haut sur le côté", memberId: "karim" } },
    ]);

    expect(recapOf(events).timeline.at(-1)?.detail).toBe("Karim Benali : trop haut sur le côté");
  });

  /*
   * `HIDDEN_EVENT_TYPES` is PAUSE/RESUME/VOID, so a remark reaches the shared summary without this
   * module knowing the type exists — which is exactly what was asked for, and exactly the kind of
   * thing a later « let us hide the small events » would break silently. Hence a test, not code.
   */
  it("shows a remark, with its kind and the player it names", () => {
    const events = log([
      { type: "KICKOFF", min: 0, period: 1 },
      { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTERS) },
      { type: "REMARK", min: 58, payload: { kind: "GOOD_EFFORT", memberId: "karim" } },
    ]);

    expect(recapOf(events).timeline.at(-1)).toMatchObject({
      label: "Remarque",
      detail: "Bel effort — Karim Benali",
      minuteLabel: "58’",
      scoreAfter: null,
      tone: "neutral",
    });
  });

  it("runs oldest first, with continuous minutes", () => {
    expect(timeline.map((entry) => entry.minuteLabel)).toEqual([
      "0’",
      "11’",
      "19’",
      "24’",
      "27’",
      "30’",
      "30’",
      "44’",
      "51’",
      "55’",
      "60’",
      "60’",
    ]);
  });
});

describe("buildRecap — minutes played", () => {
  const players = recapOf(FULL_MATCH).players;

  it("puts the men who played first, most minutes at the top", () => {
    expect(players[0]?.minutes).toBe(60);
    expect(players.at(-1)).toMatchObject({
      memberId: "ali",
      minutes: 0,
      playedMatch: false,
      minutesLabel: "0’",
    });
  });

  it("splits the minutes of a substitution", () => {
    const julien = players.find((player) => player.memberId === "julien");
    const momo = players.find((player) => player.memberId === "momo");

    expect(julien).toMatchObject({ minutes: 55, startedMatch: true, minutesLabel: "55’" });
    expect(momo).toMatchObject({ minutes: 5, startedMatch: false, playedMatch: true });
  });

  it("carries the shirt number and the goalkeeper's clean minutes", () => {
    const hugo = players.find((player) => player.memberId === "hugo");
    expect(hugo).toMatchObject({ jerseyNumber: 1, wasGoalkeeper: true, minutes: 60 });
    // Conceded at 24’, so 24 minutes of clean sheet in goal.
    expect(hugo?.gkCleanMinutes).toBe(24);
  });

  it("names an unknown member rather than showing a raw id", () => {
    expect(recapOf(FULL_MATCH, []).players[0]?.name).toBe(UNKNOWN_MEMBER_NAME);
  });
});

describe("buildRecap — a match that was never recorded", () => {
  it("says the log is empty rather than pretending it finished 0-0", () => {
    // Decision 038: a match can be closed with nothing in its log — nobody opened game mode and
    // nobody backfilled it. `recorded` is what lets the recap say so instead of printing a score
    // that never happened.
    const recap = recapOf([]);

    expect(recap.recorded).toBe(false);
    expect(recap.goalsFor).toBe(0);
    expect(recap.goalsAgainst).toBe(0);
    // The reducer cannot know the match is over: no final whistle was ever logged. The row's
    // `status` is what tells the screen, which is why `Scoreboard` takes it as a prop.
    expect(recap.finished).toBe(false);
    expect(recap.resultLabel).toBeNull();
    expect(recap.timeline).toEqual([]);
  });

  it("is recorded as soon as anything at all was logged", () => {
    expect(recapOf(log([{ type: "KICKOFF", min: 0, period: 1 }])).recorded).toBe(true);
    expect(recapOf(FULL_MATCH).recorded).toBe(true);
  });
});

describe("buildRecap — a goal nobody could attribute", () => {
  const events = log([
    { type: "KICKOFF", min: 0, period: 1 },
    { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTERS) },
    { type: "GOAL_FOR", min: 14 },
    { type: "FINAL_WHISTLE", min: 60, period: 2 },
  ]);

  it("counts in the score and says the scorer is missing", () => {
    // Decision 036: in a 7-a-side game nobody always sees who touched it last, so a goal may carry
    // no scorer. It still counts — and the timeline states the gap rather than showing a bare « But ».
    const recap = recapOf(events);

    expect(recap.goalsFor).toBe(1);
    expect(recap.scorers).toEqual([]);
    expect(recap.timeline.find((entry) => entry.minuteLabel === "14’")).toMatchObject({
      label: "But",
      detail: "buteur non renseigné",
      scoreAfter: "1 – 0",
      tone: "for",
    });
  });

  it("says nothing of the sort about a goal conceded, which never has a scorer of ours", () => {
    const conceded = log([
      { type: "KICKOFF", min: 0, period: 1 },
      { type: "GOAL_AGAINST", min: 8 },
    ]);
    expect(recapOf(conceded).timeline.at(-1)).toMatchObject({
      label: "But encaissé",
      detail: null,
    });
  });
});

describe("buildRecap — the supporter on the sheet", () => {
  const squad = [...SQUAD, { teamMemberId: "gerard", role: "supporter" as const }];
  const members = [
    ...MEMBERS,
    { memberId: "gerard", displayName: "Gérard Simon", jerseyNumber: null },
  ];
  const recap = buildRecap(reduceMatch(FULL_MATCH, [], { slots: SLOTS, squad }), members);
  const lineOf = (memberId: string) => recap.players.find((player) => player.memberId === memberId);

  it("carries the role of the sheet, so 0’ can be explained", () => {
    // Both were on the sheet and neither played: one was an option the coach did not use, the other
    // was never an option. « non entré » is only true of the first (decision 039).
    expect(lineOf("gerard")).toMatchObject({
      squadRole: "supporter",
      minutes: 0,
      playedMatch: false,
    });
    expect(lineOf("ali")).toMatchObject({
      squadRole: "substitute",
      minutes: 0,
      playedMatch: false,
    });
    expect(lineOf("hugo")?.squadRole).toBe("starter");
  });

  it("sinks below the unused substitutes, who were closer to playing", () => {
    const tail = recap.players.slice(-2).map((player) => player.memberId);
    expect(tail).toEqual(["ali", "gerard"]);
  });
});
