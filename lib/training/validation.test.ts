import { describe, expect, it } from "vitest";

import {
  createTrainingSchema,
  markAttendanceSchema,
  readAttendanceMarks,
  startsAtSchema,
  trainingNoteSchema,
} from "./validation";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const TRAINING_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const MEMBER_B = "44444444-4444-4444-8444-444444444444";

describe("startsAtSchema", () => {
  it("reads the wall clock as Paris time", () => {
    // A Tuesday evening session in September: 19:00 CEST is 17:00 UTC.
    expect(startsAtSchema.parse("2026-09-29T19:00").toISOString()).toBe(
      "2026-09-29T17:00:00.000Z",
    );
  });

  it("refuses an empty or impossible value", () => {
    expect(startsAtSchema.safeParse("").success).toBe(false);
    expect(startsAtSchema.safeParse("2026-04-31T19:00").success).toBe(false);
  });
});

describe("trainingNoteSchema", () => {
  it("keeps what the session is about and drops a blank", () => {
    expect(trainingNoteSchema.parse("Travail sur les sorties de balle")).toBe(
      "Travail sur les sorties de balle",
    );
    expect(trainingNoteSchema.parse("")).toBeNull();
    expect(trainingNoteSchema.parse(undefined)).toBeNull();
  });

  it("refuses more than 280 characters", () => {
    expect(trainingNoteSchema.safeParse("x".repeat(281)).success).toBe(false);
  });
});

describe("createTrainingSchema", () => {
  it("parses a complete form", () => {
    expect(
      createTrainingSchema.parse({
        teamId: TEAM_ID,
        startsAt: "2026-09-29T19:00",
        venue: "Gymnase Jean-Moulin",
        note: "",
      }),
    ).toEqual({
      teamId: TEAM_ID,
      startsAt: new Date("2026-09-29T17:00:00.000Z"),
      venue: "Gymnase Jean-Moulin",
      note: null,
    });
  });

  it("needs only a team and a date", () => {
    const result = createTrainingSchema.safeParse({
      teamId: TEAM_ID,
      startsAt: "2026-09-29T19:00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.venue).toBeNull();
      expect(result.data.note).toBeNull();
    }
  });
});

describe("readAttendanceMarks", () => {
  function entriesOf(record: Record<string, string>): Array<[string, FormDataEntryValue]> {
    return Object.entries(record);
  }

  it("picks the per-player radios out of the form", () => {
    expect(
      readAttendanceMarks(
        entriesOf({
          teamId: TEAM_ID,
          trainingId: TRAINING_ID,
          [`presence:${MEMBER_A}`]: "present",
          [`presence:${MEMBER_B}`]: "absent",
        }),
      ),
    ).toEqual([
      { teamMemberId: MEMBER_A, mark: "present" },
      { teamMemberId: MEMBER_B, mark: "absent" },
    ]);
  });

  it("ignores every field that is not a presence radio", () => {
    expect(
      readAttendanceMarks(entriesOf({ teamId: TEAM_ID, trainingId: TRAINING_ID })),
    ).toEqual([]);
  });

  it("keeps « unset » as a real value, distinct from absent", () => {
    // This is the guard against an unmarked player silently counting as absent.
    expect(readAttendanceMarks(entriesOf({ [`presence:${MEMBER_A}`]: "unset" }))).toEqual([
      { teamMemberId: MEMBER_A, mark: "unset" },
    ]);
  });

  it("drops a value it does not understand rather than guessing", () => {
    expect(
      readAttendanceMarks(
        entriesOf({
          [`presence:${MEMBER_A}`]: "peut-être",
          [`presence:${MEMBER_B}`]: "present",
        }),
      ),
    ).toEqual([{ teamMemberId: MEMBER_B, mark: "present" }]);
  });

  it("reads an empty list out of an empty form", () => {
    expect(readAttendanceMarks([])).toEqual([]);
  });
});

describe("markAttendanceSchema", () => {
  it("accepts the whole squad in one payload", () => {
    const result = markAttendanceSchema.safeParse({
      teamId: TEAM_ID,
      trainingId: TRAINING_ID,
      marks: [
        { teamMemberId: MEMBER_A, mark: "present" },
        { teamMemberId: MEMBER_B, mark: "unset" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty list — nothing to change is not an error", () => {
    expect(
      markAttendanceSchema.safeParse({ teamId: TEAM_ID, trainingId: TRAINING_ID, marks: [] })
        .success,
    ).toBe(true);
  });

  it("refuses a member id that is not a uuid", () => {
    expect(
      markAttendanceSchema.safeParse({
        teamId: TEAM_ID,
        trainingId: TRAINING_ID,
        marks: [{ teamMemberId: "karim", mark: "present" }],
      }).success,
    ).toBe(false);
  });
});
