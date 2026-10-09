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
  /** `team_members.id` — the identity that owns goals, ratings, injuries… */
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
  // Match preparation and play
  | "match:selectSquad"
  | "match:manageLineups"
  | "match:operate"
  | "match:amend"
  /**
   * Read the individual notes of a match, with the name of whoever wrote each one — and the count a
   * mean rests on. **The coach's alone** (decision 137): every other reader gets one settled figure
   * per player and no way to work out who gave what. It is a *read*, and it is in `can()` rather
   * than in a `isCoachOf` call at the page because the query layer is where it is enforced, and a
   * second way of asking the same question is how the two drift apart.
   */
  | "rating:readNotes"
  /**
   * **Show a match's means to the team, or hide them again.** One permission over one column, both
   * ways (decision 139): `publishRatings` writes the instant, `hideRatings` writes null back, and
   * splitting them into two actions would let a coach who may show end up unable to undo it.
   *
   * It used to be the escape hatch for the straggler who never rated, because the squad finishing
   * published a match by itself. Nothing publishes anything by itself now — this is the only door, and
   * the coach decides per match.
   *
   * A coach action, not a self-scoped one: `rating:submit` is every member's, and deciding what the
   * whole team reads is not something a member does for himself.
   */
  | "rating:publish"
  /**
   * A player's preferred positions. **The coach's, and only the coach's** (decision 163): the owner
   * wants the posts the équipe type is built on to be the coach's reading of his squad, not what each
   * man says about himself. A coach may set them for any member of his team; a player may set none,
   * his own included. It used to be self-scoped (decision 005, the picker of decisions 130–142).
   */
  | "profile:editPositions"
  // Self-scoped
  /**
   * The flocage — the name printed on the shirt. Self-scoped, unlike the **number**, which stays a
   * coach's `member:update`: a squad's numbers have to agree with each other (`updateMember` refuses
   * one already worn) while « MOMO » is nobody's business but Momo's.
   */
  | "profile:editShirtName"
  | "injury:declare"
  /**
   * Give notes for a match. **Any member of the team, as far as `can()` can tell** (decision 139) — and
   * then only for a match whose sheet names him as a starter, a substitute or a supporter (decision
   * 159). That second half is data: `can()` has no match sheet, so it is `mayRateMatch` in
   * `lib/rating/progress.ts`, applied by `submitRatings` and by the reads that build the form and the
   * coach's tally. This answer is the permission; it is never the whole of « may he rate this match ».
   *
   * Self-scoped, so a coach cannot rate on somebody's behalf — but, unlike every other self-scoped
   * action, **not conditional on `isPlayer`**. A supporter on the sheet may be a non-playing member, and
   * a non-playing coach named as a supporter has the best view of the hour. This is why the action is
   * handled on its own in `can()` rather than through `SELF_ACTIONS`.
   *
   * Who may be *rated* is a different question, answered from the log in `lib/rating/progress.ts`
   * (`minutes > 0`, decision 137), and no permission can see it.
   */
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
  "match:selectSquad",
  "match:manageLineups",
  "match:operate",
  "match:amend",
  "rating:readNotes",
  "rating:publish",
  "profile:editPositions",
  "injury:declare",
  "team:read",
]);

/**
 * Actions any member may perform **on themselves**. A coach may additionally declare an
 * injury for someone else (`injury:declare` is in COACH_ACTIONS), which is why it appears
 * in both sets.
 */
const SELF_ACTIONS = new Set<Action>([
  "profile:editShirtName",
  "injury:declare",
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

  /*
   * Self-scoped, like the block below, but for **every** member rather than every player: a non-playing
   * coach and a supporter both get to rate (decision 139; which *match* is decision 159's question,
   * answered from the sheet outside `can()`). It is above the `isPlayer` test rather than
   * inside it because that test is what would turn « any member » back into « any player ».
   */
  if (action === "rating:submit") {
    const target = context.targetMemberId ?? membership.membershipId;
    return target === membership.membershipId;
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
