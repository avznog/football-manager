/**
 * Validation for the match sheet and the composition editor.
 *
 * Pure — no server imports — so it is unit tested directly and the editor can use the same parsers
 * to check itself before submitting. Every message is French: the coach reads them (decision 012).
 *
 * The editor is a client component holding a graph of state (an assignment per slot) that has to
 * reach a Server Action through a plain `<form>`, because the whole screen must keep working when a
 * gesture fails or JavaScript never loads. It is carried in **repeated hidden fields**, the same
 * trick the position picker uses (`app/(app)/joueur/_components/positions-editor.tsx`), and the
 * reader below is the only place that knows their encoding.
 */

import { z } from "zod";

import { FORMATION_SLOT_COUNT } from "@/db/reference";

/* -------------------------------------------------------------------------- */
/* The match sheet                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One line of the match sheet.
 *
 * `"none"` is a real answer, not a missing one: it deletes the `match_squad` row. "Not selected"
 * and "selected as a supporter" are different facts, and the availability screen, the statistics
 * and the composition editor all read the difference.
 */
export const squadMarkSchema = z.enum(["starter", "substitute", "supporter", "none"], {
  message: "Choisis titulaire, remplaçant, supporter ou rien.",
});

export type SquadMark = z.infer<typeof squadMarkSchema>;

/** The whole sheet in one submit — one save on a phone at the side of a pitch. */
export const setMatchSquadSchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  marks: z.array(z.object({ teamMemberId: z.uuid(), mark: squadMarkSchema })),
});

/**
 * Reads the per-player radios of the match sheet, named `role:<membershipId>`.
 *
 * Unknown values are skipped rather than defaulted: a value the app did not write is a bug or a
 * forged form, and in both cases leaving the player's current row alone is the safe answer.
 */
export function readSquadMarks(
  entries: Iterable<[string, FormDataEntryValue]>,
): Array<{ teamMemberId: string; mark: SquadMark }> {
  const marks: Array<{ teamMemberId: string; mark: SquadMark }> = [];

  for (const [key, value] of entries) {
    if (!key.startsWith("role:")) continue;
    const teamMemberId = key.slice("role:".length);
    const parsed = squadMarkSchema.safeParse(typeof value === "string" ? value : "");
    if (!parsed.success) continue;
    marks.push({ teamMemberId, mark: parsed.data });
  }

  return marks;
}

/* -------------------------------------------------------------------------- */
/* The composition                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The minute a composition takes effect from.
 *
 * 0 is the starting seven. The ceiling is deliberately loose: a match is 2×30 by default
 * (decision 009) but extra time, a longer format or a coach planning "for the last five minutes"
 * of a 2×45 friendly must all fit. Minutes are continuous — with 2×30 the second half runs
 * 30'→60' (`CLAUDE.md`), so 45 means "in the second half", never "in the first".
 */
export const fromMinuteSchema = z.coerce
  .number({ message: "Indique une minute." })
  .int("La minute doit être un nombre entier.")
  .min(0, "La minute ne peut pas être négative.")
  .max(200, "Cette minute est en dehors du match.");

/** One `(slot, player)` pair as the form carries it: `slot=<slotKey>:<membershipId>`. */
export function readSlotFields(
  values: readonly FormDataEntryValue[],
): Array<{ slotKey: string; memberId: string }> {
  const pairs: Array<{ slotKey: string; memberId: string }> = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const separator = value.indexOf(":");
    if (separator <= 0) continue;
    const slotKey = value.slice(0, separator).trim();
    const memberId = value.slice(separator + 1).trim();
    if (slotKey.length === 0 || memberId.length === 0) continue;
    // Last one wins, so a duplicated field cannot smuggle two players into one slot.
    const existing = pairs.findIndex((pair) => pair.slotKey === slotKey);
    if (existing >= 0) pairs[existing] = { slotKey, memberId };
    else pairs.push({ slotKey, memberId });
  }

  return pairs;
}

/**
 * The composition, as the editor submits it. There is no formation in it: every composition stands
 * on the one formation (decision 157), which `saveLineup` reads itself rather than trusting a form to
 * name it. The slot keys are that formation's `formation_slots.id`s.
 */
export const saveLineupSchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  /** Absent when the coach is creating a composition rather than editing one. */
  lineupId: z.uuid().optional(),
  fromMinute: fromMinuteSchema,
  assignments: z
    .array(z.object({ slotKey: z.string().min(1), memberId: z.uuid() }))
    .max(FORMATION_SLOT_COUNT, "Il n’y a que 7 postes sur le terrain."),
});

export type SaveLineupInput = z.infer<typeof saveLineupSchema>;

export const lineupTargetSchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  lineupId: z.uuid(),
});
