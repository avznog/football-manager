import "server-only";

/**
 * Reads for the rating flow and the post-match recap.
 *
 * Two jobs, and the first one is a security boundary:
 *
 * 1. **Publication and the coach's privilege are enforced here, not in the UI.** Decision 137 has two
 *    rules to keep, and both are kept by *not selecting* rather than by not rendering: an unpublished
 *    match's scores are never read at all, and a reader who is not the coach never receives an
 *    individual note or the count behind a mean — `getRatingResults` decides both **before** it
 *    issues the select. There is nothing for a crafted request, a React DevTools inspection or a
 *    leaked RSC payload to reveal, because the numbers never leave Postgres.
 *
 *    This replaces decision 007's per-viewer gate, which asked whether *this reader* had earned the
 *    notes. The question has no viewer in it any more; what has a viewer in it is whether he is the
 *    coach, and that is one `can()` answer passed in rather than a rule restated here.
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
  MIN_NOTES_FOR_MEAN,
  type ManOfTheMatch,
  type RatingRecord,
} from "./aggregate";
import {
  hasPlayed,
  playedMemberIds,
  ratingProgress,
  ratingTargetsFor,
  type PlayedEntry,
  type RatingProgress,
} from "./progress";
import {
  ratingsPublication,
  type RatingsPublicationReason,
} from "./published";
import { buildRecap, type MatchRecap, type RecapMember } from "./recap";
import { ratingWindow, type RatingWindow } from "./window";

/* -------------------------------------------------------------------------- */
/* Small reads                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A row of `match_squad`: who the coach named, and as what.
 *
 * It used to be `lib/rating/progress.ts`'s type, because the sheet decided who rated. It no longer
 * does — the log does (decision 137) — so the sheet is back to being what it always was: the
 * selection, read by the recap for « qui était là » and by the reducer for the squad.
 */
export type SheetEntry = {
  teamMemberId: string;
  role: SquadRole;
};

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
    })
    .from(ratings)
    .where(and(eq(ratings.matchId, matchId), eq(ratings.raterMemberId, raterMemberId)));
}

/**
 * Who rated whom, **with no scores**: the pairs, and only the pairs.
 *
 * This is how « has every set come in » is answered for a reader who is not entitled to a single
 * note. Selecting the pairs and not the figures is the point — a count of rows per rater is all the
 * publication predicate needs, and anything more would be a leak dressed as a convenience.
 */
async function getRatingPairs(matchId: string) {
  return db
    .select({
      raterMemberId: ratings.raterMemberId,
      ratedMemberId: ratings.ratedMemberId,
    })
    .from(ratings)
    .where(eq(ratings.matchId, matchId));
}

/**
 * Who played, from the log, for one match.
 *
 * Takes the reduced state rather than reading `match_player_stats`, because the recap and the
 * notation screen both reduce the match anyway (invariant 2: the reducer is the only thing that
 * computes match state) and the frozen table is a cache of the same answer. `state.started` false
 * means no `KICKOFF` was ever recorded, so there are no minutes to read and nobody played — not «
 * everybody played zero » (decision 013).
 */
function playedFrom(state: MatchState): PlayedEntry[] {
  if (!state.started) return [];
  return state.players.map((player) => ({
    teamMemberId: player.memberId,
    minutes: player.minutes,
  }));
}

/**
 * Who played, for a caller with a match row and no reduced state — `submitRatings`, which has to
 * re-derive the legal targets rather than believe the form.
 */
export async function playedEntriesOf(match: MatchRow, nowMs = Date.now()): Promise<PlayedEntry[]> {
  return playedFrom(await loadMatchState(match, nowMs));
}

/* -------------------------------------------------------------------------- */
/* The rating flow                                                            */
/* -------------------------------------------------------------------------- */

export type RatingTarget = {
  membershipId: string;
  displayName: string;
  jerseyNumber: number | null;
  /** How he was named, or null for somebody the log has playing who was never on the sheet. */
  squadRole: SquadRole | null;
  /**
   * Whole minutes he played, from the log. Always at least one: a member with no minutes is not a
   * target at all (decision 137), so there is no « non entré » row left to describe.
   */
  minutes: number;
  /** What this rater already put, if anything. A note, once given, is final. */
  myScore: number | null;
};

/** Why the viewer is not being asked for notes. `null` when he is. */
export type NotationBlockedReason =
  /** He played, and the window is shut or not open yet. */
  | "window"
  /** He was named but never came on, so he has no opinion to be collected. */
  | "did-not-play"
  /** He was not in this match at all: a supporter, a non-playing coach, somebody looking in. */
  | "not-in-match";

export type NotationView = {
  match: MatchRow;
  window: RatingWindow;
  /** He played, so he rates — `minutes > 0` in the log, not a role on the sheet. */
  played: boolean;
  /**
   * How the viewer was listed on the sheet, or null if he was not on it at all. `played` answers
   * « is he asked »; this answers « why not », and they are different questions: a supporter was on
   * the sheet and rates nobody (decision 039), so telling him he was not on it is a lie.
   */
  sheetRole: SquadRole | null;
  /** Why he is being shown a read-only screen, or null when he is being asked for notes. */
  blocked: NotationBlockedReason | null;
  /** Everybody he owes a note: who played, minus himself. Starters first, then by shirt. */
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
   * Minutes come from the log or from nowhere, and they are the whole of who rates whom now.
   * `state.started` is false when no `KICKOFF` was ever recorded — a match nobody opened game mode
   * for and nobody backfilled — and reading every player as 0’ would not mean « nobody came on » but
   * « we do not know » (decision 013). A retro entry writes a `KICKOFF` per period
   * (`lib/retro/log.ts`), so backfilled matches are covered.
   */
  const played = playedFrom(state);
  const minutesOf = new Map(played.map((entry) => [entry.teamMemberId, entry.minutes]));

  const viewerPlayed = hasPlayed(played, input.membershipId);
  const requiredIds = ratingTargetsFor(played, input.membershipId);

  const mine =
    viewerPlayed && input.membershipId ? await getMyRatings(match.id, input.membershipId) : [];
  const myScoreOf = new Map(mine.map((row) => [row.ratedMemberId, row.score]));

  const byMembership = new Map(directory.map((member) => [member.membershipId, member]));
  const roleOf = new Map(sheet.map((entry) => [entry.teamMemberId, entry.role]));

  const targets: RatingTarget[] = requiredIds
    .map((membershipId) => {
      const member = byMembership.get(membershipId);
      return {
        membershipId,
        displayName: member?.displayName ?? "Joueur inconnu",
        jerseyNumber: member?.jerseyNumber ?? null,
        squadRole: roleOf.get(membershipId) ?? null,
        minutes: minutesOf.get(membershipId) ?? 0,
        myScore: myScoreOf.get(membershipId) ?? null,
      };
    })
    .sort(compareTargets);

  return {
    match,
    window,
    played: viewerPlayed,
    sheetRole: input.membershipId ? roleOf.get(input.membershipId) ?? null : null,
    blocked: blockedReason({ viewerPlayed, onSheet: roleOf.has(input.membershipId ?? ""), window }),
    targets,
    progress: ratingProgress({
      requiredIds,
      submittedIds: mine.map((row) => row.ratedMemberId),
    }),
  };
}

/**
 * Why the screen is read-only, in the order the reader needs told.
 *
 * « Tu n'as pas joué ce match » comes before « les notes sont fermées », because a man who never came
 * on is not waiting for a window to open — telling him about a deadline would have him come back.
 */
function blockedReason(input: {
  viewerPlayed: boolean;
  onSheet: boolean;
  window: RatingWindow;
}): NotationBlockedReason | null {
  if (!input.viewerPlayed) return input.onSheet ? "did-not-play" : "not-in-match";
  if (!input.window.isOpen) return "window";
  return null;
}

/**
 * Starters before substitutes, then by shirt number, then by name — a team sheet order.
 *
 * Somebody the log has playing but the sheet never named sorts with the substitutes rather than
 * first: it happens when a late arrival is put on without the sheet being corrected, and he came off
 * the bench whatever the sheet forgot to say.
 */
function compareTargets(a: RatingTarget, b: RatingTarget): number {
  const roleRank = (role: SquadRole | null) => (role === "starter" ? 0 : 1);
  return (
    roleRank(a.squadRole) - roleRank(b.squadRole) ||
    (a.jerseyNumber ?? 100) - (b.jerseyNumber ?? 100) ||
    a.displayName.localeCompare(b.displayName, "fr")
  );
}

/* -------------------------------------------------------------------------- */
/* The results — published or not, and the coach's own view                   */
/* -------------------------------------------------------------------------- */

export type RatingReceived = {
  raterMemberId: string;
  raterName: string;
  score: number;
  /** The viewer wrote this one. The coach plays too, so his own notes are in the list. */
  isViewer: boolean;
};

export type RatedPlayer = {
  memberId: string;
  displayName: string;
  jerseyNumber: number | null;
  squadRole: SquadRole | null;
  /**
   * The mean of the notes the others gave him — **null below `MIN_NOTES_FOR_MEAN`**, for every
   * reader including the coach. The floor is about the figure, not about who is reading it; the coach
   * is not deprived, because he has the notes themselves.
   */
  average: number | null;
  /** « 7,3 » or « — ». */
  averageLabel: string;
  /**
   * How many notes the mean rests on — **coach only**, `null` for every other reader.
   *
   * This is the answer to the question the owner was asked: the coach reads « 7,5 (5 notes) », a
   * player reads « 7,5 ». On a player's own screen the count is an invitation to work out who did
   * not rate him, and in a squad of a dozen that arithmetic is easy and poisonous.
   */
  count: number | null;
  /** This row is about the viewer, who must not be spoken of in the third person on it. */
  isViewer: boolean;
  /** Every note received, best first — **coach only** (decision 137). Empty for anybody else. */
  received: RatingReceived[];
};

export type ManOfTheMatchView = {
  /** More than one name when the averages tie. */
  members: { memberId: string; displayName: string; jerseyNumber: number | null }[];
  averageLabel: string;
  tied: boolean;
};

/** What the coach is told about who has not finished. Empty for every other reader. */
export type OwingRater = {
  memberId: string;
  displayName: string;
};

type RatingResultsCommon = {
  reason: RatingsPublicationReason;
  /** The viewer's own set — what the duty card and the « il te reste 3 notes » line read. */
  progress: RatingProgress;
  /** `can(actor, "rating:readNotes", …)`: he reads the individual notes and the counts. */
  canSeeNotes: boolean;
  /** Who still owes at least one note, by name — **coach only**. */
  owing: OwingRater[];
  /** Everybody expected to rate, so « 5 sur 7 ont noté » can be said — **coach only**, else 0. */
  raterTotal: number;
  /** He may release the means now: `rating:publish`, not yet published, notes still owed. */
  canPublish: boolean;
};

export type RatingResultsView =
  | (RatingResultsCommon & {
      published: true;
      players: RatedPlayer[];
      manOfTheMatch: ManOfTheMatchView | null;
      /** Notes written for this match — **coach only**, else 0. */
      ratingCount: number;
    })
  | (RatingResultsCommon & {
      published: false;
      reason: "pending";
    });

/**
 * The ratings of a match: the means when they are published, the notes when the reader is the coach.
 *
 * Two boundaries, both enforced by what is *selected*:
 *
 * - **unpublished means nothing is read.** The `select` that would fetch the scores is below the
 *   early return, so an unpublished match's figures never leave Postgres — for anybody, the coach
 *   included. He has a button to publish them, which is a different thing from reading them early;
 * - **not the coach means no note and no count.** The scores are fetched (they are needed for the
 *   means) but `received` stays empty and `count` stays null for every other reader, so there is no
 *   RSC payload to inspect and no field to un-hide in DevTools.
 *
 * `canSubmit`, `canSeeNotes` and `canPublish` are answers from `can()` — the permission rules stay in
 * `lib/auth/can.ts` (invariant 4) and this query only acts on them.
 */
export async function getRatingResults(input: {
  teamId: string;
  matchId: string;
  membershipId: string | null;
  /** `can(actor, "rating:submit", …)`. */
  canSubmit: boolean;
  /** `can(actor, "rating:readNotes", …)` — the coach. */
  canSeeNotes: boolean;
  /** `can(actor, "rating:publish", …)` — the coach. */
  canPublish: boolean;
  nowMs?: number;
}): Promise<RatingResultsView | null> {
  const match = await getMatch(input.teamId, input.matchId);
  if (!match) return null;

  const nowMs = input.nowMs ?? Date.now();
  const [sheet, directory, window, state, pairs] = await Promise.all([
    getMatchSheet(match.id),
    getTeamDirectory(match.teamId),
    getRatingWindow(match, nowMs),
    loadMatchState(match, nowMs),
    getRatingPairs(match.id),
  ]);

  const played = playedFrom(state);
  const expectedRaterIds = playedMemberIds(played);

  // One rater's set is complete when he has a note on every other player who played.
  const submittedBy = new Map<string, Set<string>>();
  for (const pair of pairs) {
    const set = submittedBy.get(pair.raterMemberId) ?? new Set<string>();
    set.add(pair.ratedMemberId);
    submittedBy.set(pair.raterMemberId, set);
  }
  const completeRaterIds = expectedRaterIds.filter((raterId) =>
    ratingTargetsFor(played, raterId).every((target) => submittedBy.get(raterId)?.has(target)),
  );

  const publication = ratingsPublication({
    expectedRaterIds,
    completeRaterIds,
    publishedAtMs: match.ratingsPublishedAt === null ? null : Date.parse(match.ratingsPublishedAt),
    windowState: window.state,
  });

  const byMembership = new Map(directory.map((member) => [member.membershipId, member]));
  const nameOf = (memberId: string) =>
    byMembership.get(memberId)?.displayName ?? "Joueur inconnu";
  const roleOf = new Map(sheet.map((entry) => [entry.teamMemberId, entry.role]));

  const progress = ratingProgress({
    requiredIds: input.canSubmit ? ratingTargetsFor(played, input.membershipId) : [],
    submittedIds: input.membershipId ? [...(submittedBy.get(input.membershipId) ?? [])] : [],
  });

  const common: RatingResultsCommon = {
    reason: publication.reason,
    progress,
    canSeeNotes: input.canSeeNotes,
    owing: input.canSeeNotes
      ? publication.owingRaterIds.map((memberId) => ({ memberId, displayName: nameOf(memberId) }))
      : [],
    raterTotal: input.canSeeNotes ? expectedRaterIds.length : 0,
    // Nothing to publish once it is published, and nothing to release when nobody owes anything.
    canPublish:
      input.canPublish && match.ratingsPublishedAt === null && publication.owingRaterIds.length > 0,
  };

  if (!publication.published) {
    // Hard stop. Nothing below this line runs, so nothing below this line can leak.
    return { ...common, published: false, reason: "pending" };
  }

  const rows = await db
    .select({
      raterMemberId: ratings.raterMemberId,
      ratedMemberId: ratings.ratedMemberId,
      score: ratings.score,
    })
    .from(ratings)
    .where(eq(ratings.matchId, match.id));

  const aggregate = aggregateRatings(rows as RatingRecord[], { members: expectedRaterIds });

  const receivedByMember = new Map<string, RatingReceived[]>();
  if (input.canSeeNotes) {
    for (const row of rows) {
      const list = receivedByMember.get(row.ratedMemberId) ?? [];
      list.push({
        raterMemberId: row.raterMemberId,
        raterName: nameOf(row.raterMemberId),
        score: row.score,
        isViewer: row.raterMemberId === input.membershipId,
      });
      receivedByMember.set(row.ratedMemberId, list);
    }
  }

  const players: RatedPlayer[] = aggregate.players.map((player) => {
    const enough = player.count >= MIN_NOTES_FOR_MEAN;
    return {
      memberId: player.memberId,
      displayName: nameOf(player.memberId),
      jerseyNumber: byMembership.get(player.memberId)?.jerseyNumber ?? null,
      squadRole: roleOf.get(player.memberId) ?? null,
      average: enough ? player.average : null,
      averageLabel: enough ? player.averageLabel : "—",
      count: input.canSeeNotes ? player.count : null,
      isViewer: player.memberId === input.membershipId,
      received: (receivedByMember.get(player.memberId) ?? []).sort(
        (a, b) => b.score - a.score || a.raterName.localeCompare(b.raterName, "fr"),
      ),
    };
  });

  return {
    ...common,
    published: true,
    players,
    manOfTheMatch: toManOfTheMatchView(manOfTheMatch(aggregate), nameOf, byMembership),
    ratingCount: input.canSeeNotes ? aggregate.ratingCount : 0,
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
