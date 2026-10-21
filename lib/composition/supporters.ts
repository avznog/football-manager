/**
 * Naming a supporter on a match that is already over, and taking one back off.
 *
 * ## Why this exists at all
 *
 * The vote belongs to whoever the sheet names: starter, substitute or **supporter** (decision 159,
 * enforced in `lib/rating/actions.ts`). That is also the only way a man who did not play gets to rate
 * at all — decision 096 says a non-player can be nothing else, and the composition screen offers him
 * « Supporter » or nothing.
 *
 * But the sheet is written with the starting composition, at minute 0, by `saveLineup` — and
 * `saveLineup` refuses a finished match, correctly: a composition is a plan for football that has not
 * happened yet. So the one person who turns up, watches, and is asked for his notes afterwards could
 * not be named afterwards. That is the gap, and it is the whole of this module's reason: **a supporter
 * is not a plan.** He changes no minute, no score and no position; he gains a vote and a line in his
 * own season that says « 1 fois supporter ».
 *
 * ## Why it needs no re-freeze
 *
 * Sheet roles are counted straight from `match_squad` and never from the frozen cache —
 * `lib/stats/aggregate.ts` rule 4, because titulaire/remplaçant/supporter is what the coach wrote and
 * not something the reducer can know. So a row added here is in the season table on the next read,
 * and `match_player_stats` is not involved. Nothing else in the app derives anything from a supporter.
 *
 * ## The two rules, and why they are here rather than in the action
 *
 * Pure, so they have unit tests: an action that reaches the database cannot be tested for the thing
 * that actually matters, which is *who is refused*.
 */

import type { SquadRole } from "@/db/schema";

/** One member of the team, as the two rules need to see him. */
export type SupporterCandidate = {
  memberId: string;
  name: string;
  /** What the sheet already says about him: `null` is « not selected », not « supporter ». */
  squadRole: SquadRole | null;
  /**
   * He has a minute in this match, from the reducer.
   *
   * It must come from the reducer and **not** from the planned compositions: most of a live match's
   * changes are made on the spot in game mode and carry no `lineup_id` at all, so a man who came on
   * that way is invisible to `getFieldedMemberIds`. On the 2026-10-20 match that was most of the
   * seventeen changes.
   */
  playedMatch: boolean;
};

export type SupporterRefusal = { errorFr: string };

/**
 * Whether this man may be named supporter on a match that is over.
 *
 * Two refusals, and the second is the owner's « someone who has not played, obviously »:
 *
 * 1. **He is already on the sheet.** Whatever the role, there is nothing to add — and silently
 *    turning a titulaire into a supporter would take minutes he played out of his own history.
 * 2. **He played.** The sheet would then say he watched a match he was on the pitch for. He already
 *    has the vote for having played, so this would buy him nothing and cost the record its truth.
 */
export function mayAddSupporter(candidate: SupporterCandidate): true | SupporterRefusal {
  if (candidate.squadRole !== null) {
    return {
      errorFr: `${candidate.name} est déjà sur la feuille de ce match.`,
    };
  }
  if (candidate.playedMatch) {
    return {
      errorFr: `${candidate.name} a joué ce match : il le note déjà, et la feuille ne peut pas dire qu’il regardait.`,
    };
  }
  return true;
}

/**
 * Whether this supporter may be taken off again.
 *
 * `match_squad` is not append-only — only `match_events` is (invariant 1) — so removing a row is
 * legitimate and is the undo for a mis-tap. Two refusals:
 *
 * 1. **He is not a supporter here.** A titulaire is removed by editing the composition, which is a
 *    different act with different consequences; this control does not reach it.
 * 2. **He has already submitted notes.** Taking away his place on the sheet takes away the vote that
 *    made those notes admissible, so the row and the notes would disagree about whether they should
 *    exist. The notes are somebody's judgement of his teammates and are not this control's to
 *    destroy, so the answer is to refuse and say why.
 */
export function mayRemoveSupporter(
  candidate: Pick<SupporterCandidate, "name" | "squadRole">,
  hasRated: boolean,
): true | SupporterRefusal {
  if (candidate.squadRole !== "supporter") {
    return {
      errorFr: `${candidate.name} n’est pas supporter sur ce match.`,
    };
  }
  if (hasRated) {
    return {
      errorFr: `${candidate.name} a déjà donné ses notes : retire-les d’abord, ou laisse-le sur la feuille.`,
    };
  }
  return true;
}

/**
 * Who the « Ajouter un supporter » list offers, in the order it was given.
 *
 * The same rule as `mayAddSupporter`, applied to the whole squad, so the screen cannot offer a name
 * the action will refuse. Both exist because the list is a convenience and the action is the
 * guarantee: a stale page is the ordinary case here, not an attack — the coach leaves it open, somebody
 * finishes the match, and the names he is looking at are a minute out of date.
 */
export function addableSupporters(candidates: readonly SupporterCandidate[]): SupporterCandidate[] {
  return candidates.filter((candidate) => mayAddSupporter(candidate) === true);
}

/** The supporters this sheet already names, for the list the control sits under. */
export function namedSupporters(candidates: readonly SupporterCandidate[]): SupporterCandidate[] {
  return candidates.filter((candidate) => candidate.squadRole === "supporter");
}

/**
 * The squad, paired with who played, in the shape the two rules read.
 *
 * Here rather than in each caller because there are two and they must not drift: the action derives
 * the played set from the reducer, the screen takes it from the recap it has already computed, and if
 * the two ever disagreed about the *mapping* the screen would offer a name the action refuses. The
 * `playedMemberIds` they each pass is the honest difference between them; everything after it is this
 * function.
 */
export function toSupporterCandidates(
  members: readonly { membershipId: string; name: string; squadRole: SquadRole | null }[],
  playedMemberIds: Iterable<string>,
): SupporterCandidate[] {
  const played = new Set(playedMemberIds);
  return members.map((member) => ({
    memberId: member.membershipId,
    name: member.name,
    squadRole: member.squadRole,
    playedMatch: played.has(member.membershipId),
  }));
}
