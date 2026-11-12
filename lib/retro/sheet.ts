/**
 * Bringing onto a finished match somebody the « feuille de match » does not have (decision 226).
 *
 * The owner: « I must be able to add people to the match, if I did not. Example: if Rémi was not
 * player, sub or supporter, I want to be able to, post match, add him to a composition, substitution,
 * etc. But make it clear that you are adding him to the game, as people not on the "feuille de match"
 * should not be there, as it is today. »
 *
 * So the default lists stay exactly what decision 169 made them — after the match the sheet is what
 * happened — and the people it does not name are offered **apart**, under « Pas sur la feuille de
 * match », with a sentence before confirming that says what will change on the sheet. Nobody reaches
 * the pitch without the coach having read that he is adding them.
 *
 * Pure: no database, no React. The two screens and the two server actions call the same functions,
 * so the screen cannot offer somebody the action refuses.
 */

import type { LiveMatch, LivePlayer } from "@/lib/match/presenter";
import type { MatchState } from "@/lib/match/reducer";

import { changeCandidateIds } from "./change";

/** The heading of the group, said once so the two screens cannot word it differently. */
export const OFF_SHEET_HEADING_FR = "Pas sur la feuille de match";

/**
 * Who may be brought onto the match from outside it, at that pitch: players of the team who are
 * off the pitch then and whom the sheet does not let on by itself.
 *
 *  - **not on the sheet at all** (`squadRole` null) — Rémi, forgotten when the sheet was made;
 *  - **a supporter** of the match. He is on the sheet, but to rate (decision 211), not to play, so
 *    putting him on the pitch changes his role and is said as such;
 *  - **never a non-player** (decision 096), **never somebody who has left the team**, never somebody
 *    already allowed in by `changeCandidateIds` (a starter, a substitute, or a man the log saw play).
 *
 * A match with **no sheet at all** gets nobody here: `changeCandidateIds` already offers every player
 * on such a match, because there is nothing to narrow by — and nothing to add them to.
 */
export function offSheetCandidateIds(
  live: Pick<LiveMatch, "players" | "hasSquadSheet">,
  atClock: Pick<MatchState, "onPitch">,
  wholeMatch: Pick<MatchState, "players">,
): string[] {
  if (!live.hasSquadSheet) return [];
  const allowed = new Set(changeCandidateIds(live, atClock, wholeMatch));
  const onAtClock = new Set(atClock.onPitch.map((entry) => entry.memberId));
  return live.players
    .filter((player) => player.isPlayer && !player.hasLeft)
    .filter((player) => !onAtClock.has(player.memberId) && !allowed.has(player.memberId))
    .filter((player) => player.squadRole === null || player.squadRole === "supporter")
    .map((player) => player.memberId);
}

/** What the sheet becomes for one person brought on: his role before, and the one he gets. */
export type SheetAddition = {
  memberId: string;
  displayName: string;
  /** `null` when he was not on the sheet at all. */
  from: "supporter" | null;
  to: "starter" | "substitute";
};

/**
 * Which of `memberIds` the sheet has to change for, given the role they get.
 *
 * Only the two cases this module exists for — not on the sheet, or supporter — and only on a match
 * that has a sheet. A substitute who comes on stays a substitute; a substitute who now starts is the
 * start correction's ordinary business (`squadAfterStart`), not an addition to the match.
 */
export function sheetAdditions(
  live: Pick<LiveMatch, "players" | "hasSquadSheet">,
  memberIds: readonly string[],
  to: SheetAddition["to"],
): SheetAddition[] {
  if (!live.hasSquadSheet) return [];
  const byId = new Map<string, LivePlayer>(live.players.map((player) => [player.memberId, player]));
  const additions: SheetAddition[] = [];
  for (const memberId of new Set(memberIds)) {
    const player = byId.get(memberId);
    if (!player) continue;
    if (player.squadRole !== null && player.squadRole !== "supporter") continue;
    additions.push({ memberId, displayName: player.displayName, from: player.squadRole, to });
  }
  return additions;
}

const ROLE_FR: Readonly<Record<SheetAddition["to"], string>> = {
  starter: "titulaire",
  substitute: "remplaçant",
};

/**
 * The sentence the confirm step shows, one per person.
 *
 * « Rémi sera ajouté à la feuille de match comme remplaçant. » — he was not on it.
 * « Léo C passe de supporter à remplaçant. » — he was, but to rate.
 */
export function sheetAdditionFr(addition: SheetAddition): string {
  const role = ROLE_FR[addition.to];
  return addition.from === "supporter"
    ? `${addition.displayName} passe de supporter à ${role}.`
    : `${addition.displayName} sera ajouté à la feuille de match comme ${role}.`;
}
