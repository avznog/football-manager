import { describe, expect, it } from "vitest";

import { matchEventBatchSchema } from "@/lib/match/events";
import type { SlotInfo } from "@/lib/match/lineup";
import { reduceMatch, playerState } from "@/lib/match/reducer";

import { isAmendableEventType } from "./amend";
import {
  RETRO_ACTION_TYPES,
  RETRO_FACT_TYPES,
  type RetroEntry,
  buildRetroLog,
  isRetroActionType,
  isRetroFactType,
  retroEntrySeed,
  retroEventId,
  retroEventRecords,
  retroPitch,
  retroSubmissionId,
} from "./log";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Readable, deterministic uuids: `p01` is a player, `s1` a formation slot. */
const uuid = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(9, "0")}`;

const SUBMISSION = "11111111-2222-4333-8444-555555555555";

const P = Object.fromEntries(
  ["gk", "dg", "dc", "dd", "mcl", "mcr", "at", "sub1", "sub2"].map((name, index) => [
    name,
    uuid("aaa", index + 1),
  ]),
) as Record<"gk" | "dg" | "dc" | "dd" | "mcl" | "mcr" | "at" | "sub1" | "sub2", string>;

/** The 1-3-2-1 template of `db/reference.ts`, as the reducer wants it. */
const SLOTS: readonly SlotInfo[] = [
  { id: uuid("bbb", 1), positionCode: "GB", sort: 1 },
  { id: uuid("bbb", 2), positionCode: "DG", sort: 2 },
  { id: uuid("bbb", 3), positionCode: "DC", sort: 3 },
  { id: uuid("bbb", 4), positionCode: "DD", sort: 4 },
  { id: uuid("bbb", 5), positionCode: "MC", sort: 5 },
  { id: uuid("bbb", 6), positionCode: "MC", sort: 6 },
  { id: uuid("bbb", 7), positionCode: "AT", sort: 7 },
];

const STARTERS = [
  { slotId: SLOTS[0].id, memberId: P.gk },
  { slotId: SLOTS[1].id, memberId: P.dg },
  { slotId: SLOTS[2].id, memberId: P.dc },
  { slotId: SLOTS[3].id, memberId: P.dd },
  { slotId: SLOTS[4].id, memberId: P.mcl },
  { slotId: SLOTS[5].id, memberId: P.mcr },
  { slotId: SLOTS[6].id, memberId: P.at },
];

const KICKOFF_AT_MS = Date.UTC(2026, 8, 12, 17, 0, 0);

function entry(overrides: Partial<RetroEntry> = {}): RetroEntry {
  return {
    submissionId: SUBMISSION,
    periods: { periodsCount: 2, periodMinutes: 30 },
    kickoffAtMs: KICKOFF_AT_MS,
    lineupId: null,
    starters: STARTERS,
    actions: [],
    ...overrides,
  };
}

/** What every consumer of the match will see. The only place a score is ever computed. */
function reduce(built: ReturnType<typeof buildRetroLog>) {
  return reduceMatch(retroEventRecords(built.events), [], {
    periodsCount: 2,
    periodMinutes: 30,
    slots: SLOTS,
  });
}

const MINUTE = 60_000;

/* -------------------------------------------------------------------------- */
/* The log is a log like any other                                            */
/* -------------------------------------------------------------------------- */

describe("buildRetroLog", () => {
  it("produces a batch the ingestion boundary accepts unchanged", () => {
    const built = buildRetroLog(
      entry({
        actions: [
          { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: P.mcr, minute: 11 },
          { key: "f2", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: 24 },
          { key: "f3", type: "PENALTY_SCORED", memberId: P.at, assistId: null, minute: 44 },
          { key: "f4", type: "OWN_GOAL", memberId: P.dc, assistId: null, minute: 51 },
          { key: "f5", type: "PENALTY_MISSED", memberId: P.mcl, assistId: null, minute: 58 },
          { key: "f6", type: "FOUL", memberId: P.dd, assistId: null, minute: 19 },
          { key: "f7", type: "INJURY", memberId: P.dg, assistId: null, minute: 40 },
          { key: "c1", type: "SUBSTITUTION", outId: P.mcl, inId: P.sub1, minute: 38 },
        ],
      }),
    );

    const parsed = matchEventBatchSchema.safeParse({
      matchId: uuid("ccc", 1),
      events: built.events,
    });
    expect(parsed.success).toBe(true);
  });

  it("frames the match the way game mode does: kick-off, seven on the pitch, whistle", () => {
    const built = buildRetroLog(entry({ lineupId: uuid("ddd", 1) }));
    const types = built.events.map((event) => event.type);

    expect(types).toEqual([
      "KICKOFF",
      "LINEUP_APPLIED",
      "PERIOD_END",
      "KICKOFF",
      "PERIOD_END",
      "FINAL_WHISTLE",
    ]);

    // The composition is named, so `lineups.applied_event_id` can point at the event that applied it.
    expect(built.events[1].payload).toMatchObject({ lineupId: uuid("ddd", 1) });
    expect(built.events[1].clockMs).toBe(0);
    expect(built.events[2].clockMs).toBe(30 * MINUTE);
    expect(built.events[3].clockMs).toBe(30 * MINUTE);
    expect(built.events[3].period).toBe(2);
    expect(built.events.at(-1)?.clockMs).toBe(60 * MINUTE);
  });

  it("reduces to the score the coach entered, and to no anomaly at all", () => {
    const state = reduce(
      buildRetroLog(
        entry({
          actions: [
            { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: P.mcr, minute: 11 },
            { key: "f2", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: 24 },
            { key: "f3", type: "PENALTY_SCORED", memberId: P.at, assistId: null, minute: 44 },
            { key: "f4", type: "OWN_GOAL", memberId: P.dc, assistId: null, minute: 51 },
            { key: "f5", type: "GOAL_FOR", memberId: P.mcl, assistId: null, minute: 57 },
          ],
        }),
      ),
    );

    // Two from open play, one penalty; conceded one, plus our own defender's.
    expect(state.finished).toBe(true);
    expect(state.scoreLabel).toBe("3 – 2");
    expect(state.result).toBe("win");
    expect(state.anomalies).toEqual([]);

    const striker = playerState(state, P.at);
    expect(striker?.goals).toBe(2);
    expect(striker?.penaltiesScored).toBe(1);
    expect(playerState(state, P.mcr)?.assists).toBe(1);
    expect(playerState(state, P.dc)?.ownGoals).toBe(1);
  });

  it("derives minutes from the substitutions instead of asking for them", () => {
    const state = reduce(
      buildRetroLog(
        entry({
          actions: [{ key: "c1", type: "SUBSTITUTION", outId: P.mcl, inId: P.sub1, minute: 38 }],
        }),
      ),
    );

    expect(playerState(state, P.gk)?.minutes).toBe(60);
    expect(playerState(state, P.gk)?.startedMatch).toBe(true);
    expect(playerState(state, P.mcl)?.minutes).toBe(38);
    expect(playerState(state, P.sub1)?.minutes).toBe(22);
    expect(playerState(state, P.sub1)?.startedMatch).toBe(false);
    expect(state.anomalies).toEqual([]);
  });

  it("knows who was in goal, and for how long the sheet stayed clean", () => {
    const state = reduce(
      buildRetroLog(
        entry({
          actions: [{ key: "f1", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: 24 }],
        }),
      ),
    );

    const keeper = playerState(state, P.gk);
    expect(keeper?.wasGoalkeeper).toBe(true);
    expect(keeper?.gkMinutes).toBe(60);
    expect(keeper?.gkCleanMinutes).toBe(24);
    expect(keeper?.concededWhileGk).toBe(1);
  });

  it("counts a goal whose scorer is forgotten, and credits nobody (decision 017)", () => {
    const state = reduce(
      buildRetroLog(
        entry({
          actions: [{ key: "f1", type: "GOAL_FOR", memberId: null, assistId: null, minute: 20 }],
        }),
      ),
    );

    expect(state.goalsFor).toBe(1);
    expect(state.players.every((player) => player.goals === 0)).toBe(true);
    expect(state.anomalies).toEqual([]);
  });

  it("puts the events of a 2×30 in the right period, the boundary included", () => {
    const built = buildRetroLog(
      entry({
        actions: [
          { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 0 },
          { key: "f2", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 30 },
          { key: "f3", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 60 },
        ],
      }),
    );

    const goals = built.events.filter((event) => event.type === "GOAL_FOR");
    expect(goals.map((goal) => goal.period)).toEqual([1, 2, 2]);
    // Minute 30 is the second half's kick-off, so the goal must land after it, not before the break.
    const order = built.events.map((event) => event.type);
    expect(order.indexOf("GOAL_FOR")).toBeLessThan(order.indexOf("PERIOD_END"));
    expect(order.lastIndexOf("GOAL_FOR")).toBeLessThan(order.lastIndexOf("FINAL_WHISTLE"));
    expect(reduce(built).anomalies).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The minute nobody remembers                                                */
/* -------------------------------------------------------------------------- */

describe("the stamp of an event the coach cannot date", () => {
  it("puts a substitution at the break", () => {
    const pitch = retroPitch(
      entry({
        actions: [{ key: "c1", type: "SUBSTITUTION", outId: P.mcl, inId: P.sub1, minute: null }],
      }),
    );
    expect(pitch.changes[0].clockMs).toBe(30 * MINUTE);
    expect(pitch.changes[0].guessed).toBe(true);
  });

  it("puts a team event with no player at the middle of regulation", () => {
    const built = buildRetroLog(
      entry({
        actions: [{ key: "f1", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: null }],
      }),
    );

    const conceded = built.events.find((event) => event.type === "GOAL_AGAINST");
    expect(conceded?.minute).toBe(30);
    expect(built.guessedStamps).toBe(1);
    // And the consequence the coach is being told about: half the match counts as clean.
    expect(reduce(built).players.find((p) => p.memberId === P.gk)?.gkCleanMinutes).toBe(30);
  });

  it("puts a goal at the middle of its scorer's own time on the pitch", () => {
    const built = buildRetroLog(
      entry({
        actions: [
          { key: "c1", type: "SUBSTITUTION", outId: P.mcl, inId: P.sub1, minute: 40 },
          { key: "f1", type: "GOAL_FOR", memberId: P.sub1, assistId: null, minute: null },
        ],
      }),
    );

    // On from 40′ to 60′, so 50′ — never 30′, which would be a `scorer-off-pitch` anomaly.
    expect(built.events.find((event) => event.type === "GOAL_FOR")?.minute).toBe(50);
    expect(reduce(built).anomalies).toEqual([]);
  });

  it("narrows the window to the overlap between the scorer and the assister", () => {
    const built = buildRetroLog(
      entry({
        actions: [
          { key: "c1", type: "SUBSTITUTION", outId: P.mcl, inId: P.sub1, minute: 20 },
          { key: "c2", type: "SUBSTITUTION", outId: P.at, inId: P.sub2, minute: 50 },
          // The substitute scored, the striker assisted: only on together from 20′ to 50′.
          { key: "f1", type: "GOAL_FOR", memberId: P.sub1, assistId: P.at, minute: null },
        ],
      }),
    );

    expect(built.events.find((event) => event.type === "GOAL_FOR")?.minute).toBe(35);
    expect(reduce(built).anomalies).toEqual([]);
  });

  it("keeps the score progression in the order the coach typed it", () => {
    const state = reduce(
      buildRetroLog(
        entry({
          actions: [
            { key: "f1", type: "GOAL_FOR", memberId: null, assistId: null, minute: null },
            { key: "f2", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: null },
            { key: "f3", type: "GOAL_FOR", memberId: null, assistId: null, minute: null },
          ],
        }),
      ),
    );

    // All three land on 30′; `seq` is what keeps them in order, and the running score monotone.
    expect(
      state.timeline.filter((line) => line.scoreAfter !== null).map((line) => line.scoreAfter),
    ).toEqual([
      { goalsFor: 1, goalsAgainst: 0 },
      { goalsFor: 1, goalsAgainst: 1 },
      { goalsFor: 2, goalsAgainst: 1 },
    ]);
  });

  it("uses the middle of a single-period match, which has no break", () => {
    const pitch = retroPitch(
      entry({
        periods: { periodsCount: 1, periodMinutes: 50 },
        actions: [
          { key: "c1", type: "SUBSTITUTION", outId: P.mcl, inId: P.sub1, minute: null },
        ],
      }),
    );
    expect(pitch.changes[0].clockMs).toBe(25 * MINUTE);
  });

  it("keeps the two landing rules apart inside one actions array (decision 048)", () => {
    /*
     * The regression test for « somebody unified the two resolvers ». One sheet, one array, two
     * undated rows, and the two rules decision 048 gives them are different numbers: the substitution
     * lands at the break and the goal in the middle of the scorer's own spell. Before the merge these
     * two could not be written side by side, because they lived in separate fields.
     *
     * `resolveFactClockMs` taking the narrowed fact arm is what *enforces* this — passing it a
     * substitution does not compile. This is the arithmetic that proves the enforcement is still wired
     * to two different answers rather than one.
     */
    const built = buildRetroLog(
      entry({
        actions: [
          { key: "c1", type: "SUBSTITUTION", outId: P.mcl, inId: P.sub1, minute: null },
          { key: "f1", type: "GOAL_FOR", memberId: P.sub1, assistId: null, minute: null },
        ],
      }),
    );

    // The break of a 2×30, which is also where `breakClockMs` puts it.
    expect(built.events.find((event) => event.type === "SUBSTITUTION")?.minute).toBe(30);
    // The substitute came on at 30′ and stayed to 60′, so the middle of *his* spell is 45′ — not 30′,
    // which is where one shared resolver would have put it, and which would be a `scorer-off-pitch`.
    expect(built.events.find((event) => event.type === "GOAL_FOR")?.minute).toBe(45);
    expect(built.guessedStamps).toBe(2);
    expect(reduce(built).anomalies).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The order the events come out in                                           */
/* -------------------------------------------------------------------------- */

describe("the emission order of one minute", () => {
  it("emits a minute's facts before its substitutions, whichever the coach typed first", () => {
    /*
     * The non-symmetric boundary `validation.ts`' `onPitchAt` is built on, now that the two kinds of
     * row share an array and a typing order. `buildRetroLog` keeps `order` as **two buckets** — the
     * index among the facts, then `facts.length +` the index among the substitutions — precisely so
     * this does not depend on which row the coach wrote down first.
     *
     * Were `order` the index in the merged array, the substitution below would be emitted first, the
     * striker would already be off at 45′, and the goal he actually scored would become a
     * `scorer-off-pitch` anomaly on a log the app wrote itself.
     */
    const built = buildRetroLog(
      entry({
        actions: [
          { key: "c1", type: "SUBSTITUTION", outId: P.at, inId: P.sub1, minute: 45 },
          { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 45 },
        ],
      }),
    );

    const types = built.events.map((event) => event.type);
    expect(types.indexOf("GOAL_FOR")).toBeLessThan(types.indexOf("SUBSTITUTION"));
    expect(reduce(built).anomalies).toEqual([]);
    expect(playerState(reduce(built), P.at)?.goals).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Idempotency                                                                */
/* -------------------------------------------------------------------------- */

describe("retroEventId", () => {
  it("is a valid uuid, derived from the submission and the position", () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(retroEventId(SUBMISSION, 0)).toMatch(uuidPattern);
    expect(retroEventId(SUBMISSION, 17)).toMatch(uuidPattern);
    expect(retroEventId(SUBMISSION, 0)).not.toBe(retroEventId(SUBMISSION, 1));
  });

  it("derives the submission id from the sheet, not from a random draw", () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const matchId = uuid("ccc", 1);
    const sheet = entry({
      actions: [{ key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 11 }],
    });

    const id = retroSubmissionId([retroEntrySeed(matchId, sheet)]);
    expect(id).toMatch(uuidPattern);

    // Same sheet, same id: the coach's second tap on « Enregistrer » is the same submission.
    expect(retroSubmissionId([retroEntrySeed(matchId, sheet)])).toBe(id);

    // The row keys are DOM bookkeeping: re-adding a deleted row must not change the submission.
    const renamed = entry({
      actions: [{ key: "f9", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 11 }],
    });
    expect(retroSubmissionId([retroEntrySeed(matchId, renamed)])).toBe(id);

    // A different sheet is a different submission, so nothing is swallowed as a false duplicate.
    const different = entry({
      actions: [{ key: "f1", type: "GOAL_FOR", memberId: P.mcl, assistId: null, minute: 11 }],
    });
    expect(retroSubmissionId([retroEntrySeed(matchId, different)])).not.toBe(id);

    // And the same sheet on another match is another submission.
    expect(retroSubmissionId([retroEntrySeed(uuid("ccc", 2), sheet)])).not.toBe(id);
  });

  it("makes a double submission of the same form produce the same ids (invariant 6)", () => {
    const actions = [
      { key: "f1", type: "GOAL_FOR" as const, memberId: P.at, assistId: null, minute: 11 },
    ];
    const first = buildRetroLog(entry({ actions }));
    const second = buildRetroLog(entry({ actions }));

    expect(second.events.map((event) => event.clientEventId)).toEqual(
      first.events.map((event) => event.clientEventId),
    );
    expect(new Set(first.events.map((event) => event.clientEventId)).size).toBe(
      first.events.length,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The two lists, and why they are two                                        */
/* -------------------------------------------------------------------------- */

describe("RETRO_FACT_TYPES — the correctable set", () => {
  it("still holds exactly its seven members", () => {
    expect(RETRO_FACT_TYPES).toEqual([
      "GOAL_FOR",
      "PENALTY_SCORED",
      "PENALTY_MISSED",
      "OWN_GOAL",
      "GOAL_AGAINST",
      "FOUL",
      "INJURY",
    ]);
  });

  it("still contains FOUL, which decision 114 removed from a menu and not from the model", () => {
    // `match_events` is append-only: the fouls already logged must render, count and be voidable.
    expect(RETRO_FACT_TYPES).toContain("FOUL");
    expect(isRetroFactType("FOUL")).toBe(true);
  });

  it("is what decides amendability, so POSITION_CHANGE must stay out of it (decision 049)", () => {
    // Asserted next to the constant as well as in `amend.test.ts`: this is where the coupling bites.
    // Adding POSITION_CHANGE above would give it a « Corriger » button nobody decided to give it.
    expect(RETRO_FACT_TYPES as readonly string[]).not.toContain("POSITION_CHANGE");
    expect(isAmendableEventType("POSITION_CHANGE")).toBe(false);
    expect(isAmendableEventType("SUBSTITUTION")).toBe(true);
  });
});

describe("RETRO_ACTION_TYPES — the enterable set", () => {
  it("is RETRO_FACT_TYPES plus exactly SUBSTITUTION", () => {
    expect(RETRO_ACTION_TYPES).toEqual([...RETRO_FACT_TYPES, "SUBSTITUTION"]);
  });

  it("is a strict superset of the correctable set", () => {
    for (const type of RETRO_FACT_TYPES) {
      expect(isRetroActionType(type), type).toBe(true);
    }
    expect(RETRO_ACTION_TYPES.length).toBe(RETRO_FACT_TYPES.length + 1);
  });

  it("does not offer POSITION_CHANGE, which the owner decided not to build (decision 134)", () => {
    // Game mode records a shirt that moved; the retro sheet does not, so nothing can produce such a
    // row and the list must not claim it can. Re-adding it to make the two modes symmetric is the
    // mistake this assertion exists to catch — `FOUL` already goes the other way.
    expect(isRetroActionType("POSITION_CHANGE")).toBe(false);
    expect(RETRO_ACTION_TYPES as readonly string[]).not.toContain("POSITION_CHANGE");
  });

  it("does not make anything new correctable: being enterable is not being amendable", () => {
    // The one type that is enterable without being a fact is amendable only because
    // `isAmendableEventType` names it, not because this list holds it.
    expect(isRetroActionType("SUBSTITUTION")).toBe(true);
    expect(isRetroFactType("SUBSTITUTION")).toBe(false);
    expect(isAmendableEventType("POSITION_CHANGE")).toBe(false);
  });

  it("stops short of the frame of the match, which buildRetroLog writes itself", () => {
    for (const type of ["KICKOFF", "PERIOD_END", "FINAL_WHISTLE", "LINEUP_APPLIED"]) {
      expect(isRetroActionType(type), type).toBe(false);
    }
  });
});
