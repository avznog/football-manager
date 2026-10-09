/**
 * The adapter from what the database knows to what `best-seven.ts` takes.
 *
 * `best-seven.ts` imports nothing, on purpose, so *something* has to carry a season row and a set of
 * declared posts across into its narrow inputs — and that something is the likeliest place in this
 * slice to be quietly wrong. Every field it maps is a number that already exists under another name:
 * `cleanMinutes` and `gkCleanMinutes` are decision 011's two readings and differ by one word, and
 * swapping them would produce a seven that looks entirely plausible and ranks the wrong people. So
 * this file is pure, it lives under `lib/` where Vitest collects it, and `best-seven-input.test.ts`
 * pins the join field by field.
 *
 * ## Who is a candidate, and why that is a judgement rather than a filter
 *
 * A post in this codebase is only ever what a player **declared** (`player_positions`, decision 005)
 * — there is no per-post minute data anywhere. Declarations are read through `getSquad`, which shows
 * the *current* squad and drops anybody with a `leftAt`. So a player who has left has a season but no
 * declarations, and feeding him in would make him `fit: "none"` in all seven slots: the positional
 * objective (rule 5) would then only ever field him out of position, which is not "considered and
 * beaten", it is excluded by an accident of a join.
 *
 * Rather than let that happen silently, this file **excludes him deliberately and counts him**, and
 * the screen says so. Same for a member with `is_player = false` — the coach `createTeam` inserts on
 * every new team (decision 094's row two), whom `can()` has never let be convoqué and who must not
 * be put on a pitch by a statistic either.
 *
 * A candidate with **no data at all is kept**. That is not an oversight: rule 2 of `best-seven.ts`
 * lands a zero-exposure player exactly on the squad mean, so he heads neither the best nor the worst
 * seven, and dropping him here would instead make a seven of five men on a squad that has only just
 * started its season.
 */

import type { PlayerSeasonStats } from "./aggregate";
import type { BestSevenCandidate, BestSevenSlot, PositionDeclaration } from "./best-seven";

/**
 * One member's identity and declared posts, in the shape `getSquad` already returns
 * (`lib/team/queries.ts`: `membershipId`, `displayName`, `jerseyNumber`, `isPlayer`, `positions`).
 * Restated structurally rather than importing
 * `SquadMember`, so a test can write a squad in three lines and so this module never depends on a
 * `"server-only"` one.
 */
export type DeclaredPositions = {
  membershipId: string;
  /**
   * Who he is, from the squad row. The season row carries the same name — both read `users` — but only
   * the squad is guaranteed to have a row here at all, which is why identity comes from this side.
   */
  displayName: string;
  jerseyNumber: number | null;
  isPlayer: boolean;
  positions: readonly { code: string; preference: PositionDeclaration }[];
};

export type BestSevenSquad = {
  /** In `getSquad`'s order; `bestSeven` re-sorts by its own tie-breaks anyway. */
  candidates: BestSevenCandidate[];
  /**
   * Members who have a season in this selection but are no longer in the squad. Their goals stay in
   * the season (`aggregate.ts`, rule 8) and they are still not fieldable, so the number is returned
   * for the screen to state instead of being subtracted in silence.
   */
  departedWithData: number;
  /** Squad members with `is_player = false`: encadrement, never a candidate for a pitch. */
  nonPlayers: number;
};

/**
 * `player_positions` flattened into the `Record` rule 5 matches slots against.
 *
 * At most one `primary` per member is a data-model invariant, but it is enforced on the way *in*
 * (`lib/player/positions.ts`), so a broken row must not be able to demote a primary here: `primary`
 * wins whatever order the rows arrive in.
 */
function declarationsOf(
  positions: readonly { code: string; preference: PositionDeclaration }[],
): Record<string, PositionDeclaration> {
  const declarations: Record<string, PositionDeclaration> = {};
  for (const position of positions) {
    if (declarations[position.code] === "primary") continue;
    declarations[position.code] = position.preference;
  }
  return declarations;
}

/** A squad member with no row in the aggregate: every figure is zero, every rating unknown. */
const NO_SEASON = {
  minutes: 0,
  goals: 0,
  assists: 0,
  cleanMinutes: 0,
  gkMinutes: 0,
  gkCleanMinutes: 0,
  ratingAverage: null,
  ratingCount: 0,
  ratingVariance: null,
} as const;

/**
 * The squad `bestSeven` will choose from, plus who was left out of it and why.
 *
 * `players` is `getSeasonStats(...).players` — every membership of the team, including those who have
 * left — and `squad` is `getSquad`, which is only the current one. The join is on membership id in
 * both directions: the squad decides *who* may be fielded, the season decides *with which figures*.
 */
export function toBestSevenSquad(
  players: readonly PlayerSeasonStats[],
  squad: readonly DeclaredPositions[],
): BestSevenSquad {
  const seasonById = new Map(players.map((player) => [player.teamMemberId, player]));

  const candidates = squad
    .filter((member) => member.isPlayer)
    .map((member): BestSevenCandidate => {
      const season = seasonById.get(member.membershipId);
      const figures = season ?? NO_SEASON;
      return {
        id: member.membershipId,
        /**
         * **Identity from the squad row, figures from the season row.**
         *
         * It used to be `season?.displayName ?? ""`, and an empty string is not a fallback: a squad
         * member missing from `getSeasonStats().players` would have drawn a nameless disc on the pitch
         * and a nameless row in the picker, which is a worse answer than the name the squad row was
         * already holding. The join is what may be missing; who he is never is.
         */
        displayName: member.displayName,
        jerseyNumber: member.jerseyNumber,
        minutes: figures.minutes,
        goals: figures.goals,
        assists: figures.assists,
        // Decision 011's two readings, and the one pair of fields this whole file exists to get
        // right: `cleanMinutes` is minutes on the pitch with the sheet unbroken, for anybody;
        // `gkCleanMinutes` is the same thing counted only in goal. Rule 4 of `best-seven.ts` picks
        // between them per slot, so both have to arrive, under their own names.
        cleanMinutes: figures.cleanMinutes,
        gkMinutes: figures.gkMinutes,
        gkCleanMinutes: figures.gkCleanMinutes,
        ratingAverage: season?.rating.average ?? null,
        ratingCount: season?.rating.count ?? 0,
        ratingVariance: season?.rating.variance ?? null,
        declarations: declarationsOf(member.positions),
      };
    });

  return {
    candidates,
    departedWithData: players.filter((player) => player.hasLeft && player.hasData).length,
    nonPlayers: squad.filter((member) => !member.isPlayer).length,
  };
}

/**
 * The formation's seven posts as slots.
 *
 * Two things this does that a `map` over the rows would get wrong if written at the call site. The
 * identity is `formation_slots.id` and never the post code, because **a code is not unique within a
 * formation** — 1-2-3-1 has two `DC` and two `AIL`, and keying on the code would collapse them into
 * one slot and lose a man. And `isGoalkeeper` is computed here, once: `best-seven.ts` is told which
 * slot is the goal rather than comparing a string to `"GB"` itself, so decision 011's two clean-sheet
 * readings do not hinge on a magic code buried in a pure module.
 */
export function toBestSevenSlots(
  slots: readonly { id: string; positionCode: string }[],
): BestSevenSlot[] {
  return slots.map((slot) => ({
    id: slot.id,
    positionCode: slot.positionCode,
    isGoalkeeper: slot.positionCode === "GB",
  }));
}
