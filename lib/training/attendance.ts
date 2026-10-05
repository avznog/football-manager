/**
 * The coach's présent/absent marks, as a value the screen can hold.
 *
 * The marking list used to be a Server Component with uncontrolled radios, and that is what cost the
 * coach his pointage: « Tout le monde est là » wrote thirteen rows, the card said « 13 présents sur
 * 13 pointés », and **all thirteen radios still read « — »** — React re-renders the tree onto the same
 * keys and does not reset an uncontrolled input, so the DOM kept the stale `unset`. The next save
 * posted `unset` for the eleven nobody had touched, and the action deleted their rows, because
 * « the coach cleared this » and « the DOM is stale » are the same two words on the wire (`D1`, the
 * UX audit of 2026-10-01 — reproduced in both engines before this was written).
 *
 * So the marks are **state** now, and this module is that state's arithmetic: pure, so the
 * four-step sequence that lost the data is a unit test rather than a hand walk. Three facts shape
 * every function here:
 *
 * 1. **There are three marks, not two.** A member with no row has not been judged, which is not the
 *    same as being marked absent, and M5's attendance rate depends on the difference
 *    (`docs/DATA_MODEL.md`). `"unset"` is that third state and it is what deletes a row.
 * 2. **The map can hold members the list cannot show.** The coach pointed fourteen men in August and
 *    one had left by September; his mark survives, and the row offering him a radio does not. So the
 *    denominator is the map's size and never `players.length`.
 * 3. **`present` is a boolean in the database and the absence of a key is the third state**, which is
 *    why these take a `ReadonlyMap<string, boolean>` rather than inventing a third storage shape.
 */

/** What one radio group can say. `"unset"` is « — », and it is what deletes the row. */
export type Mark = "present" | "absent" | "unset";

/** `true` présent, `false` absent, and no key at all means nobody has judged this member yet. */
export type MarkMap = ReadonlyMap<string, boolean>;

export function markOf(marks: MarkMap, membershipId: string): Mark {
  const mark = marks.get(membershipId);
  if (mark === undefined) return "unset";
  return mark ? "present" : "absent";
}

/**
 * The map with one member's mark changed. A new map every time: the component compares by identity.
 */
export function withMark(marks: MarkMap, membershipId: string, mark: Mark): MarkMap {
  const next = new Map(marks);
  if (mark === "unset") next.delete(membershipId);
  else next.set(membershipId, mark === "present");
  return next;
}

/**
 * « Tout le monde est là », applied to the list in front of the coach.
 *
 * Only the members he can see: a mark belonging to somebody who has left the club is not touched,
 * because the shortcut is a statement about tonight's squad and that mark is a statement about an
 * evening in August.
 */
export function allPresent(marks: MarkMap, membershipIds: readonly string[]): MarkMap {
  const next = new Map(marks);
  for (const id of membershipIds) next.set(id, true);
  return next;
}

/**
 * A stable string for « which marks are these ».
 *
 * Two jobs, and both need the *same* answer: telling the server's marks from the ones on screen, and
 * noticing that a save has landed so the screen can go back to trusting the server. Sorted, because
 * a map's iteration order is its insertion order and two identical pointages built in a different
 * order must not read as a change.
 */
export function marksSignature(marks: MarkMap): string {
  return [...marks]
    .map(([id, present]) => `${id}:${present ? "P" : "A"}`)
    .sort()
    .join("|");
}

export type AttendanceTally = {
  present: number;
  judged: number;
  /** Marks belonging to members the list cannot show — someone who has since left the club. */
  departed: number;
};

export function attendanceTally(marks: MarkMap, membershipIds: readonly string[]): AttendanceTally {
  const shown = new Set(membershipIds);
  let present = 0;
  let departed = 0;
  for (const [id, isPresent] of marks) {
    if (isPresent) present += 1;
    if (!shown.has(id)) departed += 1;
  }
  return { present, judged: marks.size, departed };
}

/**
 * How many members the coach has changed since the last save, so the screen can say that the figures
 * above are not in the database yet.
 *
 * Counted over the union of both maps: a member cleared back to « — » has left one map and is a
 * change exactly like a member who has just been marked present.
 */
export function unsavedCount(saved: MarkMap, current: MarkMap): number {
  let changed = 0;
  for (const id of new Set([...saved.keys(), ...current.keys()])) {
    if (saved.get(id) !== current.get(id)) changed += 1;
  }
  return changed;
}

/**
 * « 2 changements pas encore enregistrés. » — the sentence the old card had no way to say.
 *
 * It said « 13 présents sur 13 pointés » about the database while the radios below described
 * something else entirely, which is the half of `D1` a coach could actually see. Now the count
 * describes the radios, and this says whether the database agrees yet.
 */
export function unsavedMarksNoteFr(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "1 présence modifiée, pas encore enregistrée.";
  return `${count} présences modifiées, pas encore enregistrées.`;
}

/**
 * What the coach is told when the save does not land — the touchline case, which is the one this
 * screen was designed for and the one it handled worst: the whole page was replaced by the crash
 * boundary, the thirteen rows went with it, and the « Réessayer » it offered re-renders a segment
 * rather than resubmitting anything (`D4`).
 *
 * « sont toujours là » is the part that matters: the marks are on screen, so the retry is one tap
 * and not thirteen.
 */
export const ATTENDANCE_SAVE_FAILED_FR =
  "Les présences n’ont pas été enregistrées. Tes réponses sont toujours là : réessaie.";
