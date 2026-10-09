import { describe, expect, it } from "vitest";

import type { MatchStatus } from "@/db/schema";
import {
  addMinutes,
  byStartAscending,
  isFinishedEvent,
  isLiveEvent,
  isOngoing,
  isPast,
  matchWindowMinutes,
  pastSectionTitleFr,
  splitTimeline,
  type PastSectionItem,
  type TimelineItem,
} from "./timeline";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

type Item = TimelineItem & { id: string };

function match(startsAt: string, status: MatchStatus = "scheduled"): Item {
  return {
    id: `match-${startsAt}`,
    kind: "match",
    status,
    startsAt,
    endsAt: addMinutes(new Date(startsAt), matchWindowMinutes(2, 30)),
  };
}

/* -------------------------------------------------------------------------- */
/* Durations                                                                  */
/* -------------------------------------------------------------------------- */

describe("matchWindowMinutes", () => {
  it("is play + breaks + grace", () => {
    // 2×30 = 60 played, one 15' break, 60' of grace.
    expect(matchWindowMinutes(2, 30)).toBe(135);
    // A tournament of four 15' periods: 60 played, three breaks, same grace.
    expect(matchWindowMinutes(4, 15)).toBe(165);
  });

  it("charges no break for a single period", () => {
    expect(matchWindowMinutes(1, 40)).toBe(100);
  });
});

describe("addMinutes", () => {
  it("returns an ISO instant", () => {
    expect(addMinutes(new Date("2026-09-27T08:30:00Z"), 135)).toBe("2026-09-27T10:45:00.000Z");
  });
});

/* -------------------------------------------------------------------------- */
/* Chronology                                                                 */
/* -------------------------------------------------------------------------- */

describe("byStartAscending", () => {
  it("sorts oldest first", () => {
    const items = [match("2026-09-27T08:00:00Z"), match("2026-09-20T08:00:00Z")];
    expect([...items].sort(byStartAscending).map((item) => item.id)).toEqual([
      "match-2026-09-20T08:00:00Z",
      "match-2026-09-27T08:00:00Z",
    ]);
  });
});

describe("isLiveEvent", () => {
  it("is true only for a match being played", () => {
    expect(isLiveEvent(match("2026-09-27T08:00:00Z", "live"))).toBe(true);
    expect(isLiveEvent(match("2026-09-27T08:00:00Z"))).toBe(false);
  });
});

describe("isFinishedEvent", () => {
  it("is true only for a match that is over", () => {
    expect(isFinishedEvent(match("2026-09-27T08:00:00Z", "finished"))).toBe(true);
    expect(isFinishedEvent(match("2026-09-27T08:00:00Z", "live"))).toBe(false);
    expect(isFinishedEvent(match("2026-09-27T08:00:00Z"))).toBe(false);
  });
});

describe("isOngoing and isPast", () => {
  const kickoff = "2026-09-27T08:00:00Z";
  const scheduled = match(kickoff); // window ends 10:15Z

  it("is neither ongoing nor past before kick-off", () => {
    const now = new Date("2026-09-27T07:59:00Z");
    expect(isOngoing(scheduled, now)).toBe(false);
    expect(isPast(scheduled, now)).toBe(false);
  });

  it("is ongoing from kick-off to the end of the grace window", () => {
    expect(isOngoing(scheduled, new Date(kickoff))).toBe(true);
    expect(isOngoing(scheduled, new Date("2026-09-27T10:14:59Z"))).toBe(true);
  });

  it("is past the moment the window closes", () => {
    expect(isPast(scheduled, new Date("2026-09-27T10:15:00Z"))).toBe(true);
    expect(isOngoing(scheduled, new Date("2026-09-27T10:15:00Z"))).toBe(false);
  });

  it("never treats a live match as past, however long it overran", () => {
    const live = match(kickoff, "live");
    const wayLater = new Date("2026-09-28T00:00:00Z");
    expect(isPast(live, wayLater)).toBe(false);
    expect(isOngoing(live, wayLater)).toBe(true);
  });

  // Decision 121: the coach declares a match over, so the column outranks the clock.
  it("treats a match declared over as past, even before its own kick-off", () => {
    const declared = match("2026-10-11T08:00:00Z", "finished");
    const beforeKickoff = new Date("2026-09-27T12:00:00Z");
    expect(isPast(declared, beforeKickoff)).toBe(true);
    expect(isOngoing(declared, beforeKickoff)).toBe(false);
  });

  it("treats a match that ended early as past, without waiting for its window", () => {
    const early = match(kickoff, "finished");
    const duringTheWindow = new Date("2026-09-27T09:00:00Z");
    expect(isPast(early, duringTheWindow)).toBe(true);
    expect(isOngoing(early, duringTheWindow)).toBe(false);
  });
});

describe("splitTimeline", () => {
  const items = [
    match("2026-09-06T08:00:00Z", "finished"),
    match("2026-09-20T08:00:00Z", "finished"),
    match("2026-09-27T08:00:00Z"),
    match("2026-10-04T08:00:00Z"),
    match("2026-10-11T08:00:00Z"),
  ];

  it("pins the soonest event still to come", () => {
    const timeline = splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.next?.id).toBe("match-2026-09-27T08:00:00Z");
  });

  it("lists the rest of the future chronologically, without the pinned one", () => {
    const timeline = splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.upcoming.map((item) => item.id)).toEqual([
      "match-2026-10-04T08:00:00Z",
      "match-2026-10-11T08:00:00Z",
    ]);
  });

  it("lists the past most recent first", () => {
    const timeline = splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.past.map((item) => item.id)).toEqual([
      "match-2026-09-20T08:00:00Z",
      "match-2026-09-06T08:00:00Z",
    ]);
  });

  it("pins the event that is happening rather than the next one", () => {
    // Half-time of the 27th. The pinned card must be that match, not the October one.
    const timeline = splitTimeline(items, new Date("2026-09-27T08:35:00Z"));
    expect(timeline.next?.id).toBe("match-2026-09-27T08:00:00Z");
    expect(timeline.past).toHaveLength(2);
  });

  it("pins a live match even long after its scheduled end", () => {
    const live = [match("2026-09-27T08:00:00Z", "live"), match("2026-10-11T08:00:00Z")];
    const timeline = splitTimeline(live, new Date("2026-09-30T08:00:00Z"));
    expect(timeline.next?.id).toBe("match-2026-09-27T08:00:00Z");
  });

  it("never pins a match the coach has declared over, and files it under the past", () => {
    // Typed up in advance: the 11th of October, entered on the 25th of September (decision 121).
    const declared = [
      match("2026-10-11T08:00:00Z", "finished"),
      match("2026-10-04T08:00:00Z"),
    ];
    const timeline = splitTimeline(declared, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.next?.id).toBe("match-2026-10-04T08:00:00Z");
    expect(timeline.upcoming).toEqual([]);
    expect(timeline.past.map((item) => item.id)).toEqual(["match-2026-10-11T08:00:00Z"]);
  });

  it("has no next event when the season is over", () => {
    const timeline = splitTimeline(items, new Date("2027-01-01T00:00:00Z"));
    expect(timeline.next).toBeNull();
    expect(timeline.upcoming).toEqual([]);
    expect(timeline.past).toHaveLength(items.length);
  });

  it("copes with an empty calendar", () => {
    expect(splitTimeline([], new Date("2026-09-25T12:00:00Z"))).toEqual({
      next: null,
      upcoming: [],
      past: [],
    });
  });

  it("does not mutate the list it was given", () => {
    const original = [...items];
    splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(items).toEqual(original);
  });
});

/* -------------------------------------------------------------------------- */
/* The heading of the history                                                 */
/* -------------------------------------------------------------------------- */

describe("pastSectionTitleFr", () => {
  const played: PastSectionItem = { score: { goalsFor: 2, goalsAgainst: 1 } };
  const unrecorded: PastSectionItem = { score: null };

  it("says « Déjà joué » when every row is a match that was played", () => {
    expect(pastSectionTitleFr([played, played])).toBe("Déjà joué");
  });

  /**
   * FC des Deux-Ponts: finished, nine men on the sheet, not one event. The heading claimed it had
   * been played, which is the invention decision 013 refused, one level up.
   */
  it("widens it for a match whose window closed with nothing recorded", () => {
    expect(pastSectionTitleFr([played, unrecorded])).toBe("Déjà passé");
  });

  it("is only ever rendered over a non-empty list", () => {
    expect(pastSectionTitleFr([])).toBe("Déjà joué");
  });
});
