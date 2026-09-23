"use server";

/**
 * Mutations on a player's own record: preferred positions, the jersey number, injuries.
 *
 * Every one of them starts with a decision taken by `can()` (`CLAUDE.md`, invariant 4) and then
 * re-checks that the membership really belongs to the team named in the form — a forged hidden
 * field must not widen anybody's reach, exactly as in `lib/team/actions.ts`.
 *
 * Who may do what, from `lib/auth/can.ts`:
 *  - `injury:declare` is in **both** the coach set and the self set, so a coach acts for anyone
 *    and a player only for themselves. Nothing else to arrange.
 *  - `profile:editPositions` is self-only. A coach editing a teammate's wishes therefore falls
 *    back to `member:update`, their permission over the squad record that `player_positions`
 *    belongs to. Both branches are `can()` decisions; neither is an ad-hoc role check.
 *  - `profile:editShirtName` is self-only in the same way, with the same `member:update` fallback.
 *    The **number** on the maillot is deliberately not: it is `member:update` alone, because it has
 *    to be unique in the squad. Same garment, two permissions — see `updateShirtName`.
 */

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { injuries, playerPositions, teamMembers } from "@/db/schema";
import { type Action, type Actor, assertCan, can } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { type FormState, toFormState } from "@/lib/auth/validation";
import { updateMember } from "@/lib/team/actions";
import { isFutureDate, parisDate } from "./injury";
import { toPositionRows } from "./positions";
import {
  declareInjurySchema,
  resolveInjurySchema,
  updatePositionsSchema,
  updateShirtNameSchema,
} from "./validation";

/**
 * A self-scoped action, or a coach doing it on somebody's behalf. Tries the self action first,
 * then the coach's `member:update`; `assertCan` throws if neither holds.
 */
function assertCanActFor(
  actor: Actor,
  selfAction: Action,
  teamId: string,
  memberId: string,
): void {
  if (can(actor, selfAction, { teamId, targetMemberId: memberId })) return;
  assertCan(actor, "member:update", { teamId, targetMemberId: memberId });
}

/** The active membership, or null. Guards against a `memberId` belonging to another team. */
async function findActiveMember(teamId: string, memberId: string) {
  return db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.id, memberId),
      eq(teamMembers.teamId, teamId),
      isNull(teamMembers.leftAt),
    ),
    columns: { id: true, isPlayer: true },
  });
}

const UNKNOWN_MEMBER = "Ce joueur n’existe pas dans cette équipe.";

/**
 * The three screens that show a member's positions, number or injury badge. Nothing is cached
 * (`cacheComponents` is off), but the client router cache is, so a save must invalidate them or
 * a back-navigation shows the old value.
 */
function revalidateMember(memberId: string): void {
  revalidatePath(`/joueur/${memberId}`);
  revalidatePath("/equipe");
  revalidatePath("/moi");
}

/* -------------------------------------------------------------------------- */
/* Preferred positions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Replaces a player's wishes wholesale with what the picker posted.
 *
 * Delete-then-insert rather than a diff: the set is at most eleven rows, it has no history to
 * preserve, and one transaction is easier to reason about than three statements that have to
 * agree on the "at most one primary" invariant.
 */
export async function updatePlayerPositions(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor();

  const parsed = updatePositionsSchema.safeParse({
    teamId: formData.get("teamId"),
    memberId: formData.get("memberId"),
    primary: formData.get("primary") ?? "",
    secondary: formData.getAll("secondary").map(String),
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, memberId, primary, secondary } = parsed.data;

  assertCanActFor(actor, "profile:editPositions", teamId, memberId);

  const member = await findActiveMember(teamId, memberId);
  if (!member) return { error: UNKNOWN_MEMBER };
  if (!member.isPlayer) {
    return { error: "Ce membre n’est pas joueur : il n’a pas de postes à choisir." };
  }

  const rows = toPositionRows(primary, secondary);

  await db.transaction(async (tx) => {
    await tx.delete(playerPositions).where(eq(playerPositions.teamMemberId, memberId));
    if (rows.length > 0) {
      await tx.insert(playerPositions).values(
        rows.map((row) => ({
          teamMemberId: memberId,
          positionCode: row.code,
          preference: row.preference,
        })),
      );
    }
  });

  revalidateMember(memberId);
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Jersey number                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The jersey number, from the profile page.
 *
 * Delegates to the M0 `updateMember`, which already owns the permission check (`member:update`,
 * i.e. a coach) and the "already worn by an active teammate" clash check. Wrapping it rather
 * than reimplementing it means there is exactly one place where a number can be refused — this
 * function only adds the revalidation of the profile route, which `updateMember` does not know
 * about.
 *
 * The form must carry `isPlayer` as well: `updateMember` writes both columns, so omitting it
 * would silently turn a player into staff.
 */
export async function updateJerseyNumber(
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await updateMember(prev, formData);

  const memberId = formData.get("memberId");
  if (!result && typeof memberId === "string") revalidateMember(memberId);

  return result;
}

/* -------------------------------------------------------------------------- */
/* Flocage — the name on the shirt                                            */
/* -------------------------------------------------------------------------- */

/**
 * The flocage, from the profile page. **Not** a wrapper around `updateMember`, and that is the
 * point of it existing.
 *
 * The number and the name printed on a shirt are one object and two permissions. A number has to
 * agree with the twelve other numbers in the squad — `updateMember` refuses one already worn — so it
 * is the coach's to hand out, and the profile has told a player « les numéros sont attribués par le
 * coach » since M0. A flocage agrees with nothing: « MOMO » is a decision about one man's own back,
 * two players may perfectly well both be floqués « JUNIOR », and a coach typing a nickname for
 * somebody is doing them a favour rather than administering a squad.
 *
 * So this is a self action first (`profile:editShirtName`, in `SELF_ACTIONS`) with the coach's
 * `member:update` as the fallback — the same `assertCanActFor` shape as the preferred positions,
 * which are the other field of the squad record that belongs to the player. One consequence worth
 * stating: a member with `isPlayer = false` fails the self branch, because `can()` refuses every
 * `SELF_ACTIONS` entry to a non-player, so a member of the encadrement cannot invent a flocage for a
 * maillot they do not have — only a coach can, which is the same asymmetry the jersey number has.
 */
export async function updateShirtName(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor();

  const parsed = updateShirtNameSchema.safeParse({
    teamId: formData.get("teamId"),
    memberId: formData.get("memberId"),
    shirtName: formData.get("shirtName") ?? "",
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, memberId, shirtName } = parsed.data;

  assertCanActFor(actor, "profile:editShirtName", teamId, memberId);

  // As everywhere else here: a forged `memberId` from another team must not widen anybody's reach.
  const member = await findActiveMember(teamId, memberId);
  if (!member) return { error: UNKNOWN_MEMBER };

  await db
    .update(teamMembers)
    .set({ shirtName })
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)));

  revalidateMember(memberId);
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Injuries                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Declares an injury: a player for themselves, a coach for anyone (`docs/PROJECT.md`).
 *
 * One open injury at a time. The « blessé » badge derives from *any* unresolved row, so a second
 * one would add nothing and would make "the current injury" ambiguous on the profile.
 */
export async function declareInjury(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = declareInjurySchema.safeParse({
    teamId: formData.get("teamId"),
    memberId: formData.get("memberId"),
    startedOn: formData.get("startedOn") ?? "",
    expectedReturnOn: formData.get("expectedReturnOn") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, memberId, startedOn, expectedReturnOn, note } = parsed.data;

  assertCan(actor, "injury:declare", { teamId, targetMemberId: memberId });

  const today = parisDate(new Date());
  if (isFutureDate(startedOn, today)) {
    return { fieldErrors: { startedOn: ["Une blessure ne peut pas commencer dans le futur."] } };
  }

  const member = await findActiveMember(teamId, memberId);
  if (!member) return { error: UNKNOWN_MEMBER };

  const ongoing = await db.query.injuries.findFirst({
    where: and(eq(injuries.teamMemberId, memberId), isNull(injuries.resolvedOn)),
    columns: { id: true },
  });
  if (ongoing) {
    return {
      error: "Une blessure est déjà en cours. Marque-la comme guérie avant d’en déclarer une autre.",
    };
  }

  await db.insert(injuries).values({
    teamMemberId: memberId,
    startedOn,
    expectedReturnOn,
    note,
    declaredBy: actor.userId,
  });

  revalidateMember(memberId);
  return undefined;
}

/**
 * Closes an injury. A plain `<form action>` with no client state, so it works with JavaScript
 * disabled — the whole point of keeping the coach's controls as forms.
 *
 * `resolved_on` defaults to today, and is never allowed to precede the start: a one-day injury
 * reads as one day, not as a negative duration.
 */
export async function resolveInjury(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = resolveInjurySchema.safeParse({
    teamId: formData.get("teamId"),
    memberId: formData.get("memberId"),
    injuryId: formData.get("injuryId"),
    resolvedOn: formData.get("resolvedOn") ?? "",
  });
  if (!parsed.success) return;
  const { teamId, memberId, injuryId, resolvedOn } = parsed.data;

  assertCan(actor, "injury:declare", { teamId, targetMemberId: memberId });

  const member = await findActiveMember(teamId, memberId);
  if (!member) return;

  const injury = await db.query.injuries.findFirst({
    where: and(
      eq(injuries.id, injuryId),
      eq(injuries.teamMemberId, memberId),
      isNull(injuries.resolvedOn),
    ),
    columns: { startedOn: true },
  });
  if (!injury) return;

  const day = resolvedOn ?? parisDate(new Date());

  await db
    .update(injuries)
    .set({ resolvedOn: day < injury.startedOn ? injury.startedOn : day })
    .where(and(eq(injuries.id, injuryId), eq(injuries.teamMemberId, memberId)));

  revalidateMember(memberId);
}
