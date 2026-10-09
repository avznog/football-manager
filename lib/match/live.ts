import "server-only";

/**
 * Everything game mode needs to render, in one round trip each.
 *
 * Game mode is the only screen that reads the **whole** event log: the score, who is on the pitch,
 * the minutes and the timeline are all derived from it by `reduceMatch` (invariant 2), so the job
 * here is purely to hand the reducer its inputs — plus the names, shirt numbers and slot
 * coordinates the reducer deliberately knows nothing about.
 *
 * Everything returned is plain and serialisable: instants leave as ISO strings, so the payload
 * crosses into the client component without a `Date` in sight (`CLAUDE.md`).
 */

import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { DEFAULT_FORMATION_LABEL } from "@/db/reference";
import {
  formationSlots,
  formations,
  lineupSlots,
  lineups,
  matchEvents,
  matchSquad,
  teamMembers,
  teams,
  users,
} from "@/db/schema";
import type { SquadRole } from "@/db/schema";
import { getSquad, type SquadMember } from "@/lib/team/queries";
import type {
  LiveEvent,
  LiveFormation,
  LiveMatch,
  LivePlayer,
  LiveSlot,
} from "./presenter";
import { getMatch } from "./queries";

/**
 * The shapes are declared in `presenter.ts`, not here: both sides of the RSC boundary need them and
 * this module is `server-only`. Re-exported so a Server Component has one import to make.
 */
export type {
  LiveEvent,
  LiveFormation,
  LiveLineup,
  LiveMatch,
  LiveMatchRow,
  LivePlayer,
  LiveSlot,
} from "./presenter";

/* -------------------------------------------------------------------------- */
/* The load                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Load a match for game mode, scoped to the team.
 *
 * `null` means "no such match in this team" — the `teamId` is part of the predicate rather than
 * checked afterwards, exactly as in `getMatch`.
 */
export async function getLiveMatch(teamId: string, matchId: string): Promise<LiveMatch | null> {
  const match = await getMatch(teamId, matchId);
  if (!match) return null;

  const [team, events, lineupRows, formationRows, slotRows, squadRows, roster] = await Promise.all([
    db
      .select({ primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1),
    getMatchEvents(matchId),
    db
      .select({
        id: lineups.id,
        fromMinute: lineups.fromMinute,
        isInitial: lineups.isInitial,
        appliedEventId: lineups.appliedEventId,
        formationId: lineups.formationId,
        formationLabel: formations.label,
      })
      .from(lineups)
      .innerJoin(formations, eq(formations.id, lineups.formationId))
      .where(eq(lineups.matchId, matchId))
      .orderBy(asc(lineups.fromMinute)),
    // The one formation the composer offers (decision 157). The slots below are still the whole
    // catalogue's — built-ins, retired ones included, and the team's own — because the reducer needs
    // the slots of whatever formation the log happens to mention, and an old match may mention one
    // nobody can pick any more.
    db
      .select({
        id: formations.id,
        name: formations.name,
        label: formations.label,
        teamId: formations.teamId,
      })
      .from(formations)
      .where(and(isNull(formations.teamId), eq(formations.label, DEFAULT_FORMATION_LABEL)))
      .orderBy(asc(formations.createdAt))
      .limit(1),
    db
      .select({
        id: formationSlots.id,
        formationId: formationSlots.formationId,
        positionCode: formationSlots.positionCode,
        x: formationSlots.x,
        y: formationSlots.y,
        sort: formationSlots.sort,
      })
      .from(formationSlots)
      .innerJoin(formations, eq(formations.id, formationSlots.formationId))
      .where(or(isNull(formations.teamId), eq(formations.teamId, teamId)))
      .orderBy(asc(formationSlots.sort)),
    db
      .select({ teamMemberId: matchSquad.teamMemberId, role: matchSquad.role })
      .from(matchSquad)
      .where(eq(matchSquad.matchId, matchId)),
    getSquad(teamId),
  ]);

  const [lineupSlotRows, departed] = await Promise.all([
    loadLineupSlots(lineupRows.map((row) => row.id)),
    // The men on this sheet who have since left the team. `getSquad` above hides them — that is
    // what the soft `leftAt` is for — but the log of a match played while they were here still
    // mentions them, and `reduceLive` takes the reducer's squad from this roster. Without them a
    // re-freeze writes their cached row with `squad_role = null`: a cache that no longer matches a
    // recomputation of the same log, which is the one thing that cache may never be.
    getDepartedSheetMembers(matchId),
  ]);

  const slotsByFormation = new Map<string, LiveSlot[]>();
  for (const slot of slotRows) {
    const list = slotsByFormation.get(slot.formationId);
    if (list) list.push(slot);
    else slotsByFormation.set(slot.formationId, [slot]);
  }

  const squadRoles = new Map(squadRows.map((row) => [row.teamMemberId, row.role]));

  const formationsOut: LiveFormation[] = formationRows.map((row) => ({
    id: row.id,
    name: row.name,
    label: row.label,
    isBuiltin: row.teamId === null,
    slots: slotsByFormation.get(row.id) ?? [],
  }));

  return {
    match,
    kit: {
      primaryColor: team[0]?.primaryColor ?? "#1f6feb",
      secondaryColor: team[0]?.secondaryColor ?? "#ffffff",
    },
    events,
    lineups: lineupRows.map((row) => ({
      ...row,
      slots: lineupSlotRows.get(row.id) ?? [],
    })),
    slots: slotRows,
    formations: formationsOut,
    defaultFormationId: formationsOut[0]?.id ?? null,
    // The current squad in `getSquad`'s order, then whoever has left: they belong to this match's
    // sheet and to no other screen in the app, so this is the only bench they appear on.
    players: [
      ...roster.map((member) => toLivePlayer(member, squadRoles)),
      ...departed.map((member) => toDepartedLivePlayer(member, squadRoles)),
    ],
    hasSquadSheet: squadRows.length > 0,
  };
}

/**
 * The append-only log of one match, in `seq` order.
 *
 * `seq` order is insertion order, not match time: the reducer re-sorts with `compareMatchEvents`,
 * because the outbox can land a 12′ event after a 40′ one (decision 004).
 */
export async function getMatchEvents(matchId: string): Promise<LiveEvent[]> {
  const rows = await db
    .select({
      id: matchEvents.id,
      clientEventId: matchEvents.clientEventId,
      type: matchEvents.type,
      period: matchEvents.period,
      minute: matchEvents.minute,
      clockMs: matchEvents.clockMs,
      occurredAt: matchEvents.occurredAt,
      payload: matchEvents.payload,
      voidsEventId: matchEvents.voidsEventId,
      seq: matchEvents.seq,
    })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.seq));

  return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
}

/**
 * The members of a match sheet who have since left the team.
 *
 * Returns nothing at all for an ordinary match — a player only leaves *after* the matches they
 * played. Deliberately no injuries and no position preferences: neither means anything for somebody
 * who can no longer be picked, and both would cost a join for a row that exists so that the history
 * of this match stays complete (decision 040).
 */
async function getDepartedSheetMembers(matchId: string): Promise<DepartedSheetMember[]> {
  return db
    .select({
      teamMemberId: teamMembers.id,
      displayName: users.displayName,
      jerseyNumber: teamMembers.jerseyNumber,
      isPlayer: teamMembers.isPlayer,
    })
    .from(matchSquad)
    .innerJoin(teamMembers, eq(teamMembers.id, matchSquad.teamMemberId))
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(matchSquad.matchId, matchId), isNotNull(teamMembers.leftAt)))
    .orderBy(asc(teamMembers.jerseyNumber), asc(users.displayName));
}

async function loadLineupSlots(
  lineupIds: readonly string[],
): Promise<Map<string, { slotId: string; memberId: string }[]>> {
  const bySlot = new Map<string, { slotId: string; memberId: string }[]>();
  if (lineupIds.length === 0) return bySlot;

  const rows = await db
    .select({
      lineupId: lineupSlots.lineupId,
      slotId: lineupSlots.formationSlotId,
      memberId: lineupSlots.teamMemberId,
      sort: formationSlots.sort,
    })
    .from(lineupSlots)
    .innerJoin(formationSlots, eq(formationSlots.id, lineupSlots.formationSlotId))
    .where(inArray(lineupSlots.lineupId, [...lineupIds]))
    .orderBy(asc(formationSlots.sort));

  for (const row of rows) {
    const list = bySlot.get(row.lineupId);
    const entry = { slotId: row.slotId, memberId: row.memberId };
    if (list) list.push(entry);
    else bySlot.set(row.lineupId, [entry]);
  }

  return bySlot;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type DepartedSheetMember = {
  teamMemberId: string;
  displayName: string;
  jerseyNumber: number | null;
  isPlayer: boolean;
};

function toLivePlayer(member: SquadMember, squadRoles: Map<string, SquadRole>): LivePlayer {
  return {
    memberId: member.membershipId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
    isInjured: member.isInjured,
    squadRole: squadRoles.get(member.membershipId) ?? null,
    isPlayer: member.isPlayer,
  };
}

/** The same shape from the leaner row: no injury flag, no preferences, nothing to pick him for. */
function toDepartedLivePlayer(
  member: DepartedSheetMember,
  squadRoles: Map<string, SquadRole>,
): LivePlayer {
  return {
    memberId: member.teamMemberId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
    isInjured: false,
    squadRole: squadRoles.get(member.teamMemberId) ?? null,
    isPlayer: member.isPlayer,
  };
}
