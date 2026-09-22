/**
 * The data access layer for identity.
 *
 * Every Server Component, Server Action and Route Handler that needs to know who is asking
 * goes through here. `cache()` deduplicates the lookup within a single request, so calling
 * `getActor()` in a layout and again in three components costs one query.
 *
 * Route protection lives here and in layout guards — never only in `proxy.ts`, which runs on
 * prefetches and may only do optimistic cookie checks (`docs/NEXTJS16.md` §6).
 */

import "server-only";

import { cache } from "react";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { teamMembers, teams, users } from "@/db/schema";
import type { Actor } from "./can";
import { ACTIVE_TEAM_COOKIE } from "./cookies";
import { readSession } from "./session";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  isSuperAdmin: boolean;
};

/** The authenticated user, or null. Never redirects — use `requireUser` for that. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { id: true, username: true, displayName: true, isSuperAdmin: true },
  });

  return user ?? null;
});

/** The actor passed to `can()`. Loads the user's active memberships. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await db
    .select({
      membershipId: teamMembers.id,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
      isPlayer: teamMembers.isPlayer,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), isNull(teamMembers.leftAt)));

  return { userId: user.id, isSuperAdmin: user.isSuperAdmin, memberships };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/connexion");
  return actor;
}

export type ActiveTeam = {
  id: string;
  name: string;
  slug: string;
  crestUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  /** The actor's membership of this team. Null only for a super admin who is not a member. */
  membershipId: string | null;
  role: "coach" | "player" | null;
  isPlayer: boolean;
  isCoach: boolean;
};

/**
 * The team the user is currently looking at.
 *
 * The UI shows one team at a time (decision 002). The choice is remembered in a cookie and
 * validated against the actor's memberships on every read, so a stale or forged cookie simply
 * falls back to their first team.
 */
export const getActiveTeam = cache(async (): Promise<ActiveTeam | null> => {
  const actor = await getActor();
  if (!actor) return null;

  const store = await cookies();
  const preferred = store.get(ACTIVE_TEAM_COOKIE)?.value;

  const membership =
    (preferred && actor.memberships.find((m) => m.teamId === preferred)) || actor.memberships[0];

  // A super admin with no membership may still be pinned to a team by the cookie.
  if (!membership && actor.isSuperAdmin && preferred) {
    const team = await db.query.teams.findFirst({ where: eq(teams.id, preferred) });
    if (!team) return null;
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      crestUrl: team.crestUrl,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      membershipId: null,
      role: null,
      isPlayer: false,
      isCoach: true,
    };
  }

  if (!membership) return null;

  const team = await db.query.teams.findFirst({ where: eq(teams.id, membership.teamId) });
  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    crestUrl: team.crestUrl,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    membershipId: membership.membershipId,
    role: membership.role,
    isPlayer: membership.isPlayer,
    isCoach: membership.role === "coach" || actor.isSuperAdmin,
  };
});

/**
 * Guard for every screen inside the application shell: authenticated **and** in a team.
 * A user with no team can reach nothing but `/rejoindre` (`CLAUDE.md`, invariant 5).
 */
export async function requireTeamContext(): Promise<{ actor: Actor; team: ActiveTeam }> {
  const actor = await requireActor();
  const team = await getActiveTeam();
  if (!team) redirect("/rejoindre");
  return { actor, team };
}
