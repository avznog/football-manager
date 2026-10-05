import { describe, expect, it } from "vitest";

import {
  allPresent,
  attendanceTally,
  markOf,
  marksSignature,
  unsavedCount,
  unsavedMarksNoteFr,
  withMark,
  type MarkMap,
} from "./attendance";

const SQUAD = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"];

function marks(entries: Record<string, boolean> = {}): MarkMap {
  return new Map(Object.entries(entries));
}

describe("markOf", () => {
  it("tells « pas encore pointé » from « absent »", () => {
    const current = marks({ a: true, b: false });
    expect(markOf(current, "a")).toBe("present");
    expect(markOf(current, "b")).toBe("absent");
    expect(markOf(current, "c")).toBe("unset");
  });
});

describe("withMark", () => {
  it("records a mark without touching the map it was given", () => {
    const before = marks({ a: true });
    const after = withMark(before, "b", "absent");
    expect(markOf(after, "b")).toBe("absent");
    expect(markOf(before, "b")).toBe("unset");
  });

  it("removes the key for « — », because that is what deletes the row", () => {
    const after = withMark(marks({ a: true }), "a", "unset");
    expect(after.has("a")).toBe(false);
    expect(after.size).toBe(0);
  });
});

describe("allPresent", () => {
  it("marks every member the coach can see", () => {
    const after = allPresent(marks(), SQUAD);
    expect(after.size).toBe(13);
    expect([...after.values()].every(Boolean)).toBe(true);
  });

  it("flips a member already marked absent", () => {
    expect(markOf(allPresent(marks({ a: false }), SQUAD), "a")).toBe("present");
  });

  it("leaves alone a mark belonging to somebody who has left the club", () => {
    // Pointed in August, gone by September: the shortcut is about tonight's squad.
    const after = allPresent(marks({ rayan: false }), SQUAD);
    expect(markOf(after, "rayan")).toBe("absent");
    expect(after.size).toBe(14);
  });
});

describe("marksSignature", () => {
  it("does not depend on the order the marks were recorded in", () => {
    const one = withMark(withMark(marks(), "a", "present"), "b", "absent");
    const other = withMark(withMark(marks(), "b", "absent"), "a", "present");
    expect(marksSignature(one)).toBe(marksSignature(other));
  });

  it("changes when a mark changes, and when one is cleared", () => {
    const base = marks({ a: true });
    expect(marksSignature(withMark(base, "a", "absent"))).not.toBe(marksSignature(base));
    expect(marksSignature(withMark(base, "a", "unset"))).not.toBe(marksSignature(base));
  });

  it("is empty for an unpointed session, so « nothing saved » is a value too", () => {
    expect(marksSignature(marks())).toBe("");
  });
});

describe("attendanceTally", () => {
  it("counts présents over the marks and pointés over the map's size", () => {
    const current = marks({ a: true, b: true, c: false });
    expect(attendanceTally(current, SQUAD)).toEqual({ present: 2, judged: 3, departed: 0 });
  });

  it("names the marks the list cannot show a row for", () => {
    const current = allPresent(marks({ rayan: true }), SQUAD);
    expect(attendanceTally(current, SQUAD)).toEqual({ present: 14, judged: 14, departed: 1 });
  });
});

describe("unsavedCount", () => {
  it("is zero when the screen and the database agree", () => {
    expect(unsavedCount(marks({ a: true }), marks({ a: true }))).toBe(0);
  });

  it("counts a changed mark, a new one and a cleared one alike", () => {
    const saved = marks({ a: true, b: true });
    const current = withMark(withMark(withMark(saved, "a", "absent"), "b", "unset"), "c", "present");
    expect(unsavedCount(saved, current)).toBe(3);
  });
});

describe("unsavedMarksNoteFr", () => {
  it("agrees with its own number", () => {
    expect(unsavedMarksNoteFr(1)).toBe("1 présence modifiée, pas encore enregistrée.");
    expect(unsavedMarksNoteFr(11)).toBe("11 présences modifiées, pas encore enregistrées.");
  });

  it("says nothing when there is nothing to warn about", () => {
    expect(unsavedMarksNoteFr(0)).toBeNull();
    expect(unsavedMarksNoteFr(-1)).toBeNull();
  });

  it("tutoie-compatible: it names the subject rather than addressing a « vous »", () => {
    expect(unsavedMarksNoteFr(2)).not.toMatch(/vous|votre/i);
  });
});

/**
 * `D1`, as the four taps that lost the data.
 *
 * On the old screen this sequence ended at « 0 présent sur 2 pointés »: the shortcut's own form
 * submitted, the server wrote thirteen rows, and the thirteen radios in the *other* form kept the
 * `unset` the DOM had been built with — so the save that followed posted `unset` eleven times and
 * deleted eleven rows. Walked here against the state these helpers hold, which is the fix: there is
 * one set of marks, the radios and the card both read it, and nothing can post a mark the coach
 * cannot see.
 */
describe("the four-step sequence of D1", () => {
  it("keeps the eleven untouched players present after the save", () => {
    // 1. nobody pointed yet.
    let current = marks();
    expect(attendanceTally(current, SQUAD).judged).toBe(0);

    // 2. « Tout le monde est là ».
    current = allPresent(current, SQUAD);
    expect(attendanceTally(current, SQUAD)).toEqual({ present: 13, judged: 13, departed: 0 });
    // The half a coach could see: the radios now say what the card says.
    expect(SQUAD.every((id) => markOf(current, id) === "present")).toBe(true);

    // 3. two of them are missing.
    current = withMark(withMark(current, "a", "absent"), "b", "absent");

    // 4. « Enregistrer les présences » — what travels is these marks, and nothing else.
    const tally = attendanceTally(current, SQUAD);
    expect(tally).toEqual({ present: 11, judged: 13, departed: 0 });
    const cleared = SQUAD.filter((id) => markOf(current, id) === "unset");
    expect(cleared).toEqual([]);
  });

  it("warns that the two flips are not in the database until the save lands", () => {
    const saved = allPresent(marks(), SQUAD);
    const current = withMark(withMark(saved, "a", "absent"), "b", "absent");
    expect(unsavedMarksNoteFr(unsavedCount(saved, current))).toBe(
      "2 présences modifiées, pas encore enregistrées.",
    );
    // And once it lands, the server's answer is the screen's answer again.
    expect(unsavedCount(current, current)).toBe(0);
  });
});
