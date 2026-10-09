import { describe, expect, it } from "vitest";

import {
  fromMinuteSchema,
  readBenchMarks,
  readSlotFields,
  saveLineupSchema,
} from "./validation";

const HUGO = "11111111-1111-4111-8111-111111111111";
const KARIM = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";
const MATCH = "44444444-4444-4444-8444-444444444444";

describe("readBenchMarks", () => {
  it("reads the whole list under the pitch in one pass", () => {
    const form = new FormData();
    form.set("matchId", MATCH);
    form.set(`role:${HUGO}`, "substitute");
    form.set(`role:${KARIM}`, "supporter");

    expect(readBenchMarks(form.entries())).toEqual(
      new Map([
        [HUGO, "substitute"],
        [KARIM, "supporter"],
      ]),
    );
  });

  it("keeps « none » — the answer that leaves a player unselected", () => {
    const form = new FormData();
    form.set(`role:${HUGO}`, "none");
    expect(readBenchMarks(form.entries())).toEqual(new Map([[HUGO, "none"]]));
  });

  /** « Titulaire » is the pitch's to say: the list never offers it, so a form claiming it is forged. */
  it("skips « starter » and any value the app would never have written", () => {
    const form = new FormData();
    form.set(`role:${HUGO}`, "starter");
    form.set(`role:${KARIM}`, "capitaine");
    expect(readBenchMarks(form.entries())).toEqual(new Map());
  });
});

describe("readSlotFields", () => {
  it("reads one pair per slot", () => {
    expect(readSlotFields([`slot-1:${HUGO}`, `slot-5:${KARIM}`])).toEqual([
      { slotKey: "slot-1", memberId: HUGO },
      { slotKey: "slot-5", memberId: KARIM },
    ]);
  });

  it("refuses to put two players in one slot", () => {
    expect(readSlotFields([`slot-1:${HUGO}`, `slot-1:${KARIM}`])).toEqual([
      { slotKey: "slot-1", memberId: KARIM },
    ]);
  });

  it("ignores anything it cannot read", () => {
    expect(readSlotFields(["", "slot-1", ":orphan", "slot-2:"])).toEqual([]);
  });
});

describe("fromMinuteSchema", () => {
  it("accepts what a number input submits", () => {
    expect(fromMinuteSchema.parse("30")).toBe(30);
    expect(fromMinuteSchema.parse("0")).toBe(0);
  });

  it("refuses a minute outside the match", () => {
    expect(fromMinuteSchema.safeParse("-1").success).toBe(false);
    expect(fromMinuteSchema.safeParse("300").success).toBe(false);
    expect(fromMinuteSchema.safeParse("mi-temps").success).toBe(false);
    expect(fromMinuteSchema.safeParse("30.5").success).toBe(false);
  });
});

describe("saveLineupSchema", () => {
  const valid = {
    teamId: TEAM,
    matchId: MATCH,
    fromMinute: "30",
    withSquad: false,
    assignments: [{ slotKey: "slot-1", memberId: HUGO }],
  };

  it("accepts a composition the editor submitted", () => {
    const parsed = saveLineupSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.fromMinute).toBe(30);
  });

  it("needs to be told whether the form carries the selection", () => {
    expect(saveLineupSchema.safeParse({ ...valid, withSquad: undefined }).success).toBe(false);
  });

  it("refuses a player id that is not a membership", () => {
    const parsed = saveLineupSchema.safeParse({
      ...valid,
      assignments: [{ slotKey: "slot-1", memberId: "hugo" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses more players than there are slots", () => {
    const parsed = saveLineupSchema.safeParse({
      ...valid,
      assignments: Array.from({ length: 8 }, (_, index) => ({
        slotKey: `slot-${index}`,
        memberId: HUGO,
      })),
    });
    expect(parsed.success).toBe(false);
  });
});
