import { describe, expect, it } from "vitest";

import { MS_PER_MINUTE } from "./clock";
import {
  availableOptions,
  clockActionFr,
  enterableCardFr,
  eventLabel,
  mergeEvents,
  minuteLabelFr,
  nextEventStamp,
  onPitchOptions,
  pendingCountLabelFr,
  emptyPitchFr,
  pendingLineupChangesFr,
  pendingLineupView,
  periodsOf,
  phaseLabelFr,
  pitchView,
  playerIndex,
  proposedPitchView,
  reduceLive,
  squadRoleLabelFr,
  timelineLines,
  wholeMinutes,
  type LiveEvent,
  type LiveMatch,
  type LivePlayer,
  type LiveSlot,
  type PendingEvent,
  type PendingLineupView,
} from "./presenter";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Wall clock of the kick-off: the tests that tick the clock add to it, nothing reads `Date.now()`. */
const T0 = Date.UTC(2026, 3, 11, 8, 0, 0);
const MIN = MS_PER_MINUTE;

const SLOT = {
  gb: "s-gb",
  dg: "s-dg",
  dc: "s-dc",
  dd: "s-dd",
  mc1: "s-mc1",
  mc2: "s-mc2",
  at: "s-at",
} as const;

/** The built-in 1-3-2-1, with the permille coordinates `formation_slots` stores. */
const SLOTS: LiveSlot[] = [
  { id: SLOT.gb, formationId: "f1", positionCode: "GB", x: 500, y: 60, sort: 1 },
  { id: SLOT.dg, formationId: "f1", positionCode: "DG", x: 220, y: 280, sort: 2 },
  { id: SLOT.dc, formationId: "f1", positionCode: "DC", x: 500, y: 250, sort: 3 },
  { id: SLOT.dd, formationId: "f1", positionCode: "DD", x: 780, y: 280, sort: 4 },
  { id: SLOT.mc1, formationId: "f1", positionCode: "MC", x: 350, y: 540, sort: 5 },
  { id: SLOT.mc2, formationId: "f1", positionCode: "MC", x: 650, y: 540, sort: 6 },
  { id: SLOT.at, formationId: "f1", positionCode: "AT", x: 500, y: 850, sort: 7 },
];

const player = (
  memberId: string,
  displayName: string,
  extra: Partial<LivePlayer> = {},
): LivePlayer => ({
  memberId,
  displayName,
  jerseyNumber: null,
  isInjured: false,
  squadRole: "starter",
  positionCodes: [],
  isPlayer: true,
  ...extra,
});

const PLAYERS: LivePlayer[] = [
  player("hugo", "Hugo"),
  player("samir", "Samir"),
  player("thomas", "Thomas"),
  player("nico", "Nico"),
  player("leo", "Léo"),
  player("karim", "Karim"),
  player("julien", "Julien"),
  player("momo", "Momo", { squadRole: "substitute" }),
  player("yanis", "Yanis", { squadRole: "substitute" }),
  player("ali", "Ali", { squadRole: "substitute", isInjured: true }),
  player("gerard", "Gérard", { squadRole: "supporter", isPlayer: false }),
  player("fabien", "Fabien", { squadRole: null }),
];

const STARTING_SEVEN = [
  { slotId: SLOT.gb, memberId: "hugo" },
  { slotId: SLOT.dg, memberId: "samir" },
  { slotId: SLOT.dc, memberId: "thomas" },
  { slotId: SLOT.dd, memberId: "nico" },
  { slotId: SLOT.mc1, memberId: "leo" },
  { slotId: SLOT.mc2, memberId: "karim" },
  { slotId: SLOT.at, memberId: "julien" },
];

type Fixture = {
  type: LiveEvent["type"];
  min: number;
  period?: number;
  payload?: unknown;
  /** 1-based index of the event this one annuls. */
  voids?: number;
};

function log(fixtures: Fixture[]): LiveEvent[] {
  return fixtures.map((fixture, index) => ({
    id: `e${index + 1}`,
    clientEventId: `c${index + 1}`,
    type: fixture.type,
    period: fixture.period ?? (fixture.min >= 30 ? 2 : 1),
    minute: fixture.min,
    clockMs: fixture.min * MIN,
    occurredAt: new Date(T0 + fixture.min * MIN).toISOString(),
    payload: fixture.payload ?? {},
    voidsEventId: fixture.voids === undefined ? null : `e${fixture.voids}`,
    seq: index + 1,
  }));
}

function live(events: LiveEvent[], overrides: Partial<LiveMatch> = {}): LiveMatch {
  return {
    match: {
      id: "m1",
      teamId: "t1",
      kickoffAt: new Date(T0).toISOString(),
      opponentName: "FC Voisin",
      isHome: true,
      venue: "Stade municipal",
      competitionId: "c1",
      competitionLabel: "Championnat",
      periodsCount: 2,
      periodMinutes: 30,
      status: "live",
      operatorUserId: "u1",
      entryMode: "live",
    },
    kit: { primaryColor: "#1d4ed8", secondaryColor: "#ffffff" },
    events,
    lineups: [],
    slots: SLOTS,
    formations: [{ id: "f1", name: "1-3-2-1", label: "1-3-2-1", isBuiltin: true, slots: SLOTS }],
    defaultFormationId: "f1",
    players: PLAYERS,
    hasSquadSheet: true,
    ...overrides,
  };
}

const lineupPayload = (
  assignments: readonly { slotId: string; memberId: string }[],
  lineupId: string | null = null,
) => ({ lineupId, slots: assignments });

/** A kicked-off match with the seven on the pitch. */
const KICKED_OFF: Fixture[] = [
  { type: "KICKOFF", min: 0, period: 1 },
  { type: "LINEUP_APPLIED", min: 0, period: 1, payload: lineupPayload(STARTING_SEVEN) },
];

const index = playerIndex(PLAYERS);

/* -------------------------------------------------------------------------- */
/* Pending actions                                                            */
/* -------------------------------------------------------------------------- */

describe("merging the outbox into the log", () => {
  const pending: PendingEvent = {
    clientEventId: "p1",
    type: "GOAL_FOR",
    period: 1,
    minute: 12,
    clockMs: 12 * MIN,
    occurredAt: new Date(T0 + 12 * MIN).toISOString(),
    payload: { scorerId: "julien" },
  };

  it("shows a queued action immediately, after everything confirmed", () => {
    const merged = mergeEvents(log(KICKED_OFF), [pending]);

    expect(merged).toHaveLength(3);
    expect(merged[2].id).toBe("p1"); // its own client id stands in for match_events.id
    expect(merged[2].seq).toBe(3);
  });

  it("counts a goal the moment it is tapped, before any round trip", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [pending], T0 + 13 * MIN);

    expect(state.goalsFor).toBe(1);
    expect(state.scoreLabel).toBe("1 – 0");
  });

  it("does not count it twice once the server has confirmed it", () => {
    const confirmed = log([
      ...KICKED_OFF,
      { type: "GOAL_FOR", min: 12, payload: { scorerId: "julien" } },
    ]);
    // The outbox has not been told yet, so it still holds the action — under the id the server
    // stored it as.
    const stale: PendingEvent = { ...pending, clientEventId: "c3" };

    expect(mergeEvents(confirmed, [stale])).toHaveLength(3);
    expect(reduceLive(live(confirmed), [stale], null).goalsFor).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Stamping                                                                   */
/* -------------------------------------------------------------------------- */

describe("stamping an action on the device", () => {
  it("takes the clock as it reads while the match is running", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 23 * MIN + 40_000);
    const stamp = nextEventStamp(state, "GOAL_FOR", T0 + 23 * MIN + 40_000);

    expect(stamp).toEqual({ period: 1, minute: 23, clockMs: 23 * MIN + 40_000 });
  });

  it("gives the second-half kick-off period 2 and a continuous clock", () => {
    // The first half was whistled early, at 28′: the second half must still start at 30′, because
    // minutes are continuous (decision 009) and 28′ would replay before the period end.
    const events = log([...KICKED_OFF, { type: "PERIOD_END", min: 28, period: 1 }]);
    const state = reduceLive(live(events), [], T0 + 40 * MIN);

    expect(nextEventStamp(state, "KICKOFF", T0 + 40 * MIN)).toEqual({
      period: 2,
      minute: 30,
      clockMs: 30 * MIN,
    });
  });

  it("never invents a period beyond the configured count", () => {
    const events = log([
      ...KICKED_OFF,
      { type: "PERIOD_END", min: 30, period: 1 },
      { type: "KICKOFF", min: 30, period: 2 },
      { type: "PERIOD_END", min: 60, period: 2 },
    ]);
    const state = reduceLive(live(events), [], T0 + 70 * MIN);

    expect(nextEventStamp(state, "KICKOFF", T0 + 70 * MIN).period).toBe(2);
  });

  it("stamps a pause at the moment it happens, not at the period end", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 17 * MIN);

    expect(nextEventStamp(state, "PAUSE", T0 + 17 * MIN).clockMs).toBe(17 * MIN);
  });

  it("does not advance a stopped clock, however long the coach stares at the screen", () => {
    const events = log([...KICKED_OFF, { type: "PAUSE", min: 20 }]);
    const state = reduceLive(live(events), [], T0 + 26 * MIN);

    expect(nextEventStamp(state, "INJURY", T0 + 26 * MIN).clockMs).toBe(20 * MIN);
  });
});

/* -------------------------------------------------------------------------- */
/* The pitch                                                                  */
/* -------------------------------------------------------------------------- */

describe("the pitch", () => {
  it("draws the seven where the formation puts them, in formation order", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 5 * MIN);
    const view = pitchView(state, SLOTS, index);

    expect(view.map((slot) => slot.player?.name)).toEqual([
      "Hugo",
      "Samir",
      "Thomas",
      "Nico",
      "Léo",
      "Karim",
      "Julien",
    ]);
    expect(view[0]).toMatchObject({ x: 500, y: 60, positionCode: "GB" });
  });

  it("leaves an empty slot empty rather than shifting the others", () => {
    const seven = STARTING_SEVEN.filter((entry) => entry.slotId !== SLOT.at);
    const state = reduceLive(
      live(log([{ type: "KICKOFF", min: 0 }, { type: "LINEUP_APPLIED", min: 0, payload: lineupPayload(seven) }])),
      [],
      T0 + 5 * MIN,
    );
    const view = pitchView(state, SLOTS, index);

    expect(view).toHaveLength(7);
    expect(view.at(-1)?.player).toBeNull();
  });

  it("flags an injured player without taking their disc away (decision 011)", () => {
    const events = log([
      ...KICKED_OFF,
      { type: "SUBSTITUTION", min: 20, payload: { outId: "julien", inId: "ali" } },
    ]);
    const state = reduceLive(live(events), [], T0 + 25 * MIN);
    const view = pitchView(state, SLOTS, index);
    const ali = view.find((slot) => slot.player?.id === "ali");

    expect(ali?.player?.statusLabel).toBe("blessé");
    expect(ali?.player?.variant).toBe("normal");
  });

  it("marks the player the action sheet is about", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 5 * MIN);
    const view = pitchView(state, SLOTS, index, { selectedMemberId: "karim" });

    expect(view.find((slot) => slot.player?.id === "karim")?.player?.variant).toBe("selected");
    expect(view.find((slot) => slot.player?.id === "hugo")?.player?.variant).toBe("normal");
  });

  it("still shows a player whose slot no longer exists", () => {
    const events = log([
      { type: "KICKOFF", min: 0 },
      {
        type: "LINEUP_APPLIED",
        min: 0,
        payload: lineupPayload([...STARTING_SEVEN, { slotId: "deleted-slot", memberId: "momo" }]),
      },
    ]);
    const state = reduceLive(live(events), [], T0 + 5 * MIN);
    const view = pitchView(state, SLOTS, index);
    const momo = view.find((slot) => slot.player?.id === "momo");

    expect(momo).toBeDefined();
    expect(momo?.player?.statusLabel).toBe("poste inconnu");
  });

  it("draws a proposed composition as ghosts, and a flagged player as unavailable", () => {
    const proposed = [
      ...STARTING_SEVEN.filter((entry) => entry.slotId !== SLOT.at),
      { slotId: SLOT.at, memberId: "ali" },
    ];
    const view = proposedPitchView(proposed, SLOTS, index, {
      onPitchMemberIds: STARTING_SEVEN.map((entry) => entry.memberId),
      flags: [{ memberId: "ali", reason: "injured" }],
    });

    expect(view.find((slot) => slot.player?.id === "hugo")?.player?.variant).toBe("normal");
    expect(view.find((slot) => slot.player?.id === "ali")?.player).toMatchObject({
      variant: "unavailable",
      statusLabel: "blessé",
    });
  });

  it("ghosts a player who is not on yet", () => {
    const view = proposedPitchView([{ slotId: SLOT.at, memberId: "yanis" }], SLOTS, index, {
      onPitchMemberIds: ["julien"],
    });

    expect(view[0].player?.variant).toBe("ghost");
  });
});

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

describe("the player pickers", () => {
  it("lists the pitch in formation order with position and minutes", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 34 * MIN + 10_000);
    const options = onPitchOptions(state, SLOTS, index);

    expect(options.map((option) => option.name)).toEqual([
      "Hugo",
      "Samir",
      "Thomas",
      "Nico",
      "Léo",
      "Karim",
      "Julien",
    ]);
    expect(options[0].subtitle).toBe("GB · 34’");
  });

  it("offers everyone who is not on the pitch, substitutes first", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 20 * MIN);
    const options = availableOptions(state, PLAYERS);

    // Gérard is a supporter and not a player: never offered.
    expect(options.map((option) => option.name)).toEqual(["Ali", "Momo", "Yanis", "Fabien"]);
    expect(options[0].subtitle).toBe("remplaçant · blessé");
    expect(options[0].warn).toBe(true);
    // The sheet says nothing about Fabien, but a coach one short at 20′ still needs him.
    expect(options.at(-1)?.subtitle).toBe("hors feuille");
  });

  it("does not call the list « Remplaçants » when most of it is not", () => {
    // Before the kick-off nobody is on the pitch, so the list is the whole squad (invariant 3).
    const before = reduceLive(live(log([])), [], T0);
    const all = availableOptions(before, PLAYERS);
    const substitutes = all.filter((option) =>
      PLAYERS.some(
        (player) => player.memberId === option.memberId && player.squadRole === "substitute",
      ),
    );

    expect(all.length).toBeGreaterThan(substitutes.length);
    const card = enterableCardFr({ available: all, players: PLAYERS, canAct: true });
    expect(card.titleFr).not.toBe("Remplaçants");
    expect(card.titleFr).toBe("Qui peut entrer");
    expect(card.hintFr).toContain("puis le reste du groupe");
  });

  it("says nothing about the order when the list really is the substitutes", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 20 * MIN);
    const onlySubs = availableOptions(state, PLAYERS).filter((option) =>
      PLAYERS.some(
        (player) => player.memberId === option.memberId && player.squadRole === "substitute",
      ),
    );

    const card = enterableCardFr({ available: onlySubs, players: PLAYERS, canAct: true });

    expect(card.hintFr).toBe("Touchez un joueur pour le faire entrer.");
  });

  it("tells a spectator what the list is, not what to do with it", () => {
    const state = reduceLive(live(log(KICKED_OFF)), [], T0 + 20 * MIN);
    const card = enterableCardFr({
      available: availableOptions(state, PLAYERS),
      players: PLAYERS,
      canAct: false,
    });

    expect(card.titleFr).toBe("En dehors du terrain");
    expect(card.hintFr).toBeNull();
  });

  it("does not call an empty list a bench nobody is sitting on", () => {
    const card = enterableCardFr({ available: [], players: PLAYERS, canAct: true });

    expect(card.emptyFr).toBe("Tous les joueurs sont sur le terrain.");
    expect(card.emptyFr).not.toContain("banc");
  });

  it("says out loud that a player has already played, rather than hiding them", () => {
    const events = log([
      ...KICKED_OFF,
      { type: "SUBSTITUTION", min: 10, payload: { outId: "julien", inId: "momo" } },
      { type: "SUBSTITUTION", min: 32, payload: { outId: "momo", inId: "yanis" } },
    ]);
    const state = reduceLive(live(events), [], T0 + 40 * MIN);
    const momo = availableOptions(state, PLAYERS).find((option) => option.memberId === "momo");

    expect(momo?.subtitle).toBe("remplaçant · déjà joué 22’");
  });
});

/* -------------------------------------------------------------------------- */
/* The timeline                                                               */
/* -------------------------------------------------------------------------- */

describe("the timeline", () => {
  const events = log([
    ...KICKED_OFF,
    { type: "GOAL_FOR", min: 11, payload: { scorerId: "julien", assistId: "karim" } },
    { type: "GOAL_AGAINST", min: 18 },
    { type: "SUBSTITUTION", min: 25, payload: { outId: "leo", inId: "yanis" } },
  ]);

  it("reads newest first, in French, with the score at that moment", () => {
    const state = reduceLive(live(events), [], T0 + 30 * MIN);
    const lines = timelineLines(state, index);

    expect(lines[0]).toMatchObject({ title: "Changement", detail: "Léo → Yanis", minuteLabel: "25’" });
    expect(lines[1]).toMatchObject({ title: "But encaissé", scoreLabel: "1 – 1" });
    expect(lines[2]).toMatchObject({ title: "But", detail: "Julien (passe de Karim)", scoreLabel: "1 – 0" });
  });

  it("offers « annuler » only on an event that can be annulled and has reached the server", () => {
    const state = reduceLive(live(events), [], T0 + 30 * MIN);
    const lines = timelineLines(state, index, { pendingClientEventIds: ["c5"] });
    const byClientId = new Map(lines.map((line) => [line.clientEventId, line]));

    expect(byClientId.get("c5")).toMatchObject({ pending: true, canVoid: false });
    expect(byClientId.get("c3")).toMatchObject({ pending: false, canVoid: true });
    // Even the kick-off can be annulled — a whistle tapped a minute early is a real mistake, and
    // `canBeVoided` refuses only a VOID of a VOID.
    expect(byClientId.get("c1")?.canVoid).toBe(true);
  });

  it("strikes a voided event through instead of dropping it (invariant 1)", () => {
    const withVoid = log([
      ...KICKED_OFF,
      { type: "GOAL_FOR", min: 11, payload: { scorerId: "julien" } },
      { type: "VOID", min: 12, voids: 3 },
    ]);
    const state = reduceLive(live(withVoid), [], T0 + 20 * MIN);
    const lines = timelineLines(state, index);

    expect(state.goalsFor).toBe(0);
    const goal = lines.find((line) => line.clientEventId === "c3");
    expect(goal).toMatchObject({ voided: true, canVoid: false });
    expect(lines.find((line) => line.clientEventId === "c4")?.voidsEventId).toBe("e3");
  });

  it("reads out every change of a composition, not one arbitrary name", () => {
    // A TERRAIN change: Léo → Yanis, Julien → Momo, and Karim pushed up front. All of it is one
    // event, so the one line has to carry all of it.
    const terrain = [
      { slotId: SLOT.gb, memberId: "hugo" },
      { slotId: SLOT.dg, memberId: "samir" },
      { slotId: SLOT.dc, memberId: "thomas" },
      { slotId: SLOT.dd, memberId: "nico" },
      { slotId: SLOT.mc1, memberId: "yanis" },
      { slotId: SLOT.mc2, memberId: "momo" },
      { slotId: SLOT.at, memberId: "karim" },
    ];
    const events = log([
      ...KICKED_OFF,
      { type: "LINEUP_APPLIED", min: 40, period: 2, payload: lineupPayload(terrain) },
    ]);
    const state = reduceLive(live(events), [], T0 + 45 * MIN);

    expect(timelineLines(state, index)[0]).toMatchObject({
      title: "Composition appliquée",
      detail: "Sortent : Léo, Julien · Entrent : Yanis, Momo · Change de poste : Karim",
    });
  });

  it("phrases a one-player composition change in the singular", () => {
    const sixPlusOne = [...STARTING_SEVEN.filter((entry) => entry.memberId !== "julien")];
    const events = log([
      ...KICKED_OFF,
      {
        type: "LINEUP_APPLIED",
        min: 40,
        period: 2,
        payload: lineupPayload([...sixPlusOne, { slotId: SLOT.at, memberId: "momo" }]),
      },
    ]);
    const state = reduceLive(live(events), [], T0 + 45 * MIN);

    expect(timelineLines(state, index)[0].detail).toBe("Sort : Julien · Entre : Momo");
  });

  it("names an unknown player rather than printing an id at the coach", () => {
    const orphan = log([...KICKED_OFF, { type: "FOUL", min: 14, payload: { memberId: "ghost" } }]);
    const state = reduceLive(live(orphan), [], T0 + 20 * MIN);

    expect(timelineLines(state, index)[0].detail).toBe("Joueur inconnu");
  });
});

/* -------------------------------------------------------------------------- */
/* The planned-composition prompt                                             */
/* -------------------------------------------------------------------------- */

describe("the planned-composition prompt", () => {
  const planned = {
    id: "l-45",
    fromMinute: 45,
    isInitial: false,
    appliedEventId: null,
    formationId: "f1",
    formationLabel: "1-3-2-1",
    slots: [
      ...STARTING_SEVEN.filter((entry) => entry.slotId !== SLOT.at && entry.slotId !== SLOT.mc2),
      { slotId: SLOT.at, memberId: "ali" },
      { slotId: SLOT.mc2, memberId: "yanis" },
    ],
  };

  const events = log([
    ...KICKED_OFF,
    { type: "PERIOD_END", min: 30, period: 1 },
    { type: "KICKOFF", min: 30, period: 2 },
  ]);

  it("describes what would change, and warns without blocking (invariant 3)", () => {
    const state = reduceLive(live(events, { lineups: [planned] }), [], T0 + 46 * MIN);
    const view = pendingLineupView(state.pendingLineup, [planned], index);

    expect(view?.title).toBe("Composition prévue à la 45’");
    expect(view?.isEmpty).toBe(false);
    expect(view?.changes.join(" | ")).toContain("Ali");
    // The reducer cannot know Ali was hurt at training: that flag comes from the roster.
    expect(view?.warnings).toEqual(["Ali est blessé"]);
    expect(view?.flags).toEqual([{ memberId: "ali", reason: "injured" }]);
    // Nothing is applied: the pitch is still the starting seven until the coach confirms.
    expect(state.onPitch.map((entry) => entry.memberId)).toContain("julien");
    expect(state.appliedLineupIds).toEqual([]);
  });

  it("raises nothing before its minute", () => {
    const state = reduceLive(live(events, { lineups: [planned] }), [], T0 + 40 * MIN);

    expect(state.pendingLineup).toBeNull();
    expect(pendingLineupView(state.pendingLineup, [planned], index)).toBeNull();
  });

  it("stops asking once the coach has confirmed it", () => {
    const applied = log([
      ...KICKED_OFF,
      { type: "PERIOD_END", min: 30, period: 1 },
      { type: "KICKOFF", min: 30, period: 2 },
      { type: "LINEUP_APPLIED", min: 45, period: 2, payload: lineupPayload(planned.slots, "l-45") },
    ]);
    const state = reduceLive(
      live(applied, { lineups: [{ ...planned, appliedEventId: "e5" }] }),
      [],
      T0 + 50 * MIN,
    );

    expect(state.pendingLineup).toBeNull();
    expect(state.onPitch.map((entry) => entry.memberId)).toContain("ali");
  });

  it("titles the starting composition as such, and does not call it seven changes", () => {
    const initial = { ...planned, id: "l-0", fromMinute: 0, isInitial: true };
    const state = reduceLive(live(log([]), { lineups: [initial] }), [], T0);
    const view = pendingLineupView(state.pendingLineup, [initial], index);

    expect(view?.title).toBe("Composition de départ");
    // The diff against an empty pitch is seven arrivals; the ghost pitch beside this list is where
    // the coach reads the team sheet, and « Hugo entre, Nico entre, … » under it says nothing.
    expect(view?.changes).toEqual([]);
    // …but the diff itself is *not* empty, which is what tells the card that this silence is a team
    // sheet and not « nothing would happen ». The card used to print the second one over the first.
    expect(view?.isEmpty).toBe(false);
    expect(pendingLineupChangesFr(view!)).toEqual({
      kind: "sentence",
      text: "7 joueurs entrent en jeu.",
    });
  });

  it("spells out a man walking on when the team is a player short", () => {
    /*
     * The case this prompt used to describe with an empty list. Julien goes off injured at the 20th
     * with nobody to replace him, so the team plays on with six; at the 45th the planned composition
     * brings Yanis on. That is one arrival paired with no departure, and it is the only thing that
     * happens — so a silent list meant the coach confirmed a change he had never been shown.
     */
    const planWithSix = {
      ...planned,
      slots: [
        ...STARTING_SEVEN.filter((entry) => entry.slotId !== SLOT.at && entry.slotId !== SLOT.mc2),
        { slotId: SLOT.mc2, memberId: "karim" },
        { slotId: SLOT.at, memberId: "yanis" },
      ],
    };
    const withInjury = log([
      ...KICKED_OFF,
      // A SUBSTITUTION always has two halves, so a man leaving unreplaced is a six-player sheet.
      {
        type: "LINEUP_APPLIED",
        min: 20,
        payload: lineupPayload(STARTING_SEVEN.filter((entry) => entry.memberId !== "julien")),
      },
      { type: "PERIOD_END", min: 30, period: 1 },
      { type: "KICKOFF", min: 30, period: 2 },
    ]);
    const state = reduceLive(live(withInjury, { lineups: [planWithSix] }), [], T0 + 46 * MIN);
    const view = pendingLineupView(state.pendingLineup, [planWithSix], index);

    expect(state.onPitch).toHaveLength(6);
    expect(view?.isEmpty).toBe(false);
    expect(view?.changes).toEqual(["Yanis entre"]);
    expect(pendingLineupChangesFr(view!)).toEqual({ kind: "list", lines: ["Yanis entre"] });
  });

  /*
   * The two silences. `changes` is empty both for the starting composition — on purpose, because
   * seven arrivals are a team sheet — and for a plan that would genuinely change nothing, and the
   * card printed « ne change rien sur le terrain » for both. Over a full starting seven that is a
   * screen stating the opposite of the truth, which is the defect class this repo keeps finding by
   * looking rather than by testing. Now there is a test.
   */
  /*
   * The pitch is empty before kick-off in every properly prepared match, so « aucune composition
   * enregistrée » — which the screen printed on that basis alone — was usually false, and was printed
   * directly beneath the card showing the composition it denied.
   */
  it("does not deny a composition that is on screen waiting to be applied", () => {
    expect(emptyPitchFr({ hasLineups: false, isProposed: false, canOperate: true })).toMatchObject({
      title: "Aucune composition enregistrée.",
    });

    const proposed = emptyPitchFr({ hasLineups: true, isProposed: true, canOperate: true });
    expect(proposed.title).toBe("Personne n’est encore sur le terrain.");
    expect(proposed.description).toContain("ta confirmation");

    // A viewer who cannot operate is told whose confirmation it is waiting for, not asked for theirs.
    const watching = emptyPitchFr({ hasLineups: true, isProposed: true, canOperate: false });
    expect(watching.description).toContain("l’opérateur");
    expect(watching.description).not.toContain("votre");

    // Saved, not proposed — a plan for the 30th minute, say. Still not « aucune composition ».
    expect(emptyPitchFr({ hasLineups: true, isProposed: false, canOperate: true })).toMatchObject({
      title: "Personne n’est encore sur le terrain.",
    });
  });

  it("tells « rien ne changerait » apart from « c'est la feuille de match »", () => {
    const nothingWouldChange: PendingLineupView = {
      lineupId: "l-45",
      title: "Composition prévue à la 45’",
      changes: [],
      warnings: [],
      flags: [],
      slots: STARTING_SEVEN,
      isEmpty: true,
    };
    expect(pendingLineupChangesFr(nothingWouldChange)).toEqual({
      kind: "sentence",
      text: "Cette composition ne change rien sur le terrain.",
    });

    // Same empty list, opposite meaning: the diff is not empty, so somebody is walking on.
    expect(pendingLineupChangesFr({ ...nothingWouldChange, isEmpty: false })).toEqual({
      kind: "sentence",
      text: "7 joueurs entrent en jeu.",
    });
    // A seven-a-side sheet is never one player, but the sentence is built from the slots and a
    // formation the coach drew himself could be anything.
    expect(
      pendingLineupChangesFr({
        ...nothingWouldChange,
        isEmpty: false,
        slots: [STARTING_SEVEN[0]!],
      }),
    ).toEqual({ kind: "sentence", text: "1 joueur entre en jeu." });
  });
});

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

describe("what the big button says", () => {
  const at = (fixtures: Fixture[], nowMin: number) =>
    reduceLive(live(log(fixtures)), [], T0 + nowMin * MIN);

  it("walks the coach through the match one tap at a time", () => {
    expect(clockActionFr(at([], 0))).toEqual({ label: "Coup d’envoi", event: "KICKOFF" });
    expect(clockActionFr(at(KICKED_OFF, 10))).toEqual({ label: "Mi-temps", event: "PERIOD_END" });

    const halfTime = [...KICKED_OFF, { type: "PERIOD_END" as const, min: 30, period: 1 }];
    expect(clockActionFr(at(halfTime, 35))).toEqual({
      label: "Coup d’envoi 2e période",
      event: "KICKOFF",
    });

    const secondHalf = [...halfTime, { type: "KICKOFF" as const, min: 30, period: 2 }];
    expect(clockActionFr(at(secondHalf, 50))).toEqual({ label: "Fin du match", event: "PERIOD_END" });

    const played = [...secondHalf, { type: "PERIOD_END" as const, min: 60, period: 2 }];
    expect(clockActionFr(at(played, 62))).toEqual({
      label: "Coup de sifflet final",
      event: "FINAL_WHISTLE",
    });

    const over = [...played, { type: "FINAL_WHISTLE" as const, min: 60, period: 2 }];
    expect(clockActionFr(at(over, 70))).toEqual({ label: "Match terminé", event: null });
  });

  it("offers to resume a stopped game", () => {
    const paused = [...KICKED_OFF, { type: "PAUSE" as const, min: 20 }];
    expect(clockActionFr(at(paused, 25))).toEqual({ label: "Reprendre", event: "RESUME" });
    expect(phaseLabelFr(at(paused, 25))).toBe("Jeu arrêté");
  });

  it("names the phase under the clock", () => {
    expect(phaseLabelFr(at([], 0))).toBe("Avant le coup d’envoi");
    expect(phaseLabelFr(at(KICKED_OFF, 10))).toBe("1re période");
    expect(phaseLabelFr(at([...KICKED_OFF, { type: "PERIOD_END", min: 30, period: 1 }], 35))).toBe(
      "Mi-temps",
    );
  });
});

describe("the small strings", () => {
  it("counts what is waiting, and says when nothing is", () => {
    expect(pendingCountLabelFr(0)).toBe("Tout est enregistré");
    expect(pendingCountLabelFr(1)).toBe("1 action en attente");
    expect(pendingCountLabelFr(3)).toBe("3 actions en attente");
  });

  it("uses the words the coach uses", () => {
    expect(squadRoleLabelFr("starter")).toBe("titulaire");
    expect(squadRoleLabelFr("substitute")).toBe("remplaçant");
    expect(eventLabel("PENALTY_MISSED")).toBe("Penalty manqué");
  });

  it("keeps the minutes continuous and marks added time", () => {
    const periods = periodsOf({ periodsCount: 2, periodMinutes: 30 });
    expect(minuteLabelFr(45 * MIN, 2, periods)).toBe("45’");
    expect(minuteLabelFr(32 * MIN, 1, periods)).toBe("30’+2");
    expect(wholeMinutes(45 * MIN + 30_000)).toBe(45);
    expect(wholeMinutes(-5)).toBe(0);
  });
});
