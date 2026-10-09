import { describe, expect, it } from "vitest";

import { autoLineupToApply, autoLineupToLock, type AutoLineupInput } from "./auto-lineup";
import { matchEventInputSchema } from "./events";

const SEVEN = [
  { slotId: "s-gb", memberId: "hugo" },
  { slotId: "s-dc", memberId: "thomas" },
  { slotId: "s-at", memberId: "julien" },
];

const base: AutoLineupInput = {
  matchId: "m1",
  canOperate: true,
  entryMode: "live",
  state: { phase: "before-kickoff", onPitch: [] },
  events: [],
  lineups: [{ id: "l-start", fromMinute: 0, isInitial: true, slots: SEVEN }],
};

const onPitch = (slots: typeof SEVEN) =>
  slots.map((slot) => ({
    memberId: slot.memberId,
    slotId: slot.slotId,
    positionCode: null,
    sinceClockMs: 0,
    isGoalkeeper: false,
  }));

describe("autoLineupToApply (decision 153)", () => {
  it("applies the starting composition to an empty pitch before the kick-off", () => {
    const auto = autoLineupToApply(base);
    expect(auto?.lineupId).toBe("l-start");
    expect(auto?.payload).toMatchObject({ lineupId: "l-start", auto: true });
    expect(auto?.payload.slots).toHaveLength(3);
  });

  it("derives one id per version: the same plan twice is one row, an edited plan is another", () => {
    const first = autoLineupToApply(base)!;
    expect(autoLineupToApply({ ...base, lineups: [...base.lineups] })!.clientEventId).toBe(
      first.clientEventId,
    );
    // Order of the slots does not matter, the seven do.
    expect(
      autoLineupToApply({
        ...base,
        lineups: [{ ...base.lineups[0], slots: [...SEVEN].reverse() }],
      })!.clientEventId,
    ).toBe(first.clientEventId);
    const edited = [{ ...SEVEN[0] }, { ...SEVEN[1] }, { slotId: "s-at", memberId: "momo" }];
    expect(
      autoLineupToApply({ ...base, lineups: [{ ...base.lineups[0], slots: edited }] })!
        .clientEventId,
    ).not.toBe(first.clientEventId);
    // And it is an id the ingestion boundary accepts.
    expect(
      matchEventInputSchema.safeParse({
        clientEventId: first.clientEventId,
        type: "LINEUP_APPLIED",
        period: 1,
        minute: 0,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {
          ...first.payload,
          slots: first.payload.slots.map(() => ({
            slotId: crypto.randomUUID(),
            memberId: crypto.randomUUID(),
          })),
          lineupId: crypto.randomUUID(),
        },
      }).success,
    ).toBe(true);
  });

  it("writes nothing for a viewer, a retro match, or once the match has kicked off", () => {
    expect(autoLineupToApply({ ...base, canOperate: false })).toBeNull();
    expect(autoLineupToApply({ ...base, entryMode: "retro" })).toBeNull();
    expect(autoLineupToApply({ ...base, state: { phase: "running", onPitch: [] } })).toBeNull();
  });

  it("writes nothing without a starting composition, and uses minute 0 when none is flagged", () => {
    expect(autoLineupToApply({ ...base, lineups: [] })).toBeNull();
    expect(
      autoLineupToApply({
        ...base,
        lineups: [{ id: "l-30", fromMinute: 30, isInitial: false, slots: SEVEN }],
      }),
    ).toBeNull();
    expect(
      autoLineupToApply({
        ...base,
        lineups: [{ id: "l-0", fromMinute: 0, isInitial: false, slots: SEVEN }],
      })?.lineupId,
    ).toBe("l-0");
  });

  it("writes nothing when the pitch already is that composition", () => {
    expect(
      autoLineupToApply({ ...base, state: { phase: "before-kickoff", onPitch: onPitch(SEVEN) } }),
    ).toBeNull();
  });

  it("re-applies an edited plan over its own earlier application", () => {
    const edited = [SEVEN[0], SEVEN[1], { slotId: "s-at", memberId: "momo" }];
    const auto = autoLineupToApply({
      ...base,
      state: { phase: "before-kickoff", onPitch: onPitch(SEVEN) },
      events: [
        { type: "LINEUP_APPLIED", payload: { lineupId: "l-start", slots: SEVEN, auto: true } },
      ],
      lineups: [{ ...base.lineups[0], slots: edited }],
    });
    expect(auto?.payload.slots).toContainEqual({ slotId: "s-at", memberId: "momo" });
  });

  it("stops for good once the coach arranged the pitch himself, even if he annulled it", () => {
    const manual = { type: "LINEUP_APPLIED" as const, payload: { lineupId: null, slots: SEVEN } };
    expect(autoLineupToApply({ ...base, events: [manual] })).toBeNull();
    expect(
      autoLineupToApply({ ...base, events: [manual, { type: "VOID" as const, payload: {} }] }),
    ).toBeNull();
    expect(
      autoLineupToApply({
        ...base,
        events: [{ type: "SUBSTITUTION", payload: { outId: "a", inId: "b" } }],
      }),
    ).toBeNull();
  });
});

describe("autoLineupToLock", () => {
  const event = (
    id: string,
    seq: number,
    payload: unknown,
    type: "LINEUP_APPLIED" | "VOID" = "LINEUP_APPLIED",
    voidsEventId: string | null = null,
  ) => ({
    id,
    type,
    clockMs: 0,
    seq,
    payload,
    voidsEventId,
  });

  it("freezes the last automatic application still standing", () => {
    expect(
      autoLineupToLock([
        event("e1", 1, { lineupId: "l-start", slots: SEVEN, auto: true }),
        event("e2", 2, { lineupId: "l-start", slots: SEVEN, auto: true }),
      ]),
    ).toEqual({ lineupId: "l-start", eventId: "e2" });
  });

  it("ignores manual applications and annulled automatic ones", () => {
    expect(autoLineupToLock([event("e1", 1, { lineupId: "l-start", slots: SEVEN })])).toBeNull();
    expect(
      autoLineupToLock([
        event("e1", 1, { lineupId: "l-start", slots: SEVEN, auto: true }),
        event("e2", 2, { lineupId: "l-start", slots: SEVEN, auto: true }),
        event("e3", 3, {}, "VOID", "e2"),
      ]),
    ).toEqual({ lineupId: "l-start", eventId: "e1" });
  });
});
