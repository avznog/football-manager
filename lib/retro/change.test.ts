/**
 * « Ajouter un changement » (decisions 169, 170): the pitch at a minute, who may go in and out, the
 * server's own check, the stamp of the one event it appends, which lines stay correctable, and the
 * reducer-backed realism check that every correction now goes through.
 */

import { describe, expect, it } from "vitest";

import type { LiveEvent, LiveMatch, LivePlayer, LiveSlot, PendingEvent } from "@/lib/match/presenter";
import { reduceLive } from "@/lib/match/presenter";

import { buildChangeAmendment, isAmendableEntry } from "./amend";
import { changeCandidateIds, changeProblemFr, changeSeed, eventsUpTo, stateAtClock } from "./change";
import { type RetroEntry, buildRetroLog } from "./log";
import { introducedAnomalies, realismRefusalFr } from "./realism";
import { retroEventId, retroSubmissionId } from "./log";

/* -------------------------------------------------------------------------- */
/* Fixtures: a 2 × 30, a change at 30’, goals at 12’ and 41’                   */
/* -------------------------------------------------------------------------- */

const uuid = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(9, "0")}`;

const KEYS = ["gk", "dc1", "dc2", "ail1", "mc", "ail2", "at", "sub", "fan", "stranger", "sub2"] as const;
type Key = (typeof KEYS)[number];
const P = Object.fromEntries(KEYS.map((key, index) => [key, uuid("aaa", index + 1)])) as Record<Key, string>;
const NAMES: Record<string, string> = {
  [P.gk]: "Lucas",
  [P.dc1]: "Nicolas",
  [P.dc2]: "Lucien",
  [P.ail1]: "Pierre",
  [P.mc]: "Maxime",
  [P.ail2]: "Benjamin",
  [P.at]: "Samuel",
  [P.sub]: "Clément",
  [P.fan]: "Léo",
  [P.stranger]: "Rémi",
  [P.sub2]: "Charles",
};
const nameOf = (memberId: string) => NAMES[memberId] ?? memberId;

const CODES = ["GB", "DC", "DC", "AIL", "MC", "AIL", "AT"];
const SLOTS: LiveSlot[] = CODES.map((positionCode, index) => ({
  id: uuid("bbb", index + 1),
  formationId: "f1",
  positionCode,
  x: 500,
  y: 100 * (index + 1),
  sort: index + 1,
}));
const STARTERS = [P.gk, P.dc1, P.dc2, P.ail1, P.mc, P.ail2, P.at];

const MINUTE = 60_000;
const KICKOFF_AT_MS = Date.UTC(2026, 8, 12, 17, 0, 0);

const ENTRY: RetroEntry = {
  submissionId: "11111111-2222-4333-8444-555555555555",
  periods: { periodsCount: 2, periodMinutes: 30 },
  kickoffAtMs: KICKOFF_AT_MS,
  lineupId: null,
  starters: SLOTS.map((slot, index) => ({ slotId: slot.id, memberId: STARTERS[index] })),
  actions: [
    { key: "g1", type: "GOAL_FOR", memberId: P.mc, assistId: null, minute: 12 },
    { key: "c1", type: "SUBSTITUTION", outId: P.ail1, inId: P.sub, minute: 30 },
    { key: "g2", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 41 },
  ],
};

function storedEvents(entry: RetroEntry = ENTRY): LiveEvent[] {
  return buildRetroLog(entry).events.map((event, index) => ({
    id: uuid("ddd", index + 1),
    clientEventId: event.clientEventId,
    type: event.type,
    period: event.period,
    minute: event.minute,
    clockMs: event.clockMs,
    occurredAt: event.occurredAt.toISOString(),
    payload: event.payload ?? {},
    voidsEventId: event.voidsEventId ?? null,
    seq: index + 1,
  }));
}

const player = (key: Key, extra: Partial<LivePlayer> = {}): LivePlayer => ({
  memberId: P[key],
  displayName: nameOf(P[key]),
  jerseyNumber: null,
  isInjured: false,
  squadRole: "starter",
  isPlayer: true,
  ...extra,
});

function liveMatch(events: LiveEvent[] = storedEvents()): LiveMatch {
  return {
    match: {
      id: "m1",
      teamId: "t1",
      kickoffAt: new Date(KICKOFF_AT_MS).toISOString(),
      opponentName: "FC Hexagone",
      isHome: true,
      venue: null,
      competitionId: "c1",
      competitionLabel: "Championnat",
      periodsCount: 2,
      periodMinutes: 30,
      status: "finished",
      operatorUserId: null,
      entryMode: "retro",
    },
    kit: { primaryColor: "#000000", secondaryColor: "#ffffff" },
    events,
    lineups: [],
    slots: SLOTS,
    formations: [{ id: "f1", name: "1-2-3-1", label: "1-2-3-1", isBuiltin: true, slots: SLOTS }],
    defaultFormationId: "f1",
    players: [
      ...(["gk", "dc1", "dc2", "ail1", "mc", "ail2", "at"] as const).map((key) => player(key)),
      player("sub", { squadRole: "substitute" }),
      player("sub2", { squadRole: "substitute" }),
      player("fan", { squadRole: "supporter" }),
      player("stranger", { squadRole: null }),
    ],
    hasSquadSheet: true,
  };
}

const onAt = (live: LiveMatch, minute: number) =>
  stateAtClock(live, minute * MINUTE)
    .onPitch.map((entry) => entry.memberId)
    .sort();

function change(live: LiveMatch, minute: number, slots: { slotId: string; memberId: string }[]) {
  const submissionId = retroSubmissionId(changeSeed(live.match.id, minute, slots));
  return buildChangeAmendment({
    submissionId,
    periods: { periodsCount: 2, periodMinutes: 30 },
    kickoffAtMs: KICKOFF_AT_MS,
    finalWhistleMs: 60 * MINUTE,
    change: { minute, slots },
  });
}

function pending(amendment: ReturnType<typeof change>): PendingEvent[] {
  return amendment.events.map((event) => ({
    clientEventId: event.clientEventId,
    type: event.type,
    period: event.period,
    minute: event.minute,
    clockMs: event.clockMs,
    occurredAt: event.occurredAt.toISOString(),
    payload: event.payload ?? {},
    voidsEventId: event.voidsEventId ?? null,
  }));
}

/** The pitch at 20’ with one player swapped: `out` leaves his slot, `inn` takes it. */
function swapAt(live: LiveMatch, minute: number, out: string, inn: string) {
  return stateAtClock(live, minute * MINUTE)
    .onPitch.filter((entry) => entry.slotId)
    .map((entry) => ({
      slotId: entry.slotId as string,
      memberId: entry.memberId === out ? inn : entry.memberId,
    }));
}

/* -------------------------------------------------------------------------- */
/* The pitch at a minute                                                      */
/* -------------------------------------------------------------------------- */

describe("eventsUpTo", () => {
  it("keeps every event at or before the reading, and every VOID whatever its stamp", () => {
    const events = [
      { id: "a", type: "GOAL_FOR" as const, clockMs: 10 * MINUTE },
      { id: "b", type: "GOAL_FOR" as const, clockMs: 20 * MINUTE },
      { id: "c", type: "GOAL_FOR" as const, clockMs: 21 * MINUTE },
      { id: "v", type: "VOID" as const, clockMs: 55 * MINUTE },
    ];
    expect(eventsUpTo(events, 20 * MINUTE).map((event) => event.id)).toEqual(["a", "b", "v"]);
  });
});

describe("stateAtClock", () => {
  const live = liveMatch();

  it("is the pitch before a change that happened later", () => {
    expect(onAt(live, 20)).toEqual([...STARTERS].sort());
  });

  it("includes a change stamped at exactly that minute", () => {
    // The retro sheet stamps the 30’ substitution at 30:00, so a change added « at 30’ » is applied
    // after it — the reading a coach means when he names the same minute twice.
    expect(onAt(live, 30)).toContain(P.sub);
    expect(onAt(live, 30)).not.toContain(P.ail1);
  });

  it("honours an annulment stamped long after its target", () => {
    const events = storedEvents();
    const substitution = events.find((event) => event.type === "SUBSTITUTION")!;
    const voided: LiveEvent[] = [
      ...events,
      {
        ...substitution,
        id: "void-1",
        clientEventId: "void-1",
        type: "VOID",
        clockMs: 59 * MINUTE,
        minute: 59,
        payload: {},
        voidsEventId: substitution.id,
        seq: 99,
      },
    ];
    expect(onAt(liveMatch(voided), 35)).toContain(P.ail1);
    expect(onAt(liveMatch(voided), 35)).not.toContain(P.sub);
  });
});

/* -------------------------------------------------------------------------- */
/* Who may come on, and the server's own check                                */
/* -------------------------------------------------------------------------- */

describe("changeCandidateIds", () => {
  const live = liveMatch();
  const whole = reduceLive(live, [], null);

  it("offers the substitute before he came on, and nobody already on", () => {
    const ids = changeCandidateIds(live, stateAtClock(live, 20 * MINUTE), whole);
    expect(ids).toContain(P.sub);
    for (const starter of STARTERS) expect(ids).not.toContain(starter);
  });

  it("offers a player who had already come off, since he did play", () => {
    expect(changeCandidateIds(live, stateAtClock(live, 40 * MINUTE), whole)).toContain(P.ail1);
  });

  it("never offers a supporter or somebody the sheet does not name", () => {
    const ids = changeCandidateIds(live, stateAtClock(live, 20 * MINUTE), whole);
    expect(ids).not.toContain(P.fan);
    expect(ids).not.toContain(P.stranger);
  });

  it("offers every player when the match has no sheet at all", () => {
    const sheetless = { ...live, hasSquadSheet: false };
    expect(changeCandidateIds(sheetless, stateAtClock(live, 20 * MINUTE), whole)).toContain(
      P.stranger,
    );
  });
});

describe("changeProblemFr", () => {
  const live = liveMatch();
  const whole = reduceLive(live, [], null);
  const atClock = stateAtClock(live, 23 * MINUTE);
  const context = {
    atClock,
    candidateIds: changeCandidateIds(live, atClock, whole),
    slots: SLOTS,
    nameOf,
    minuteLabel: "23’",
  };

  it("accepts a change that leaves a legal pitch", () => {
    const slots = swapAt(live, 23, P.ail2, P.sub);
    expect(changeProblemFr({ outIds: [P.ail2], inIds: [P.sub], slots }, context)).toBeNull();
  });

  it("refuses « Lucas entre » when Lucas was already on — the cahier's own example", () => {
    const slots = swapAt(live, 23, P.ail2, P.sub);
    expect(changeProblemFr({ outIds: [P.ail2], inIds: [P.gk], slots }, context)).toBe(
      "Lucas était déjà sur le terrain à la 23’.",
    );
  });

  it("refuses somebody going out who was not on", () => {
    expect(
      changeProblemFr({ outIds: [P.sub], inIds: [], slots: swapAt(live, 23, "", "") }, context),
    ).toBe("Clément n’était pas sur le terrain à la 23’ : il ne peut pas sortir.");
  });

  it("refuses a supporter coming on", () => {
    const slots = swapAt(live, 23, P.ail2, P.fan);
    expect(changeProblemFr({ outIds: [P.ail2], inIds: [P.fan], slots }, context)).toContain(
      "ni titulaire ni remplaçant",
    );
  });

  it("refuses slots that do not say what the two answers say", () => {
    // Claims a 1-for-1, posts a pitch with the outgoing man still on it and the arrival nowhere.
    const slots = swapAt(live, 23, "", "");
    expect(changeProblemFr({ outIds: [P.ail2], inIds: [P.sub], slots }, context)).toBe(
      "Clément entre, mais il n’est placé à aucun poste.",
    );
    // And a pitch with somebody on it nobody brought on.
    const smuggled = swapAt(live, 23, P.ail2, P.sub);
    expect(changeProblemFr({ outIds: [P.ail2], inIds: [], slots: smuggled }, context)).toBe(
      "Clément est sur le terrain sans être entré : ajoute-le à ceux qui entrent.",
    );
  });

  it("refuses a pitch with nobody in goal", () => {
    const slots = swapAt(live, 23, P.gk, P.sub).filter((slot) => slot.slotId !== SLOTS[0].id);
    const moved = [...slots, { slotId: SLOTS[0].id, memberId: P.sub }].filter(
      (slot) => slot.slotId !== SLOTS[0].id,
    );
    expect(changeProblemFr({ outIds: [P.gk], inIds: [], slots: moved }, context)).toBe(
      "Personne n’est dans les buts après ce changement.",
    );
  });

  it("refuses one player on two posts", () => {
    const slots = swapAt(live, 23, "", "").map((slot, index) =>
      index === 1 ? { ...slot, memberId: P.dc2 } : slot,
    );
    expect(changeProblemFr({ outIds: [P.dc1], inIds: [], slots }, context)).toBe(
      "Un joueur est placé à deux postes.",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The event, and which lines stay correctable                                 */
/* -------------------------------------------------------------------------- */

describe("buildChangeAmendment", () => {
  const live = liveMatch();
  const slots = swapAt(live, 20, P.ail2, P.sub);

  it("appends one LINEUP_APPLIED on the minute, nobody's planned composition", () => {
    const { events } = change(live, 20, slots);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.type).toBe("LINEUP_APPLIED");
    expect(event.clockMs).toBe(20 * MINUTE);
    expect(event.minute).toBe(20);
    expect(event.period).toBe(1);
    expect(event.occurredAt.getTime()).toBe(KICKOFF_AT_MS + 20 * MINUTE);
    expect(event.payload).toEqual({ lineupId: null, slots });
    expect(event.voidsEventId).toBeNull();
  });

  it("is keyed on the change, so a double tap is one change (invariant 6)", () => {
    const first = change(live, 20, slots).events[0].clientEventId;
    const reordered = change(live, 20, [...slots].reverse()).events[0].clientEventId;
    expect(reordered).toBe(first);
    expect(first).toBe(retroEventId(retroSubmissionId(changeSeed("m1", 20, slots)), 0));
    expect(change(live, 21, slots).events[0].clientEventId).not.toBe(first);
  });

  it("is clamped to the final whistle", () => {
    const { events } = buildChangeAmendment({
      submissionId: "s",
      periods: { periodsCount: 2, periodMinutes: 30 },
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: 60 * MINUTE,
      change: { minute: 90, slots },
    });
    expect(events[0].clockMs).toBe(60 * MINUTE);
  });
});

describe("isAmendableEntry", () => {
  it("keeps the facts and the substitutions correctable", () => {
    expect(isAmendableEntry({ type: "GOAL_FOR" })).toBe(true);
    expect(isAmendableEntry({ type: "SUBSTITUTION" })).toBe(true);
  });

  it("makes a change correctable, and never the starting composition (decision 150)", () => {
    expect(isAmendableEntry({ type: "LINEUP_APPLIED", startingLineup: false })).toBe(true);
    expect(isAmendableEntry({ type: "LINEUP_APPLIED", startingLineup: true })).toBe(false);
  });

  it("leaves the frame of the match alone", () => {
    for (const type of ["KICKOFF", "PERIOD_END", "FINAL_WHISTLE", "VOID"] as const) {
      expect(isAmendableEntry({ type })).toBe(false);
    }
  });

  it("agrees with the reducer about which line is the starting composition", () => {
    const state = reduceLive(liveMatch(), [], null);
    const lineups = state.timeline.filter((entry) => entry.type === "LINEUP_APPLIED");
    expect(lineups).toHaveLength(1);
    expect(isAmendableEntry(lineups[0])).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Realism, compared by (code, eventId)                                        */
/* -------------------------------------------------------------------------- */

describe("realism", () => {
  const live = liveMatch();
  const before = reduceLive(live, [], null);

  it("accepts a change that strands nothing", () => {
    const amendment = change(live, 20, swapAt(live, 20, P.ail2, P.sub2));
    const after = reduceLive(live, pending(amendment), null);
    expect(introducedAnomalies(before.anomalies, after.anomalies)).toEqual([]);
  });

  it("refuses bringing on at 20’ the man the log brings on at 30’ — that later change strands", () => {
    const amendment = change(live, 20, swapAt(live, 20, P.ail2, P.sub));
    const after = reduceLive(live, pending(amendment), null);
    const introduced = introducedAnomalies(before.anomalies, after.anomalies);
    expect(introduced.map((anomaly) => anomaly.code)).toEqual(["substitute-in-already-on"]);
    expect(realismRefusalFr(introduced, after, nameOf)).toBe(
      "Clément était déjà sur le terrain à la 30’.",
    );
  });

  it("refuses a change that takes off the man who scores later, naming him and the goal's minute", () => {
    // Samuel scores at 41’; a change at 20’ that takes him off leaves that goal scored by nobody on.
    const amendment = change(live, 20, swapAt(live, 20, P.at, P.sub2));
    const after = reduceLive(live, pending(amendment), null);
    const introduced = introducedAnomalies(before.anomalies, after.anomalies);
    expect(introduced.map((anomaly) => anomaly.code)).toEqual(["scorer-off-pitch"]);
    expect(realismRefusalFr(introduced, after, nameOf)).toBe(
      "Samuel n’était pas sur le terrain à la 41’ : il ne peut pas y avoir marqué.",
    );
  });

  it("refuses a second anomaly of a code the log already had — it is a different event", () => {
    const existing = [
      { code: "scorer-off-pitch" as const, message: "", eventId: "goal-a", clockMs: 0 },
    ];
    const after = [
      ...existing,
      { code: "scorer-off-pitch" as const, message: "", eventId: "goal-b", clockMs: 0 },
    ];
    expect(introducedAnomalies(existing, after).map((anomaly) => anomaly.eventId)).toEqual([
      "goal-b",
    ]);
  });

  it("ignores anomalies of the log's frame, which no correction is responsible for", () => {
    const after = [
      { code: "period-end-while-stopped" as const, message: "", eventId: "x", clockMs: 0 },
    ];
    expect(introducedAnomalies([], after)).toEqual([]);
  });

  it("tutoies and never says « vous »", () => {
    const amendment = change(live, 20, swapAt(live, 20, P.at, P.sub2));
    const after = reduceLive(live, pending(amendment), null);
    const sentence = realismRefusalFr(introducedAnomalies(before.anomalies, after.anomalies), after, nameOf);
    expect(sentence).not.toMatch(/\bvous\b|\bvotre\b/i);
  });
});
