import "server-only";

/**
 * Reads for the rating flow and the post-match recap.
 *
 * Two jobs, and the first one is a security boundary:
 *
 * 1. **Publication and the coach's privilege are enforced here, not in the UI.** Decision 137 has two
 *    rules to keep, and both are kept by *not selecting* rather than by not rendering: a match whose
 *    means the coach has not shown never has its scores read at all, and a reader who is not the coach
 *    never receives an individual note or the count behind a mean — `getRatingResults` decides both
 *    **before** it issues the select. There is nothing for a crafted request, a React DevTools
 *    inspection or a leaked RSC payload to reveal, because the numbers never leave Postgres.
 *
 *    This replaces decision 007's per-viewer gate, which asked whether *this reader* had earned the
 *    notes. The question has no viewer in it any more; what has a viewer in it is whether he is the
 *    coach, and that is one `can()` answer passed in rather than a rule restated here.
 *
 *    Decision 139 made the first of the two a question about one column the coach writes, and made it
 *    **reversible**: hiding a match again is the same early return doing the same job, so a figure the
 *    squad read last week simply stops being selected. Nothing is cached per match that would survive
 *    that, which is the whole reason the switch can go both ways at all.
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

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import {
  formationSlots,
  formations,
  lineupSlots,
  lineups,
  matchEvents,
  matchSquad,
  ratings,
  teamMembers,
  users,
} from "@/db/schema";
import type { SquadRole } from "@/db/schema";
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
  eligibleRaterIds,
  hasPlayed,
  mayRateMatch,
  playedMemberIds,
  ratingProgress,
  ratingTargetsFor,
  tallyOf,
  type PlayedEntry,
  type RaterTally,
  type RatingProgress,
} from "./progress";
import { meansAreVisible } from "./published";
import { buildRecap, type MatchRecap, type RecapMember } from "./recap";

export type { RaterTally, SilentMember } from "./progress";

/* -------------------------------------------------------------------------- */
/* Small reads                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A row of `match_squad`: who the coach named, and as what.
 *
 * The sheet decides who **rates** (decision 159: starters, substitutes, supporters — `mayRateMatch`),
 * and the log decides who is **rated** (decision 137). Read by the recap for « qui était là », by the
 * reducer for the squad, and by every rating read and write for the vote.
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
 * Are this match's means out? One column, parsed once.
 *
 * This used to be `publicationOf`, which took the match, every player's minutes and the whole
 * rater→rated graph, because publication had a derived clause: every expected set in. Decision 139
 * deleted it, so there is nothing to derive and nothing for two call sites to spell differently —
 * which is what the old helper existed to prevent. `getRatingWindow` went the same way, with the
 * module behind it: nothing closes the notation any more, so a « window » had one state.
 */
function meansOut(match: { ratingsPublishedAt: string | null }): boolean {
  return meansAreVisible(
    match.ratingsPublishedAt === null ? null : Date.parse(match.ratingsPublishedAt),
  );
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
 * Who has sent notes for this match — **ids only, no score and no victim**.
 *
 * Read for the coach alone, and only to tell him how many people have spoken before he decides to show
 * the means. It used to be `getRatingPairs`, the whole rater→rated graph, because publication depended
 * on every expected set being in; decision 139 made publication his column, so nobody needs the graph
 * and this is a `selectDistinct` of one column. Who rated *whom* is still in the table and still the
 * coach's to read — but only once the means are out, down in `getRatingResults`.
 */
async function getRaterIds(matchId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ raterMemberId: ratings.raterMemberId })
    .from(ratings)
    .where(eq(ratings.matchId, matchId));
  return rows.map((row) => row.raterMemberId);
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

export type NotationView = {
  match: MatchRow;
  /**
   * The match has been played, so there is something to rate. `status === "finished"`.
   *
   * The only thing left of the rating window (decision 139): nothing shuts afterwards, so « pas encore
   * joué » is the one state in which a member is turned away, and it is not about him.
   */
  finished: boolean;
  /**
   * The means are out. **Not a lock** — he may still rate (decision 139) — but the screen has to say
   * it, because his notes will move a figure the squad has already read and he is about to write them
   * having read it.
   */
  meansVisible: boolean;
  /**
   * He may rate this match: he was on its sheet as a starter, a substitute or a supporter, or he
   * played in it (`mayRateMatch`, decision 159). False for a member who was not selected — and for
   * everybody on a match with no sheet nobody played in. When false, `targets` is empty and `progress`
   * is the empty set: the screen explains instead of offering a form.
   */
  eligible: boolean;
  /** This match has no sheet at all, so the refusal is about the match rather than about him. */
  sheetEmpty: boolean;
  /**
   * He played, which does not decide whether he is asked (the sheet does) and still decides two
   * things: he is in the list of rated men, so his own list is one name shorter, and the screen greets
   * a man who was on the pitch differently from one who watched.
   */
  played: boolean;
  /** How he was listed, or null if he was not on the sheet at all. */
  sheetRole: SquadRole | null;
  /** Everybody he may note: who played, minus himself. Starters first, then by shirt. Empty if he may not rate. */
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
  const [sheet, directory, state] = await Promise.all([
    getMatchSheet(match.id),
    getTeamDirectory(match.teamId),
    loadMatchState(match, nowMs),
  ]);

  /*
   * Minutes come from the log or from nowhere, and they are the whole of who is rated now.
   * `state.started` is false when no `KICKOFF` was ever recorded — a match nobody opened game mode
   * for and nobody backfilled — and reading every player as 0’ would not mean « nobody came on » but
   * « we do not know » (decision 013). A retro entry writes a `KICKOFF` per period
   * (`lib/retro/log.ts`), so backfilled matches are covered.
   */
  const played = playedFrom(state);
  const minutesOf = new Map(played.map((entry) => [entry.teamMemberId, entry.minutes]));

  const viewerPlayed = hasPlayed(played, input.membershipId);
  // Decision 159: no vote, no set. The same predicate `submitRatings` refuses with.
  const eligible = mayRateMatch(sheet, played, input.membershipId);
  const requiredIds = eligible ? ratingTargetsFor(played, input.membershipId) : [];

  /*
   * His own notes, and nobody else's — gated on his having a vote. A supporter has one and may already
   * have sent part of his set.
   */
  const mine = eligible && input.membershipId ? await getMyRatings(match.id, input.membershipId) : [];
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
    finished: match.status === "finished",
    meansVisible: meansOut(match),
    eligible,
    sheetEmpty: sheet.length === 0,
    played: viewerPlayed,
    sheetRole: input.membershipId ? roleOf.get(input.membershipId) ?? null : null,
    targets,
    progress: ratingProgress({
      requiredIds,
      submittedIds: mine.map((row) => row.ratedMemberId),
    }),
  };
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

type RatingResultsCommon = {
  /** The viewer's own set — what the duty card and the « il te reste 3 notes » line read. */
  progress: RatingProgress;
  /** `can(actor, "rating:readNotes", …)`: he reads the individual notes and the counts. */
  canSeeNotes: boolean;
  /** Who has rated and who has not — **coach only**, null for every other reader. */
  tally: RaterTally | null;
  /** The means are hidden and he may show them: `rating:publish`. */
  canPublish: boolean;
  /** The means are out and he may hide them again — the same permission, the other way. */
  canHide: boolean;
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
    });

/**
 * The ratings of a match: the means when they are published, the notes when the reader is the coach.
 *
 * Two boundaries, both enforced by what is *selected*:
 *
 * - **hidden means nothing is read.** The `select` that would fetch the scores is below the early
 *   return, so a hidden match's figures never leave Postgres — for anybody, the coach included. He has
 *   a button to show them, which is a different thing from reading them early. Under decision 139 that
 *   button is the *only* thing that opens this, and it goes both ways: hiding a match again puts every
 *   figure back behind this same early return;
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
  /** `can(actor, "rating:publish", …)` — the coach, who shows the means and may hide them again. */
  canPublish: boolean;
  nowMs?: number;
}): Promise<RatingResultsView | null> {
  const match = await getMatch(input.teamId, input.matchId);
  if (!match) return null;

  const published = meansOut(match);
  const nowMs = input.nowMs ?? Date.now();
  const [sheet, directory, state, mine, raterIds] = await Promise.all([
    getMatchSheet(match.id),
    getTeamDirectory(match.teamId),
    loadMatchState(match, nowMs),
    // His own notes, for his own progress line. Reading them is not reading anybody else's.
    input.membershipId ? getMyRatings(match.id, input.membershipId) : [],
    // Who has spoken, for the tally — and only for the one reader entitled to it.
    input.canSeeNotes ? getRaterIds(match.id) : [],
  ]);

  const played = playedFrom(state);
  const ratedIds = playedMemberIds(played);

  const byMembership = new Map(directory.map((member) => [member.membershipId, member]));
  const nameOf = (memberId: string) =>
    byMembership.get(memberId)?.displayName ?? "Joueur inconnu";
  const roleOf = new Map(sheet.map((entry) => [entry.teamMemberId, entry.role]));

  // `can()` is the permission and the sheet is the data (decision 159): both must say yes.
  const mayRate = input.canSubmit && mayRateMatch(sheet, played, input.membershipId);
  const progress = ratingProgress({
    requiredIds: mayRate ? ratingTargetsFor(played, input.membershipId) : [],
    submittedIds: mine.map((row) => row.ratedMemberId),
  });

  const common: RatingResultsCommon = {
    progress,
    canSeeNotes: input.canSeeNotes,
    tally: input.canSeeNotes
      ? tallyOf(directory, eligibleRaterIds(sheet, played), raterIds)
      : null,
    // The switch, and which way it points. `rating:publish` answers both: it is one permission over one
    // column, and splitting it in two would let the two drift (`lib/auth/can.ts`).
    canPublish: input.canPublish && !published,
    canHide: input.canPublish && published,
  };

  if (!published) {
    // Hard stop. Nothing below this line runs, so nothing below this line can leak.
    return { ...common, published: false };
  }

  const rows = await db
    .select({
      raterMemberId: ratings.raterMemberId,
      ratedMemberId: ratings.ratedMemberId,
      score: ratings.score,
    })
    .from(ratings)
    .where(eq(ratings.matchId, match.id));

  const aggregate = aggregateRatings(rows as RatingRecord[], { members: ratedIds });

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
