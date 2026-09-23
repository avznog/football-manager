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

import { asc, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { DEFAULT_FORMATION_LABEL } from "@/db/reference";
import {
  formationSlots,
  formations,
  lineupSlots,
  lineups,
  matchEvents,
  matchSquad,
  teams,
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
    // Built-in templates plus the team's own: the whole catalogue is a handful of rows, and game
    // mode needs it all — the composer offers it, and the reducer needs the slots of whatever
    // formation the log happens to mention.
    db
      .select({
        id: formations.id,
        name: formations.name,
        label: formations.label,
        teamId: formations.teamId,
      })
      .from(formations)
      .where(or(isNull(formations.teamId), eq(formations.teamId, teamId)))
      .orderBy(asc(formations.label)),
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

  const lineupSlotRows = await loadLineupSlots(lineupRows.map((row) => row.id));

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
    defaultFormationId: pickDefaultFormationId(formationsOut, lineupRows),
    players: roster.map((member) => toLivePlayer(member, squadRoles)),
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

function toLivePlayer(member: SquadMember, squadRoles: Map<string, SquadRole>): LivePlayer {
  return {
    memberId: member.membershipId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
    isInjured: member.isInjured,
    squadRole: squadRoles.get(member.membershipId) ?? null,
    positionCodes: member.positions.map((position) => position.code),
    isPlayer: member.isPlayer,
  };
}

/**
 * Which formation the ad-hoc composer opens on.
 *
 * The last composition planned for this match is the best guess at what the coach has in mind; if
 * nothing was planned, the default 1-3-2-1 template (decision 005), preferring the team’s own
 * version of it if they drew one.
 */
function pickDefaultFormationId(
  available: readonly LiveFormation[],
  lineupRows: readonly { formationId: string; fromMinute: number }[],
): string | null {
  const planned = [...lineupRows].sort((a, b) => b.fromMinute - a.fromMinute)[0];
  if (planned && available.some((formation) => formation.id === planned.formationId)) {
    return planned.formationId;
  }

  const byLabel = available.filter((formation) => formation.label === DEFAULT_FORMATION_LABEL);
  const own = byLabel.find((formation) => !formation.isBuiltin);
  return own?.id ?? byLabel[0]?.id ?? available[0]?.id ?? null;
}
