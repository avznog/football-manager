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
import { finalizeMatchById } from "@/lib/match/finalize";
import { actualPeriodStarts, clockMsForMinuteField, periodsConfig } from "@/lib/match/clock";
import { getLiveMatch } from "@/lib/match/live";
import {
  type LiveMatch,
  type PendingEvent,
  mergeEvents,
  minuteLabelFr,
  reduceLive,
} from "@/lib/match/presenter";
import type { MatchState } from "@/lib/match/reducer";
import type { Actor } from "@/lib/auth/can";

import { type Amendment, buildAmendment, buildChangeAmendment, isAmendableEntry } from "./amend";
import { changeCandidateIds, changeProblemFr, changeSeed, stateAtClock } from "./change";
import { MAX_AMENDMENT_EVENTS, withFrameMove } from "./frame";
import { introducedAnomalies, realismRefusalFr } from "./realism";
import { offSheetCandidateIds, sheetAdditions } from "./sheet";
import { NOBODY, amendRemoveSchema, planRemoval } from "./remove";
import {
  amendStartSchema,
  buildStartAmendment,
  squadAfterStart,
  startProblemFr,
  startSignature,
} from "./start";
import {
  buildRetroLog,
  retroEntrySeed,
  retroEventId,
  retroSubmissionId,
  retroSubstitutions,
  type RetroEntry,
} from "./log";
import {
  amendChangeSchema,
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
    redirect(`/match/${matchId}`);
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

  redirect(`/match/${matchId}?saisie=1`);
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

  // « Ajouter un changement » (decision 169): a shape of its own, the same path afterwards.
  if (formData.get("intent") === "change") return submitChange(actor, formData);
  // « Corriger la composition de départ » (decision 223).
  if (formData.get("intent") === "start") return submitStart(actor, formData);
  // « Retirer du match » (decision 226).
  if (formData.get("intent") === "remove") return submitRemove(actor, formData);

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
            minute: optionalMinuteField(formData.get("fact-minute")),
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
  if (target && !isAmendableEntry(target)) {
    return {
      error:
        target.type === "LINEUP_APPLIED"
          ? "La composition de départ ne s’annule pas : pour changer l’équipe sur le terrain, ajoute un changement."
          : "Cette ligne fait partie du déroulement du match : seules les actions et les changements se corrigent ici.",
    };
  }
  // A change is annulled and re-entered, never replaced by a fact.
  if (target && target.type === "LINEUP_APPLIED" && intent !== "void") {
    return { error: "Un changement ne se corrige pas en place : annule-le, puis ajoute le bon." };
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

  // A minute the field's shape allowed but this match has no place for — « 25+2 » of a 2×30. Checked
  // here so it is a sentence rather than a silent fallback to the target's own stamp (decision 215).
  if (
    fact?.minute != null &&
    !clockMsForMinuteField(fact.minute, periodsConfig(live.match), actualPeriodStarts(state.playIntervals))
  ) {
    return {
      error: `La minute « ${fact.minute} » n’existe pas dans ce match : le temps additionnel s’écrit avec la fin de la période, par exemple 30+2.`,
    };
  }

  const amendment = buildAmendment({
    submissionId,
    periods: {
      periodsCount: live.match.periodsCount,
      periodMinutes: live.match.periodMinutes,
    },
    kickoffAtMs,
    finalWhistleMs:
      state.timeline.find((line) => line.type === "FINAL_WHISTLE" && !line.voided)?.clockMs ?? 0,
    // The minute the coach typed is the one the sheet showed him (decision 214), so the real starts
    // of the periods are what maps it back onto the clock.
    periodStarts: actualPeriodStarts(state.playIntervals),
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

  // An action after its period's whistle moves the whistle, in this same batch (decision 224).
  const framed = withFrameMove(amendment, {
    submissionId,
    events: live.events,
    periods: periodsConfig(live.match),
    excludeIds: target ? new Set([target.eventId]) : undefined,
  });
  if (framed.events.length > MAX_AMENDMENT_EVENTS) return { error: FRAME_TOO_LONG_FR };

  const refusal = realismOf(live, state, framed, framed.copies);
  if (refusal) return { error: refusal };

  const result = await amendMatchEvents(actor, { matchId, events: framed.events });
  if (!result.ok) return { error: result.body.error };

  redirect(`/match/${matchId}/saisie?corrige=1`);
}

/**
 * The corrected log, read by the reducer before it is written (decision 170). A correction that would
 * produce a goal by somebody who had already been substituted, or a change that strands a later goal,
 * is the coach misremembering, and the right answer is to say so — naming who and when — rather than
 * to store a timeline with a warning on it. New anomalies are those not already in the log, compared
 * by `(code, eventId)`: a second goal by somebody off the pitch is new even if the log had one.
 */
function realismOf(
  live: LiveMatch,
  state: MatchState,
  amendment: Amendment,
  copies: ReadonlyMap<string, string> = new Map(),
): string | null {
  const preview = reduceLive(live, amendment.events.map(toPending), null);
  // A moved event is a new row (decision 224), so an anomaly the log already had on the original
  // would otherwise read as new and refuse a correction that did not cause it.
  const asOriginal = preview.anomalies.map((anomaly) =>
    anomaly.eventId && copies.has(anomaly.eventId)
      ? { ...anomaly, eventId: copies.get(anomaly.eventId)! }
      : anomaly,
  );
  const introduced = introducedAnomalies(state.anomalies, asOriginal);
  return realismRefusalFr(introduced, preview, nameIn(live));
}

/** Only reachable with a match of a few hundred events, which seven-a-side does not produce. */
const FRAME_TOO_LONG_FR =
  "Cette correction déplacerait trop d’actions d’un coup : corrige le match en plusieurs fois.";

function toPending(event: Amendment["events"][number]): PendingEvent {
  return {
    clientEventId: event.clientEventId,
    type: event.type,
    period: event.period,
    minute: event.minute,
    clockMs: event.clockMs,
    occurredAt: event.occurredAt.toISOString(),
    payload: event.payload ?? {},
    voidsEventId: event.voidsEventId ?? null,
  };
}

function nameIn(live: LiveMatch): (memberId: string) => string {
  return (memberId) =>
    live.players.find((player) => player.memberId === memberId)?.displayName ?? "Ce joueur";
}

/* -------------------------------------------------------------------------- */
/* Adding a change after the match                                            */
/* -------------------------------------------------------------------------- */

/**
 * « Ajouter un changement » — one `LINEUP_APPLIED` at the minute the coach named (decisions 147, 169).
 *
 * The screen only offered players who could go out or come in at that minute; this asks again,
 * against the pitch recomputed here from the log (`stateAtClock`), then asks the reducer whether the
 * whole match still holds once the change is in it — a change at 20′ that takes off the man who
 * scores at 41′ is refused on that goal. Then the same `amendMatchEvents` every correction uses, which
 * re-freezes `match_player_stats`.
 */
async function submitChange(actor: Actor, formData: FormData): Promise<FormState> {
  const minuteRaw = typeof formData.get("change-minute") === "string" ? String(formData.get("change-minute")).trim() : "";
  const parsed = amendChangeSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    intent: formData.get("intent"),
    minute: minuteRaw,
    outIds: formData.getAll("change-out").map(String),
    inIds: formData.getAll("change-in").map(String),
    slots: formData
      .getAll("change-slot")
      .map(String)
      .map((value) => {
        const [slotId, memberId] = value.split(":");
        return { slotId: slotId ?? "", memberId: memberId ?? "" };
      }),
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, matchId, minute, outIds, inIds, slots } = parsed.data;

  assertCan(actor, "match:amend", { teamId });

  const live = await getLiveMatch(teamId, matchId);
  if (!live) return { error: "Ce match n’existe pas dans cette équipe." };
  const kickoffAtMs = new Date(live.match.kickoffAt).getTime();
  if (Number.isNaN(kickoffAtMs)) return { error: "Ce match n’a pas de date exploitable." };

  const state = reduceLive(live, [], null);
  const finalWhistleMs =
    state.timeline.find((line) => line.type === "FINAL_WHISTLE" && !line.voided)?.clockMs ?? 0;

  const submissionId = retroSubmissionId(changeSeed(matchId, minute, slots));
  if (live.events.some((event) => event.clientEventId === retroEventId(submissionId, 0))) {
    redirect(`/match/${matchId}/saisie?corrige=1`);
  }

  if (!clockMsForMinuteField(minute, periodsConfig(live.match), actualPeriodStarts(state.playIntervals))) {
    return {
      error: `La minute « ${minute} » n’existe pas dans ce match : le temps additionnel s’écrit avec la fin de la période, par exemple 30+2.`,
    };
  }

  const amendment = buildChangeAmendment({
    submissionId,
    periods: { periodsCount: live.match.periodsCount, periodMinutes: live.match.periodMinutes },
    kickoffAtMs,
    finalWhistleMs,
    change: { minute, slots },
    periodStarts: actualPeriodStarts(state.playIntervals),
  });
  const stamped = amendment.events[0];
  /*
   * No « le match était déjà terminé » any more (decision 224): a change after a whistle moves the
   * whistle, in this same batch, like an action does. The pitch « at that minute » is then read from
   * the log **with the frame already moved**, because after an added-time move the second half's
   * events have shifted and the old log would answer for a moment that no longer exists.
   */
  const framed = withFrameMove(amendment, {
    submissionId,
    events: live.events,
    periods: periodsConfig(live.match),
  });
  if (framed.events.length > MAX_AMENDMENT_EVENTS) return { error: FRAME_TOO_LONG_FR };
  const moved = framed.events.slice(amendment.events.length);
  const liveMoved: LiveMatch =
    moved.length === 0 ? live : { ...live, events: mergeEvents(live.events, moved.map(toPending)) };

  const atClock = stateAtClock(liveMoved, stamped.clockMs);
  /*
   * Who may come on: the sheet's own, and — said as such on the screen before confirming — the
   * players it does not have (decision 226). Recomputed here from the roster this action loaded, never
   * taken from the form: `live.players` holds only this team's active members plus whoever this
   * match's sheet names, so a member of another team, a departed one or a non-player cannot be posted.
   */
  const candidateIds = [
    ...changeCandidateIds(live, atClock, state),
    ...offSheetCandidateIds(live, atClock, state),
  ];
  const problem = changeProblemFr(
    { outIds, inIds, slots },
    {
      atClock,
      candidateIds,
      slots: live.slots,
      nameOf: nameIn(live),
      minuteLabel: minuteLabelFr(stamped.clockMs, stamped.period, atClock.periods),
    },
  );
  if (problem) return { error: problem };
  if (outIds.length === 0 && inIds.length === 0) {
    const same =
      atClock.onPitch.every((entry) =>
        slots.some((slot) => slot.memberId === entry.memberId && slot.slotId === entry.slotId),
      ) && slots.length === atClock.onPitch.length;
    if (same) return { error: "Personne n’entre, personne ne sort et personne ne change de poste." };
  }

  const refusal = realismOf(live, state, framed, framed.copies);
  if (refusal) return { error: refusal };

  const result = await amendMatchEvents(actor, { matchId, events: framed.events });
  if (!result.ok) return { error: result.body.error };

  // Whoever came on from outside the sheet is on it now, as a substitute (decision 226). After the
  // events, so a refused batch leaves the sheet alone; then the stats once more, because
  // `match_player_stats.squad_role` is read off the sheet and `amendMatchEvents` froze them before.
  const added = sheetAdditions(live, inIds, "substitute");
  if (added.length > 0) {
    await writeSquadRoles(
      matchId,
      added.map((entry) => ({ memberId: entry.memberId, role: entry.to })),
    );
    await finalizeMatchById(teamId, matchId);
  }

  redirect(`/match/${matchId}/saisie?corrige=1`);
}

/** Set these members' role on this match's sheet, creating the row where there was none. */
async function writeSquadRoles(
  matchId: string,
  roles: readonly { memberId: string; role: "starter" | "substitute" }[],
): Promise<void> {
  for (const change of roles) {
    await db
      .insert(matchSquad)
      .values({ matchId, teamMemberId: change.memberId, role: change.role })
      .onConflictDoUpdate({
        target: [matchSquad.matchId, matchSquad.teamMemberId],
        set: { role: change.role },
      });
  }
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw === "" ? null : raw;
}

/**
 * An empty minute field is « je ne sais plus », which the stamp rule handles. Text rather than a
 * number since decision 215: `30+2` is a minute of this match and not a number.
 */
function optionalMinuteField(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw === "" ? null : raw;
}

/* -------------------------------------------------------------------------- */
/* Correcting the starting composition (decision 223)                         */
/* -------------------------------------------------------------------------- */

/**
 * « Corriger la composition de départ » on a finished match.
 *
 * The start only, as the owner chose: a `VOID` on the current start and the corrected seven at the
 * same clock, in one batch (`lib/retro/start.ts` says why that is not what decision 150 forbids).
 * Every later change stays as recorded. If the corrected seven makes a later line impossible — a
 * substitution bringing on somebody who now starts, a goal by somebody now on the bench — the
 * reducer finds it and the same realism check every correction uses refuses it, naming who and when.
 *
 * Then the squad sheet follows: who now starts is a `starter`, who no longer does a `substitute`.
 * After the events, not before, so a refused batch leaves the sheet as it was; and the stats are
 * re-frozen once more afterwards, because `match_player_stats.squad_role` is read off the sheet.
 */
async function submitStart(actor: Actor, formData: FormData): Promise<FormState> {
  const parsed = amendStartSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    intent: formData.get("intent"),
    slots: formData
      .getAll("start-slot")
      .map(String)
      .map((value) => {
        const [slotId, memberId] = value.split(":");
        return { slotId: slotId ?? "", memberId: memberId ?? "" };
      }),
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, matchId, slots } = parsed.data;

  assertCan(actor, "match:amend", { teamId });

  const live = await getLiveMatch(teamId, matchId);
  if (!live) return { error: "Ce match n’existe pas dans cette équipe." };
  if (live.match.status !== "finished") {
    return { error: "Le match n’est pas terminé : la composition de départ se règle avant ou pendant le match." };
  }
  const kickoffAtMs = new Date(live.match.kickoffAt).getTime();
  if (Number.isNaN(kickoffAtMs)) return { error: "Ce match n’a pas de date exploitable." };

  const state = reduceLive(live, [], null);
  const start = state.timeline.find(
    (line) => line.type === "LINEUP_APPLIED" && line.startingLineup && !line.voided,
  );
  const current = state.compositions.find((composition) => composition.eventId === start?.eventId);
  if (!start || !current) {
    return { error: "Ce match n’a pas de composition de départ à corriger." };
  }
  const before = current.assignments
    .filter((assignment): assignment is { memberId: string; slotId: string } => assignment.slotId !== null)
    .map((assignment) => ({ slotId: assignment.slotId, memberId: assignment.memberId }));

  const problem = startProblemFr({
    current: before,
    proposed: slots,
    knownSlotIds: new Set(live.slots.map((slot) => slot.id)),
    candidates: live.players.map((player) => ({
      memberId: player.memberId,
      displayName: player.displayName,
      isPlayer: player.isPlayer,
      squadRole: player.squadRole,
      hasLeft: player.hasLeft,
    })),
  });
  if (problem) return { error: problem };

  const submissionId = retroSubmissionId([matchId, "start", start.eventId, ...startSignature(slots)]);
  if (live.events.some((event) => event.clientEventId === retroEventId(submissionId, 0))) {
    redirect(`/match/${matchId}/saisie?corrige=1`);
  }

  const amendment = buildStartAmendment({
    submissionId,
    kickoffAtMs,
    start: { eventId: start.eventId, period: start.period, clockMs: start.clockMs },
    slots,
  });

  const refusal = realismOf(live, state, amendment);
  if (refusal) return { error: refusal };

  const result = await amendMatchEvents(actor, { matchId, events: amendment.events });
  if (!result.ok) return { error: result.body.error };

  const roles = squadAfterStart({
    hasSquadSheet: live.hasSquadSheet,
    before,
    after: slots,
    roles: new Map(live.players.map((player) => [player.memberId, player.squadRole])),
  });
  if (roles.length > 0) {
    // Includes a player brought in from outside the sheet, or a supporter promoted (decision 226).
    await writeSquadRoles(matchId, roles);
    // `amendMatchEvents` froze the stats before the sheet moved; `squad_role` is read off the sheet.
    await finalizeMatchById(teamId, matchId);
  }

  redirect(`/match/${matchId}/saisie?corrige=1`);
}

/* -------------------------------------------------------------------------- */
/* Taking somebody off the match (decision 226)                               */
/* -------------------------------------------------------------------------- */

/**
 * « Retirer du match »: he never was there, so he leaves the sheet, and every whole-pitch snapshot he
 * is in gives his slot to whoever really played there — or to nobody, « on a joué à 6 ».
 *
 * `planRemoval` decides everything and the screen ran the same function to show the sentence; this
 * re-runs it on the log as the server has it, never on what the form claims. Then the same realism
 * check as every correction, the same `amendMatchEvents`, and only afterwards the sheet: his row goes
 * (any role, supporter included), the replacement's role follows. **His notes are not touched** —
 * they stop counting because he is no longer on the match (`lib/rating/eligibility.ts`), and come back
 * if he is added again.
 */
async function submitRemove(actor: Actor, formData: FormData): Promise<FormState> {
  const parsed = amendRemoveSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    intent: formData.get("intent"),
    memberId: formData.get("memberId"),
    replacement: formData.get("replacement"),
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, matchId, memberId, replacement } = parsed.data;

  assertCan(actor, "match:amend", { teamId });

  const live = await getLiveMatch(teamId, matchId);
  if (!live) return { error: "Ce match n’existe pas dans cette équipe." };
  if (live.match.status !== "finished") {
    return { error: "Le match n’est pas terminé : la feuille se règle dans la composition." };
  }
  const kickoffAtMs = new Date(live.match.kickoffAt).getTime();
  if (Number.isNaN(kickoffAtMs)) return { error: "Ce match n’a pas de date exploitable." };

  const state = reduceLive(live, [], null);
  const onTheMatch =
    live.players.some((player) => player.memberId === memberId && player.squadRole !== null) ||
    state.players.some((player) => player.memberId === memberId && player.playedMatch);
  if (!onTheMatch) return { error: "Cette personne n’est pas sur ce match." };

  const replacementId = replacement === NOBODY ? null : replacement;
  const submissionId = retroSubmissionId([matchId, "remove", memberId, replacement]);
  if (live.events.some((event) => event.clientEventId === retroEventId(submissionId, 0))) {
    redirect(`/match/${matchId}/saisie?corrige=1`);
  }

  const plan = planRemoval({
    live,
    state,
    periods: periodsConfig(live.match),
    periodStarts: actualPeriodStarts(state.playIntervals),
    memberId,
    replacementId,
    submissionId,
    kickoffAtMs,
  });
  if (!plan.ok) return { error: plan.problemFr };

  if (plan.amendment.events.length > 0) {
    if (plan.amendment.events.length > MAX_AMENDMENT_EVENTS) return { error: FRAME_TOO_LONG_FR };
    const refusal = realismOf(live, state, plan.amendment, plan.copies);
    if (refusal) return { error: refusal };
    const result = await amendMatchEvents(actor, { matchId, events: plan.amendment.events });
    if (!result.ok) return { error: result.body.error };
  }

  // The sheet last, so a refused batch leaves it as it was.
  await db
    .delete(matchSquad)
    .where(and(eq(matchSquad.matchId, matchId), eq(matchSquad.teamMemberId, memberId)));
  if (plan.replacementRole) await writeSquadRoles(matchId, [plan.replacementRole]);
  // `amendMatchEvents` froze the stats before the sheet moved, or did not run at all for somebody who
  // never played; `squad_role` and the minutes are read again here either way.
  await finalizeMatchById(teamId, matchId);

  redirect(`/match/${matchId}/saisie?corrige=1`);
}
