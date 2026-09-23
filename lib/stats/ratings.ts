/**
 * Who may see which ratings — the season-long reading of decision 007.
 *
 * Decision 007 gates the *match* screen: « a player cannot see anyone else's ratings until they have
 * submitted their own », which stops anchoring and copying. A season average would be a hole
 * straight through that gate: publish the average of a match to somebody who has not rated it yet
 * and they have read the ratings, just with one number instead of thirteen.
 *
 * So the same gate applies here, per match:
 *
 * - a viewer who **could rate** the match (on the sheet as `starter` or `substitute`, which is the
 *   invariant `docs/DATA_MODEL.md` puts on `ratings`) sees it only once they have submitted;
 * - a viewer who **could not** rate it — a supporter, a non-playing coach, a super admin, somebody
 *   who joined the team afterwards — has nothing to submit and nothing to anchor on, so the match
 *   is visible to them. Gating them instead would hide the season from the coach for ever, which
 *   decision 007 never asked for.
 *
 * "Has submitted" is "has at least one rating for that match". M6 submits a player's whole set in
 * one action, so the two coincide — **that is a contract M6 must keep**: a flow that saves one card
 * at a time would let a player see the averages after rating a single teammate.
 *
 * Pure. The query layer fetches the rows, this decides, and the screen says how many matches are
 * still hidden so a missing average never reads as a bug.
 */

import type { SquadRole } from "@/db/schema";

export type RatingRowWithRater = {
  matchId: string;
  raterMemberId: string;
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
};

/** Only a member on the sheet as a starter or a substitute may rate (`docs/DATA_MODEL.md`). */
export function couldRate(role: SquadRole | undefined): boolean {
  return role === "starter" || role === "substitute";
}

export function ratingVisibility(input: {
  /** The matches under consideration — already filtered by competition. */
  matchIds: readonly string[];
  squad: readonly SquadRoleRow[];
  ratings: readonly RatingRowWithRater[];
  /** The viewer's `team_members.id`, or null for a super admin who is not a member. */
  viewerMemberId: string | null;
}): RatingVisibility {
  const wanted = new Set(input.matchIds);

  const roleOfViewer = new Map<string, SquadRole>();
  if (input.viewerMemberId !== null) {
    for (const row of input.squad) {
      if (row.teamMemberId === input.viewerMemberId && wanted.has(row.matchId)) {
        roleOfViewer.set(row.matchId, row.role);
      }
    }
  }

  const hasRatings = new Set<string>();
  const viewerHasRated = new Set<string>();
  for (const rating of input.ratings) {
    if (!wanted.has(rating.matchId)) continue;
    hasRatings.add(rating.matchId);
    if (input.viewerMemberId !== null && rating.raterMemberId === input.viewerMemberId) {
      viewerHasRated.add(rating.matchId);
    }
  }

  const visibleMatchIds: string[] = [];
  const hiddenMatchIds: string[] = [];

  for (const matchId of input.matchIds) {
    const gated = couldRate(roleOfViewer.get(matchId)) && !viewerHasRated.has(matchId);
    if (gated) {
      // Only worth telling the viewer about a match that actually holds ratings.
      if (hasRatings.has(matchId)) hiddenMatchIds.push(matchId);
      continue;
    }
    visibleMatchIds.push(matchId);
  }

  return { visibleMatchIds, hiddenMatchIds };
}

/** The rows the season aggregate may use, with the rater dropped: it needs only who was rated. */
export function visibleRatings(
  ratings: readonly RatingRowWithRater[],
  visibleMatchIds: readonly string[],
): Array<{ matchId: string; ratedMemberId: string; score: number }> {
  const visible = new Set(visibleMatchIds);
  return ratings
    .filter((rating) => visible.has(rating.matchId))
    .map((rating) => ({
      matchId: rating.matchId,
      ratedMemberId: rating.ratedMemberId,
      score: rating.score,
    }));
}
