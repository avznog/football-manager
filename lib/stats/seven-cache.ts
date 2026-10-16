/**
 * The cache key of an équipe type asked of a model, and the way back from a stored answer to a
 * `SevenResult` (decision 204).
 *
 * Pure, and deliberately in its own module rather than in `seven-cache-queries.ts`: that one imports
 * `@/db/client`, which imports `server-only`, which **throws** outside a React Server environment — so
 * a Vitest file that imported it could not run at all. The fingerprint is the one part of this layer
 * worth testing, so it lives where a test can reach it. Same split as `aggregate.ts` / `queries.ts`
 * next door.
 *
 * ## What the fingerprint is over, and what it is not
 *
 * **In the hash**, because a change to any of them should change the answer:
 *
 * - the seven asked for (`kind`) and the competition filter (`null` meaning « toutes compétitions »);
 * - the context the owner typed, whitespace-normalised — « qui est absent » is an input to the answer;
 * - for every candidate, the figures `buildSevenPrompt` actually prints: shirt number, displayed name,
 *   minutes, goals, assists, minutes and goals conceded in goal, outfield minutes and goals conceded
 *   outfield, the rating average and its count, the declared posts, and the per-group season lines.
 *
 * **Not in the hash**, each for a reason:
 *
 * - **the order of `candidates`**. The lines are sorted before hashing, so a squad that comes back from
 *   the database in a different order is the same question. This is the property the test pins: without
 *   it, every page load after a tie in `candidateOrder` would be a cache miss and a paid-for call.
 * - **`candidate.id`**. It is a uuid the model never sees; two squads identical in every printed figure
 *   are the same question for the model, and the stored answer is keyed on shirt numbers anyway.
 * - **the model id**. Which model answered is *recorded* (`seven_suggestions.model`) and shown on
 *   screen, but the pin does move (it already has once), so putting it in the key would throw away every
 *   row the day it does — and the previous answer over the same figures is still the answer the
 *   screen already showed. A deliberate stale-tolerance, not an oversight.
 * - **the slots**. There is one formation (decision 157); when there are two, add it.
 */

import { createHash } from "node:crypto";

import { candidateOrder, type BestSevenSlot } from "./best-seven";
import {
  assignmentToPicks,
  buildCells,
  type SevenCandidate,
  type SevenKind,
  type SevenResult,
} from "./sevens";
import { validateSevenAnswer } from "./seven-llm";

/**
 * Bumped by hand when the hashed material changes shape, so rows written by an older version of this
 * function are missed rather than matched against a key that means something else.
 */
const FINGERPRINT_VERSION = "v1";

/** The shirt-number sets a model answered with, keyed by post code — what is stored, never indices. */
export type SevenShirtSets = Readonly<Record<string, readonly number[]>>;

/** Trailing spaces and a stray newline are not a different question. */
export function normalizeSevenContext(context: string): string {
  return context.replace(/\s+/gu, " ").trim();
}

function numberPart(value: number | null): string {
  // Fixed precision: a rating average arrives as a float and `0.30000000000000004` must not be a
  // different question from `0.3`.
  return value === null ? "-" : value.toFixed(4);
}

/** One candidate as the single line the hash sees. */
function candidateLine(candidate: SevenCandidate): string {
  const declarations = Object.entries(candidate.declarations)
    .map(([code, fit]) => `${code}=${fit}`)
    .sort()
    .join(",");
  const positions = [...candidate.positions]
    .map(
      (position) =>
        `${position.group}:${position.minutes}/${position.goalsFor}/${position.goalsAgainst}`,
    )
    .sort()
    .join(",");
  return [
    candidate.jerseyNumber === null ? "-" : String(candidate.jerseyNumber),
    candidate.displayName,
    `m${candidate.minutes}`,
    `g${candidate.goals}`,
    `a${candidate.assists}`,
    `gk${candidate.gkMinutes}`,
    `cgk${candidate.concededWhileGk}`,
    `om${candidate.outfieldMinutes}`,
    `co${candidate.concededOutfield}`,
    `r${numberPart(candidate.ratingAverage)}/${candidate.ratingCount}`,
    `d[${declarations}]`,
    `p[${positions}]`,
  ].join("|");
}

/**
 * The cache key: sha-256 over the question, as a hex string.
 *
 * Stable across calls, order-independent in `candidates`, and different the moment any printed figure
 * or the typed context moves.
 */
export function sevenFingerprint(
  kind: SevenKind,
  competitionId: string | null,
  context: string,
  candidates: readonly SevenCandidate[],
): string {
  const material = [
    FINGERPRINT_VERSION,
    `kind=${kind}`,
    `competition=${competitionId ?? "all"}`,
    `context=${normalizeSevenContext(context)}`,
    ...candidates.map(candidateLine).sort(),
  ].join("\n");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/* -------------------------------------------------------------------------- */
/* From a stored answer back to a seven                                       */
/* -------------------------------------------------------------------------- */

export type RestoredSeven = { result: SevenResult; reasons: { shirt: number; why: string }[] };

/**
 * A stored answer re-read against **today's** candidates, or `null`.
 *
 * `null` is a cache miss and is treated as one by the caller, never as an error: the row holds shirt
 * numbers, and a squad can change under it in ways the fingerprint cannot see — a man whose minutes
 * moved changes the key, but a man who left the team does not change anybody else's line. So the sets
 * go back through the very validator the live answer went through (`validateSevenAnswer`), and a seven
 * that no longer names seven eligible men is simply asked again.
 *
 * The cells are rebuilt from scratch with `buildCells`, so a restored seven and a fresh one print the
 * same figure under the same name by construction.
 */
export function restoreSeven(
  kind: SevenKind,
  input: { candidates: readonly SevenCandidate[]; slots: readonly BestSevenSlot[] },
  stored: { shirts: SevenShirtSets; reasons: { shirt: number; why: string }[] },
): RestoredSeven | null {
  const candidates = [...input.candidates].sort(candidateOrder);
  const { slots } = input;
  const validation = validateSevenAnswer(
    { slots: stored.shirts, reasons: stored.reasons, summary: "" },
    candidates,
    slots,
  );
  if (!validation.ok) return null;

  const built = buildCells(kind, candidates, slots);
  const picks = assignmentToPicks(slots, candidates, built.cells, validation.slotToCandidate);
  return {
    result: {
      kind,
      candidates,
      cells: built.cells,
      picks,
      outOfPositionCount: picks.filter((pick) => pick.player !== null && pick.fit === "none").length,
      keeperModel: built.keeperModel,
      keepersConsidered: built.keepersConsidered,
      keepersRefused: built.keepersRefused,
      ratingsModel: built.ratingsModel,
    },
    reasons: validation.answer.reasons,
  };
}
