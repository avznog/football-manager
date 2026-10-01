import { describe, expect, it } from "vitest";

import type { SlotInfo } from "@/lib/match/lineup";

import { RETRO_FACT_TYPES, type RetroEntry, buildRetroLog } from "./log";
import {
  type RetroIssueCode,
  type RetroMember,
  blockingRetroIssues,
  findRetroIssues,
  readChangeFields,
  readFactFields,
  readStarterFields,
  retroFactSchema,
  retroLogIssuesFr,
  retroSubmitSchema,
} from "./validation";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const uuid = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(9, "0")}`;

const NAMES = ["Momo", "Karim", "Sofiane", "Léo", "Yanis", "Théo", "Hugo", "Rémi", "Nabil"] as const;
const P = Object.fromEntries(
  ["gk", "dg", "dc", "dd", "mcl", "mcr", "at", "sub1", "sub2"].map((key, index) => [
    key,
    uuid("aaa", index + 1),
  ]),
) as Record<"gk" | "dg" | "dc" | "dd" | "mcl" | "mcr" | "at" | "sub1" | "sub2", string>;

const MEMBERS: readonly RetroMember[] = Object.values(P).map((membershipId, index) => ({
  membershipId,
  name: NAMES[index],
}));

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

function entry(overrides: Partial<RetroEntry> = {}): RetroEntry {
  return {
    submissionId: "11111111-2222-4333-8444-555555555555",
    periods: { periodsCount: 2, periodMinutes: 30 },
    kickoffAtMs: Date.UTC(2026, 8, 12, 17, 0, 0),
    lineupId: null,
    starters: STARTERS,
    changes: [],
    facts: [],
    ...overrides,
  };
}

const codes = (entryValue: RetroEntry): RetroIssueCode[] =>
  findRetroIssues({ entry: entryValue, members: MEMBERS, slots: SLOTS }).map((issue) => issue.code);

/* -------------------------------------------------------------------------- */
/* Decoding the form                                                          */
/* -------------------------------------------------------------------------- */

describe("reading the form", () => {
  /** What the browser actually posts, built by hand so the test cannot drift from the markup. */
  function form(pairs: readonly [string, string][]): FormData {
    const data = new FormData();
    for (const [name, value] of pairs) data.append(name, value);
    return data;
  }

  it("keeps the starters that were filled in and drops the empty slots", () => {
    const starters = readStarterFields(
      form([
        [`starter:${SLOTS[0].id}`, P.gk],
        [`starter:${SLOTS[1].id}`, ""],
        [`starter:${SLOTS[2].id}`, P.dc],
        ["opponentName", "AS Ignored"],
      ]),
    );

    expect(starters).toEqual([
      { slotId: SLOTS[0].id, memberId: P.gk },
      { slotId: SLOTS[2].id, memberId: P.dc },
    ]);
  });

  it("gathers a change row from its three controls, in DOM order", () => {
    const changes = readChangeFields(
      form([
        ["change-out:r1", P.mcl],
        ["change-in:r1", P.sub1],
        ["change-minute:r1", "38"],
        ["change-out:r2", P.at],
        ["change-in:r2", P.sub2],
        ["change-minute:r2", ""],
      ]),
    );

    expect(changes).toEqual([
      { key: "r1", outId: P.mcl, inId: P.sub1, minute: 38 },
      // An empty minute is « je ne sais plus », not zero.
      { key: "r2", outId: P.at, inId: P.sub2, minute: null },
    ]);
  });

  it("ignores a change row the coach added and never filled", () => {
    expect(
      readChangeFields(form([["change-out:r1", ""], ["change-in:r1", ""], ["change-minute:r1", ""]])),
    ).toEqual([]);
  });

  it("reads the facts, and refuses a type it does not know", () => {
    const facts = readFactFields(
      form([
        ["fact-type:f1", "GOAL_FOR"],
        ["fact-member:f1", P.at],
        ["fact-assist:f1", P.mcr],
        ["fact-minute:f1", "11"],
        ["fact-type:f2", "FOUL"],
        ["fact-member:f2", P.dd],
        ["fact-assist:f2", ""],
        ["fact-minute:f2", ""],
        // Not a retro fact: a clock event has no business coming from this form.
        ["fact-type:f3", "FINAL_WHISTLE"],
        ["fact-member:f3", P.gk],
      ]),
    );

    expect(facts).toEqual([
      { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: P.mcr, minute: 11 },
      { key: "f2", type: "FOUL", memberId: P.dd, assistId: null, minute: null },
    ]);
  });
});

describe("retroSubmitSchema", () => {
  const payload = {
    teamId: uuid("ccc", 1),
    matchId: uuid("ccc", 2),
    submissionId: uuid("ccc", 3),
    lineupId: null,
    starters: STARTERS,
    changes: [],
    facts: [],
  };

  it("accepts a plausible submission", () => {
    expect(retroSubmitSchema.safeParse(payload).success).toBe(true);
  });

  it("refuses more than seven on the pitch, in French", () => {
    const result = retroSubmitSchema.safeParse({
      ...payload,
      starters: [...STARTERS, { slotId: SLOTS[0].id, memberId: P.sub1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("sept joueurs");
    }
  });

  it("refuses a submission with no starting seven at all", () => {
    expect(retroSubmitSchema.safeParse({ ...payload, starters: [] }).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Judging the content                                                        */
/* -------------------------------------------------------------------------- */

describe("findRetroIssues", () => {
  it("has nothing to say about a well-filled sheet", () => {
    expect(
      codes(
        entry({
          changes: [{ key: "c1", outId: P.mcl, inId: P.sub1, minute: 38 }],
          facts: [
            { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: P.mcr, minute: 11 },
            { key: "f2", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: 24 },
            { key: "f3", type: "FOUL", memberId: P.sub1, assistId: null, minute: 50 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("blocks the same player placed at two posts", () => {
    const issues = findRetroIssues({
      entry: entry({
        starters: [...STARTERS.slice(0, 6), { slotId: SLOTS[6].id, memberId: P.mcl }],
      }),
      members: MEMBERS,
      slots: SLOTS,
    });

    expect(issues.map((issue) => issue.code)).toContain("duplicate-member");
    expect(blockingRetroIssues(issues)).not.toHaveLength(0);
    // The coach is told who, by name.
    expect(issues.find((issue) => issue.code === "duplicate-member")?.messageFr).toContain("Yanis");
  });

  it("warns, without blocking, about six on the pitch and an empty goal", () => {
    const issues = findRetroIssues({
      entry: entry({ starters: STARTERS.slice(1) }),
      members: MEMBERS,
      slots: SLOTS,
    });

    expect(issues.map((issue) => issue.code)).toEqual(["incomplete", "no-goalkeeper"]);
    // A team really did finish with six; the entry must still be saveable.
    expect(blockingRetroIssues(issues)).toEqual([]);
  });

  it("blocks a player who leaves the pitch without being on it", () => {
    expect(
      codes(entry({ changes: [{ key: "c1", outId: P.sub2, inId: P.sub1, minute: 20 }] })),
    ).toEqual(["change-out-not-on"]);
  });

  it("blocks a player coming on who is already playing", () => {
    expect(
      codes(entry({ changes: [{ key: "c1", outId: P.mcl, inId: P.at, minute: 20 }] })),
    ).toEqual(["change-in-already-on"]);
  });

  it("blocks a player replacing himself", () => {
    expect(
      codes(entry({ changes: [{ key: "c1", outId: P.mcl, inId: P.mcl, minute: 20 }] })),
    ).toEqual(["change-same-player"]);
  });

  it("blocks a minute that does not exist in this match", () => {
    const issues = findRetroIssues({
      entry: entry({
        facts: [{ key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 75 }],
      }),
      members: MEMBERS,
      slots: SLOTS,
    });

    expect(issues.map((issue) => issue.code)).toContain("minute-out-of-range");
    expect(issues[0].messageFr).toContain("60 minutes");
    expect(issues[0].rowKey).toBe("f1");
  });

  it("blocks a goal by somebody who was not on the pitch yet", () => {
    const issues = findRetroIssues({
      entry: entry({
        changes: [{ key: "c1", outId: P.mcl, inId: P.sub1, minute: 40 }],
        facts: [{ key: "f1", type: "GOAL_FOR", memberId: P.sub1, assistId: null, minute: 12 }],
      }),
      members: MEMBERS,
      slots: SLOTS,
    });

    expect(issues.map((issue) => issue.code)).toEqual(["player-not-on-pitch"]);
    expect(issues[0].messageFr).toContain("Rémi");
  });

  it("blocks a goal by somebody who never appears on the sheet, and says so differently", () => {
    const issues = findRetroIssues({
      entry: entry({
        facts: [{ key: "f1", type: "GOAL_FOR", memberId: P.sub2, assistId: null, minute: 12 }],
      }),
      members: MEMBERS,
      slots: SLOTS,
    });

    expect(issues[0].code).toBe("player-not-on-pitch");
    expect(issues[0].messageFr).toContain("n’apparaît ni dans la composition");
  });

  it("accepts a goal at the very minute its scorer was replaced, and refuses it for the one who came on", () => {
    // The reducer reads a minute's facts before its substitutions, so the outgoing player scored.
    expect(
      codes(
        entry({
          changes: [{ key: "c1", outId: P.at, inId: P.sub1, minute: 45 }],
          facts: [{ key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 45 }],
        }),
      ),
    ).toEqual([]);

    expect(
      codes(
        entry({
          changes: [{ key: "c1", outId: P.at, inId: P.sub1, minute: 45 }],
          facts: [{ key: "f1", type: "GOAL_FOR", memberId: P.sub1, assistId: null, minute: 45 }],
        }),
      ),
    ).toEqual(["player-not-on-pitch"]);
  });

  it("insists on a name where the fact is about a person", () => {
    const issues = findRetroIssues({
      entry: entry({
        facts: [
          { key: "f1", type: "OWN_GOAL", memberId: null, assistId: null, minute: 20 },
          { key: "f2", type: "PENALTY_MISSED", memberId: null, assistId: null, minute: 21 },
          { key: "f3", type: "FOUL", memberId: null, assistId: null, minute: 22 },
          { key: "f4", type: "INJURY", memberId: null, assistId: null, minute: 23 },
          // These two are the team's, not a player's: no name needed (decision 017).
          { key: "f5", type: "GOAL_FOR", memberId: null, assistId: null, minute: 24 },
          { key: "f6", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: 25 },
        ],
      }),
      members: MEMBERS,
      slots: SLOTS,
    });

    expect(issues.map((issue) => issue.rowKey)).toEqual(["f1", "f2", "f3", "f4"]);
    expect(issues.map((issue) => issue.code)).toEqual(Array(4).fill("missing-scorer"));
    expect(issues[0].messageFr).toBe("Il faut dire qui a marqué contre son camp.");
  });

  it("blocks a player who has left the squad since the match", () => {
    expect(
      codes(
        entry({
          starters: [...STARTERS.slice(0, 6), { slotId: SLOTS[6].id, memberId: uuid("eee", 9) }],
        }),
      ),
    ).toEqual(["unknown-member"]);
  });

  it("blocks a post that does not belong to this formation", () => {
    expect(
      codes(entry({ starters: [{ slotId: uuid("fff", 1), memberId: P.gk }] })),
    ).toContain("unknown-slot");
  });

  it("never blocks an entry whose minutes were all left blank", () => {
    const blank = entry({
      changes: [{ key: "c1", outId: P.mcl, inId: P.sub1, minute: null }],
      facts: [
        { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: null },
        { key: "f2", type: "GOAL_FOR", memberId: P.sub1, assistId: null, minute: null },
        { key: "f3", type: "GOAL_AGAINST", memberId: null, assistId: null, minute: null },
        { key: "f4", type: "OWN_GOAL", memberId: P.dc, assistId: null, minute: null },
      ],
    });

    // The whole point of the unknown-minute rule: forgetting every minute is a valid entry.
    expect(blockingRetroIssues(findRetroIssues({ entry: blank, members: MEMBERS, slots: SLOTS }))).toEqual([]);
    expect(retroLogIssuesFr(buildRetroLog(blank).events, { periods: { periodsCount: 2, periodMinutes: 30 }, slots: SLOTS })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The last line of defence                                                   */
/* -------------------------------------------------------------------------- */

describe("retroLogIssuesFr", () => {
  const periods = { periodsCount: 2, periodMinutes: 30 } as const;

  it("passes a log the app synthesised itself", () => {
    const built = buildRetroLog(
      entry({
        changes: [{ key: "c1", outId: P.mcl, inId: P.sub1, minute: 38 }],
        facts: [
          { key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: P.mcr, minute: 11 },
          { key: "f2", type: "PENALTY_SCORED", memberId: P.sub1, assistId: null, minute: 55 },
        ],
      }),
    );

    expect(retroLogIssuesFr(built.events, { periods, slots: SLOTS })).toEqual([]);
  });

  it("catches a log whose events sit after the final whistle", () => {
    const built = buildRetroLog(entry());
    const tampered = [
      ...built.events,
      {
        ...built.events[0],
        clientEventId: uuid("999", 1),
        type: "GOAL_FOR" as const,
        period: 2,
        minute: 90,
        clockMs: 90 * 60_000,
        payload: {},
        voidsEventId: null,
      },
    ];

    expect(retroLogIssuesFr(tampered, { periods, slots: SLOTS })).toHaveLength(1);
    expect(retroLogIssuesFr(tampered, { periods, slots: SLOTS })[0]).toContain("déroulé incohérent");
  });

  it("does not object to a match played without a goalkeeper", () => {
    const built = buildRetroLog(entry({ starters: STARTERS.slice(1) }));
    expect(retroLogIssuesFr(built.events, { periods, slots: SLOTS })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The fact schema, now built from the list instead of repeating it            */
/* -------------------------------------------------------------------------- */

describe("retroFactSchema", () => {
  const fact = (type: string) => ({
    key: "f1",
    type,
    memberId: null,
    assistId: null,
    minute: null,
  });

  it("accepts every member of the correctable set, with no second copy of the list", () => {
    for (const type of RETRO_FACT_TYPES) {
      expect(retroFactSchema.safeParse(fact(type)).success, type).toBe(true);
    }
  });

  it("refuses the two types the form deduces rather than asks for as facts", () => {
    // Both are *enterable* (`RETRO_ACTION_TYPES`) — as substitution rows and as position changes —
    // and neither is ever a « fact » row, which is why this schema is built from the narrower list.
    expect(retroFactSchema.safeParse(fact("SUBSTITUTION")).success).toBe(false);
    expect(retroFactSchema.safeParse(fact("POSITION_CHANGE")).success).toBe(false);
  });

  it("refuses the frame of the match", () => {
    expect(retroFactSchema.safeParse(fact("FINAL_WHISTLE")).success).toBe(false);
  });
});
