/**
 * The order in which formations compete to become the « équipe type »'s shape — pure, and split out
 * of `formation-usage.ts` for one reason: a tie-break that only exists inside a `server-only` module
 * is a rule nothing can hold to. `docs/ROADMAP.md` already logs the leaderboard shipping an invented
 * order among equals, and this comparator decides which seven posts a whole screen is drawn from, so
 * it is the worse place to repeat that. Vitest collects `lib/**` and nothing that imports `db/`
 * (decision 097's configuration), which is why the comparator lives here and the fetching stays next
 * door.
 *
 * No `server-only`, no database, no clock: the same set always sorts to the same sequence, which is
 * the entire claim being made — « the same season always yields the same seven posts ».
 */

/**
 * The narrowest input the comparator actually reads. Deliberately structural rather than
 * `FormationUsage`: a comparator that demanded the slots would force every fixture to invent seven
 * of them to assert something about a label, and the extra fields would silently become part of what
 * a reader thinks the ordering depends on.
 */
export type RankableFormation = {
  formationId: string;
  /** The shape, e.g. `1-3-2-1`. This is what the screen titles itself with. */
  label: string;
  /** A template shared by every team, rather than one this team drew (decision 005). */
  isBuiltin: boolean;
  /** Distinct matches the shape was used in — the number the screen prints beside the label. */
  matches: number;
  /** Of those, the ones game mode confirmed (decision 006). */
  appliedMatches: number;
  /** ISO 8601 kickoff of the most recent of those matches; null when never used. */
  lastUsedAt: string | null;
};

/**
 * A **total order** over formations, most-played first — total on purpose, not merely "good enough":
 * `Array.prototype.sort` is only specified to be stable, so any pair the comparator calls equal is a
 * pair whose order is decided by whatever sequence the rows arrived in. For this screen that would
 * mean the pitch silently repainting because a row was inserted somewhere unrelated.
 *
 * The levels, in order, each one reached only when every previous one ties:
 *
 * 1. **More matches wins.** The question the screen asks, and the number it prints.
 * 2. **Then the most recently used.** Two shapes played four times each are not equally current: the
 *    one the coach used last Sunday is the one the team is playing now. A formation that exists but
 *    was never played has `lastUsedAt: null` and sorts last here — though in practice level 1 has
 *    already separated it, since never played means zero matches.
 * 3. **Then a built-in before a custom one.** Not a judgement on either: a template carries a name
 *    every reader recognises, so it is the less surprising thing to show when nothing else separates
 *    the two.
 * 4. **Then the label, then the id.** Arbitrary, and deliberately so — these exist only to make the
 *    answer *stable*. An id comparison is the cheapest guarantee that two renders of one season
 *    agree, and `formationId` is a primary key, so it can never tie.
 *
 * `appliedMatches` is **not** a level. It is in the type because the screen states it, and stating it
 * is the point (decision 006): ranking by it would quietly re-introduce the rule `formation-usage.ts`
 * argues against, that a season played without game mode counts for nothing.
 */
export function byUsage(a: RankableFormation, b: RankableFormation): number {
  if (a.matches !== b.matches) return b.matches - a.matches;

  if (a.lastUsedAt !== b.lastUsedAt) {
    // Never-played sorts after played, rather than letting `null` compare as anything at all.
    if (a.lastUsedAt === null) return 1;
    if (b.lastUsedAt === null) return -1;
    // ISO 8601 with a fixed offset is lexicographically chronological, which is why instants leave
    // the query layer as strings in the first place (`CLAUDE.md`).
    return b.lastUsedAt.localeCompare(a.lastUsedAt);
  }

  if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
  if (a.label !== b.label) return a.label.localeCompare(b.label);
  return a.formationId.localeCompare(b.formationId);
}
