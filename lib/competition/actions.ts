"use server";

/**
 * Creating, renaming, archiving and deleting a team's competitions (decision 107).
 *
 * Every mutation starts with `assertCan(actor, "competition:manage", …)` (`CLAUDE.md`, invariant 4),
 * and takes its `teamId` from the submitted form rather than from the active-team cookie — then
 * checks it, so a forged cookie widens nobody's reach.
 *
 * The one rule with teeth: **a competition matches point at is not deleted.** `matches.competition_id`
 * is `on delete restrict`, so the database refuses as well; this refuses first, counted, and names
 * archiving as the thing to do instead (decisions 098 and 100).
 */

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { competitions } from "@/db/schema";
import { assertCan } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState, type FormState } from "@/lib/auth/validation";
import { competitionDeleteRefusedFr } from "./labels";
import { getTeamCompetition, getTeamCompetitions } from "./queries";
import {
  archiveCompetitionSchema,
  competitionTargetSchema,
  createCompetitionSchema,
  renameCompetitionSchema,
} from "./validation";

/**
 * A competition's name is printed on the calendar, on every match page and in the stats filter, so a
 * rename has to reach the whole shell rather than the page that submitted it.
 */
function revalidateCompetitions(): void {
  revalidatePath("/", "layout");
}

const DUPLICATE_FR = "Cette compétition existe déjà dans l’équipe.";

export async function createCompetition(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor();

  const parsed = createCompetitionSchema.safeParse({
    teamId: formData.get("teamId"),
    labelFr: formData.get("labelFr"),
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "competition:manage", { teamId: parsed.data.teamId });

  const existing = await getTeamCompetitions(parsed.data.teamId);
  // New ones go to the end of the `<select>`, after the defaults the team started with.
  const sort = existing.reduce((highest, row) => Math.max(highest, row.sort), -1) + 1;

  const inserted = await db
    .insert(competitions)
    .values({ teamId: parsed.data.teamId, labelFr: parsed.data.labelFr, sort })
    // The unique constraint is the real guard against two coaches adding « Coupe » at once;
    // checking first and then inserting would be a race.
    .onConflictDoNothing({ target: [competitions.teamId, competitions.labelFr] })
    .returning({ id: competitions.id });

  if (inserted.length === 0) return { fieldErrors: { labelFr: [DUPLICATE_FR] } };

  revalidateCompetitions();
  return undefined;
}

export async function renameCompetition(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor();

  const parsed = renameCompetitionSchema.safeParse({
    teamId: formData.get("teamId"),
    competitionId: formData.get("competitionId"),
    labelFr: formData.get("labelFr"),
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "competition:manage", { teamId: parsed.data.teamId });

  const clash = await db.query.competitions.findFirst({
    where: and(
      eq(competitions.teamId, parsed.data.teamId),
      eq(competitions.labelFr, parsed.data.labelFr),
      ne(competitions.id, parsed.data.competitionId),
    ),
    columns: { id: true },
  });
  if (clash) return { fieldErrors: { labelFr: [DUPLICATE_FR] } };

  const updated = await db
    .update(competitions)
    .set({ labelFr: parsed.data.labelFr })
    .where(
      and(
        eq(competitions.id, parsed.data.competitionId),
        eq(competitions.teamId, parsed.data.teamId),
      ),
    )
    .returning({ id: competitions.id });

  if (updated.length === 0) return { error: "Cette compétition n’existe pas dans cette équipe." };

  revalidateCompetitions();
  return undefined;
}

/**
 * Retires a competition, or brings it back.
 *
 * The answer to « I no longer play in this one » — because the matches played in it keep it, which a
 * deletion could not promise. Nothing else changes: the label still prints on the calendar and in
 * the statistics, it is only absent from the match form (`lib/competition/options.ts`).
 */
export async function setCompetitionArchived(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = archiveCompetitionSchema.safeParse({
    teamId: formData.get("teamId"),
    competitionId: formData.get("competitionId"),
    archived: formData.get("archived"),
  });
  if (!parsed.success) return;

  assertCan(actor, "competition:manage", { teamId: parsed.data.teamId });

  await db
    .update(competitions)
    .set({ archivedAt: parsed.data.archived ? new Date() : null })
    .where(
      and(
        eq(competitions.id, parsed.data.competitionId),
        eq(competitions.teamId, parsed.data.teamId),
      ),
    );

  revalidateCompetitions();
}

/**
 * Deletes a competition nothing was played in.
 *
 * It re-counts the matches instead of trusting the button it came from: the card only offers the
 * control at zero, but a stale tab is a tab whose count is a promise about a row somebody else may
 * have written a match against since. The refusal is the same sentence the card shows, with the same
 * numbers (decision 098).
 */
export async function deleteCompetition(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor();

  const parsed = competitionTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    competitionId: formData.get("competitionId"),
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "competition:manage", { teamId: parsed.data.teamId });

  const competition = await getTeamCompetition(parsed.data.teamId, parsed.data.competitionId);
  if (!competition) return { error: "Cette compétition n’existe pas dans cette équipe." };
  if (competition.matchCount > 0) {
    return {
      error: competitionDeleteRefusedFr(competition.labelFr, competition.matchCount),
    };
  }

  await db
    .delete(competitions)
    .where(
      and(
        eq(competitions.id, parsed.data.competitionId),
        eq(competitions.teamId, parsed.data.teamId),
      ),
    );

  revalidateCompetitions();
  return undefined;
}
