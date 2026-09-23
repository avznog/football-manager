import "server-only";

/**
 * Reads for a player's profile. Separate from `actions.ts` so a Server Component never imports a
 * `"use server"` module just to render a page.
 *
 * Everything returned is plain and serialisable: `timestamptz` becomes a `YYYY-MM-DD` day in
 * Paris, never a `Date` crossing the RSC boundary (`CLAUDE.md`).
 */

import { cache } from "react";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { isPositionCode } from "@/db/reference";
import { injuries, playerPositions, teamMembers, users } from "@/db/schema";
import type { TeamRole } from "@/db/schema";
import type { PositionPreference } from "@/lib/pitch/preferences";
import { wouldLeaveNoCoach } from "@/lib/team/coaches";
import { getActiveCoachIds } from "@/lib/team/queries";
import { type InjuryRecord, parisDate, sortInjuries } from "./injury";
import { type PreferredPosition, sortPreferredPositions } from "./positions";
import { isUuid } from "./validation";

export type PlayerProfile = {
  /** `team_members.id` — the identity everything else in the app references. */
  membershipId: string;
  userId: string;
  username: string;
  displayName: string;
  role: TeamRole;
  /** A coach with `isPlayer = false` has no player profile: no positions, no injuries. */
  isPlayer: boolean;
  jerseyNumber: number | null;
  /**
   * The flocage — what is printed on the back of the shirt. `null` for most members, which is the
   * normal case and not a missing value: see `lib/player/shirt.ts` for how it is displayed.
   */
  shirtName: string | null;
  /** `YYYY-MM-DD` in Paris. */
  joinedOn: string;
  positions: PreferredPosition[];
  /** Ongoing first, then most recently started. */
  injuries: InjuryRecord[];
  /**
   * Their coach role is the team's last, so `setMemberRole` and `removeMember` will both refuse to
   * touch it. The profile is where those two forms live, and a button that silently does nothing is
   * worse than no button — so the page says why instead of offering the taps.
   */
  isLastCoach: boolean;
};

/**
 * One member of one team, with their wishes and their injury history.
 *
 * Scoped by `teamId` on purpose: a membership id from another team must read as "not found"
 * rather than leak a name (decision 002 — every query filters by team).
 *
 * `cache()`d so `generateMetadata` and the page itself cost a single round trip.
 */
export const getPlayerProfile = cache(
  async (teamId: string, membershipId: string): Promise<PlayerProfile | null> => {
    if (!isUuid(teamId) || !isUuid(membershipId)) return null;

    const member = await db
      .select({
        membershipId: teamMembers.id,
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        role: teamMembers.role,
        isPlayer: teamMembers.isPlayer,
        jerseyNumber: teamMembers.jerseyNumber,
        shirtName: teamMembers.shirtName,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(
        and(
          eq(teamMembers.id, membershipId),
          eq(teamMembers.teamId, teamId),
          isNull(teamMembers.leftAt),
        ),
      )
      .limit(1);

    if (member.length === 0) return null;
    const row = member[0];

    const [positions, history, coachIds] = await Promise.all([
      getPreferredPositions(membershipId),
      getInjuries(membershipId),
      getActiveCoachIds(teamId),
    ]);

    return {
      membershipId: row.membershipId,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      isPlayer: row.isPlayer,
      jerseyNumber: row.jerseyNumber,
      shirtName: row.shirtName,
      joinedOn: parisDate(row.joinedAt),
      positions,
      injuries: history,
      isLastCoach: wouldLeaveNoCoach(coachIds, membershipId),
    };
  },
);

/** The `player_positions` rows of one member, primary first. */
export async function getPreferredPositions(
  membershipId: string,
): Promise<PreferredPosition[]> {
  if (!isUuid(membershipId)) return [];

  const rows = await db
    .select({
      code: playerPositions.positionCode,
      preference: playerPositions.preference,
    })
    .from(playerPositions)
    .where(eq(playerPositions.teamMemberId, membershipId));

  // `player_positions.position_code` is `text` referencing the reference table, so a code the
  // closed list in `db/reference.ts` does not know is dropped rather than cast blindly.
  return sortPreferredPositions(
    rows.flatMap((row) =>
      isPositionCode(row.code)
        ? [{ code: row.code, preference: row.preference as PositionPreference }]
        : [],
    ),
  );
}

/** The full injury history of one member, ongoing first. */
export async function getInjuries(membershipId: string): Promise<InjuryRecord[]> {
  if (!isUuid(membershipId)) return [];

  const rows = await db
    .select({
      id: injuries.id,
      startedOn: injuries.startedOn,
      expectedReturnOn: injuries.expectedReturnOn,
      note: injuries.note,
      resolvedOn: injuries.resolvedOn,
      declaredByName: users.displayName,
    })
    .from(injuries)
    .leftJoin(users, eq(users.id, injuries.declaredBy))
    .where(eq(injuries.teamMemberId, membershipId));

  return sortInjuries(rows);
}
