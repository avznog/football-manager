/**
 * The single authority on who may do what.
 *
 * A **pure function**: no database, no cookies, no clock. Callers load an `Actor` once (see
 * `lib/auth/dal.ts`) and then ask `can()` as often as they like. Every mutation in the
 * application must go through it — no ad-hoc role checks in actions or route handlers
 * (`CLAUDE.md`, invariant 4).
 *
 * Roles (decision 002, and `docs/PROJECT.md`):
 *  - super admin — everything, on every team
 *  - coach       — manages their own team; a coach with `isPlayer` also gets the player actions
 *  - player      — self-scoped actions, plus read access to their team
 */

import type { MatchStatus, TeamRole } from "@/db/schema";

export type ActorMembership = {
  /** `team_members.id` — the identity that owns goals, availability, ratings… */
  membershipId: string;
  teamId: string;
  role: TeamRole;
  isPlayer: boolean;
};

export type Actor = {
  userId: string;
  isSuperAdmin: boolean;
  memberships: ActorMembership[];
};

export type Action =
  // Platform
  | "team:create"
  // Team administration
  | "team:update"
  | "team:appointCoach"
  | "team:invite"
  // The team's own vocabulary: the competitions it plays in (decision 107).
  | "competition:manage"
  | "member:update"
  | "member:remove"
  | "member:resetPassword"
  // Calendar
  | "match:create"
  | "match:update"
  | "match:delete"
  | "training:create"
  | "training:update"
  | "training:delete"
  | "training:markAttendance"
  // Match preparation and play
  | "match:selectSquad"
  | "match:manageLineups"
  | "match:operate"
  | "match:amend"
  // Self-scoped
  | "availability:declare"
  | "profile:editPositions"
  /**
   * The flocage — the name printed on the shirt. Self-scoped, unlike the **number**, which stays a
   * coach's `member:update`: a squad's numbers have to agree with each other (`updateMember` refuses
   * one already worn) while « MOMO » is nobody's business but Momo's.
   */
  | "profile:editShirtName"
  | "injury:declare"
  | "rating:submit"
  // Read
  | "team:read";

export type Context = {
  teamId: string;
  /**
   * For self-scoped actions, the membership being acted upon. Omit it and the action is
   * treated as targeting the actor themselves.
   */
  targetMemberId?: string;
  match?: {
    status: MatchStatus;
    operatorUserId: string | null;
  };
};

/** Actions a coach of the team may perform. */
const COACH_ACTIONS = new Set<Action>([
  "team:update",
  "team:appointCoach",
  "team:invite",
  "competition:manage",
  "member:update",
  "member:remove",
  "member:resetPassword",
  "match:create",
  "match:update",
  "match:delete",
  "training:create",
  "training:update",
  "training:delete",
  "training:markAttendance",
  "match:selectSquad",
  "match:manageLineups",
  "match:operate",
  "match:amend",
  "injury:declare",
  "team:read",
]);

/**
 * Actions any member may perform **on themselves**. A coach may additionally declare an
 * injury for someone else (`injury:declare` is in COACH_ACTIONS), which is why it appears
 * in both sets.
 */
const SELF_ACTIONS = new Set<Action>([
  "availability:declare",
  "profile:editPositions",
  "profile:editShirtName",
  "injury:declare",
  "rating:submit",
]);

export function can(actor: Actor, action: Action, context: Context): boolean {
  if (actor.isSuperAdmin) return true;

  // Creating a team is a platform action reserved to the super admin.
  if (action === "team:create") return false;

  const membership = actor.memberships.find((m) => m.teamId === context.teamId);
  if (!membership) return false;

  const isCoach = membership.role === "coach";

  if (action === "team:read") return true;

  if (isCoach && COACH_ACTIONS.has(action)) {
    return true;
  }

  // Running game mode may be delegated to a non-coach for a single match (decision 004).
  if (action === "match:operate" && context.match?.operatorUserId === actor.userId) {
    return true;
  }

  if (SELF_ACTIONS.has(action)) {
    // Only players act as players. A non-playing coach has nothing to declare.
    if (!membership.isPlayer) return false;
    const target = context.targetMemberId ?? membership.membershipId;
    return target === membership.membershipId;
  }

  return false;
}

/** Throwing variant, for use at the top of a Server Action. */
export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Forbidden: ${action}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(actor: Actor, action: Action, context: Context): void {
  if (!can(actor, action, context)) throw new ForbiddenError(action);
}

/** Convenience helpers used widely enough to be worth naming. */
export function membershipIn(actor: Actor, teamId: string): ActorMembership | undefined {
  return actor.memberships.find((m) => m.teamId === teamId);
}

export function isCoachOf(actor: Actor, teamId: string): boolean {
  if (actor.isSuperAdmin) return true;
  return membershipIn(actor, teamId)?.role === "coach";
}
