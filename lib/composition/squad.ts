/**
 * Who is selected for a match, read off the starting composition (decision 165).
 *
 * There is no match sheet screen any more. The coach places seven players on the pitch of the
 * **composition de départ**, and on the same page marks everybody else **Remplaçant**, **Supporter** or
 * **—** (not selected). This module turns that one form into the `match_squad` rows the rest of the app
 * reads — game mode, the ratings (decision 159), the statistics, the recap — and it is the only place
 * the mapping is decided. Pure, so it is unit tested without a database (`squad.test.ts`).
 *
 * The rules, each one a sentence of the cahier or of a decision it did not repeal:
 *
 * 1. **On the pitch is titulaire.** A player placed in the starting composition is a starter whatever
 *    the list said about him: the list does not even show a control for him, so nobody can make him
 *    both (the cahier: « on place les joueurs sur le terrain »).
 * 2. **Off the pitch, the list decides**, and « — » is a real answer: it means no row. Nobody marked is
 *    nobody selected — « Le reste des joueurs est considéré comme pas sélectionné. »
 * 3. **A member who does not play can only be a supporter** (decision 096's `is_player`, and decision
 *    159: a coach rates only if the sheet names him, so he must be nameable — as a supporter). He is
 *    never on the pitch and never on the bench.
 * 4. **A player already fielded in a confirmed composition stays selected** (decision 053 and the old
 *    `setMatchSquad` guard): taking him off would contradict a match that has happened.
 */

import type { SquadRole } from "@/db/schema";

/** What the list below the pitch offers: everything but « titulaire », which is the pitch's to say. */
export type BenchMark = "substitute" | "supporter" | "none";

export const BENCH_MARKS: readonly BenchMark[] = ["substitute", "supporter", "none"];

/** The French of the three choices, full and abbreviated for a 390 px row. */
export const BENCH_MARK_LABELS: Record<BenchMark, { full: string; short: string }> = {
  substitute: { full: "Remplaçant", short: "Rempl." },
  supporter: { full: "Supporter", short: "Supp." },
  // « — » and « Non sélectionné »: the cahier's own word for it, and a dash rather than « Hors » because
  // there is no « feuille » left to be outside of.
  none: { full: "Non sélectionné", short: "—" },
};

export type SquadCandidate = {
  membershipId: string;
  name: string;
  isPlayer: boolean;
  /** What `match_squad` says about him today. */
  squadRole: SquadRole | null;
};

/** Which choices a member is offered: a non-player may only be a supporter, or nothing (rule 3). */
export function benchMarksFor(member: Pick<SquadCandidate, "isPlayer">): readonly BenchMark[] {
  return member.isPlayer ? BENCH_MARKS : ["supporter", "none"];
}

/**
 * What the list shows for a member who is not on the pitch, before the coach touches it.
 *
 * His current row, when it is one the list can say. A **starter who is no longer on the pitch** is
 * shown as a substitute: the coach took him off the turf, and the bench is where a man taken off the
 * turf goes — a click on « — » away from not selected, rather than silently dropped.
 */
export function defaultBenchMark(member: Pick<SquadCandidate, "isPlayer" | "squadRole">): BenchMark {
  switch (member.squadRole) {
    case "supporter":
      return "supporter";
    case "substitute":
    case "starter":
      return member.isPlayer ? "substitute" : "none";
    default:
      return "none";
  }
}

/** The role a list mark stands for, `null` for « — ». */
export function roleOfMark(mark: BenchMark): SquadRole | null {
  return mark === "none" ? null : mark;
}

export type SquadFromCompositionInput = {
  /** The active members of the team, in any order. Anybody else in the form is ignored. */
  members: readonly SquadCandidate[];
  /** Who is on the pitch of the starting composition. */
  starterIds: readonly string[];
  /** What the list says about the others, by `team_members.id`. A member missing from it is « — ». */
  marks: ReadonlyMap<string, BenchMark>;
  /** Players in a composition game mode has confirmed (rule 4). */
  lockedIds?: ReadonlySet<string>;
};

export type SquadFromComposition =
  | {
      ok: true;
      /** The `match_squad` rows to hold, one per selected member. */
      rows: { teamMemberId: string; role: SquadRole }[];
      /** Members with no row once saved: delete theirs, if any. */
      cleared: string[];
    }
  | { ok: false; errorFr: string };

/** The four rules above, applied to one submitted form. */
export function squadFromComposition(input: SquadFromCompositionInput): SquadFromComposition {
  const starters = new Set(input.starterIds);
  const locked = input.lockedIds ?? new Set<string>();
  const rows: { teamMemberId: string; role: SquadRole }[] = [];
  const cleared: string[] = [];

  for (const member of input.members) {
    if (starters.has(member.membershipId)) {
      if (!member.isPlayer) {
        return {
          ok: false,
          errorFr: `${member.name} ne joue pas : il peut être supporter, pas sur le terrain.`,
        };
      }
      rows.push({ teamMemberId: member.membershipId, role: "starter" });
      continue;
    }

    const mark = input.marks.get(member.membershipId) ?? "none";
    if (!benchMarksFor(member).includes(mark)) {
      return {
        ok: false,
        errorFr: `${member.name} ne joue pas : il peut être supporter, pas remplaçant.`,
      };
    }

    const role = roleOfMark(mark);
    if (locked.has(member.membershipId) && role !== "substitute") {
      return {
        ok: false,
        errorFr: `${member.name} est déjà entré en jeu : il reste titulaire ou remplaçant.`,
      };
    }

    if (role === null) cleared.push(member.membershipId);
    else rows.push({ teamMemberId: member.membershipId, role });
  }

  return { ok: true, rows, cleared };
}

/**
 * Who may be placed in a composition.
 *
 * The **starting** one draws on every player of the team — placing him is what selects him (rule 1).
 * A **planned change** draws on the selection the starting composition made: its starters and its
 * substitutes, the same pool `saveLineup` re-checks, so a supporter or an unselected player is never
 * brought on by a plan.
 */
export function isPlaceable(
  member: Pick<SquadCandidate, "isPlayer" | "squadRole">,
  mode: "initial" | "plan",
): boolean {
  if (mode === "initial") return member.isPlayer;
  return member.squadRole === "starter" || member.squadRole === "substitute";
}
