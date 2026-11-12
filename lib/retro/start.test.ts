/**
 * « Corriger la composition de départ » (decision 223): the start is replaced in one batch, the rest of
 * the match stays as recorded, and the reducer — through the same realism check every correction
 * uses — refuses a seven that makes a later line impossible.
 */

import { describe, expect, it } from "vitest";

import { voidsStartingLineup } from "@/lib/match/ingest";
import type { LiveEvent, LiveMatch, LivePlayer, LiveSlot, PendingEvent } from "@/lib/match/presenter";
import { reduceLive } from "@/lib/match/presenter";
import type { MatchEventRecord } from "@/lib/match/reducer";

import { type RetroEntry, buildRetroLog, retroEventId, retroSubmissionId } from "./log";
import { introducedAnomalies, realismRefusalFr } from "./realism";
import {
  amendStartSchema,
  buildStartAmendment,
  squadAfterStart,
  startProblemFr,
  startSignature,
} from "./start";

/* -------------------------------------------------------------------------- */
/* Fixtures: a 2 × 30, Maxime scores at 12’, Clément on for Pierre at 30’      */
/* -------------------------------------------------------------------------- */

const uuid = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(9, "0")}`;

const KEYS = ["gk", "dc1", "dc2", "ail1", "mc", "ail2", "at", "sub", "fan", "sub2", "staff"] as const;
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
  [P.sub2]: "Charles",
  [P.staff]: "Coach",
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
const KICKOFF_AT_MS = Date.UTC(2026, 10, 10, 20, 5, 0);

const ENTRY: RetroEntry = {
  submissionId: "11111111-2222-4333-8444-555555555555",
  periods: { periodsCount: 2, periodMinutes: 30 },
  kickoffAtMs: KICKOFF_AT_MS,
  lineupId: null,
  starters: SLOTS.map((slot, index) => ({ slotId: slot.id, memberId: STARTERS[index] })),
  actions: [
    { key: "g1", type: "GOAL_FOR", memberId: P.mc, assistId: null, minute: 12 },
    { key: "c1", type: "SUBSTITUTION", outId: P.ail1, inId: P.sub, minute: 30 },
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
      opponentName: "Grand Paris FC",
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
      player("staff", { squadRole: null, isPlayer: false }),
    ],
    hasSquadSheet: true,
  };
}

/** The start with one man replaced in his own slot. */
function startWith(out: string, inn: string) {
  return SLOTS.map((slot, index) => ({
    slotId: slot.id,
    memberId: STARTERS[index] === out ? inn : STARTERS[index],
  }));
}

function correct(live: LiveMatch, slots: { slotId: string; memberId: string }[]) {
  const state = reduceLive(live, [], null);
  const start = state.timeline.find((line) => line.startingLineup && !line.voided)!;
  const submissionId = retroSubmissionId([live.match.id, "start", start.eventId, ...startSignature(slots)]);
  const amendment = buildStartAmendment({
    submissionId,
    kickoffAtMs: KICKOFF_AT_MS,
    start: { eventId: start.eventId, period: start.period, clockMs: start.clockMs },
    slots,
  });
  const pending: PendingEvent[] = amendment.events.map((event) => ({
    clientEventId: event.clientEventId,
    type: event.type,
    period: event.period,
    minute: event.minute,
    clockMs: event.clockMs,
    occurredAt: event.occurredAt.toISOString(),
    payload: event.payload ?? {},
    voidsEventId: event.voidsEventId ?? null,
  }));
  const after = reduceLive(live, pending, null);
  const introduced = introducedAnomalies(state.anomalies, after.anomalies);
  return { start, amendment, before: state, after, introduced, refusal: realismRefusalFr(introduced, after, nameOf) };
}

const minutesOf = (state: ReturnType<typeof reduceLive>, memberId: string) =>
  state.players.find((p) => p.memberId === memberId)?.minutes ?? 0;

/* -------------------------------------------------------------------------- */
/* The correction itself                                                      */
/* -------------------------------------------------------------------------- */

describe("correcting the start (decision 223)", () => {
  const live = liveMatch();

  it("puts the corrected seven on at the start's own clock, and Charles plays Lucien's minutes", () => {
    const { after, refusal, introduced, amendment, start } = correct(live, startWith(P.dc2, P.sub2));
    expect(introduced).toEqual([]);
    expect(refusal).toBeNull();
    // Two events, both at the start's clock and period: the annulment, then the replacement.
    expect(amendment.events.map((event) => [event.type, event.clockMs, event.period])).toEqual([
      ["VOID", start.clockMs, start.period],
      ["LINEUP_APPLIED", start.clockMs, start.period],
    ]);
    expect(amendment.events[0].voidsEventId).toBe(start.eventId);
    expect(minutesOf(after, P.sub2)).toBe(60);
    expect(minutesOf(after, P.dc2)).toBe(0);
  });

  it("moves the starting-lineup flag to the replacement and skips the original", () => {
    const { after, start } = correct(live, startWith(P.dc2, P.sub2));
    const starts = after.timeline.filter((line) => line.type === "LINEUP_APPLIED" && line.startingLineup);
    // The original is still in the timeline, struck through; the one that counts is the new event.
    const original = after.timeline.find((line) => line.eventId === start.eventId)!;
    expect(original.voided).toBe(true);
    const live1 = starts.filter((line) => !line.voided);
    expect(live1).toHaveLength(1);
    expect(live1[0].eventId).not.toBe(start.eventId);
    // And the compositions strip shows exactly one « Composition de départ », with Charles in it.
    const first = after.compositions.find((composition) => composition.startingLineup)!;
    expect(first.assignments.map((assignment) => assignment.memberId)).toContain(P.sub2);
    expect(first.assignments.map((assignment) => assignment.memberId)).not.toContain(P.dc2);
  });

  /*
   * The replacement is appended, so at clock 0 it replays after the KICKOFF it shares that reading
   * with. Pinned because it looks wrong and is not: the pitch is empty for no time, and nothing — not
   * minutes, not clean sheets, not an anomaly — sees the difference.
   */
  it("replays after the kick-off at 0′00″ without costing anybody a millisecond", () => {
    const { after, introduced } = correct(live, startWith(P.dc2, P.sub2));
    expect(introduced).toEqual([]);
    const charles = after.players.find((p) => p.memberId === P.sub2)!;
    expect(charles.playedMs).toBe(60 * MINUTE);
    expect(after.goalsFor).toBe(1);
  });

  it("refuses a seven that has Clément start, when the log brings him on at 30’", () => {
    // The owner's « Rémi comes on twice » case: the later substitution now brings on a man already on.
    const { introduced, refusal } = correct(live, startWith(P.dc2, P.sub));
    expect(introduced.map((anomaly) => anomaly.code)).toEqual(["substitute-in-already-on"]);
    expect(refusal).toBe("Clément était déjà sur le terrain à la 30’.");
  });

  it("refuses a seven that benches the man who scores at 12’", () => {
    const { introduced, refusal } = correct(live, startWith(P.mc, P.sub2));
    expect(introduced.map((anomaly) => anomaly.code)).toEqual(["scorer-off-pitch"]);
    expect(refusal).toBe("Maxime n’était pas sur le terrain à la 12’ : il ne peut pas y avoir marqué.");
  });

  it("refuses a seven that benches the man the log takes off at 30’", () => {
    const { introduced, refusal } = correct(live, startWith(P.ail1, P.sub2));
    expect(introduced.map((anomaly) => anomaly.code)).toContain("substitute-out-not-on");
    expect(refusal).not.toBeNull();
  });

  /*
   * « Change the start only », against a log whose later change is a whole-pitch snapshot (decision
   * 147) rather than a SUBSTITUTION. The snapshot says who is on from 30’, and stays as recorded; what
   * it *means* is re-derived by diff, so it now reads as Lucien coming on rather than nothing at all.
   * Nothing becomes impossible, and nothing is rewritten.
   */
  it("leaves a later whole-pitch change as recorded, and lets it describe the new movement", () => {
    const events = storedEvents({
      ...ENTRY,
      actions: [{ key: "g1", type: "GOAL_FOR", memberId: P.mc, assistId: null, minute: 12 }],
    });
    const snapshot: LiveEvent = {
      id: uuid("eee", 1),
      clientEventId: "snap-30",
      type: "LINEUP_APPLIED",
      period: 2,
      minute: 30,
      clockMs: 30 * MINUTE,
      occurredAt: new Date(KICKOFF_AT_MS + 30 * MINUTE).toISOString(),
      payload: { lineupId: null, slots: SLOTS.map((slot, index) => ({ slotId: slot.id, memberId: STARTERS[index] })) },
      voidsEventId: null,
      seq: 99,
    };
    const withSnapshot = liveMatch([...events, snapshot]);
    const { introduced, after } = correct(withSnapshot, startWith(P.dc2, P.sub2));
    expect(introduced).toEqual([]);
    // Charles 0→30, then the 30’ snapshot (Lucien in it) brings Lucien on for the second half.
    expect(minutesOf(after, P.sub2)).toBe(30);
    expect(minutesOf(after, P.dc2)).toBe(30);
    const at30 = after.timeline.find((line) => line.eventId === snapshot.id)!;
    expect(at30.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: P.dc2, role: "in" }),
        expect.objectContaining({ memberId: P.sub2, role: "out" }),
      ]),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The seven itself                                                           */
/* -------------------------------------------------------------------------- */

describe("startProblemFr", () => {
  const live = liveMatch();
  const candidates = live.players.map((p) => ({
    memberId: p.memberId,
    displayName: p.displayName,
    isPlayer: p.isPlayer,
    squadRole: p.squadRole,
  }));
  const current = startWith(P.dc2, P.dc2);
  const ask = (proposed: { slotId: string; memberId: string }[]) =>
    startProblemFr({ current, proposed, knownSlotIds: new Set(SLOTS.map((s) => s.id)), candidates });

  it("accepts a different seven of players", () => {
    expect(ask(startWith(P.dc2, P.sub2))).toBeNull();
  });

  it("says when nothing changed", () => {
    expect(ask(current)).toBe("C’est déjà la composition de départ de ce match.");
  });

  it("refuses somebody who does not play (decision 096)", () => {
    expect(ask(startWith(P.dc2, P.staff))).toBe("Coach ne joue pas : il peut être supporter, pas sur le terrain.");
  });

  /*
   * Decision 226 turned this refusal into a promotion said out loud: the screen offers him under
   * « Pas sur la feuille de match » and says « Léo passe de supporter à titulaire. » before Valider.
   */
  it("accepts a supporter now, whose promotion the screen announces (decision 226)", () => {
    expect(ask(startWith(P.dc2, P.fan))).toBeNull();
  });

  it("refuses somebody who has left the team, unless the sheet already had him playing", () => {
    const left = candidates.map((candidate) =>
      candidate.memberId === P.fan
        ? { ...candidate, hasLeft: true }
        : candidate.memberId === P.sub
          ? { ...candidate, hasLeft: true }
          : candidate,
    );
    const askWith = (proposed: { slotId: string; memberId: string }[]) =>
      startProblemFr({
        current,
        proposed,
        knownSlotIds: new Set(SLOTS.map((s) => s.id)),
        candidates: left,
      });
    expect(askWith(startWith(P.dc2, P.fan))).toBe(
      "Léo a quitté l’équipe : il ne peut plus être ajouté à ce match.",
    );
    // A substitute of this very match who has left since may still be moved within it.
    expect(askWith(startWith(P.dc2, P.sub))).toBeNull();
  });

  it("refuses a man twice, an unknown slot, an unknown player, and an empty pitch", () => {
    expect(ask(startWith(P.dc2, P.dc1))).toBe("Un poste ou un joueur apparaît deux fois dans cette composition.");
    expect(ask([{ slotId: uuid("zzz", 1), memberId: P.sub2 }])).toBe(
      "Un de ces postes n’existe pas dans la formation de ce match.",
    );
    expect(ask(startWith(P.dc2, uuid("zzz", 2)))).toBe("Un de ces joueurs n’est pas dans cette équipe.");
    expect(ask([])).toBe("Il faut au moins un joueur dans la composition de départ.");
  });

  it("tutoies and never says « vous »", () => {
    for (const proposed of [current, startWith(P.dc2, P.staff), startWith(P.dc2, P.fan), []]) {
      expect(ask(proposed) ?? "").not.toMatch(/\bvous\b|\bvotre\b/i);
    }
  });
});

describe("the squad sheet after a corrected start", () => {
  const roles = new Map<string, "starter" | "substitute" | "supporter" | null>([
    ...STARTERS.map((id) => [id, "starter"] as const),
    [P.sub2, "substitute"],
    [P.fan, "supporter"],
  ]);

  it("makes who now starts a starter, and who no longer does a substitute", () => {
    expect(
      squadAfterStart({
        hasSquadSheet: true,
        before: startWith(P.dc2, P.dc2),
        after: startWith(P.dc2, P.sub2),
        roles,
      }),
    ).toEqual([
      { memberId: P.sub2, role: "starter" },
      { memberId: P.dc2, role: "substitute" },
    ]);
  });

  it("writes nothing on a match that has no sheet", () => {
    expect(
      squadAfterStart({ hasSquadSheet: false, before: startWith(P.dc2, P.dc2), after: startWith(P.dc2, P.sub2), roles }),
    ).toEqual([]);
  });
});

describe("the posted shape", () => {
  it("takes the seven as slot and member ids", () => {
    const parsed = amendStartSchema.safeParse({
      teamId: uuid("ccc", 1),
      matchId: uuid("fff", 1),
      intent: "start",
      slots: startWith(P.dc2, P.sub2),
    });
    expect(parsed.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Decision 150, narrowed                                                     */
/* -------------------------------------------------------------------------- */

describe("annulling the start (decisions 150, 223)", () => {
  const log: MatchEventRecord[] = storedEvents().map((event) => ({ ...event }));
  const start = reduceLive(liveMatch(), [], null).timeline.find((line) => line.startingLineup)!;
  const submissionId = retroSubmissionId(["m1", "start"]);
  const replacement = buildStartAmendment({
    submissionId,
    kickoffAtMs: KICKOFF_AT_MS,
    start: { eventId: start.eventId, period: start.period, clockMs: start.clockMs },
    slots: startWith(P.dc2, P.sub2),
  }).events;

  it("still refuses an annulment of the start on its own", () => {
    expect(voidsStartingLineup(log, [replacement[0]])).toBe(true);
  });

  it("allows it in the batch that carries the corrected seven", () => {
    expect(voidsStartingLineup(log, replacement)).toBe(false);
  });

  it("does not count a later composition in the same batch as a replacement", () => {
    const at20 = {
      ...replacement[1],
      clientEventId: retroEventId(submissionId, 9),
      clockMs: 20 * MINUTE,
      minute: 20,
    };
    expect(voidsStartingLineup(log, [replacement[0], at20])).toBe(true);
  });
});
