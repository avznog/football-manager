/**
 * Validation for the composition editor, and the selection it now carries (decision 165).
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

import type { BenchMark } from "./squad";

/* -------------------------------------------------------------------------- */
/* The selection, below the starting composition                              */
/* -------------------------------------------------------------------------- */

/**
 * One line of the list under the starting composition's pitch (decision 165): remplaçant, supporter,
 * or « — ». There is no « titulaire » here — the pitch says who starts — and `"none"` is a real
 * answer: it means no `match_squad` row.
 */
export const benchMarkSchema = z.enum(["substitute", "supporter", "none"], {
  message: "Choisis remplaçant, supporter ou non sélectionné.",
});

/**
 * Reads the per-member radios of that list, named `role:<membershipId>`.
 *
 * Unknown values are skipped rather than defaulted: a value the app did not write is a bug or a
 * forged form. `squadFromComposition` then treats the member as unmarked, which is « — ».
 */
export function readBenchMarks(
  entries: Iterable<[string, FormDataEntryValue]>,
): Map<string, BenchMark> {
  const marks = new Map<string, BenchMark>();

  for (const [key, value] of entries) {
    if (!key.startsWith("role:")) continue;
    const teamMemberId = key.slice("role:".length);
    const parsed = benchMarkSchema.safeParse(typeof value === "string" ? value : "");
    if (!parsed.success) continue;
    marks.set(teamMemberId, parsed.data);
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
  /**
   * True when the form is the starting composition's, which carries the selection list under the
   * pitch. It must be true at minute 0 and false after it (`saveLineup`), so a plan can never wipe
   * the selection by submitting a minute 0 without a list.
   */
  withSquad: z.boolean(),
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
