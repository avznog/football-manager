/**
 * Validation for the training forms. Pure, French messages (decision 012).
 *
 * The date field and the availability field are the same ones a match uses, so they are imported
 * rather than restated: « dispo / pas dispo / peut-être » must mean the same thing everywhere.
 */

import { z } from "zod";

import { fromLocalInput } from "@/lib/calendar/time";
import { availabilityStatusSchema, venueSchema } from "@/lib/match/validation";

export const startsAtSchema = z
  .string()
  .trim()
  .min(1, "Indique la date et l’heure de l’entraînement.")
  .refine((value) => fromLocalInput(value) !== null, "Cette date n’est pas valide.")
  .transform((value) => fromLocalInput(value) as Date);

/** « Travail sur les sorties de balle » — what the session is about. */
export const trainingNoteSchema = z
  .string()
  .trim()
  .max(280, "Cette note est trop longue.")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const trainingFields = {
  startsAt: startsAtSchema,
  venue: venueSchema,
  note: trainingNoteSchema,
};

export const createTrainingSchema = z.object({ teamId: z.uuid(), ...trainingFields });

export const updateTrainingSchema = z.object({
  teamId: z.uuid(),
  trainingId: z.uuid(),
  ...trainingFields,
});

export const trainingTargetSchema = z.object({ teamId: z.uuid(), trainingId: z.uuid() });

/**
 * No `note` field, unlike a match: `training_availability` has no column for one. An excuse for
 * missing a Tuesday session matters less than one for missing a game, and the schema says so.
 */
export const trainingAvailabilitySchema = z.object({
  teamId: z.uuid(),
  trainingId: z.uuid(),
  status: availabilityStatusSchema,
});

/**
 * One line of the coach's présent/absent list.
 *
 * `"unset"` is a real value, not a missing one: a member the coach has not judged yet has **no
 * row** in `training_attendance`, which is different from being marked absent. The gap between
 * declared availability and actual attendance is the interesting part (`docs/DATA_MODEL.md`),
 * and pretending an unmarked player was absent would destroy it.
 */
export const attendanceMarkSchema = z.enum(["present", "absent", "unset"]);

export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;

/** The whole list in one submit, so the coach saves once on a flaky connection. */
export const markAttendanceSchema = z.object({
  teamId: z.uuid(),
  trainingId: z.uuid(),
  marks: z.array(z.object({ teamMemberId: z.uuid(), mark: attendanceMarkSchema })),
});

/**
 * Reads the per-player radios out of the submitted form.
 *
 * The inputs are named `presence:<membershipId>` so one `FormData` carries the whole squad.
 * Pure, and unit tested: this is the one place where a typo would silently mark everybody absent.
 */
export function readAttendanceMarks(
  entries: Iterable<[string, FormDataEntryValue]>,
): Array<{ teamMemberId: string; mark: AttendanceMark }> {
  const marks: Array<{ teamMemberId: string; mark: AttendanceMark }> = [];

  for (const [key, value] of entries) {
    if (!key.startsWith("presence:")) continue;
    const teamMemberId = key.slice("presence:".length);
    const parsed = attendanceMarkSchema.safeParse(typeof value === "string" ? value : "");
    if (!parsed.success) continue;
    marks.push({ teamMemberId, mark: parsed.data });
  }

  return marks;
}
