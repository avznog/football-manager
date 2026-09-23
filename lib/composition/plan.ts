/**
 * Planned compositions: « à partir de la 30ᵉ minute », and the changes they imply.
 *
 * A coach does not plan substitutions, he plans **teams** (decision 006). The app stores one
 * composition per minute mark and *deduces* "Ali → Momo, Karim passe MC → AT" by diffing the
 * planned team against the one in force just before it. Nothing here applies anything: game mode
 * proposes the plan and waits for a confirmation (`CLAUDE.md`, invariant 3), and
 * `lineups.applied_event_id` stays null until that happens.
 *
 * The diff itself belongs to `lib/match/lineup.ts` and is not reimplemented — this module decides
 * *which two teams* to compare, and which of the resulting changes are worth showing.
 */

import type { SquadRole } from "@/db/schema";
import {
  type LineupDiff,
  type PositionChange,
  type SlotAssignment,
  type SlotInfo,
  type Substitution,
  describeLineupDiffFr,
  diffLineups,
  summariseLineupDiffFr,
} from "@/lib/match/lineup";

/** A formation slot as the plan needs it: enough to name the position in a French diff. */
export type PlanSlot = {
  id: string;
  positionCode: string;
  sort: number;
};

/** One saved composition of a match. */
export type PlannedLineup = {
  id: string;
  /** The minute it takes effect from. 0 for the starting seven. */
  fromMinute: number;
  isInitial: boolean;
  formationId: string;
  formationLabel: string;
  /** True once game mode has confirmed it — it then describes the past and must not be edited. */
  isApplied: boolean;
  assignments: readonly SlotAssignment[];
  slots: readonly PlanSlot[];
};

/** Who a plan may put on the pitch, and what the match sheet says about them. */
export type PlanMember = {
  membershipId: string;
  name: string;
  /** `null` when the player is not on the match sheet at all. */
  squadRole: SquadRole | null;
  isInjured: boolean;
};

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/** Chronological order: the starting seven, then each change as the match goes on. */
export function sortPlans<T extends { fromMinute: number; isInitial: boolean }>(
  lineups: readonly T[],
): T[] {
  return [...lineups].sort((a, b) => {
    if (a.fromMinute !== b.fromMinute) return a.fromMinute - b.fromMinute;
    return Number(b.isInitial) - Number(a.isInitial);
  });
}

/**
 * The composition the team is playing immediately **before** `minute` — the one a plan at that
 * minute is a change to.
 *
 * `exceptId` leaves the plan being edited out of the comparison, so re-opening the 30th-minute
 * composition still diffs it against the starting seven rather than against itself.
 */
export function planInForceBefore(
  lineups: readonly PlannedLineup[],
  minute: number,
  exceptId?: string | null,
): PlannedLineup | null {
  const candidates = sortPlans(
    lineups.filter((lineup) => lineup.id !== exceptId && lineup.fromMinute < minute),
  );
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/** True when another composition already starts at that minute (`lineups_match_from_minute_unique`). */
export function minuteIsTaken(
  lineups: readonly PlannedLineup[],
  minute: number,
  exceptId?: string | null,
): boolean {
  return lineups.some((lineup) => lineup.id !== exceptId && lineup.fromMinute === minute);
}

/** The next free minute mark, so the « ajouter » button can propose something sensible. */
export function suggestNextMinute(
  lineups: readonly PlannedLineup[],
  totalMinutes: number,
): number {
  const half = Math.max(1, Math.round(totalMinutes / 2));
  const candidates = [half, ...Array.from({ length: totalMinutes }, (_, index) => index + 1)];
  return candidates.find((minute) => !minuteIsTaken(lineups, minute)) ?? half;
}

/* -------------------------------------------------------------------------- */
/* French labels                                                              */
/* -------------------------------------------------------------------------- */

/** French ordinal, feminine — « 1re », « 30ᵉ ». */
export function ordinalFr(value: number): string {
  return value === 1 ? "1re" : `${value}ᵉ`;
}

/** How a composition announces itself: « Composition de départ » or « À partir de la 30ᵉ minute ». */
export function planTitleFr(lineup: { fromMinute: number; isInitial: boolean }): string {
  if (lineup.isInitial || lineup.fromMinute === 0) return "Composition de départ";
  return `À partir de la ${ordinalFr(lineup.fromMinute)} minute`;
}

/** The same thing, short enough for a badge: « 0' » / « 30' ». */
export function planMinuteBadgeFr(lineup: { fromMinute: number }): string {
  return `${lineup.fromMinute}'`;
}

/** What the match sheet calls each role. `null` is a real answer: « non retenu ». */
export const SQUAD_ROLE_LABELS: Record<SquadRole, string> = {
  starter: "Titulaire",
  substitute: "Remplaçant",
  supporter: "Supporter",
};

export function squadRoleLabelFr(role: SquadRole | null): string {
  return role === null ? "Non retenu" : SQUAD_ROLE_LABELS[role];
}

export type SquadCounts = {
  starters: number;
  substitutes: number;
  supporters: number;
  unselected: number;
};

export function countSquadRoles(members: readonly { squadRole: SquadRole | null }[]): SquadCounts {
  return {
    starters: members.filter((member) => member.squadRole === "starter").length,
    substitutes: members.filter((member) => member.squadRole === "substitute").length,
    supporters: members.filter((member) => member.squadRole === "supporter").length,
    unselected: members.filter((member) => member.squadRole === null).length,
  };
}

/**
 * The one-line state of the match sheet: « 7 titulaires · 4 remplaçants · 1 supporter ».
 *
 * Roles with nobody in them are left out rather than printed as a zero — the line is read at a
 * glance on a phone, and « 0 supporter » is noise.
 */
export function squadSummaryFr(counts: SquadCounts): string {
  const parts: string[] = [];
  if (counts.starters > 0) {
    parts.push(counts.starters === 1 ? "1 titulaire" : `${counts.starters} titulaires`);
  }
  if (counts.substitutes > 0) {
    parts.push(counts.substitutes === 1 ? "1 remplaçant" : `${counts.substitutes} remplaçants`);
  }
  if (counts.supporters > 0) {
    parts.push(counts.supporters === 1 ? "1 supporter" : `${counts.supporters} supporters`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Feuille de match vide";
}

/* -------------------------------------------------------------------------- */
/* The deduced changes                                                        */
/* -------------------------------------------------------------------------- */

export type DeducedChanges = {
  substitutions: readonly Substitution[];
  positionChanges: readonly PositionChange[];
  /** One French line per change, in the order the coach would carry them out. */
  lines: readonly string[];
  /** The same on one line — « Aucun changement » when there is nothing to do. */
  summary: string;
  isEmpty: boolean;
  /** False when there is no earlier composition to compare against — nothing can be deduced. */
  hasPrevious: boolean;
};

/**
 * What has to happen on the pitch to go from `previous` to `target`.
 *
 * Position changes that keep the same `position_code` are dropped: sliding a player between the two
 * `MC` slots of a double pivot, or keeping a centre-back a centre-back through a change of
 * formation, is not a change a coach needs to be told about — and printing « Karim passe MC → MC »
 * would make the genuinely useful lines harder to spot.
 */
export function deduceChanges(
  previous: { assignments: readonly SlotAssignment[]; slots: readonly PlanSlot[] } | null,
  target: { assignments: readonly SlotAssignment[]; slots: readonly PlanSlot[] },
  nameOf: (memberId: string) => string,
  options: { long?: boolean } = {},
): DeducedChanges {
  const diff = diffLineups(previous?.assignments ?? [], target.assignments, {
    slots: slotCatalogue(previous?.slots ?? [], target.slots),
  });

  const meaningful: LineupDiff = {
    ...diff,
    positionChanges: diff.positionChanges.filter(
      (change) => change.fromPositionCode !== change.toPositionCode,
    ),
  };

  /*
   * With no earlier composition there is nothing to deduce, and saying so has to be explicit: the
   * diff against an empty pitch is seven arrivals, and « Hugo entre, Nico entre, … » under the
   * starting sheet is the « 7 changements » lie in another form. It used to be suppressed by
   * `describeLineupDiffFr` omitting unpaired arrivals altogether, which was a bug everywhere else.
   */
  const hasPrevious = (previous?.assignments.length ?? 0) > 0;
  const lines = hasPrevious ? describeLineupDiffFr(meaningful, nameOf, options) : [];

  return {
    substitutions: meaningful.substitutions,
    positionChanges: meaningful.positionChanges,
    lines,
    summary: hasPrevious ? summariseLineupDiffFr(meaningful, nameOf, options) : "Aucun changement",
    isEmpty: lines.length === 0,
    hasPrevious,
  };
}

/** The slots of both compositions in one catalogue, so the diff can name every position. */
export function slotCatalogue(
  ...groups: readonly (readonly PlanSlot[])[]
): SlotInfo[] {
  const byId = new Map<string, SlotInfo>();
  for (const group of groups) {
    for (const slot of group) {
      if (!byId.has(slot.id)) {
        byId.set(slot.id, { id: slot.id, positionCode: slot.positionCode, sort: slot.sort });
      }
    }
  }
  return [...byId.values()];
}

/** Names for the diff, falling back to something readable for a player who has since left. */
export function nameOfMembers(
  members: readonly PlanMember[],
): (memberId: string) => string {
  const names = new Map(members.map((member) => [member.membershipId, member.name]));
  return (memberId) => names.get(memberId) ?? "Joueur inconnu";
}

/* -------------------------------------------------------------------------- */
/* What is wrong with a plan                                                  */
/* -------------------------------------------------------------------------- */

export type PlanIssueCode =
  | "incomplete"
  | "no-goalkeeper"
  | "unknown-member"
  | "off-sheet"
  | "supporter"
  | "injured";

export type PlanIssue = {
  code: PlanIssueCode;
  /** The player concerned, when the problem is about one. */
  memberId: string | null;
  /** Ready to print. French, because the coach reads it (decision 012). */
  messageFr: string;
  /** A blocking problem cannot be saved; a warning is only shown. */
  blocking: boolean;
};

/**
 * Everything worth telling the coach about a composition.
 *
 * The one that matters in practice: a plan written three days ago that puts on a player who has
 * since been dropped from the match sheet. The plan is kept — deleting rows behind the coach's back
 * would be worse — but it is flagged, on the list and in the editor, until it is fixed.
 *
 * Only two things block a save: an incomplete seven and a missing goalkeeper. Everything else is a
 * judgement the coach is allowed to make (a player marked injured who says he will be fine, a
 * substitute promoted at the last minute).
 */
export function findPlanIssues(input: {
  assignments: readonly SlotAssignment[];
  slots: readonly PlanSlot[];
  members: readonly PlanMember[];
}): PlanIssue[] {
  const { assignments, slots } = input;
  const byId = new Map(input.members.map((member) => [member.membershipId, member]));
  const issues: PlanIssue[] = [];

  const filled = assignments.filter((assignment) =>
    slots.some((slot) => slot.id === assignment.slotId),
  );
  const missing = slots.length - filled.length;
  if (missing > 0) {
    issues.push({
      code: "incomplete",
      memberId: null,
      messageFr:
        missing === 1
          ? "Il reste un poste à pourvoir."
          : `Il reste ${missing} postes à pourvoir.`,
      blocking: true,
    });
  }

  const keeperSlot = slots.find((slot) => slot.positionCode === "GB");
  const keeper = keeperSlot
    ? filled.find((assignment) => assignment.slotId === keeperSlot.id)
    : undefined;
  if (!keeper) {
    issues.push({
      code: "no-goalkeeper",
      memberId: null,
      messageFr: "Personne n’est dans les buts.",
      blocking: true,
    });
  }

  for (const assignment of filled) {
    const member = byId.get(assignment.memberId);
    if (!member) {
      issues.push({
        code: "unknown-member",
        memberId: assignment.memberId,
        messageFr: "Un joueur de cette composition ne fait plus partie de l’effectif.",
        blocking: false,
      });
      continue;
    }
    if (member.squadRole === null) {
      issues.push({
        code: "off-sheet",
        memberId: member.membershipId,
        messageFr: `${member.name} n’est plus sur la feuille de match.`,
        blocking: false,
      });
    } else if (member.squadRole === "supporter") {
      issues.push({
        code: "supporter",
        memberId: member.membershipId,
        messageFr: `${member.name} est inscrit comme supporter.`,
        blocking: false,
      });
    }
    if (member.isInjured) {
      issues.push({
        code: "injured",
        memberId: member.membershipId,
        messageFr: `${member.name} est blessé.`,
        blocking: false,
      });
    }
  }

  return issues;
}

/** The blocking problems only — what a Server Action refuses on. */
export function blockingIssues(issues: readonly PlanIssue[]): PlanIssue[] {
  return issues.filter((issue) => issue.blocking);
}
