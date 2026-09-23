import "server-only";

/**
 * Reads for the rating flow and the post-match recap.
 *
 * Two jobs, and the first one is a security boundary:
 *
 * 1. **The visibility gate is enforced here, not in the UI.** A rater who has not submitted his full
 *    set must not be able to obtain a single one of his teammates' scores *by any route*. So
 *    `getRatingResults` decides whether the viewer is allowed to see the notes **before** it selects
 *    anybody else's rows, and when the answer is no it returns a value that contains no score at
 *    all. There is nothing for a crafted request, a React DevTools inspection or a leaked RSC
 *    payload to reveal, because the numbers never leave Postgres.
 *
 * 2. **The recap's data loading.** The recap is derived, so it needs the event log, the
 *    compositions, the slot catalogue and the squad, then `reduceMatch` (invariant 2: the reducer is
 *    the only thing that computes match state) and `buildRecap` for the French view model.
 *
 * Everything returned is plain and serialisable: instants leave as ISO strings, never as `Date`
 * (`CLAUDE.md`).
 *
 * Known duplication, to be resolved rather than copied further: reading the event log, the
 * compositions and the slot catalogue belongs in `lib/match/queries.ts`, which has no event reader
 * yet — M4 is adding one in parallel. When it lands, `loadMatchState` here should be deleted in
 * favour of it.
 */

import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import {
  formationSlots,
  formations,
  lineupSlots,
  lineups,
  matchEvents,
  matchSquad,
  matches,
  ratings,
  teamMembers,
  users,
} from "@/db/schema";
import type { MatchStatus, SquadRole } from "@/db/schema";
import type { SlotInfo } from "@/lib/match/lineup";
import { getMatch, type MatchRow } from "@/lib/match/queries";
import {
  reduceMatch,
  type MatchEventRecord,
  type MatchState,
  type PlannedLineup,
} from "@/lib/match/reducer";
import {
  aggregateRatings,
  manOfTheMatch,
  type ManOfTheMatch,
  type RatingRecord,
} from "./aggregate";
import {
  isOnRateableSheet,
  rateableMemberIds,
  ratingProgress,
  ratingVisibility,
  type RatingProgress,
  type RatingVisibilityReason,
  type SheetEntry,
} from "./progress";
import { buildRecap, type MatchRecap, type RecapMember } from "./recap";
import { ratingWindow, type RatingWindow } from "./window";

/* -------------------------------------------------------------------------- */
/* Small reads                                                                */
/* -------------------------------------------------------------------------- */

/** The match sheet: who was a starter, a substitute, or only there to shout. */
export async function getMatchSheet(matchId: string): Promise<SheetEntry[]> {
  return db
    .select({ teamMemberId: matchSquad.teamMemberId, role: matchSquad.role })
    .from(matchSquad)
    .where(eq(matchSquad.matchId, matchId));
}

export type DirectoryMember = {
  membershipId: string;
  displayName: string;
  jerseyNumber: number | null;
  /** Members who have left keep their history — they still appear in an old recap. */
  hasLeft: boolean;
};

/**
 * Every membership of the team, **including those who have left**.
 *
 * `lib/team/queries.ts` `getSquad()` filters `leftAt` out, which is right for a selection list and
 * wrong for a recap: a player who left in March still played in February, and his name must not
 * turn into « Joueur inconnu ».
 */
export async function getTeamDirectory(teamId: string): Promise<DirectoryMember[]> {
  const rows = await db
    .select({
      membershipId: teamMembers.id,
      displayName: users.displayName,
      jerseyNumber: teamMembers.jerseyNumber,
      leftAt: teamMembers.leftAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(users.displayName));

  return rows.map((row) => ({
    membershipId: row.membershipId,
    displayName: row.displayName,
    jerseyNumber: row.jerseyNumber,
    hasLeft: row.leftAt !== null,
  }));
}

/**
 * Kick-off of the team's next match after this one — the instant the rating window shuts
 * (decision 007).
 *
 * Ordered by kick-off, which is the only thing that matters: a match created later but played
 * earlier still closes the window earlier.
 */
export async function getNextKickoffAfter(
  teamId: string,
  kickoffAt: Date | string,
): Promise<string | null> {
  const after = typeof kickoffAt === "string" ? new Date(kickoffAt) : kickoffAt;

  const rows = await db
    .select({ kickoffAt: matches.kickoffAt })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), gt(matches.kickoffAt, after)))
    .orderBy(asc(matches.kickoffAt))
    .limit(1);

  return rows[0] ? rows[0].kickoffAt.toISOString() : null;
}

/**
 * The rating window of a match, with `now` taken once so a page renders one consistent answer.
 *
 * Takes only the three columns the rule uses, so an action that has just read the match row for its
 * own checks does not have to fabricate a whole `MatchRow` to ask the question.
 */
export async function getRatingWindow(
  match: { teamId: string; kickoffAt: Date | string; status: MatchStatus },
  nowMs = Date.now(),
): Promise<RatingWindow> {
  const nextKickoff = await getNextKickoffAfter(match.teamId, match.kickoffAt);
  return ratingWindow({
    finished: match.status === "finished",
    nextKickoffAtMs: nextKickoff === null ? null : new Date(nextKickoff).getTime(),
    nowMs,
  });
}

/** The rows one rater has already written for one match. Nobody else's scores are selected. */
async function getMyRatings(matchId: string, raterMemberId: string) {
  return db
    .select({
      ratedMemberId: ratings.ratedMemberId,
      score: ratings.score,
      comment: ratings.comment,
    })
    .from(ratings)
    .where(and(eq(ratings.matchId, matchId), eq(ratings.raterMemberId, raterMemberId)));
}

/* -------------------------------------------------------------------------- */
/* The rating flow                                                            */
/* -------------------------------------------------------------------------- */

export type RatingTarget = {
  membershipId: string;
  displayName: string;
  jerseyNumber: number | null;
  squadRole: SquadRole;
  /**
   * Whole minutes he actually played, from the log — or null when the match has no log at all. The
   * sheet says what the coach intended; only this says what happened, and the rater is being asked
   * about what happened. See `playedLabelFr`.
   */
  minutes: number | null;
  /** The rater himself — decision 007 says he rates himself too. */
  isSelf: boolean;
  /** What this rater already put, if anything. A note, once given, is final. */
  myScore: number | null;
  myComment: string | null;
};

export type NotationView = {
  match: MatchRow;
  window: RatingWindow;
  /** The viewer is on the sheet as `starter` or `substitute`, so he may rate. */
  onSheet: boolean;
  /**
   * How the viewer was listed on the sheet, or null if he was not on it at all. `onSheet` answers
   * « may he rate »; this answers « why not », and the two are not the same question: a supporter was
   * on the sheet and still rates nobody (decision 039), so telling him he was not on it is a lie.
   */
  sheetRole: SquadRole | null;
  /** Everybody he owes a note, himself included. Starters first, then substitutes, by shirt. */
  targets: RatingTarget[];
  progress: RatingProgress;
};

/**
 * Everything the « Notation » screen needs.
 *
 * Returns null when the match does not belong to this team — `getMatch` scopes by team so a foreign
 * id is simply "not found".
 *
 * Note what this deliberately does *not* read: other people's ratings. The flow shows the viewer his
 * own notes and nothing else, whatever his progress.
 */
export async function getNotationView(input: {
  teamId: string;
  matchId: string;
  membershipId: string | null;
  nowMs?: number;
}): Promise<NotationView | null> {
  const match = await getMatch(input.teamId, input.matchId);
  if (!match) return null;

  const nowMs = input.nowMs ?? Date.now();
  const [sheet, directory, window, state] = await Promise.all([
    getMatchSheet(match.id),
    getTeamDirectory(match.teamId),
    getRatingWindow(match, nowMs),
    loadMatchState(match, nowMs),
  ]);

  /*
   * Minutes come from the log or from nowhere. `state.started` is false when no `KICKOFF` was ever
   * recorded — a match nobody opened game mode for and nobody backfilled — and every player would
   * then read 0’, which is not « nobody came on » but « we do not know » (decision 013). A retro
   * entry writes a `KICKOFF` per period (`lib/retro/log.ts`), so backfilled matches are covered.
   */
  const minutesOf = new Map(state.players.map((player) => [player.memberId, player.minutes]));

  const onSheet = isOnRateableSheet(sheet, input.membershipId);
  const requiredIds = rateableMemberIds(sheet);

  const mine = onSheet && input.membershipId ? await getMyRatings(match.id, input.membershipId) : [];
  const mineByMember = new Map(mine.map((row) => [row.ratedMemberId, row]));

  const byMembership = new Map(directory.map((member) => [member.membershipId, member]));
  const roleOf = new Map(sheet.map((entry) => [entry.teamMemberId, entry.role]));

  const targets: RatingTarget[] = requiredIds
    .map((membershipId) => {
      const member = byMembership.get(membershipId);
      const own = mineByMember.get(membershipId);
      return {
        membershipId,
        displayName: member?.displayName ?? "Joueur inconnu",
        jerseyNumber: member?.jerseyNumber ?? null,
        squadRole: roleOf.get(membershipId) ?? ("starter" as SquadRole),
        minutes: state.started ? minutesOf.get(membershipId) ?? 0 : null,
        isSelf: membershipId === input.membershipId,
        myScore: own?.score ?? null,
        myComment: own?.comment ?? null,
      };
    })
    .sort(compareTargets);

  return {
    match,
    window,
    onSheet,
    sheetRole: input.membershipId ? roleOf.get(input.membershipId) ?? null : null,
    targets,
    progress: ratingProgress({
      requiredIds,
      submittedIds: mine.map((row) => row.ratedMemberId),
    }),
  };
}

/**
 * Starters before substitutes, then by shirt number, then by name — a team sheet order. The rater
 * himself stays in place rather than being pulled to the front: being asked to rate yourself last,
 * after you have thought about everybody else, gives a more honest number than being asked first.
 */
function compareTargets(a: RatingTarget, b: RatingTarget): number {
  const roleRank = (role: SquadRole) => (role === "starter" ? 0 : 1);
  return (
    roleRank(a.squadRole) - roleRank(b.squadRole) ||
    (a.jerseyNumber ?? 100) - (b.jerseyNumber ?? 100) ||
    a.displayName.localeCompare(b.displayName, "fr")
  );
}

/* -------------------------------------------------------------------------- */
/* The results — behind the gate                                              */
/* -------------------------------------------------------------------------- */

export type RatingReceived = {
  raterMemberId: string;
  raterName: string;
  score: number;
  comment: string | null;
  /** The player rated himself. */
  isSelf: boolean;
  /** The viewer wrote this one. */
  isViewer: boolean;
};

export type RatedPlayer = {
  memberId: string;
  displayName: string;
  jerseyNumber: number | null;
  squadRole: SquadRole | null;
  count: number;
  average: number | null;
  /** « 7,3 » or « — ». */
  averageLabel: string;
  selfScore: number | null;
  /** This row is about the viewer, who must not be spoken of in the third person on it. */
  isViewer: boolean;
  /** Every note received, best first. Author names are visible to everyone (decision 007). */
  received: RatingReceived[];
};

export type ManOfTheMatchView = {
  /** More than one name when the averages tie. */
  members: { memberId: string; displayName: string; jerseyNumber: number | null }[];
  averageLabel: string;
  count: number;
  tied: boolean;
};

export type RatingResultsView =
  | {
      visible: true;
      reason: Extract<RatingVisibilityReason, "complete" | "not-a-rater">;
      players: RatedPlayer[];
      manOfTheMatch: ManOfTheMatchView | null;
      /** Notes written for this match. */
      ratingCount: number;
      /** How many players took part, out of how many could. */
      raterCount: number;
      raterTotal: number;
      progress: RatingProgress;
    }
  | {
      visible: false;
      reason: Extract<RatingVisibilityReason, "incomplete">;
      /** How far the viewer has to go. No score of anybody else's is in here. */
      progress: RatingProgress;
    };

/**
 * The ratings of a match, **gated**.
 *
 * `canSubmit` is the answer from `can(actor, "rating:submit", …)` — the permission check stays in
 * `lib/auth/can.ts` (invariant 4) and this query only combines it with the match sheet. A viewer who
 * may rate and has not finished gets the `visible: false` branch, and the `select` that would have
 * read his teammates' notes is never issued.
 */
export async function getRatingResults(input: {
  teamId: string;
  matchId: string;
  membershipId: string | null;
  /** Whether `can()` allows this actor to submit ratings in this team. */
  canSubmit: boolean;
}): Promise<RatingResultsView | null> {
  const match = await getMatch(input.teamId, input.matchId);
  if (!match) return null;

  const sheet = await getMatchSheet(match.id);
  const requiredIds = rateableMemberIds(sheet);
  const mayRate = input.canSubmit && isOnRateableSheet(sheet, input.membershipId);

  // Only the viewer's own rows, and only to measure his progress.
  const mine = mayRate && input.membershipId ? await getMyRatings(match.id, input.membershipId) : [];
  const progress = ratingProgress({
    requiredIds,
    submittedIds: mine.map((row) => row.ratedMemberId),
  });

  const visibility = ratingVisibility({ mayRate, progress });
  if (!visibility.visible) {
    // Hard stop. Nothing below this line runs, so nothing below this line can leak.
    return { visible: false, reason: "incomplete", progress };
  }

  const [rows, directory] = await Promise.all([
    db
      .select({
        raterMemberId: ratings.raterMemberId,
        ratedMemberId: ratings.ratedMemberId,
        score: ratings.score,
        comment: ratings.comment,
      })
      .from(ratings)
      .where(eq(ratings.matchId, match.id)),
    getTeamDirectory(match.teamId),
  ]);

  const byMembership = new Map(directory.map((member) => [member.membershipId, member]));
  const nameOf = (memberId: string) =>
    byMembership.get(memberId)?.displayName ?? "Joueur inconnu";
  const roleOf = new Map(sheet.map((entry) => [entry.teamMemberId, entry.role]));

  const aggregate = aggregateRatings(rows as RatingRecord[], { members: requiredIds });

  const receivedByMember = new Map<string, RatingReceived[]>();
  for (const row of rows) {
    const list = receivedByMember.get(row.ratedMemberId) ?? [];
    list.push({
      raterMemberId: row.raterMemberId,
      raterName: nameOf(row.raterMemberId),
      score: row.score,
      comment: row.comment,
      isSelf: row.raterMemberId === row.ratedMemberId,
      isViewer: row.raterMemberId === input.membershipId,
    });
    receivedByMember.set(row.ratedMemberId, list);
  }

  const players: RatedPlayer[] = aggregate.players.map((player) => ({
    memberId: player.memberId,
    displayName: nameOf(player.memberId),
    jerseyNumber: byMembership.get(player.memberId)?.jerseyNumber ?? null,
    squadRole: roleOf.get(player.memberId) ?? null,
    count: player.count,
    average: player.average,
    averageLabel: player.averageLabel,
    selfScore: player.selfScore,
    isViewer: player.memberId === input.membershipId,
    received: (receivedByMember.get(player.memberId) ?? []).sort(
      (a, b) => b.score - a.score || a.raterName.localeCompare(b.raterName, "fr"),
    ),
  }));

  return {
    visible: true,
    reason: visibility.reason === "complete" ? "complete" : "not-a-rater",
    players,
    manOfTheMatch: toManOfTheMatchView(manOfTheMatch(aggregate), nameOf, byMembership),
    ratingCount: aggregate.ratingCount,
    // Raters who are on the sheet: a note from somebody since removed does not count as a taker.
    raterCount: aggregate.raterIds.filter((id) => requiredIds.includes(id)).length,
    raterTotal: requiredIds.length,
    progress,
  };
}

function toManOfTheMatchView(
  motm: ManOfTheMatch | null,
  nameOf: (memberId: string) => string,
  byMembership: ReadonlyMap<string, DirectoryMember>,
): ManOfTheMatchView | null {
  if (!motm) return null;
  return {
    members: motm.members.map((player) => ({
      memberId: player.memberId,
      displayName: nameOf(player.memberId),
      jerseyNumber: byMembership.get(player.memberId)?.jerseyNumber ?? null,
    })),
    averageLabel: motm.averageLabel,
    count: motm.members[0]?.count ?? 0,
    tied: motm.tied,
  };
}

/* -------------------------------------------------------------------------- */
/* The recap                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Reduce a match: the log, the compositions and the slot catalogue in, `MatchState` out.
 *
 * `reduceMatch` is the only thing in the repository that computes match state (invariant 2), so this
 * is a loader and nothing more. `nowMs` is passed explicitly because the reducer is pure and refuses
 * to call `Date.now()` itself.
 */
export async function loadMatchState(match: MatchRow, nowMs = Date.now()): Promise<MatchState> {
  const [events, plannedLineups, slots, squad] = await Promise.all([
    loadEvents(match.id),
    loadLineups(match.id),
    loadSlotCatalogue(match.teamId),
    getMatchSheet(match.id),
  ]);

  return reduceMatch(events, plannedLineups, {
    periodsCount: match.periodsCount,
    periodMinutes: match.periodMinutes,
    slots,
    squad,
    nowMs,
  });
}

async function loadEvents(matchId: string): Promise<MatchEventRecord[]> {
  return db
    .select({
      id: matchEvents.id,
      clientEventId: matchEvents.clientEventId,
      type: matchEvents.type,
      period: matchEvents.period,
      minute: matchEvents.minute,
      clockMs: matchEvents.clockMs,
      occurredAt: matchEvents.occurredAt,
      payload: matchEvents.payload,
      voidsEventId: matchEvents.voidsEventId,
      seq: matchEvents.seq,
    })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.seq));
}

async function loadLineups(matchId: string): Promise<PlannedLineup[]> {
  const rows = await db
    .select({
      id: lineups.id,
      fromMinute: lineups.fromMinute,
      isInitial: lineups.isInitial,
      appliedEventId: lineups.appliedEventId,
      formationId: lineups.formationId,
    })
    .from(lineups)
    .where(eq(lineups.matchId, matchId))
    .orderBy(asc(lineups.fromMinute));

  if (rows.length === 0) return [];

  const slotRows = await db
    .select({
      lineupId: lineupSlots.lineupId,
      slotId: lineupSlots.formationSlotId,
      memberId: lineupSlots.teamMemberId,
    })
    .from(lineupSlots)
    .where(
      inArray(
        lineupSlots.lineupId,
        rows.map((row) => row.id),
      ),
    );

  const byLineup = new Map<string, { slotId: string; memberId: string }[]>();
  for (const row of slotRows) {
    const list = byLineup.get(row.lineupId) ?? [];
    list.push({ slotId: row.slotId, memberId: row.memberId });
    byLineup.set(row.lineupId, list);
  }

  return rows.map((row) => ({ ...row, slots: byLineup.get(row.id) ?? [] }));
}

/**
 * Every slot the match could refer to: the built-in formations plus this team's own.
 *
 * A few dozen rows. Fetching them all beats resolving which formations the log happens to mention —
 * a `POSITION_CHANGE` can move a player into a slot of a formation no composition ever used.
 */
async function loadSlotCatalogue(teamId: string): Promise<SlotInfo[]> {
  return db
    .select({
      id: formationSlots.id,
      positionCode: formationSlots.positionCode,
      sort: formationSlots.sort,
    })
    .from(formationSlots)
    .innerJoin(formations, eq(formations.id, formationSlots.formationId))
    .where(or(isNull(formations.teamId), eq(formations.teamId, teamId)))
    .orderBy(asc(formationSlots.sort));
}

export type MatchRecapView = {
  match: MatchRow;
  recap: MatchRecap;
  /** The sheet, for the « qui était là » line — supporters included. */
  sheet: SheetEntry[];
};

/** The whole recap: score, scorers, timeline, minutes played. Null when the match is not ours. */
export async function getMatchRecap(input: {
  teamId: string;
  matchId: string;
  nowMs?: number;
}): Promise<MatchRecapView | null> {
  const match = await getMatch(input.teamId, input.matchId);
  if (!match) return null;

  const [state, directory, sheet] = await Promise.all([
    loadMatchState(match, input.nowMs ?? Date.now()),
    getTeamDirectory(match.teamId),
    getMatchSheet(match.id),
  ]);

  const members: RecapMember[] = directory.map((member) => ({
    memberId: member.membershipId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
  }));

  return { match, recap: buildRecap(state, members), sheet };
}
