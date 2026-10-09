import { describe, expect, it } from "vitest";

import {
  eligibleRaterIds,
  hasPlayed,
  mayRateMatch,
  playedLabelFr,
  playedMemberIds,
  ratingProgress,
  ratingTargetsFor,
  tallyOf,
  type PlayedEntry,
  type SquadEntry,
  type TallyMember,
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

/** No longer a gate on rating (decision 139) — only on being rated, and on what the screen says. */
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

  it("asks the whole list of somebody who did not play", () => {
    // Decision 139: the unused substitute, the supporter on the touchline, and a member who was not
    // even on the sheet all rate the men who played. Nobody is subtracted, because none of them is in
    // the rated set to subtract.
    expect(ratingTargetsFor(PLAYED, "momo")).toEqual(["hugo", "karim"]);
    expect(ratingTargetsFor(PLAYED, "pierre")).toEqual(["hugo", "karim"]);
  });

  it("asks the whole list of a viewer with no membership at all", () => {
    // A null id cannot equal anybody's, so nothing is filtered out. The query layer is what refuses
    // him an insert; this function describes the match, not the reader's right to act on it.
    expect(ratingTargetsFor(PLAYED, null)).toEqual(["hugo", "karim"]);
  });

  it("asks nothing of the only man who played", () => {
    // Degenerate, but it is the shape of a match whose log holds one player: there is nobody else
    // to rate, so his set is empty and therefore complete.
    expect(ratingTargetsFor(played(["hugo", 60]), "hugo")).toEqual([]);
  });

  it("is empty for a match nobody played, whoever is asking", () => {
    // The one meaning an empty list has left (decision 139): no log, so no rated set. A supporter
    // used to produce the same empty list for a different reason, which is exactly what made it
    // ambiguous.
    expect(ratingTargetsFor([], "pierre")).toEqual([]);
  });
});

/**
 * Decision 159: the sheet rates. Hugo and Karim started, Momo was a substitute who never came on,
 * Pierre was a supporter; Rayan was not selected, and neither was the coach, who never plays.
 */
const SHEET: SquadEntry[] = [
  { teamMemberId: "hugo", role: "starter" },
  { teamMemberId: "karim", role: "starter" },
  { teamMemberId: "momo", role: "substitute" },
  { teamMemberId: "pierre", role: "supporter" },
];

describe("mayRateMatch", () => {
  it("lets a starter, a substitute who never came on, and a supporter rate", () => {
    for (const id of ["hugo", "karim", "momo", "pierre"]) {
      expect(mayRateMatch(SHEET, PLAYED, id)).toBe(true);
    }
  });

  it("refuses a player who was not selected", () => {
    expect(mayRateMatch(SHEET, PLAYED, "rayan")).toBe(false);
  });

  it("refuses a coach who is not on the sheet, whatever his permissions say", () => {
    // `can()` gives `rating:submit` to every member; the sheet is the data half and it says no.
    expect(mayRateMatch(SHEET, PLAYED, "coach")).toBe(false);
  });

  it("lets a coach rate when the sheet names him, as a supporter for instance", () => {
    expect(mayRateMatch([...SHEET, { teamMemberId: "coach", role: "supporter" }], PLAYED, "coach")).toBe(
      true,
    );
  });

  it("refuses a viewer with no membership", () => {
    expect(mayRateMatch(SHEET, PLAYED, null)).toBe(false);
    expect(mayRateMatch(SHEET, PLAYED, undefined)).toBe(false);
  });

  it("lets a man the log has playing rate even when the sheet forgot him", () => {
    // He is rated, so he rates: he was a starter or a substitute in fact, whatever the sheet says.
    expect(mayRateMatch(SHEET, played(["late", 20]), "late")).toBe(true);
  });

  it("gives nobody a vote on a match with no sheet that nobody played", () => {
    expect(mayRateMatch([], [], "hugo")).toBe(false);
    expect(eligibleRaterIds([], [])).toEqual([]);
  });
});

describe("eligibleRaterIds", () => {
  it("is the sheet plus whoever played, sorted and without duplicates", () => {
    expect(eligibleRaterIds(SHEET, [...PLAYED, ...played(["late", 20])])).toEqual([
      "hugo",
      "karim",
      "late",
      "momo",
      "pierre",
    ]);
  });
});

describe("tallyOf", () => {
  const directory: TallyMember[] = [
    { membershipId: "coach", displayName: "Coach", hasLeft: false },
    { membershipId: "hugo", displayName: "Hugo", hasLeft: false },
    { membershipId: "karim", displayName: "Karim", hasLeft: false },
    { membershipId: "momo", displayName: "Momo", hasLeft: false },
    { membershipId: "pierre", displayName: "Pierre", hasLeft: false },
    { membershipId: "rayan", displayName: "Rayan", hasLeft: false },
  ];

  it("counts the eligible raters only, so the unselected are neither counted nor chased", () => {
    const tally = tallyOf(directory, eligibleRaterIds(SHEET, PLAYED), ["hugo", "pierre"]);
    expect(tally.memberTotal).toBe(4);
    expect(tally.raterCount).toBe(2);
    expect(tally.silent.map((member) => member.displayName)).toEqual(["Karim", "Momo"]);
  });

  it("leaves out an eligible member who has left the team", () => {
    const left = directory.map((member) =>
      member.membershipId === "momo" ? { ...member, hasLeft: true } : member,
    );
    const tally = tallyOf(left, eligibleRaterIds(SHEET, PLAYED), []);
    expect(tally.memberTotal).toBe(3);
    expect(tally.silent.map((member) => member.memberId)).toEqual(["hugo", "karim", "pierre"]);
  });

  it("does not count a stray note from somebody the sheet does not name", () => {
    const tally = tallyOf(directory, eligibleRaterIds(SHEET, PLAYED), ["rayan"]);
    expect(tally.raterCount).toBe(0);
    expect(tally.memberTotal).toBe(4);
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
