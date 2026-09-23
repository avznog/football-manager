"use server";

/**
 * Team administration: the team itself, its members, and the invite codes that let people in.
 *
 * Every mutation starts with `assertCan(...)` (`CLAUDE.md`, invariant 4). The actions take the
 * `teamId` from the form rather than from the active-team cookie, and then check it — a forged
 * cookie must not be able to widen anybody's reach.
 */

import { randomBytes } from "node:crypto";

import { and, eq, isNull, sql as raw } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { invites, sessions, teamMembers, teams, users } from "@/db/schema";
import { assertCan } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { passwordSchema, type FormState, toFormState } from "@/lib/auth/validation";
import { setActiveTeam } from "@/lib/auth/actions";
import { INVITE_TTL_DAYS, generateInviteCode } from "./invite-code";
import {
  createInviteSchema,
  createTeamSchema,
  memberTargetSchema,
  slugify,
  teamRoleSchema,
  updateMemberSchema,
  updateTeamSchema,
} from "./validation";

/** Creates a team and makes the caller its first coach. Super admin only (decision 002). */
export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = createTeamSchema.safeParse({
    name: formData.get("name"),
    primaryColor: formData.get("primaryColor") || undefined,
    secondaryColor: formData.get("secondaryColor") || undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  // `teamId` is meaningless for a create; `can()` reads it, so pass a placeholder that no
  // membership can match. Only a super admin gets past this.
  assertCan(actor, "team:create", { teamId: "" });

  const teamId = await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({
        name: parsed.data.name,
        slug: await uniqueSlug(tx, slugify(parsed.data.name)),
        primaryColor: parsed.data.primaryColor,
        secondaryColor: parsed.data.secondaryColor,
      })
      .returning({ id: teams.id });

    await tx.insert(teamMembers).values({
      teamId: team.id,
      userId: actor.userId,
      role: "coach",
      isPlayer: false,
    });

    return team.id;
  });

  await setActiveTeam(teamId);
  revalidatePath("/equipe");
  // Into the app, like the join actions do (`lib/auth/actions.ts`). Without this the coach stays on
  // `/rejoindre` looking at the form he has just submitted, with no sign that anything happened:
  // the screen he was sent to for having no team does not know he now has one.
  redirect("/");
}

/** The handle Drizzle hands to a `db.transaction` callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Appends `-2`, `-3`… until the slug is free. Teams are few; a loop is honest and clear. */
async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  const root = base || "equipe";
  for (let suffix = 1; ; suffix++) {
    const candidate = suffix === 1 ? root : `${root}-${suffix}`;
    const taken = await tx.query.teams.findFirst({
      where: eq(teams.slug, candidate),
      columns: { id: true },
    });
    if (!taken) return candidate;
  }
}

export async function updateTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = updateTeamSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    primaryColor: formData.get("primaryColor"),
    secondaryColor: formData.get("secondaryColor"),
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "team:update", { teamId: parsed.data.teamId });

  await db
    .update(teams)
    .set({
      name: parsed.data.name,
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor,
    })
    .where(eq(teams.id, parsed.data.teamId));

  revalidatePath("/equipe");
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                    */
/* -------------------------------------------------------------------------- */

export type CreateInviteState =
  | { code: string }
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

/**
 * Mints an invite code. Returns it so the coach can copy it straight into WhatsApp.
 *
 * The unique constraint on `invites.code` is the real guard against a collision: retry on
 * conflict rather than checking first, which would be a race.
 */
export async function createInvite(
  _prev: CreateInviteState,
  formData: FormData,
): Promise<CreateInviteState> {
  const actor = await requireActor();

  const parsed = createInviteSchema.safeParse({
    teamId: formData.get("teamId"),
    role: formData.get("role") || undefined,
    maxUses: formData.get("maxUses") || undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "team:invite", { teamId: parsed.data.teamId });
  // Only a coach hands out coach codes; `team:invite` alone would let one escalate quietly.
  if (parsed.data.role === "coach") {
    assertCan(actor, "team:appointCoach", { teamId: parsed.data.teamId });
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode(randomBytes);
    const inserted = await db
      .insert(invites)
      .values({
        teamId: parsed.data.teamId,
        code,
        role: parsed.data.role,
        maxUses: parsed.data.maxUses,
        expiresAt,
        createdBy: actor.userId,
      })
      .onConflictDoNothing({ target: invites.code })
      .returning({ code: invites.code });

    if (inserted.length > 0) {
      revalidatePath("/equipe");
      return { code: inserted[0].code };
    }
  }

  return { error: "Impossible de générer un code pour le moment. Réessaie." };
}

/** Kills a code without deleting the trail of who used it: mark it fully consumed. */
export async function revokeInvite(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const teamId = String(formData.get("teamId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");

  assertCan(actor, "team:invite", { teamId });

  await db
    .update(invites)
    .set({ expiresAt: new Date(0), maxUses: raw`${invites.uses}` })
    .where(and(eq(invites.id, inviteId), eq(invites.teamId, teamId)));

  revalidatePath("/equipe");
}

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

export async function updateMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = updateMemberSchema.safeParse({
    teamId: formData.get("teamId"),
    memberId: formData.get("memberId"),
    jerseyNumber: formData.get("jerseyNumber") ?? "",
    isPlayer: formData.get("isPlayer") === "on" || formData.get("isPlayer") === "true",
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "member:update", {
    teamId: parsed.data.teamId,
    targetMemberId: parsed.data.memberId,
  });

  if (parsed.data.jerseyNumber !== null) {
    const clash = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, parsed.data.teamId),
        eq(teamMembers.jerseyNumber, parsed.data.jerseyNumber),
        isNull(teamMembers.leftAt),
      ),
      columns: { id: true },
    });
    if (clash && clash.id !== parsed.data.memberId) {
      return { fieldErrors: { jerseyNumber: ["Ce numéro est déjà porté par un coéquipier."] } };
    }
  }

  await db
    .update(teamMembers)
    .set({ jerseyNumber: parsed.data.jerseyNumber, isPlayer: parsed.data.isPlayer })
    .where(
      and(eq(teamMembers.id, parsed.data.memberId), eq(teamMembers.teamId, parsed.data.teamId)),
    );

  revalidatePath("/equipe");
  return undefined;
}

/**
 * Promotes a member to coach, or puts a coach back to player.
 *
 * A team must keep at least one coach: demoting the last one would lock everybody out of
 * selection, compositions and game mode.
 */
export async function setMemberRole(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = memberTargetSchema
    .extend({ role: teamRoleSchema })
    .safeParse({
      teamId: formData.get("teamId"),
      memberId: formData.get("memberId"),
      role: formData.get("role"),
    });
  if (!parsed.success) return;

  assertCan(actor, "team:appointCoach", {
    teamId: parsed.data.teamId,
    targetMemberId: parsed.data.memberId,
  });

  if (parsed.data.role === "player") {
    const coaches = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, parsed.data.teamId),
          eq(teamMembers.role, "coach"),
          isNull(teamMembers.leftAt),
        ),
      );
    const wouldBeLast = coaches.length <= 1 && coaches[0]?.id === parsed.data.memberId;
    if (wouldBeLast) return;
  }

  await db
    .update(teamMembers)
    .set({ role: parsed.data.role })
    .where(
      and(eq(teamMembers.id, parsed.data.memberId), eq(teamMembers.teamId, parsed.data.teamId)),
    );

  revalidatePath("/equipe");
}

/**
 * Removes somebody from the squad.
 *
 * Soft: `leftAt` is stamped so their goals, minutes and ratings stay attached to the season,
 * but they stop appearing in selection lists. The same guard as above protects the last coach.
 */
export async function removeMember(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = memberTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return;

  assertCan(actor, "member:remove", {
    teamId: parsed.data.teamId,
    targetMemberId: parsed.data.memberId,
  });

  const remaining = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, parsed.data.teamId),
        eq(teamMembers.role, "coach"),
        isNull(teamMembers.leftAt),
      ),
    );
  if (remaining.length <= 1 && remaining[0]?.id === parsed.data.memberId) return;

  await db
    .update(teamMembers)
    .set({ leftAt: new Date() })
    .where(
      and(eq(teamMembers.id, parsed.data.memberId), eq(teamMembers.teamId, parsed.data.teamId)),
    );

  revalidatePath("/equipe");
}

/**
 * Sets a teammate's password for them — there is no email, so this is the only recovery path
 * (decision 008). Every one of their sessions is dropped, so a shared phone left logged in
 * does not survive the reset.
 */
export async function resetMemberPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor();

  const parsed = memberTargetSchema
    .extend({ password: passwordSchema })
    .safeParse({
      teamId: formData.get("teamId"),
      memberId: formData.get("memberId"),
      password: formData.get("password"),
    });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "member:resetPassword", {
    teamId: parsed.data.teamId,
    targetMemberId: parsed.data.memberId,
  });

  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.id, parsed.data.memberId), eq(teamMembers.teamId, parsed.data.teamId)),
    columns: { userId: true },
  });
  if (!member) return { error: "Ce joueur n’existe pas dans cette équipe." };

  const passwordHash = await hashPassword(parsed.data.password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, member.userId));
    await tx.delete(sessions).where(eq(sessions.userId, member.userId));
  });

  return undefined;
}
