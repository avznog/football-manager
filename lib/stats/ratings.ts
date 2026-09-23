/**
 * Who may see which ratings — the season-long reading of decision 007.
 *
 * Decision 007 gates the *match* screen: « a player cannot see anyone else's ratings until they
 * have submitted their own ». A season average would be a hole straight through that gate: publish
 * the average of a match to somebody who has not rated it and they have read the ratings, just with
 * one number instead of thirteen. So the same gate applies here, match by match (decision 021).
 *
 * **The rule itself lives in `lib/rating/progress.ts`** and this module does not restate it. It only
 * applies it to many matches at once, for one viewer:
 *
 * - who may rate a match, and whom they owe a note, comes from `rateableMemberIds`;
 * - whether a set is complete comes from `ratingProgress`;
 * - whether that unlocks the reading comes from `ratingVisibility`.
 *
 * That indirection is the point. « Has submitted » is **a complete set**, not "has submitted
 * something": decision 023 deliberately keeps a partial set, so a player who rated four teammates
 * in the car has rows in the table and has still earned nothing. Two implementations of this rule
 * would drift the day one of them was relaxed, and the one that drifted would leak the notes.
 *
 * Pure. The query layer decides what to fetch from the answer (`queries.ts` selects no score for a
 * gated match at all), and the screen says how many matches are still hidden so that a missing
 * average never reads as a bug.
 */

import type { SquadRole } from "@/db/schema";
import {
  type SheetEntry,
  isOnRateableSheet,
  rateableMemberIds,
  ratingProgress,
  ratingVisibility as gateFor,
} from "@/lib/rating/progress";

/**
 * Who rated whom, in which match — **without the scores**. This is all the gate needs, and asking
 * for no more than it needs is what lets `queries.ts` leave a gated match's scores in the database.
 */
export type RatingAuthorRow = {
  matchId: string;
  raterMemberId: string;
  ratedMemberId: string;
};

/** A score the viewer has earned the right to read. */
export type VisibleRatingRow = {
  matchId: string;
  ratedMemberId: string;
  score: number;
};

export type SquadRoleRow = {
  matchId: string;
  teamMemberId: string;
  role: SquadRole;
};

export type RatingVisibility = {
  /** Match ids whose ratings this viewer may read. */
  visibleMatchIds: string[];
  /** Matches that hold ratings the viewer has not earned the right to see yet. */
  hiddenMatchIds: string[];
  /**
   * Per member, how many hidden matches hold a note **about them**.
   *
   * `hiddenMatchIds.length` is a fact about the season and about the reader; this is the fact a
   * profile needs. A player whose average is short of two matches is not the same reader as one whose
   * average is short of none, and until this existed the profile card quoted the season number under
   * a single player's average — a match that never held a note about him included (decision NNN).
   *
   * Computed from the author rows, which carry `ratedMemberId` and no score: knowing *that* somebody
   * was judged is not reading the judgement, so this costs no extra query and leaks nothing.
   */
  hiddenRatedCounts: Record<string, number>;
};

export function ratingVisibility(input: {
  /** The matches under consideration — already filtered by competition. */
  matchIds: readonly string[];
  squad: readonly SquadRoleRow[];
  /** Who rated whom, scores excluded. */
  authors: readonly RatingAuthorRow[];
  /** The viewer's `team_members.id`, or null for a super admin who is not a member. */
  viewerMemberId: string | null;
}): RatingVisibility {
  const wanted = new Set(input.matchIds);

  const sheets = new Map<string, SheetEntry[]>();
  for (const row of input.squad) {
    if (!wanted.has(row.matchId)) continue;
    const entry: SheetEntry = { teamMemberId: row.teamMemberId, role: row.role };
    const sheet = sheets.get(row.matchId);
    if (sheet) sheet.push(entry);
    else sheets.set(row.matchId, [entry]);
  }

  const hasRatings = new Set<string>();
  const ratedByViewer = new Map<string, string[]>();
  /** matchId → who was judged in it, deduplicated: thirteen notes about Ali are one match. */
  const judgedIn = new Map<string, Set<string>>();
  for (const author of input.authors) {
    if (!wanted.has(author.matchId)) continue;
    hasRatings.add(author.matchId);
    const judged = judgedIn.get(author.matchId);
    if (judged) judged.add(author.ratedMemberId);
    else judgedIn.set(author.matchId, new Set([author.ratedMemberId]));
    if (input.viewerMemberId === null || author.raterMemberId !== input.viewerMemberId) continue;
    const submitted = ratedByViewer.get(author.matchId);
    if (submitted) submitted.push(author.ratedMemberId);
    else ratedByViewer.set(author.matchId, [author.ratedMemberId]);
  }

  const visibleMatchIds: string[] = [];
  const hiddenMatchIds: string[] = [];
  const hiddenRatedCounts: Record<string, number> = {};

  for (const matchId of input.matchIds) {
    const sheet = sheets.get(matchId) ?? [];
    const { visible } = gateFor({
      mayRate: isOnRateableSheet(sheet, input.viewerMemberId),
      progress: ratingProgress({
        requiredIds: rateableMemberIds(sheet),
        submittedIds: ratedByViewer.get(matchId) ?? [],
      }),
    });

    if (visible) {
      visibleMatchIds.push(matchId);
      continue;
    }
    // Only worth telling the viewer about a match that actually holds ratings.
    if (!hasRatings.has(matchId)) continue;
    hiddenMatchIds.push(matchId);
    for (const memberId of judgedIn.get(matchId) ?? []) {
      hiddenRatedCounts[memberId] = (hiddenRatedCounts[memberId] ?? 0) + 1;
    }
  }

  return { visibleMatchIds, hiddenMatchIds, hiddenRatedCounts };
}
