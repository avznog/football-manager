import "server-only";

/**
 * Reads for team administration. Query functions live apart from actions so that a Server
 * Component never imports a `"use server"` module just to render a list.
 */

import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { injuries, invites, teamMembers, users } from "@/db/schema";
import type { TeamRole } from "@/db/schema";

export type SquadMember = {
  membershipId: string;
  userId: string;
  username: string;
  displayName: string;
  role: TeamRole;
  isPlayer: boolean;
  jerseyNumber: number | null;
  /** True while an injury row exists with no `resolvedOn` (decision 011 — flagged, not blocked). */
  isInjured: boolean;
};

/**
 * The current squad, coaches first then by shirt number.
 *
 * Members who have left keep their history but disappear from here — that is the point of the
 * soft `leftAt`.
 */
export async function getSquad(teamId: string): Promise<SquadMember[]> {
  const rows = await db
    .select({
      membershipId: teamMembers.id,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: teamMembers.role,
      isPlayer: teamMembers.isPlayer,
      jerseyNumber: teamMembers.jerseyNumber,
      // One aggregate beats a second query per player.
      openInjuries: sql<number>`count(${injuries.id}) filter (where ${injuries.resolvedOn} is null)`,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .leftJoin(injuries, eq(injuries.teamMemberId, teamMembers.id))
    .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)))
    .groupBy(
      teamMembers.id,
      users.id,
      users.username,
      users.displayName,
      teamMembers.role,
      teamMembers.isPlayer,
      teamMembers.jerseyNumber,
    )
    .orderBy(
      // Coaches at the top, then numbered shirts, then whoever has no number yet.
      sql`case when ${teamMembers.role} = 'coach' then 0 else 1 end`,
      sql`${teamMembers.jerseyNumber} nulls last`,
      asc(users.displayName),
    );

  return rows.map((row) => ({
    membershipId: row.membershipId,
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    isPlayer: row.isPlayer,
    jerseyNumber: row.jerseyNumber,
    isInjured: Number(row.openInjuries) > 0,
  }));
}

export type ActiveInvite = {
  id: string;
  code: string;
  role: TeamRole;
  expiresAt: Date;
  uses: number;
  maxUses: number;
};

/** Codes that can still be used. A revoked or spent code is history, not a to-do. */
export async function getActiveInvites(teamId: string): Promise<ActiveInvite[]> {
  return db
    .select({
      id: invites.id,
      code: invites.code,
      role: invites.role,
      expiresAt: invites.expiresAt,
      uses: invites.uses,
      maxUses: invites.maxUses,
    })
    .from(invites)
    .where(
      and(
        eq(invites.teamId, teamId),
        gt(invites.expiresAt, new Date()),
        sql`${invites.uses} < ${invites.maxUses}`,
      ),
    )
    .orderBy(desc(invites.createdAt));
}

/** Every team the user belongs to, for the switcher on « Moi ». */
export async function getUserTeams(
  userId: string,
): Promise<Array<{ teamId: string; name: string; role: TeamRole }>> {
  const rows = await db.query.teamMembers.findMany({
    where: and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)),
    columns: { teamId: true, role: true },
    with: { team: { columns: { name: true } } },
  });

  return rows
    .map((row) => ({ teamId: row.teamId, name: row.team.name, role: row.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
