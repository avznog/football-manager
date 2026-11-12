/**
 * Decision 226, both directions: bringing onto a finished match somebody the sheet does not have,
 * and taking off it somebody who was never there.
 */

import { describe, expect, it } from "vitest";

import { voidsStartingLineup } from "@/lib/match/ingest";
import { actualPeriodStarts, periodsConfig } from "@/lib/match/clock";
import type { LiveEvent, LiveMatch, LivePlayer, LiveSlot, PendingEvent } from "@/lib/match/presenter";
import { reduceLive } from "@/lib/match/presenter";
import type { MatchEventRecord } from "@/lib/match/reducer";

import { changeCandidateIds, stateAtClock } from "./change";
import { introducedAnomalies } from "./realism";
import { planRemoval } from "./remove";
import { offSheetCandidateIds, sheetAdditionFr, sheetAdditions } from "./sheet";

/* -------------------------------------------------------------------------- */
/* Fixtures: a live 2 × 30, Lucien on from 0′ and off for Charles at 20′       */
/* -------------------------------------------------------------------------- */

const uuid = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(9, "0")}`;

const KEYS = [
  "gk", "dc1", "dc2", "ail1", "mc", "ail2", "at", "sub", "remi", "fan", "staff", "gone",
] as const;
type Key = (typeof KEYS)[number];
const P = Object.fromEntries(KEYS.map((key, index) => [key, uuid("aaa", index + 1)])) as Record<Key, string>;
const NAMES: Record<Key, string> = {
  gk: "Lucas", dc1: "Nicolas", dc2: "Lucien", ail1: "Pierre", mc: "Maxime", ail2: "Benjamin",
  at: "Samuel", sub: "Charles", remi: "Rémi", fan: "Léo C", staff: "Coach", gone: "Thomas",
};

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
const MIN = 60_000;
const KICKOFF_AT_MS = Date.UTC(2026, 10, 10, 20, 5, 0);
const SUBMISSION = "11111111-2222-4333-8444-555555555555";

const pitch = (members: readonly string[]) =>
  SLOTS.map((slot, index) => ({ slotId: slot.id, memberId: members[index] }));

function event(seq: number, type: LiveEvent["type"], clockMs: number, period: number, payload: unknown = {}): LiveEvent {
  return {
    id: uuid("ddd", seq),
    clientEventId: uuid("ccc", seq),
    type,
    period,
    minute: Math.floor(clockMs / MIN),
    clockMs,
    occurredAt: new Date(KICKOFF_AT_MS + clockMs).toISOString(),
    payload,
    voidsEventId: null,
    seq,
  };
}

/** Lucien starts at DC and goes off for Charles at 20′; Maxime scores at 12′. */
function storedEvents(): LiveEvent[] {
  const afterChange = STARTERS.map((memberId) => (memberId === P.dc2 ? P.sub : memberId));
  return [
    event(1, "LINEUP_APPLIED", 0, 1, { lineupId: null, slots: pitch(STARTERS) }),
    event(2, "KICKOFF", 0, 1),
    event(3, "GOAL_FOR", 12 * MIN, 1, { scorerId: P.mc }),
    event(4, "LINEUP_APPLIED", 20 * MIN, 1, { lineupId: null, slots: pitch(afterChange) }),
    event(5, "PERIOD_END", 30 * MIN, 1),
    event(6, "KICKOFF", 30 * MIN, 2),
    event(7, "PERIOD_END", 60 * MIN, 2),
    event(8, "FINAL_WHISTLE", 60 * MIN, 2),
  ];
}

const player = (key: Key, extra: Partial<LivePlayer> = {}): LivePlayer => ({
  memberId: P[key],
  displayName: NAMES[key],
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
      entryMode: "live",
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
      // Rémi: a player of the team the sheet forgot.
      player("remi", { squadRole: null }),
      player("fan", { squadRole: "supporter" }),
      player("staff", { squadRole: null, isPlayer: false }),
      // Thomas: on this match's sheet as a supporter, and has left the team since.
      player("gone", { squadRole: "supporter", hasLeft: true }),
    ],
    hasSquadSheet: true,
  };
}

const pendingOf = (events: readonly { clientEventId: string; type: LiveEvent["type"]; period: number; minute: number; clockMs: number; occurredAt: Date; payload?: unknown; voidsEventId?: string | null }[]): PendingEvent[] =>
  events.map((e) => ({
    clientEventId: e.clientEventId,
    type: e.type,
    period: e.period,
    minute: e.minute,
    clockMs: e.clockMs,
    occurredAt: e.occurredAt.toISOString(),
    payload: e.payload ?? {},
    voidsEventId: e.voidsEventId ?? null,
  }));

const minutesOf = (state: ReturnType<typeof reduceLive>, memberId: string) =>
  state.players.find((p) => p.memberId === memberId)?.minutes ?? 0;

/* -------------------------------------------------------------------------- */
/* Bringing somebody on from outside the sheet                                 */
/* -------------------------------------------------------------------------- */

describe("who may be brought onto a finished match from outside the sheet", () => {
  const live = liveMatch();
  const whole = reduceLive(live, [], null);
  const at25 = stateAtClock(live, 25 * MIN);

  it("offers the forgotten player and the supporter, apart from the sheet's own", () => {
    const off = offSheetCandidateIds(live, at25, whole);
    expect(off).toContain(P.remi);
    expect(off).toContain(P.fan);
    // Nobody is in both lists, so the two groups on the screen never repeat a name.
    const sheet = new Set(changeCandidateIds(live, at25, whole));
    expect(off.filter((id) => sheet.has(id))).toEqual([]);
  });

  it("never offers a non-player, nor somebody who has left the team", () => {
    const off = offSheetCandidateIds(live, at25, whole);
    expect(off).not.toContain(P.staff);
    expect(off).not.toContain(P.gone);
  });

  it("offers nobody apart on a match with no sheet, where everybody is already offered", () => {
    const noSheet = { ...live, hasSquadSheet: false };
    expect(offSheetCandidateIds(noSheet, at25, whole)).toEqual([]);
    expect(changeCandidateIds(noSheet, at25, whole)).toContain(P.remi);
  });

  it("says what the sheet becomes, in French, one line per person", () => {
    const viaChange = sheetAdditions(live, [P.remi, P.fan, P.sub], "substitute");
    expect(viaChange.map(sheetAdditionFr)).toEqual([
      "Rémi sera ajouté à la feuille de match comme remplaçant.",
      "Léo C passe de supporter à remplaçant.",
    ]);
    const viaStart = sheetAdditions(live, [P.remi, P.gk], "starter");
    expect(viaStart.map(sheetAdditionFr)).toEqual([
      "Rémi sera ajouté à la feuille de match comme titulaire.",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Taking somebody off the match                                              */
/* -------------------------------------------------------------------------- */

function remove(live: LiveMatch, memberId: string, replacementId: string | null) {
  const state = reduceLive(live, [], null);
  return {
    state,
    plan: planRemoval({
      live,
      state,
      periods: periodsConfig(live.match),
      periodStarts: actualPeriodStarts(state.playIntervals),
      memberId,
      replacementId,
      submissionId: SUBMISSION,
      kickoffAtMs: KICKOFF_AT_MS,
    }),
  };
}

describe("removing somebody who never showed up (decision 226)", () => {
  it("gives his slot to the man who really played, in every snapshot he was in", () => {
    const live = liveMatch();
    const { state, plan } = remove(live, P.dc2, P.remi);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    // Only the start carries Lucien: the 20′ snapshot is the pitch *after* he went off.
    expect(plan.amendment.events.map((e) => e.type)).toEqual(["VOID", "LINEUP_APPLIED"]);
    expect(plan.linesFr).toEqual([
      "Lucien sera retiré du match.",
      "Rémi prend sa place en DC de 0’ à 20’.",
      "Rémi sera ajouté à la feuille de match comme titulaire.",
    ]);
    expect(plan.replacementRole).toEqual({ memberId: P.remi, role: "starter" });

    // Replayed: Rémi has Lucien's twenty minutes and Lucien has none.
    const after = reduceLive(live, pendingOf(plan.amendment.events), null);
    expect(minutesOf(after, P.remi)).toBe(20);
    expect(minutesOf(after, P.dc2)).toBe(0);
    expect(introducedAnomalies(state.anomalies, after.anomalies)).toEqual([]);
    // And the new start is still recognised as the start, which is what lets ingestion accept it.
    expect(after.timeline.find((line) => line.startingLineup && !line.voided)?.clockMs).toBe(0);
  });

  it("replaces him in every snapshot he is in, not only the start", () => {
    // Nicolas stays on through the 20′ change, so both snapshots carry him.
    const live = liveMatch();
    const { state, plan } = remove(live, P.dc1, P.remi);
    if (!plan.ok) throw new Error(plan.problemFr);
    expect(plan.amendment.events.map((e) => e.type)).toEqual([
      "VOID", "LINEUP_APPLIED", "VOID", "LINEUP_APPLIED",
    ]);
    expect(plan.linesFr[1]).toBe("Rémi prend sa place en DC de 0’ à 60’.");
    const after = reduceLive(live, pendingOf(plan.amendment.events), null);
    expect(minutesOf(after, P.remi)).toBe(60);
    expect(minutesOf(after, P.dc1)).toBe(0);
    expect(introducedAnomalies(state.anomalies, after.anomalies)).toEqual([]);
  });

  it("leaves his slot empty when nobody replaced him, and says the team played one short", () => {
    const live = liveMatch();
    const { plan } = remove(live, P.dc2, null);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.linesFr).toEqual([
      "Lucien sera retiré du match.",
      "Personne ne le remplace : l’équipe joue à 6 de 0’ à 20’.",
    ]);
    const after = reduceLive(live, pendingOf(plan.amendment.events), null);
    expect(after.compositions.find((c) => c.startingLineup)?.assignments).toHaveLength(6);
  });

  it("refuses nobody in his place when he was in goal", () => {
    const { plan } = remove(liveMatch(), P.gk, null);
    expect(plan).toEqual({
      ok: false,
      problemFr: "Lucas était dans les buts à la 0’ : il faut quelqu’un à sa place.",
    });
  });

  it("refuses a replacement who was already on the pitch", () => {
    const { plan } = remove(liveMatch(), P.dc2, P.mc);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.problemFr).toBe("Maxime était déjà sur le terrain à la 0’ : choisis quelqu’un d’autre.");
  });

  it("refuses while an action names him, so the coach fixes it first", () => {
    const { plan } = remove(liveMatch(), P.mc, P.remi);
    expect(plan).toEqual({
      ok: false,
      problemFr: "Maxime est nommé dans « But » à la 12’ : corrige ou annule cette action d’abord.",
    });
  });

  it("writes nothing to the log for somebody who never set foot on the pitch", () => {
    const { plan } = remove(liveMatch(), P.fan, null);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.amendment.events).toEqual([]);
    expect(plan.linesFr).toEqual(["Léo C sera retiré du match."]);
  });

  it("lets ingestion accept the batch that annuls and replaces the start", () => {
    const live = liveMatch();
    const { plan } = remove(live, P.dc2, P.remi);
    if (!plan.ok) throw new Error(plan.problemFr);
    const log: MatchEventRecord[] = live.events.map((e) => ({ ...e }));
    expect(voidsStartingLineup(log, plan.amendment.events)).toBe(false);
  });

  it("is the same batch twice for the same answer, so a double tap is one removal", () => {
    const a = remove(liveMatch(), P.dc2, P.remi).plan;
    const b = remove(liveMatch(), P.dc2, P.remi).plan;
    if (!a.ok || !b.ok) throw new Error("expected both to plan");
    expect(a.amendment.events.map((e) => e.clientEventId)).toEqual(
      b.amendment.events.map((e) => e.clientEventId),
    );
  });
});
