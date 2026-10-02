import { describe, expect, it } from "vitest";

import {
  hasPlayed,
  playedLabelFr,
  playedMemberIds,
  ratingProgress,
  ratingTargetsFor,
  type PlayedEntry,
} from "./progress";

function played(...entries: [string, number][]): PlayedEntry[] {
  return entries.map(([teamMemberId, minutes]) => ({ teamMemberId, minutes }));
}

/** Momo was named a substitute and never came on; Pierre watched from the touchline. */
const PLAYED = played(["hugo", 60], ["karim", 58], ["momo", 0]);

describe("playedMemberIds", () => {
  it("keeps everybody with a minute on the clock, and is sorted", () => {
    expect(playedMemberIds(PLAYED)).toEqual(["hugo", "karim"]);
  });

  it("drops the named substitute who never came on", () => {
    // The sheet said he was there; the log says he did not play. Decision 137 reads the log, which
    // is the whole difference between it and decision 007.
    expect(playedMemberIds(PLAYED)).not.toContain("momo");
  });

  it("keeps a one-minute cameo: it is a performance, however short", () => {
    expect(playedMemberIds(played(["ali", 1]))).toEqual(["ali"]);
  });

  it("is empty for a match nobody recorded", () => {
    expect(playedMemberIds([])).toEqual([]);
  });
});

describe("hasPlayed", () => {
  it("is true for the men who were on the pitch", () => {
    expect(hasPlayed(PLAYED, "hugo")).toBe(true);
    expect(hasPlayed(PLAYED, "karim")).toBe(true);
  });

  it("refuses the unused substitute, a stranger, and a viewer with no membership", () => {
    expect(hasPlayed(PLAYED, "momo")).toBe(false);
    expect(hasPlayed(PLAYED, "pierre")).toBe(false);
    expect(hasPlayed(PLAYED, null)).toBe(false);
    expect(hasPlayed(PLAYED, undefined)).toBe(false);
  });
});

describe("ratingTargetsFor", () => {
  it("is everybody who played, minus himself", () => {
    expect(ratingTargetsFor(PLAYED, "hugo")).toEqual(["karim"]);
  });

  it("never includes the rater, which is what the recap's figure means", () => {
    // « la moyenne des notes que les autres lui ont mises » — his own note has no place in it, and
    // `ratings_no_self` says the same thing in the database.
    for (const id of playedMemberIds(PLAYED)) {
      expect(ratingTargetsFor(PLAYED, id)).not.toContain(id);
    }
  });

  it("asks nothing of somebody who did not play", () => {
    // A supporter opening the notation URL by hand is a reader, not an error.
    expect(ratingTargetsFor(PLAYED, "momo")).toEqual([]);
    expect(ratingTargetsFor(PLAYED, "pierre")).toEqual([]);
    expect(ratingTargetsFor(PLAYED, null)).toEqual([]);
  });

  it("asks nothing of the only man who played", () => {
    // Degenerate, but it is the shape of a match whose log holds one player: there is nobody else
    // to rate, so his set is empty and therefore complete.
    expect(ratingTargetsFor(played(["hugo", 60]), "hugo")).toEqual([]);
  });
});

describe("ratingProgress", () => {
  const requiredIds = ["hugo", "karim", "momo"];

  it("reports an untouched set", () => {
    const progress = ratingProgress({ requiredIds, submittedIds: [] });
    expect(progress).toMatchObject({
      submittedCount: 0,
      requiredCount: 3,
      complete: false,
      partial: false,
    });
    expect(progress.missingIds).toEqual(["hugo", "karim", "momo"]);
  });

  it("reports a partial set, and what is left", () => {
    const progress = ratingProgress({ requiredIds, submittedIds: ["karim"] });
    expect(progress).toMatchObject({ submittedCount: 1, complete: false, partial: true });
    expect(progress.missingIds).toEqual(["hugo", "momo"]);
  });

  it("is complete only when every required note is in", () => {
    expect(ratingProgress({ requiredIds, submittedIds: ["hugo", "karim"] }).complete).toBe(false);
    expect(
      ratingProgress({ requiredIds, submittedIds: ["hugo", "karim", "momo"] }).complete,
    ).toBe(true);
  });

  it("ignores a submitted note for somebody who is no longer required", () => {
    // A retro amendment can take a man's minutes to zero after his team-mates have rated him. The
    // note stays in the table; it is neither a missing one nor one that completes the set.
    const progress = ratingProgress({
      requiredIds: ["hugo", "karim"],
      submittedIds: ["hugo", "karim", "ghost"],
    });
    expect(progress.complete).toBe(true);
    expect(progress.submittedIds).toEqual(["hugo", "karim"]);
    expect(progress.submittedCount).toBe(2);
  });

  it("treats an empty set as complete rather than as a lock nobody can open", () => {
    expect(ratingProgress({ requiredIds: [], submittedIds: [] })).toMatchObject({
      complete: true,
      partial: false,
      requiredCount: 0,
    });
  });
});

describe("playedLabelFr", () => {
  it("says what the log says, not what the sheet planned", () => {
    expect(playedLabelFr(42)).toBe("42’");
  });

  it("says nothing about a man with no minutes, because he is not on the screen", () => {
    // « non entré » had a reader under decision 007, where the unused substitute was rated anyway.
    // Decision 137 does not put him in the list, so the label has nobody left to describe.
    expect(playedLabelFr(0)).toBeNull();
    expect(playedLabelFr(null)).toBeNull();
  });

  it("does not round a cameo away", () => {
    expect(playedLabelFr(1)).toBe("1’");
  });
});
