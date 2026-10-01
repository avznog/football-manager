"use server";

/**
 * Entering a match that was played without the phone, and correcting one that is over.
 *
 * Both actions do the same thing in the end: they hand `amendMatchEvents` a batch of events. The
 * whole design of M7 is that nothing downstream knows the difference — `match_events` is the same
 * table, `reduceMatch` is the same function, `match_player_stats` is frozen the same way. There is no
 * "retro" branch anywhere in the reducer, the recap, the statistics or the ratings, and
 * `matches.entry_mode` exists only so the UI can say « saisi après le match » (decision 013).
 *
 * The contract is the house one: `requireActor()`, Zod on every field, `assertCan()` before any
 * write (invariant 4), French errors back to the form, `redirect` last and outside any try/catch
 * (`docs/NEXTJS16.md` §5). The permission is `match:amend` — coach-only. Game mode's operator may be
 * a delegate for the afternoon (decision 004); typing up a match a fortnight later is the coach's.
 */

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { matchSquad, matches } from "@/db/schema";
import { assertCan } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState, type FormState } from "@/lib/auth/validation";
import { amendMatchEvents } from "@/lib/match/append";
import { getLiveMatch } from "@/lib/match/live";
import { reduceLive } from "@/lib/match/presenter";

import { buildAmendment, isAmendableEventType } from "./amend";
import {
  buildRetroLog,
  retroEntrySeed,
  retroEventId,
  retroSubmissionId,
  retroSubstitutions,
  type RetroEntry,
} from "./log";
import {
  amendSubmitSchema,
  blockingRetroIssues,
  findRetroIssues,
  readActionFields,
  readStarterFields,
  retroLogIssuesFr,
  retroSubmitSchema,
} from "./validation";

/* -------------------------------------------------------------------------- */
/* Entering a whole match                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Turn a filled-in sheet into an append-only log.
 *
 * The order of the checks is the order of what can go wrong: shape, permission, existence, "has
 * somebody already entered this match", what the coach typed, and finally what the reducer makes of
 * the log the app is about to write. That last one is the one that matters — the app refuses to
 * store a log its own reducer cannot read, so no retro-entered match can ever be the reason a
 * season table looks odd.
 */
export async function submitRetroMatch(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireActor();

  const entries = [...formData.entries()];
  const parsed = retroSubmitSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    lineupId: formData.get("lineupId") || undefined,
    starters: readStarterFields(entries),
    actions: readActionFields(entries),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const { teamId, matchId } = parsed.data;

  assertCan(actor, "match:amend", { teamId });

  const live = await getLiveMatch(teamId, matchId);
  if (!live) return { error: "Ce match n’existe pas dans cette équipe." };

  const kickoffAtMs = new Date(live.match.kickoffAt).getTime();
  if (Number.isNaN(kickoffAtMs)) return { error: "Ce match n’a pas de date exploitable." };
  /*
   * The same rule as the screen: the clock decides, unless the coach has declared the match over
   * himself, which decision 121 lets him do at any moment. Refusing here what the page offers is how
   * a form comes to have a button that cannot work.
   *
   * For a future-dated match the log `buildRetroLog` produces therefore carries `occurredAt` values
   * in the future. That is inert — the reducer works from `clockMs` and `period`, and the timeline
   * displays minutes — and it is the honest record of what the coach said happened.
   */
  if (kickoffAtMs > Date.now() && live.match.status !== "finished") {
    return { error: "Ce match n’a pas encore eu lieu : il n’y a rien à saisir." };
  }

  const sheet = {
    periods: {
      periodsCount: live.match.periodsCount,
      periodMinutes: live.match.periodMinutes,
    },
    kickoffAtMs,
    lineupId: parsed.data.lineupId ?? null,
    starters: parsed.data.starters,
    actions: parsed.data.actions,
  };
  // Derived from the sheet, not submitted with it: the same sheet posted twice is one log.
  const entry: RetroEntry = {
    ...sheet,
    submissionId: retroSubmissionId([retroEntrySeed(matchId, sheet)]),
  };

  const built = buildRetroLog(entry);

  /*
   * A match that already has a log is corrected, not re-entered — except when this very submission
   * is the one that wrote it. The browser retrying a POST, or the coach tapping twice on a slow
   * phone, must land on the recap rather than on an error (invariant 6): the `clientEventId`s are
   * derived from the submission id, so "already stored" is exactly answerable.
   */
  if (live.events.length > 0) {
    const stored = new Set(live.events.map((event) => event.clientEventId));
    const mine = built.events.every((event) => stored.has(event.clientEventId));
    if (!mine) {
      return {
        error:
          "Ce match a déjà un déroulé : les corrections se font action par action, plus bas sur cette page.",
      };
    }
    redirect(`/match/${matchId}/recap`);
  }

  // The formation the starters were placed in, taken from the log's own catalogue so a crafted form
  // cannot invent slots.
  const slotIds = new Set(entry.starters.map((starter) => starter.slotId));
  const formation =
    live.formations.find((candidate) => candidate.slots.some((slot) => slotIds.has(slot.id))) ??
    null;
  if (!formation) {
    return { error: "Cette composition ne correspond à aucune formation de l’équipe." };
  }

  const issues = findRetroIssues({
    entry,
    members: live.players
      .filter((player) => player.isPlayer)
      .map((player) => ({ membershipId: player.memberId, name: player.displayName })),
    slots: formation.slots,
  });
  const blocking = blockingRetroIssues(issues);
  if (blocking.length > 0) return { error: blocking[0].messageFr };

  // Belt and braces: ask the reducer, the one every consumer will use, whether this log holds up.
  const logIssues = retroLogIssuesFr(built.events, {
    periods: { periodsCount: live.match.periodsCount, periodMinutes: live.match.periodMinutes },
    slots: formation.slots,
  });
  if (logIssues.length > 0) return { error: logIssues[0] };

  /*
   * The match sheet, from the sheet the coach just typed.
   *
   * A match played weeks ago may have no `match_squad` rows at all — nobody convocated anybody in the
   * app. The statistics and the ratings read that table (decision 007), so whoever the coach says
   * played is recorded as having been selected. `onConflictDoNothing`, never an update: a sheet that
   * was drawn before the match is the coach's word on who was convocated, and this is not the screen
   * for changing it.
   */
  await upsertSquadFromEntry(matchId, entry);

  const result = await amendMatchEvents(actor, { matchId, events: built.events });
  if (!result.ok) return { error: result.body.error };

  // `entry_mode` is a label, not a behaviour: it records how the log came to exist so the recap can
  // say so, and nothing reads it to decide anything.
  await db
    .update(matches)
    .set({ entryMode: "retro" })
    .where(and(eq(matches.id, matchId), eq(matches.teamId, teamId)));

  redirect(`/match/${matchId}/recap?saisie=1`);
}

/**
 * Everyone the sheet says was involved becomes a `match_squad` row: the starting seven as
 * `starter`, whoever came on as `substitute`.
 */
async function upsertSquadFromEntry(matchId: string, entry: RetroEntry): Promise<void> {
  const roles = new Map<string, "starter" | "substitute">();
  for (const starter of entry.starters) roles.set(starter.memberId, "starter");
  // The substitution rows only: who came on is a question about those and not about the goals.
  for (const change of retroSubstitutions(entry.actions)) {
    if (!roles.has(change.inId)) roles.set(change.inId, "substitute");
  }
  if (roles.size === 0) return;

  await db
    .insert(matchSquad)
    .values(
      [...roles].map(([teamMemberId, role]) => ({ matchId, teamMemberId, role })),
    )
    .onConflictDoNothing({ target: [matchSquad.matchId, matchSquad.teamMemberId] });
}

/* -------------------------------------------------------------------------- */
/* Correcting one action                                                      */
/* -------------------------------------------------------------------------- */

/**
 * « Ce but, ce n'était pas Karim, c'était Momo. »
 *
 * Appends a `VOID` at the wrong event and, when there is one, the right event after it — never an
 * `UPDATE` (invariant 1). `amendMatchEvents` re-freezes `match_player_stats` afterwards, so the
 * season table agrees with the recap before the coach's thumb has left the screen.
 *
 * The target is checked against this match's log twice: here, so the coach gets a French sentence,
 * and in `amendMatchEvents`, so a crafted POST gets a 409.
 */
export async function submitAmendment(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const factType = formData.get("fact-type");
  const parsed = amendSubmitSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    intent: formData.get("intent"),
    targetEventId: formData.get("targetEventId") || undefined,
    fact:
      typeof factType === "string" && factType !== ""
        ? {
            type: factType,
            memberId: emptyToNull(formData.get("fact-member")),
            assistId: emptyToNull(formData.get("fact-assist")),
            minute: optionalMinute(formData.get("fact-minute")),
          }
        : undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  const { teamId, matchId, intent } = parsed.data;

  assertCan(actor, "match:amend", { teamId });

  const live = await getLiveMatch(teamId, matchId);
  if (!live) return { error: "Ce match n’existe pas dans cette équipe." };

  const kickoffAtMs = new Date(live.match.kickoffAt).getTime();
  if (Number.isNaN(kickoffAtMs)) return { error: "Ce match n’a pas de date exploitable." };

  const state = reduceLive(live, [], null);

  const target = parsed.data.targetEventId
    ? (state.timeline.find((line) => line.eventId === parsed.data.targetEventId) ?? null)
    : null;
  if (parsed.data.targetEventId && !target) {
    return { error: "Cette action n’existe pas dans le déroulé de ce match." };
  }
  if (target && target.type === "VOID") {
    return { error: "Une annulation ne s’annule pas : ajoute l’action corrigée à la place." };
  }
  // The same rule as the one that decides whether the screen shows « Corriger » — here too, so a
  // crafted POST cannot annul a kick-off and leave a log whose minutes mean nothing.
  if (target && !isAmendableEventType(target.type)) {
    return {
      error:
        "Cette ligne fait partie du déroulement du match : seules les actions et les changements se corrigent ici.",
    };
  }

  const fact = intent === "void" ? null : (parsed.data.fact ?? null);
  if (fact === null && target === null) return { error: "Il n’y a rien à corriger." };

  /*
   * Derived from what is being corrected, so tapping « Enregistrer » twice appends one `VOID` and one
   * replacement rather than two of each (invariant 6).
   *
   * Two corrections that are genuinely identical — the same forgotten foul, by the same player, at
   * the same minute, added twice — collapse into one. That is the right answer: on a phone, that is a
   * double tap, not a player who fouled twice in the same minute.
   */
  const submissionId = retroSubmissionId([
    matchId,
    intent,
    target?.eventId ?? "",
    fact?.type ?? "",
    fact?.memberId ?? "",
    fact?.assistId ?? "",
    fact?.minute ?? "?",
  ]);

  /*
   * The same correction, already stored. This has to be answered *before* « cette action est déjà
   * annulée », because after a successful correction the target is exactly that: annulled. A browser
   * replaying the POST, or a thumb tapping twice on a slow connection, must land on the corrected
   * timeline rather than on an error about the state its own first attempt created.
   */
  if (live.events.some((event) => event.clientEventId === retroEventId(submissionId, 0))) {
    redirect(`/match/${matchId}/saisie?corrige=1`);
  }

  if (target?.voided) return { error: "Cette action est déjà annulée." };

  const amendment = buildAmendment({
    submissionId,
    periods: {
      periodsCount: live.match.periodsCount,
      periodMinutes: live.match.periodMinutes,
    },
    kickoffAtMs,
    finalWhistleMs:
      state.timeline.find((line) => line.type === "FINAL_WHISTLE" && !line.voided)?.clockMs ?? 0,
    target: target
      ? {
          eventId: target.eventId,
          type: target.type,
          period: target.period,
          clockMs: target.clockMs,
        }
      : null,
    fact,
  });

  if (amendment.events.length === 0) return { error: "Il n’y a rien à corriger." };

  /*
   * The corrected log, read by the reducer before it is written. A correction that would produce a
   * goal by somebody who had already been substituted is the coach misremembering, and the right
   * answer is to say so rather than to store a timeline with a warning on it.
   */
  const preview = reduceLive(
    live,
    amendment.events.map((event) => ({
      clientEventId: event.clientEventId,
      type: event.type,
      period: event.period,
      minute: event.minute,
      clockMs: event.clockMs,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload ?? {},
      voidsEventId: event.voidsEventId ?? null,
    })),
    null,
  );
  const introduced = preview.anomalies.filter(
    (anomaly) => !state.anomalies.some((before) => before.code === anomaly.code),
  );
  if (introduced.some((anomaly) => anomaly.code === "scorer-off-pitch")) {
    return { error: "Ce joueur n’était pas sur le terrain à cette minute." };
  }
  if (introduced.some((anomaly) => anomaly.code === "event-after-final-whistle")) {
    return { error: "Cette minute est postérieure à la fin du match." };
  }

  const result = await amendMatchEvents(actor, { matchId, events: amendment.events });
  if (!result.ok) return { error: result.body.error };

  redirect(`/match/${matchId}/saisie?corrige=1`);
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw === "" ? null : raw;
}

/** An empty minute field is « je ne sais plus », which the stamp rule handles. */
function optionalMinute(value: FormDataEntryValue | null): number | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw === "" ? null : Number(raw);
}
