/**
 * What a *new* composition starts from: the team that is already on the pitch at that minute.
 *
 * A coach planning the 10th minute is planning one substitution, not a team. Until this existed the
 * editor opened on an empty pitch, so the only way to say « Ali sort, Momo entre » was to place seven
 * players again — and the « Changements déduits » card under it read « Hugo sort · Samir sort · … »
 * for a coach who had touched nobody, which is the defect `slotsLeft` was added to hide rather than
 * to fix. Pre-filling fixes the cause: the pitch opens with the seven in force, the diff is empty,
 * and the one change the coach came to make is the only thing he does.
 *
 * **This applies nothing** (`CLAUDE.md`, invariant 3). Everything here is a pure function over plans
 * the caller has already read; it returns the editor's *initial state* and never a row. No composition
 * exists until the coach submits the form and `saveLineup` writes it — leaving the editor leaves
 * nothing behind, which is exactly what it did before.
 *
 * « The composition in force at that minute » is not « the last one created »: a coach who has
 * already planned the 20th and then adds the 10th inherits the starting seven, not the 20th. That
 * rule is `planInForceBefore` and it is not reimplemented here — the same function decides which two
 * teams the diff compares, so the team the editor opens with and the team it is measured against are
 * the same team by construction.
 */

import type { SlotAssignment } from "@/lib/match/lineup";

import { restrictToMembers, restrictToSlots } from "./editor";
import { ordinalFr, planInForceBefore, type PlannedLineup } from "./plan";

export type PlanPrefill = {
  /** The composition being copied, or `null` when nothing is in force before that minute. */
  source: PlannedLineup | null;
  /**
   * The source's formation, so the seven land in slots that exist. `null` means the caller keeps its
   * own default — either there is no source, or the source's formation is no longer available.
   */
  formationId: string | null;
  /** Keyed on `formation_slots.id`, like the saved assignments the editor takes when modifying. */
  assignments: readonly SlotAssignment[];
  /**
   * Inherited players who could *not* be placed, in the source's slot order: dropped from the match
   * sheet, or gone from the squad. Their posts stay empty and the coach is told whose they were.
   */
  droppedMemberIds: readonly string[];
};

const NOTHING: PlanPrefill = {
  source: null,
  formationId: null,
  assignments: [],
  droppedMemberIds: [],
};

/**
 * The initial state of « Nouvelle composition » at `minute`.
 *
 * `placeableMemberIds` is the pool the editor offers — the starters and the substitutes of the match
 * sheet, nobody else. It is a parameter and not a filter applied afterwards because it is the whole
 * point of question 6: a player inherited from the starting seven who has since left the sheet, or
 * the team, must not be placed silently. He is dropped, his post stays open (which `findPlanIssues`
 * already reports as « Il reste un poste à pourvoir »), and `prefillNoticeFr` names him.
 *
 * `formationIds` are the formations the team may use. A source pointing at anything else cannot be
 * inherited at all — its slot ids would not exist in the picker — so nothing is placed rather than
 * seven players being put in posts the editor cannot render.
 */
export function prefillFromPlans(input: {
  plans: readonly PlannedLineup[];
  minute: number;
  placeableMemberIds: readonly string[];
  formationIds: readonly string[];
}): PlanPrefill {
  const source = planInForceBefore(input.plans, input.minute);
  if (!source) return NOTHING;

  if (!input.formationIds.includes(source.formationId)) {
    return { ...NOTHING, source };
  }

  // Its own slots, in case a formation has been redrawn under a stored composition: a pair pointing
  // at a slot that no longer exists is not a placement, it is a row the editor could not draw.
  const onOwnSlots = restrictToSlots(
    source.assignments,
    source.slots.map((slot) => slot.id),
  );
  const assignments = restrictToMembers(onOwnSlots, input.placeableMemberIds);
  const kept = new Set(assignments.map((assignment) => assignment.memberId));

  return {
    source,
    formationId: source.formationId,
    assignments,
    droppedMemberIds: onOwnSlots
      .filter((assignment) => !kept.has(assignment.memberId))
      .map((assignment) => assignment.memberId),
  };
}

/**
 * Which composition the team was taken from, as the tail of a sentence: « de la composition de
 * départ », « de la composition de la 30ᵉ minute ».
 *
 * `planTitleFr` is a heading and cannot be quoted inside a sentence: « reprise de la composition
 * « composition de départ » » stutters, and « reprise de la composition « à partir de la 30ᵉ
 * minute » » puts a preposition inside a noun. A title and a reference to that title are two
 * different strings, so this is the second one.
 */
export function planSourcePhraseFr(lineup: { fromMinute: number; isInitial: boolean }): string {
  if (lineup.isInitial || lineup.fromMinute === 0) return "de la composition de départ";
  return `de la composition de la ${ordinalFr(lineup.fromMinute)} minute`;
}

/**
 * What the editor says while it is pre-filled, one sentence per paragraph.
 *
 * Two things have to be true at once, and the second is the one this repo keeps getting wrong: the
 * seven discs on the turf are **not** a saved composition. A screen that shows the starting seven
 * under « À partir de la 10ᵉ minute » and says nothing else is claiming a plan that does not exist —
 * leave the page and there is no composition at the 10th minute at all. So the provenance is stated
 * (« reprise de … ») and so is the fact that nothing is written yet.
 *
 * Empty when there is nothing to explain: with no earlier composition the editor opens as it always
 * has, on an empty pitch, and a sentence about inheriting nothing would be noise.
 */
export function prefillNoticeFr(
  prefill: PlanPrefill,
  nameOf: (memberId: string) => string,
): string[] {
  if (!prefill.source) return [];

  const from = planSourcePhraseFr(prefill.source);

  if (prefill.assignments.length === 0) {
    return [
      `Rien n’a pu être repris ${from} : sa formation n’est plus disponible. ` +
        "Place tes joueurs — rien n’est enregistré avant que tu valides.",
    ];
  }

  const lines = [
    `Équipe reprise ${from} : déplace seulement ce qui change. ` +
      "Rien n’est enregistré avant que tu valides.",
  ];

  if (prefill.droppedMemberIds.length > 0) {
    const names = prefill.droppedMemberIds.map(nameOf);
    lines.push(
      names.length === 1
        ? `${names[0]} n’a pas pu être replacé : il n’est plus titulaire ou remplaçant sur la ` +
            "feuille. Son poste est resté libre."
        : `${names.join(", ")} n’ont pas pu être replacés : ils ne sont plus titulaires ou ` +
            "remplaçants sur la feuille. Leurs postes sont restés libres.",
    );
  }

  return lines;
}
