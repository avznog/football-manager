"use server";

/**
 * Training CRUD, availability declaration, and the coach's présent/absent marking.
 *
 * Same contract as `lib/match/actions.ts`: `assertCan()` first, `teamId` from the form and then
 * verified, Zod for everything, `revalidatePath` at the end.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { teamMembers, trainingAttendance, trainingAvailability, trainings } from "@/db/schema";
import { assertCan, membershipIn } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState, type FormState } from "@/lib/auth/validation";
import { attendanceNotOpenFr } from "@/lib/calendar/labels";
import {
  ATTENDANCE_OPENS_MINUTES_BEFORE,
  attendanceIsOpen,
  trainingWindowMinutes,
} from "@/lib/calendar/timeline";
import {
  createTrainingSchema,
  markAttendanceSchema,
  readAttendanceMarks,
  trainingAvailabilitySchema,
  trainingTargetSchema,
  updateTrainingSchema,
} from "./validation";

function revalidateTraining(trainingId?: string): void {
  revalidatePath("/calendrier");
  revalidatePath("/entrainements");
  if (trainingId) revalidatePath(`/entrainements/${trainingId}`);
}

export async function createTraining(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = createTrainingSchema.safeParse({
    teamId: formData.get("teamId"),
    startsAt: formData.get("startsAt"),
    venue: formData.get("venue") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "training:create", { teamId: parsed.data.teamId });

  const [created] = await db
    .insert(trainings)
    .values({
      teamId: parsed.data.teamId,
      startsAt: parsed.data.startsAt,
      venue: parsed.data.venue,
      note: parsed.data.note,
      createdBy: actor.userId,
    })
    .returning({ id: trainings.id });

  revalidateTraining(created.id);
  // Outside any try/catch: `redirect` works by throwing (`docs/NEXTJS16.md` §5).
  redirect(`/entrainements/${created.id}`);
}

export async function updateTraining(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = updateTrainingSchema.safeParse({
    teamId: formData.get("teamId"),
    trainingId: formData.get("trainingId"),
    startsAt: formData.get("startsAt"),
    venue: formData.get("venue") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "training:update", { teamId: parsed.data.teamId });

  const updated = await db
    .update(trainings)
    .set({
      startsAt: parsed.data.startsAt,
      venue: parsed.data.venue,
      note: parsed.data.note,
    })
    .where(and(eq(trainings.id, parsed.data.trainingId), eq(trainings.teamId, parsed.data.teamId)))
    .returning({ id: trainings.id });

  if (updated.length === 0) return { error: "Cet entraînement n’existe pas dans cette équipe." };

  revalidateTraining(parsed.data.trainingId);
  redirect(`/entrainements/${parsed.data.trainingId}`);
}

/**
 * Deletes a training.
 *
 * Unlike a match, a training carries no append-only log: availability and attendance are simple
 * statements of fact that cascade away with it. Deleting a *past* session would still throw away
 * the attendance record the stats are built on, so only a session that has not happened yet may
 * go.
 */
export async function deleteTraining(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = trainingTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    trainingId: formData.get("trainingId"),
  });
  if (!parsed.success) return;

  assertCan(actor, "training:delete", { teamId: parsed.data.teamId });

  const training = await db.query.trainings.findFirst({
    where: and(eq(trainings.id, parsed.data.trainingId), eq(trainings.teamId, parsed.data.teamId)),
    columns: { id: true, startsAt: true },
  });
  if (!training) return;
  if (isOver(training.startsAt)) return;

  await db.delete(trainings).where(eq(trainings.id, training.id));

  revalidateTraining();
  redirect("/entrainements");
}

/** A session is over once its window has elapsed — see `trainingWindowMinutes`. */
function isOver(startsAt: Date): boolean {
  return startsAt.getTime() + trainingWindowMinutes() * 60_000 <= Date.now();
}

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

/** « Je viens / je ne viens pas / peut-être » for a training. Self-scoped, like a match. */
export async function setTrainingAvailability(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = trainingAvailabilitySchema.safeParse({
    teamId: formData.get("teamId"),
    trainingId: formData.get("trainingId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  assertCan(actor, "availability:declare", { teamId: parsed.data.teamId });

  const membership = membershipIn(actor, parsed.data.teamId);
  if (!membership) return;

  const training = await db.query.trainings.findFirst({
    where: and(eq(trainings.id, parsed.data.trainingId), eq(trainings.teamId, parsed.data.teamId)),
    columns: { id: true, startsAt: true },
  });
  // Once the session is over, only the coach's attendance list means anything.
  if (!training || isOver(training.startsAt)) return;

  await db
    .insert(trainingAvailability)
    .values({
      trainingId: parsed.data.trainingId,
      teamMemberId: membership.membershipId,
      status: parsed.data.status,
    })
    .onConflictDoUpdate({
      target: [trainingAvailability.trainingId, trainingAvailability.teamMemberId],
      set: { status: parsed.data.status, updatedAt: new Date() },
    });

  revalidateTraining(parsed.data.trainingId);
}

/* -------------------------------------------------------------------------- */
/* Attendance — the coach, on the day                                         */
/* -------------------------------------------------------------------------- */

/**
 * Records who actually turned up.
 *
 * The whole squad goes in one submit: on a phone at the side of a pitch, thirteen round trips is
 * thirteen chances to lose the connection. `marked_by` records which coach said so.
 *
 * `"unset"` deletes the row rather than storing `present = false`: "not judged yet" and "absent"
 * are different facts, and the attendance rate in M5 depends on the difference.
 *
 * **Returns a `FormState` and keeps its `(formData)` signature.** Both halves matter. It used to
 * `return` on each of its three refusals with nothing to show, so a coach who tapped « Enregistrer »
 * thirty-five minutes too early watched the screen do absolutely nothing and had no way to learn
 * why (`D4`); now each refusal says which one it is. And the signature stays single-argument so a
 * form can still bind it for a browser with no JavaScript — a `(prev, formData)` shape would break
 * the touchline fallback this screen exists for.
 *
 * The markup binds `markTrainingAttendanceNoScript` rather than this, for a type reason that is
 * really a design statement: see its docblock.
 */
export async function markTrainingAttendance(formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = markAttendanceSchema.safeParse({
    teamId: formData.get("teamId"),
    trainingId: formData.get("trainingId"),
    marks: readAttendanceMarks(formData.entries()),
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "training:markAttendance", { teamId: parsed.data.teamId });

  const training = await db.query.trainings.findFirst({
    where: and(eq(trainings.id, parsed.data.trainingId), eq(trainings.teamId, parsed.data.teamId)),
    columns: { id: true, startsAt: true },
  });
  if (!training) return { error: "Cet entraînement n’existe pas dans cette équipe." };
  // A présence is an observation, so it cannot be recorded about an evening nobody has lived
  // (decision 090, enforced by decision 099). The page hides the list, and this is the rule: the
  // page is a courtesy, the action is the guard.
  if (!attendanceIsOpen(training.startsAt, new Date())) {
    return { error: attendanceNotOpenFr(ATTENDANCE_OPENS_MINUTES_BEFORE) };
  }

  // Only members of this team, so a crafted form cannot mark a stranger present.
  const allowed = await activePlayerIds(parsed.data.teamId);
  const marks = parsed.data.marks.filter((mark) => allowed.has(mark.teamMemberId));

  const judged = marks.filter((mark) => mark.mark !== "unset");
  const cleared = marks.filter((mark) => mark.mark === "unset").map((mark) => mark.teamMemberId);

  await db.transaction(async (tx) => {
    if (judged.length > 0) {
      await tx
        .insert(trainingAttendance)
        .values(
          judged.map((mark) => ({
            trainingId: training.id,
            teamMemberId: mark.teamMemberId,
            present: mark.mark === "present",
            markedBy: actor.userId,
          })),
        )
        .onConflictDoUpdate({
          target: [trainingAttendance.trainingId, trainingAttendance.teamMemberId],
          set: {
            // `excluded.present` is the value of the row that collided, so one statement can set a
            // different value per player instead of one `UPDATE` each.
            present: sql<boolean>`excluded.present`,
            markedBy: actor.userId,
            markedAt: new Date(),
          },
        });
    }

    if (cleared.length > 0) {
      await tx
        .delete(trainingAttendance)
        .where(
          and(
            eq(trainingAttendance.trainingId, training.id),
            inArray(trainingAttendance.teamMemberId, cleared),
          ),
        );
    }
  });

  revalidateTraining(training.id);
  return undefined;
}

/** Everyone who can be marked present: active members of the team who actually play. */
async function activePlayerIds(teamId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        isNull(teamMembers.leftAt),
        eq(teamMembers.isPlayer, true),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

/**
 * Marks the whole squad present in one tap — the common case on a good evening. The coach then
 * flips the two or three who are missing.
 *
 * Returns a `FormState` for the same reasons as `markTrainingAttendance`, and matters more here: it
 * is the tap that used to leave the screen looking unchanged whether it had written thirteen rows
 * or refused. The markup binds `markEveryonePresentNoScript`.
 */
export async function markEveryonePresent(formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = trainingTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    trainingId: formData.get("trainingId"),
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "training:markAttendance", { teamId: parsed.data.teamId });

  const training = await db.query.trainings.findFirst({
    where: and(eq(trainings.id, parsed.data.trainingId), eq(trainings.teamId, parsed.data.teamId)),
    columns: { id: true, startsAt: true },
  });
  if (!training) return { error: "Cet entraînement n’existe pas dans cette équipe." };
  // « Tout le monde est là » is the sentence this whole rule exists for: it was one tap, on a séance
  // four days away, and it wrote thirteen rows (decision 099).
  if (!attendanceIsOpen(training.startsAt, new Date())) {
    return { error: attendanceNotOpenFr(ATTENDANCE_OPENS_MINUTES_BEFORE) };
  }

  const players = [...(await activePlayerIds(parsed.data.teamId))];
  if (players.length === 0) {
    return { error: "Il n’y a aucun joueur à pointer dans cette équipe." };
  }

  await db
    .insert(trainingAttendance)
    .values(
      players.map((teamMemberId) => ({
        trainingId: training.id,
        teamMemberId,
        present: true,
        markedBy: actor.userId,
      })),
    )
    .onConflictDoUpdate({
      target: [trainingAttendance.trainingId, trainingAttendance.teamMemberId],
      set: { present: true, markedBy: actor.userId, markedAt: new Date() },
    });

  revalidateTraining(training.id);
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* The same two actions, bound by the markup                                  */
/* -------------------------------------------------------------------------- */

/**
 * The no-JavaScript bindings for the two actions above.
 *
 * React's own types say an `action` or a `formAction` attribute returns `void | Promise<void>`, and
 * they are right to: in the no-JS path the browser posts the form and renders whatever comes back,
 * so **there is nobody to hand a `FormState` to**. The two actions above return one because the
 * enhanced path awaits them and renders the message; these two are what the markup binds, and the
 * discarded return value is the honest description of what a full page POST can do with it.
 *
 * They must be separate `"use server"` exports rather than arrow functions written in the component:
 * progressive enhancement works by React serialising a *server reference* into the form's `action`
 * attribute, and a closure defined in a Client Component is not one — binding that would silently
 * make this screen require JavaScript, which is the one thing it may not do (it gets filled in on a
 * touchline, which is where the signal is worst).
 *
 * The refusals they swallow are therefore not a regression: without JavaScript the server re-renders
 * the page, and the card states what is actually in the table. The message is for the path that can
 * show one.
 */
export async function markTrainingAttendanceNoScript(formData: FormData): Promise<void> {
  await markTrainingAttendance(formData);
}

export async function markEveryonePresentNoScript(formData: FormData): Promise<void> {
  await markEveryonePresent(formData);
}
