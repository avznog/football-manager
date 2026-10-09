import "server-only";

/**
 * Reads for the compositions of a match, and for the selection (`match_squad`) they write.
 *
 * Everything returned is plain and serialisable — the editor is a client component, so no Drizzle
 * row and no `Date` crosses the boundary (`CLAUDE.md`).
 *
 * Nothing here derives anything: who is on the pitch during a live match is the reducer's business
 * (invariant 2), and these are the *planned* compositions, which are stored.
 */

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { formations, lineupSlots, lineups, matchSquad } from "@/db/schema";
import type { SquadRole } from "@/db/schema";
import { getFormationSlots, type FormationSlotRow } from "@/lib/formation/queries";
import { getSquad } from "@/lib/team/queries";

import type { PlanMember, PlanSlot, PlannedLineup } from "./plan";

/* -------------------------------------------------------------------------- */
/* The selection                                                              */
/* -------------------------------------------------------------------------- */

export type SquadSheetEntry = {
  teamMemberId: string;
  role: SquadRole;
};

/** The selection as stored: only the members the coach has selected have a row. */
export async function getMatchSquad(matchId: string): Promise<SquadSheetEntry[]> {
  return db
    .select({ teamMemberId: matchSquad.teamMemberId, role: matchSquad.role })
    .from(matchSquad)
    .where(eq(matchSquad.matchId, matchId));
}

/**
 * Every active member of the team, with what the selection currently says about them.
 *
 * The squad order is `getSquad`'s (coaches first, then by shirt number), which is the order the
 * coach is used to everywhere else in the app. A player with no `match_squad` row gets
 * `squadRole: null` — "not selected", which is different from "supporter".
 */
export type CompositionMember = PlanMember & {
  jerseyNumber: number | null;
  isPlayer: boolean;
};

// No preferred positions here (decision 163): they are the coach's indication for the statistics,
// and a composition is drawn without them.

export async function getCompositionMembers(
  teamId: string,
  matchId: string,
): Promise<CompositionMember[]> {
  const [squad, sheet] = await Promise.all([getSquad(teamId), getMatchSquad(matchId)]);
  const roles = new Map(sheet.map((entry) => [entry.teamMemberId, entry.role]));

  return squad.map((member) => ({
    membershipId: member.membershipId,
    name: member.displayName,
    jerseyNumber: member.jerseyNumber,
    isInjured: member.isInjured,
    isPlayer: member.isPlayer,
    squadRole: roles.get(member.membershipId) ?? null,
  }));
}

/**
 * Everyone who already appears in a composition game mode has confirmed.
 *
 * Such a player cannot be taken off the selection: the composition is tied to an event in the
 * append-only log (invariant 1), and dropping him would contradict a match that has happened. The
 * list under the starting pitch greys the two choices that would do it, and `saveLineup` refuses
 * them outright (`squadFromComposition`, rule 4).
 */
export async function getFieldedMemberIds(matchId: string): Promise<string[]> {
  const rows = await db
    .select({ memberId: lineupSlots.teamMemberId })
    .from(lineupSlots)
    .innerJoin(lineups, eq(lineups.id, lineupSlots.lineupId))
    .where(and(eq(lineups.matchId, matchId), isNotNull(lineups.appliedEventId)));
  return [...new Set(rows.map((row) => row.memberId))];
}

/* -------------------------------------------------------------------------- */
/* The compositions                                                           */
/* -------------------------------------------------------------------------- */

export type LineupRow = {
  id: string;
  matchId: string;
  formationId: string;
  formationName: string;
  formationLabel: string;
  formationIsBuiltin: boolean;
  fromMinute: number;
  isInitial: boolean;
  /** True once game mode has confirmed it. Such a composition is history and is never edited. */
  isApplied: boolean;
  /** ISO 8601, so nothing with a `Date` on it crosses the RSC boundary. */
  createdAt: string;
  slots: FormationSlotRow[];
  assignments: { slotId: string; memberId: string }[];
};

/**
 * Every composition of a match, oldest minute first, with its formation's slots and its
 * assignments.
 *
 * Three round trips rather than one join: a join over lineups × slots × assignments multiplies rows
 * and would have to be un-multiplied in JavaScript anyway, and a match holds two or three
 * compositions of seven slots.
 */
export async function getMatchLineups(matchId: string): Promise<LineupRow[]> {
  const rows = await db
    .select({
      id: lineups.id,
      matchId: lineups.matchId,
      formationId: lineups.formationId,
      formationName: formations.name,
      formationLabel: formations.label,
      formationTeamId: formations.teamId,
      fromMinute: lineups.fromMinute,
      isInitial: lineups.isInitial,
      appliedEventId: lineups.appliedEventId,
      createdAt: lineups.createdAt,
    })
    .from(lineups)
    .innerJoin(formations, eq(formations.id, lineups.formationId))
    .where(eq(lineups.matchId, matchId))
    .orderBy(asc(lineups.fromMinute));

  if (rows.length === 0) return [];

  const [slotsByFormation, assignmentRows] = await Promise.all([
    getFormationSlots([...new Set(rows.map((row) => row.formationId))]),
    db
      .select({
        lineupId: lineupSlots.lineupId,
        slotId: lineupSlots.formationSlotId,
        memberId: lineupSlots.teamMemberId,
      })
      .from(lineupSlots)
      .where(
        inArray(
          lineupSlots.lineupId,
          rows.map((row) => row.id),
        ),
      ),
  ]);

  const assignmentsByLineup = new Map<string, { slotId: string; memberId: string }[]>();
  for (const row of assignmentRows) {
    const list = assignmentsByLineup.get(row.lineupId) ?? [];
    list.push({ slotId: row.slotId, memberId: row.memberId });
    assignmentsByLineup.set(row.lineupId, list);
  }

  return rows.map((row) => {
    const slots = slotsByFormation.get(row.formationId) ?? [];
    const order = new Map(slots.map((slot, index) => [slot.id, index]));
    const assignments = (assignmentsByLineup.get(row.id) ?? []).sort(
      (a, b) => (order.get(a.slotId) ?? 99) - (order.get(b.slotId) ?? 99),
    );

    return {
      id: row.id,
      matchId: row.matchId,
      formationId: row.formationId,
      formationName: row.formationName,
      formationLabel: row.formationLabel,
      formationIsBuiltin: row.formationTeamId === null,
      fromMinute: row.fromMinute,
      isInitial: row.isInitial,
      isApplied: row.appliedEventId !== null,
      createdAt: row.createdAt.toISOString(),
      slots,
      assignments,
    };
  });
}

/** One composition of the match, or null. The match id is part of the predicate, never a cast. */
export async function getMatchLineup(
  matchId: string,
  lineupId: string,
): Promise<LineupRow | null> {
  const all = await getMatchLineups(matchId);
  return all.find((lineup) => lineup.id === lineupId) ?? null;
}

/** The slots of a composition in the shape the French diff needs. */
export function planSlotsOf(lineup: Pick<LineupRow, "slots">): PlanSlot[] {
  return lineup.slots.map((slot) => ({
    id: slot.id,
    positionCode: slot.positionCode,
    sort: slot.sort,
  }));
}

/**
 * A stored composition as the pure planning helpers want it.
 *
 * The narrowing is the point: `PlannedLineup` carries only what deducing a change needs, so
 * `lib/composition/plan.ts` stays testable with literals and never has to know about `createdAt`
 * or a formation's name.
 */
export function toPlannedLineup(lineup: LineupRow): PlannedLineup {
  return {
    id: lineup.id,
    fromMinute: lineup.fromMinute,
    isInitial: lineup.isInitial,
    formationId: lineup.formationId,
    formationLabel: lineup.formationLabel,
    isApplied: lineup.isApplied,
    assignments: lineup.assignments,
    slots: planSlotsOf(lineup),
  };
}

/** Is there a composition on this match at all — what the match page's summary card asks. */
export async function countMatchLineups(matchId: string): Promise<number> {
  const rows = await db
    .select({ id: lineups.id })
    .from(lineups)
    .where(eq(lineups.matchId, matchId));
  return rows.length;
}

/** Whether a composition has already been confirmed in game mode — it must not be edited then. */
export async function isLineupApplied(matchId: string, lineupId: string): Promise<boolean> {
  const rows = await db
    .select({ appliedEventId: lineups.appliedEventId })
    .from(lineups)
    .where(and(eq(lineups.id, lineupId), eq(lineups.matchId, matchId)))
    .limit(1);
  return rows[0]?.appliedEventId != null;
}
