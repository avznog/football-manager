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

import { FORMATION_SLOT_COUNT } from "@/db/reference";
import type { EntryMode, MatchStatus, SquadRole } from "@/db/schema";
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

/**
 * What the editor's footer says about the state of the form.
 *
 * « À jour. » is only true of something that has been saved. A composition being *created* has
 * nothing to be up to date with, and it said « À jour. » under seven discs the moment they were
 * pre-filled (`lib/composition/prefill.ts`) — a screen claiming a plan the coach had not yet asked
 * for, which is decision 097's class of defect exactly. Being new outranks being dirty: nothing is
 * recorded either way.
 */
export function editorSaveStateFr(input: { isNew: boolean; dirty: boolean }): string {
  if (input.isNew) return "Rien n’est encore enregistré.";
  return input.dirty ? "Modifications non enregistrées." : "À jour.";
}

/**
 * The card at the foot of the compositions list, which offers the next plan.
 *
 * It used to promise a blank pitch by omission. Now that the editor opens with the team in force at
 * that minute, the card says so: a coach who reads « Nouvelle composition » and expects to place
 * seven players will not otherwise discover that he only has to move one.
 */
export function newPlanPromptFr(totalMinutes: number): { title: string; description: string } {
  return {
    title: "Planifier un changement",
    description:
      "Une composition « à partir de la minute X ». L’équipe déjà en place à cette minute est " +
      `reprise : tu ne déplaces que ce qui change. Le match dure ${totalMinutes} minutes.`,
  };
}

/** What the match sheet calls each role. `null` is a real answer: « hors feuille ». */
export const SQUAD_ROLE_LABELS: Record<SquadRole, string> = {
  starter: "Titulaire",
  substitute: "Remplaçant",
  supporter: "Supporter",
};

/**
 * « Hors feuille » and not « Non retenu », because `null` in this column means two different things
 * and the app cannot tell them apart: a coach who decided to leave the player out, and a sheet nobody
 * has touched. On a match created a minute ago every one of the thirteen rows is `null` — « Non
 * retenu » states a decision that has not been taken, thirteen times over.
 */
export function squadRoleLabelFr(role: SquadRole | null): string {
  return role === null ? "Hors feuille" : SQUAD_ROLE_LABELS[role];
}

export type SquadCounts = {
  starters: number;
  substitutes: number;
  supporters: number;
  unselected: number;
};

/** What counting a match sheet needs of a member: whether he plays, and where he was put. */
export type SheetCandidate = {
  /** `team_members.is_player`: a team can hold a coach, or a manager, who never plays. */
  isPlayer: boolean;
  squadRole: SquadRole | null;
};

/**
 * Whether this member belongs on the match sheet at all — the pool the sheet is drawn from.
 *
 * A team can hold members who do not play: a second coach, a manager (`is_player = false`,
 * `docs/DATA_MODEL.md`). They are not candidates for the sheet, and therefore they are not « hors
 * feuille » either — a coach who never plays is not somebody the coach forgot to pick.
 *
 * The exception is why this is a rule and not a `where` clause: a non-player who *is* on the sheet
 * stays in the pool. Otherwise the one screen that could take him back off would be the one screen
 * that no longer shows him.
 */
export function isSheetCandidate(member: SheetCandidate): boolean {
  return member.isPlayer || member.squadRole !== null;
}

/**
 * The match sheet in four numbers.
 *
 * It filters the pool itself rather than trusting the caller to have done it, because that trust is
 * exactly what broke: the match page and the compositions header both handed it the whole squad and
 * both announced « 3 hors feuille » on a thirteen-player team with eleven names on the sheet, while
 * the sheet screen — which filtered first — said « 2 ». Two adjacent screens, one tap apart,
 * disagreeing about the same eleven names; the thirteenth « player » was a coach who never plays
 * (decision NNN).
 */
export function countSquadRoles(members: readonly SheetCandidate[]): SquadCounts {
  const pool = members.filter(isSheetCandidate);
  return {
    starters: pool.filter((member) => member.squadRole === "starter").length,
    substitutes: pool.filter((member) => member.squadRole === "substitute").length,
    supporters: pool.filter((member) => member.squadRole === "supporter").length,
    unselected: pool.filter((member) => member.squadRole === null).length,
  };
}

/**
 * The one-line state of the match sheet: « 7 titulaires · 3 remplaçants · 1 supporter · 2 hors
 * feuille ».
 *
 * Roles with nobody in them are left out rather than printed as a zero — the line is read at a
 * glance on a phone, and « 0 supporter » is noise.
 *
 * The last part is what makes the line add up. Without it a thirteen-player squad summarised as
 * « 7 titulaires · 3 remplaçants · 1 supporter » leaves two players unaccounted for, and a coach
 * counting on his fingers cannot tell whether he forgot somebody or the app did.
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
  // Only once somebody is on the sheet: on an untouched one this would be the whole squad, and the
  // line already says « Feuille de match vide », which is both shorter and truer — nobody has been
  // left out of a sheet that does not exist yet.
  if (parts.length > 0 && counts.unselected > 0) {
    parts.push(`${counts.unselected} hors feuille`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Feuille de match vide";
}

/**
 * What the « Et maintenant ? » card on the match sheet should say, and where it should point.
 *
 * It used to say « Le groupe est fait : place les sept sur le terrain. » on every sheet, in every
 * state. On a match created a minute ago that is a completed selection nobody has made; on a match
 * played a fortnight ago it is an instruction for a match that is over; and with nine names ticked it
 * names a seven that does not exist. Decision 084, which is decision 083's rule applied to a
 * next-step card: **it describes the form in front of the coach, not a match.**
 *
 * The four cases are the four different pieces of advice, in the order a coach meets them:
 *
 *   - **finished** — nothing to place. The sheet is frozen (`SquadSheet` already says so), so the
 *     card stops giving instructions and offers the recap instead.
 *   - **nobody ticked** — the composition editor would open with an empty bench, so there is no link
 *     at all: the next step is on this screen, above.
 *   - **fewer than seven** — worth saying how many are missing, and worth keeping the link: placing
 *     four while thinking about the fifth is a normal way to work.
 *   - **more than seven** — there are only seven places (`FORMATION_SLOT_COUNT`), and nothing stops a
 *     coach ticking eight. The badge turns amber; this says by how much.
 *
 * `live` is deliberately not a case of its own. A composition prepared during a match is the normal
 * way to plan a change, and invariant 3 means it is still only a proposal.
 */
export function sheetNextStepFr(
  counts: SquadCounts,
  status: MatchStatus,
): { description: string; cta: "composition" | "recap" | null } {
  if (status === "finished") {
    return {
      description:
        "Le match est joué : la feuille reste ici pour mémoire. Le résumé dit ce qui s’est passé.",
      cta: "recap",
    };
  }
  if (counts.starters === 0) {
    return {
      description:
        "Personne n’est encore titulaire. Coche d’abord le groupe ci-dessus : sans titulaire, il " +
        "n’y a personne à placer sur le terrain.",
      cta: null,
    };
  }
  if (counts.starters < FORMATION_SLOT_COUNT) {
    const missing = FORMATION_SLOT_COUNT - counts.starters;
    return {
      description:
        `${counts.starters} titulaire${counts.starters > 1 ? "s" : ""} sur ${FORMATION_SLOT_COUNT} : ` +
        `il en manque ${missing}. Tu peux déjà placer ${counts.starters > 1 ? "ceux-là" : "celui-là"} ` +
        "sur le terrain et finir la feuille après.",
      cta: "composition",
    };
  }
  if (counts.starters > FORMATION_SLOT_COUNT) {
    const extra = counts.starters - FORMATION_SLOT_COUNT;
    return {
      description:
        `${counts.starters} titulaires cochés pour ${FORMATION_SLOT_COUNT} places : il y en a ` +
        `${extra} de trop. Repasse${extra > 1 ? "-les en remplaçants" : "-le en remplaçant"} ` +
        "avant de composer.",
      cta: "composition",
    };
  }
  return { description: "Le groupe est fait : place les sept sur le terrain.", cta: "composition" };
}

/**
 * What the compositions screen may offer, and what its empty states should say.
 *
 * The page was written for a match that has not been played, and said the same things for one that
 * has. On the demo season's FC des Deux-Ponts — finished, typed up afterwards, no composition ever
 * saved — it read « Le terrain est vide · Place tes sept joueurs sur la pelouse : tu pourras ensuite
 * planifier les changements », about a match played ten days earlier. Below the compositions of CS
 * Morvan, played and won, it offered « Planifier un changement … Le match dure 60 minutes » and a
 * button that actually worked: `saveLineup` had no `finished` guard, so a coach could add a plan « à
 * partir de la 30ᵉ minute » to a match that was over. The match sheet had refused exactly that since
 * M3 — « Le match est terminé : la feuille de match ne change plus. »
 *
 * So this settles the rule for the whole match, not just this screen (decision NNN): **a finished
 * match is a record everywhere, and every screen that could write to it says so in the same words.**
 * The way to change one is `lib/retro/amend.ts`, which appends (invariant 1) and re-freezes the
 * statistics; it is not a plan for a minute that has already been played. `lineupsFrozenFr` says so
 * in one place, shared by this screen's notice and the editor's dead end, so the two cannot drift
 * (the decision 073 move).
 *
 * `live` is editable on purpose: planning the 40th minute during the 20th is the point of the screen,
 * and invariant 3 means the plan is still only a proposal.
 */
export function lineupsFrozenFr(entryMode: EntryMode): string {
  // It was a constant for a day, and it credited « le mode match » on matches nobody watched — the
  // same defect as the notice below, in the sentence written to fix it (decision NNN).
  return entryMode === "retro"
    ? "Les compositions d’un match joué ne changent plus : elles disent ce qui était prévu, et " +
      "celles qui viennent de la saisie disent ce qui a été joué. Pour corriger le match lui-même, " +
      "repasse par sa saisie."
    : "Les compositions d’un match joué ne changent plus : elles disent ce qui était prévu, et " +
      "celles que le mode match a confirmées disent ce qui a été joué. Pour corriger le match " +
      "lui-même, passe par sa saisie.";
}

/**
 * Why an applied composition has stopped being editable — in words that are true of *this* match.
 *
 * « Elle a été confirmée pendant le match » was said about every applied composition, including the
 * ones on a match nobody watched: `lib/retro/log.ts` writes a `LINEUP_APPLIED` at 0′ for a retro
 * entry, deliberately, so that the seven count as starters and the goalkeeper is known. The demo
 * season has exactly that row — FC Rivière, `entry_mode = 'retro'`, its starting composition marked
 * applied — and the screen credited a confirmation to a match the coach typed up on his sofa.
 *
 * The state is the same in both cases, and it is the right state: a record, not a plan. Only the
 * account of how it got there changes, which is decision 013's distinction again: `entry_mode` is in
 * the database so the UI can stop describing a saisie as something somebody witnessed.
 */
export function appliedNoticeFr(entryMode: EntryMode): {
  /** « confirmée pendant le match » — a participle, so each sentence keeps its own ending. */
  howFr: string;
  /** Under the pitch, in the list of compositions. */
  listFr: string;
  /** The editor's dead end, which has a heading of its own above it. */
  editorFr: string;
  /** What `saveLineup` answers if a form reaches it anyway. */
  refusalFr: string;
} {
  const howFr =
    entryMode === "retro" ? "enregistrée avec la saisie du match" : "confirmée pendant le match";

  return {
    howFr,
    listFr: `Cette composition a été ${howFr} : elle ne change plus.`,
    editorFr: `Elle a été ${howFr} : elle décrit ce qui s’est passé, pas ce qui était prévu.`,
    refusalFr: `Cette composition a été ${howFr} : elle ne peut plus être modifiée.`,
  };
}

export function compositionsScreenFr(match: { status: MatchStatus; entryMode: EntryMode }): {
  /** Whether the screen may offer to create, modify or delete a composition. */
  editable: boolean;
  /** Said once, above the compositions, when they have stopped being plans. */
  frozenNoticeFr: string | null;
  /**
   * The link in the header to the match sheet. « modifier la feuille » is a promise the sheet does
   * not keep once the match is over: `SquadSheet` gets `frozen` and refuses every checkbox.
   */
  sheetLinkFr: string;
  /** Nobody on the match sheet, so there is nobody to place. */
  emptySheetFr: { title: string; description: string; withCta: boolean };
  /** Somebody on the sheet, but no composition saved. */
  noPlansFr: { title: string; description: string; withCta: boolean };
} {
  if (match.status !== "finished") {
    return {
      editable: true,
      frozenNoticeFr: null,
      sheetLinkFr: "modifier la feuille",
      emptySheetFr: {
        title: "Personne n’est encore retenu",
        description:
          "Choisis d’abord tes titulaires et tes remplaçants : seuls eux peuvent être placés sur " +
          "le terrain.",
        withCta: true,
      },
      noPlansFr: {
        title: "Le terrain est vide",
        description:
          "Place tes sept joueurs sur la pelouse : tu pourras ensuite planifier les changements.",
        withCta: true,
      },
    };
  }

  return {
    editable: false,
    frozenNoticeFr: lineupsFrozenFr(match.entryMode),
    sheetLinkFr: "voir la feuille",
    emptySheetFr: {
      title: "Aucune feuille de match",
      description:
        "Le match est joué et personne n’a été retenu sur la feuille : il n’y a rien à composer.",
      withCta: false,
    },
    noPlansFr: {
      // Not « Aucune composition » again: the card around it is already titled that, and at 390 px the
      // two headings landed one under the other, the same three words twice.
      title: match.entryMode === "retro" ? "Saisi sans composition" : "Le terrain est resté vide",
      description:
        match.entryMode === "retro"
          ? "Ce match a été saisi après coup, sans composition : les temps de jeu viennent de la " +
            "saisie et non d’un placement sur le terrain."
          : "Aucune composition n’a été enregistrée pour ce match, et il est joué : il n’y a plus " +
            "rien à placer.",
      withCta: false,
    },
  };
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
  /**
   * Slots nobody is standing in. A saved composition always has none — an incomplete one is
   * blocking (`findPlanIssues`) — so this is only ever non-zero for the draft in the editor, which
   * is the point: until the last post is filled, the difference against the previous team is not a
   * change list but the state of an unfinished form.
   */
  slotsLeft: number;
};

/**
 * What has to happen on the pitch to go from `previous` to `target`.
 *
 * Position changes that keep the same `position_code` are dropped: sliding a player between the two
 * `MC` slots of a double pivot, or keeping a centre-back a centre-back through a change of
 * formation, is not a change a coach needs to be told about — and printing « Karim passe MC → MC »
 * would make the genuinely useful lines harder to spot.
 *
 * Nothing is deduced in either direction while one of the two teams is not a team: no earlier
 * composition, or a target with empty slots. Both are the same lie in mirror image, and both
 * used to be printed — see `slotsLeft` (decision NNN).
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

  /*
   * And the mirror of it, which the editor showed for as long as the editor existed. « Nouvelle
   * composition » opens on an empty pitch, so the diff against the seven in force was seven
   * departures: « Hugo sort · Samir sort · Thomas sort · Nico sort · Léo sort · Karim sort · Julien
   * sort », under a card headed « Changements déduits », for a coach who had not yet touched a
   * player. It counts the slots of the target because an empty *pitch* is legitimate in the other
   * caller — a plan may field six after an injury (`describeLineupDiffFr`) — whereas a slot with
   * nobody in it is only ever a form the coach has not finished.
   */
  const placed = new Set(
    target.assignments
      .filter((assignment) => target.slots.some((slot) => slot.id === assignment.slotId))
      .map((assignment) => assignment.slotId),
  );
  const slotsLeft = Math.max(0, target.slots.length - placed.size);

  const deducible = hasPrevious && slotsLeft === 0;
  const lines = deducible ? describeLineupDiffFr(meaningful, nameOf, options) : [];

  return {
    // Emptied with the lines, and for the same reason: they only feed the « 2 changements · 1
    // repositionnement » badge, and a count above a list that is deliberately not shown is the
    // « 0 – 0 » of decision 061 all over again.
    substitutions: deducible ? meaningful.substitutions : [],
    positionChanges: deducible ? meaningful.positionChanges : [],
    lines,
    summary: deducible ? summariseLineupDiffFr(meaningful, nameOf, options) : "Aucun changement",
    isEmpty: lines.length === 0,
    hasPrevious,
    slotsLeft,
  };
}

/**
 * « Il reste 4 postes à pourvoir : les changements apparaîtront quand l’équipe sera complète. »
 *
 * What « Changements déduits » says while `slotsLeft` is not zero. Not « Aucun changement », which is
 * the answer for two complete teams that happen to be identical — a different thing from a form whose
 * question has not been answered yet (decisions 083 and NNN).
 */
export function draftChangesPendingFr(slotsLeft: number): string {
  const posts = slotsLeft === 1 ? "un poste" : `${slotsLeft} postes`;
  return `Il reste ${posts} à pourvoir : les changements apparaîtront quand l’équipe sera complète.`;
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
