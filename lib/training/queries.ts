import "server-only";

/**
 * Reads about trainings. Same contract as `lib/match/queries.ts`: plain serialisable objects,
 * instants as ISO strings, the `teamId` always inside the predicate.
 *
 * Declared availability and actual attendance are two separate tables on purpose — the gap
 * between "je viens" and "il est venu" is the interesting number (`docs/DATA_MODEL.md`), so they
 * are never merged here.
 */

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { trainingAttendance, trainingAvailability, trainings } from "@/db/schema";
import type { AvailabilityStatus } from "@/db/schema";
import type { TrainingDeletionHolds } from "@/lib/calendar/deletion";

export type TrainingRow = {
  id: string;
  teamId: string;
  /** ISO 8601. */
  startsAt: string;
  venue: string | null;
  note: string | null;
};

const TRAINING_COLUMNS = {
  id: trainings.id,
  teamId: trainings.teamId,
  startsAt: trainings.startsAt,
  venue: trainings.venue,
  note: trainings.note,
};

function toTrainingRow(row: {
  id: string;
  teamId: string;
  startsAt: Date;
  venue: string | null;
  note: string | null;
}): TrainingRow {
  return { ...row, startsAt: row.startsAt.toISOString() };
}

export async function getTeamTrainings(teamId: string): Promise<TrainingRow[]> {
  const rows = await db
    .select(TRAINING_COLUMNS)
    .from(trainings)
    .where(eq(trainings.teamId, teamId))
    .orderBy(asc(trainings.startsAt));

  return rows.map(toTrainingRow);
}

export async function getTraining(teamId: string, trainingId: string): Promise<TrainingRow | null> {
  const rows = await db
    .select(TRAINING_COLUMNS)
    .from(trainings)
    .where(and(eq(trainings.id, trainingId), eq(trainings.teamId, teamId)))
    .limit(1);

  return rows[0] ? toTrainingRow(rows[0]) : null;
}

/* -------------------------------------------------------------------------- */
/* Declared availability                                                      */
/* -------------------------------------------------------------------------- */

export type TrainingAnswer = {
  trainingId: string;
  teamMemberId: string;
  status: AvailabilityStatus;
};

export async function getTeamTrainingAnswers(teamId: string): Promise<TrainingAnswer[]> {
  return db
    .select({
      trainingId: trainingAvailability.trainingId,
      teamMemberId: trainingAvailability.teamMemberId,
      status: trainingAvailability.status,
    })
    .from(trainingAvailability)
    .innerJoin(trainings, eq(trainings.id, trainingAvailability.trainingId))
    .where(eq(trainings.teamId, teamId));
}

export async function getTrainingAnswers(trainingId: string): Promise<TrainingAnswer[]> {
  return db
    .select({
      trainingId: trainingAvailability.trainingId,
      teamMemberId: trainingAvailability.teamMemberId,
      status: trainingAvailability.status,
    })
    .from(trainingAvailability)
    .where(eq(trainingAvailability.trainingId, trainingId));
}

/* -------------------------------------------------------------------------- */
/* Actual attendance                                                          */
/* -------------------------------------------------------------------------- */

export type AttendanceRow = {
  trainingId: string;
  teamMemberId: string;
  present: boolean;
};

export async function getTrainingAttendance(trainingId: string): Promise<AttendanceRow[]> {
  return db
    .select({
      trainingId: trainingAttendance.trainingId,
      teamMemberId: trainingAttendance.teamMemberId,
      present: trainingAttendance.present,
    })
    .from(trainingAttendance)
    .where(eq(trainingAttendance.trainingId, trainingId));
}

export type AttendanceCounts = {
  /** Marked present. */
  present: number;
  /** Judged at all — a member with no row is neither present nor absent, just unmarked. */
  marked: number;
};

/** One grouped count per training, for the « 10/13 présents » on a past row in the calendar. */
export async function getTeamAttendanceCounts(
  teamId: string,
): Promise<Map<string, AttendanceCounts>> {
  const rows = await db
    .select({
      trainingId: trainingAttendance.trainingId,
      present: sql<string>`count(*) filter (where ${trainingAttendance.present})`,
      marked: sql<string>`count(*)`,
    })
    .from(trainingAttendance)
    .innerJoin(trainings, eq(trainings.id, trainingAttendance.trainingId))
    .where(eq(trainings.teamId, teamId))
    .groupBy(trainingAttendance.trainingId);

  return new Map(
    rows.map((row) => [
      row.trainingId,
      { present: Number(row.present), marked: Number(row.marked) },
    ]),
  );
}

/**
 * What would go with this séance, for the sentence on the « supprimer » card.
 *
 * Attendance is counted even though the button only appears before the session is over: the pointage
 * opens 30 minutes before kick-off (decision 099) and the delete button closes when the séance does,
 * so a séance being marked at the pitch is deletable, and a warning that mentioned only the answers
 * would be describing the easier half of the loss. When the count is zero the sentence says so.
 */
export async function getTrainingDeletionHolds(
  trainingId: string,
): Promise<TrainingDeletionHolds> {
  const [row] = await db
    .select({
      answers: sql<string>`(select count(*) from training_availability
        where training_id = ${trainingId})`,
      attendance: sql<string>`(select count(*) from training_attendance
        where training_id = ${trainingId})`,
    })
    .from(trainings)
    .where(eq(trainings.id, trainingId));

  // `count(*)` is a bigint, which postgres.js hands over as a string.
  return { answers: Number(row?.answers ?? 0), attendance: Number(row?.attendance ?? 0) };
}
