/**
 * The unified calendar, as pure data.
 *
 * `docs/PROJECT.md` describes one chronological list of matches **and** trainings, with the next
 * event pinned at the top and a big availability control on it. That merge, and the definition of
 * "next", live here rather than in the page so they can be unit tested without a database or a
 * browser — see `timeline.test.ts`.
 *
 * Instants cross the RSC boundary as ISO strings (`CLAUDE.md`: no raw `Date` objects), and are
 * rendered through `lib/calendar/time.ts`, which pins Europe/Paris.
 */

import type { AvailabilityStatus, Competition, MatchStatus } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Durations                                                                  */
/* -------------------------------------------------------------------------- */

/** Half-time, so a 2×30 occupies 75 minutes of a Sunday morning rather than 60. */
export const HALF_TIME_MINUTES = 15;

/**
 * How long an event is considered to be *happening*. Nothing is stored about the end of a
 * match or a training, so it is estimated: the estimate is only used to decide when an event
 * stops being "next" and becomes history.
 */
export const TRAINING_DURATION_MINUTES = 90;

/**
 * A generous tail after the final whistle. The coach marks attendance and the squad rates each
 * other in the minutes after an event, so it must stay pinned rather than vanish on the whistle.
 */
export const GRACE_MINUTES = 60;

/** Total wall-clock length of a match, breaks and grace included (decision 009). */
export function matchWindowMinutes(periodsCount: number, periodMinutes: number): number {
  const play = periodsCount * periodMinutes;
  const breaks = Math.max(0, periodsCount - 1) * HALF_TIME_MINUTES;
  return play + breaks + GRACE_MINUTES;
}

/** Total wall-clock length of a training, grace included. */
export function trainingWindowMinutes(): number {
  return TRAINING_DURATION_MINUTES + GRACE_MINUTES;
}

/** `startsAt` + `minutes`, as an ISO string. */
export function addMinutes(startsAt: Date, minutes: number): string {
  return new Date(startsAt.getTime() + minutes * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/* The events                                                                 */
/* -------------------------------------------------------------------------- */

/** Counts only — the calendar list shows tallies, never thirteen names. */
export type AvailabilityCounts = { yes: number; no: number; maybe: number };

export type CalendarMatch = {
  kind: "match";
  id: string;
  /** ISO 8601 instant of the kick-off. */
  startsAt: string;
  /** ISO 8601 estimate of when it stops being the current event. Derived, never stored. */
  endsAt: string;
  opponentName: string;
  isHome: boolean;
  venue: string | null;
  competition: Competition;
  status: MatchStatus;
  periodsCount: number;
  periodMinutes: number;
  /** Derived from `match_events` (decision 003). Null while the match has not been played. */
  score: { goalsFor: number; goalsAgainst: number } | null;
  /** The viewer's own answer, or null if they have not answered. */
  myAvailability: AvailabilityStatus | null;
  answers: AvailabilityCounts;
  /** Active players in the squad, so "who has not answered" is a subtraction. */
  squadSize: number;
};

export type CalendarTraining = {
  kind: "training";
  id: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  note: string | null;
  myAvailability: AvailabilityStatus | null;
  answers: AvailabilityCounts;
  squadSize: number;
  /** Actual attendance, once the coach has ticked it. `marked` is 0 when nobody has been. */
  attendance: { present: number; marked: number };
};

export type CalendarEvent = CalendarMatch | CalendarTraining;

/** `true` while a match is being played — such an event is never history. */
export function isLiveEvent(event: TimelineItem): boolean {
  return event.kind === "match" && event.status === "live";
}

/* -------------------------------------------------------------------------- */
/* Chronology                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The minimum shape the chronology needs. Declared structurally so the functions below can be
 * unit tested against three-field literals instead of full fixtures.
 */
export type TimelineItem = {
  startsAt: string;
  endsAt: string;
} & ({ kind: "match"; status: MatchStatus } | { kind: "training" });

/** Oldest first. Ties broken on kind then start string, so the order is total and stable. */
export function byStartAscending(a: TimelineItem, b: TimelineItem): number {
  const delta = Date.parse(a.startsAt) - Date.parse(b.startsAt);
  if (delta !== 0) return delta;
  // A match outranks a training at the same minute: it is the bigger commitment.
  if (a.kind !== b.kind) return a.kind === "match" ? -1 : 1;
  return 0;
}

/** Started, not finished: the event that is happening right now. */
export function isOngoing(item: TimelineItem, now: Date): boolean {
  if (isLiveEvent(item)) return true;
  const start = Date.parse(item.startsAt);
  const end = Date.parse(item.endsAt);
  return start <= now.getTime() && now.getTime() < end;
}

/** Over and done with — including its grace window. A live match is never past. */
export function isPast(item: TimelineItem, now: Date): boolean {
  if (isLiveEvent(item)) return false;
  return Date.parse(item.endsAt) <= now.getTime();
}

export type Timeline<T extends TimelineItem> = {
  /**
   * The one event pinned at the top of `/calendrier`, with the big « Je suis dispo » control.
   *
   * It is the event happening now if there is one — a match being played, or a training that
   * started twenty minutes ago — and otherwise the soonest one to come. Null only when the
   * season is over and nothing is planned.
   */
  next: T | null;
  /** Everything else still to come, chronological. */
  upcoming: T[];
  /** Everything finished, **most recent first**: that is the order you want to read results in. */
  past: T[];
};

/**
 * Splits one merged list of matches and trainings into what the page renders.
 *
 * `now` is a parameter, never `Date.now()`: that is what makes the boundary cases — an event
 * starting this second, a match that overran, a training that ended a minute ago — testable.
 */
export function splitTimeline<T extends TimelineItem>(items: readonly T[], now: Date): Timeline<T> {
  const sorted = [...items].sort(byStartAscending);
  const active = sorted.filter((item) => !isPast(item, now));
  const past = sorted.filter((item) => isPast(item, now)).reverse();

  return { next: active[0] ?? null, upcoming: active.slice(1), past };
}

/* -------------------------------------------------------------------------- */
/* Who has answered, and who has not                                          */
/* -------------------------------------------------------------------------- */

/** How many players still owe an answer. Never negative, even if the squad shrank since. */
export function pendingCount(squadSize: number, answers: AvailabilityCounts): number {
  return Math.max(0, squadSize - answers.yes - answers.no - answers.maybe);
}

/** A player, reduced to what a list of names needs. */
export type Responder = {
  membershipId: string;
  displayName: string;
};

export type AvailabilityTally = {
  yes: Responder[];
  no: Responder[];
  maybe: Responder[];
  /** No row in `match_availability` / `training_availability` at all. */
  pending: Responder[];
  answered: number;
  total: number;
};

/**
 * Buckets a squad by its declared availability, preserving the order the players came in
 * (coaches first, then shirt numbers — see `getSquad`).
 *
 * This is the coach's screen: the `pending` bucket is the list he copies into WhatsApp.
 */
export function tallyAvailability(
  players: readonly Responder[],
  answers: readonly { teamMemberId: string; status: AvailabilityStatus }[],
): AvailabilityTally {
  const byMember = new Map(answers.map((answer) => [answer.teamMemberId, answer.status]));
  const tally: AvailabilityTally = {
    yes: [],
    no: [],
    maybe: [],
    pending: [],
    answered: 0,
    total: players.length,
  };

  for (const player of players) {
    const status = byMember.get(player.membershipId);
    if (status === undefined) {
      tally.pending.push(player);
      continue;
    }
    tally[status].push(player);
    tally.answered += 1;
  }

  return tally;
}

/** Counts from a tally, for the compact badges on a list row. */
export function countsOf(tally: AvailabilityTally): AvailabilityCounts {
  return { yes: tally.yes.length, no: tally.no.length, maybe: tally.maybe.length };
}

/**
 * The message a coach pastes into the team's WhatsApp group.
 *
 * There are no notifications and no e-mails by design (decision 015): the app's job is to tell
 * the coach exactly who to nag, in a form he can copy in one tap.
 */
export function buildReminderMessage(input: {
  /** e.g. « Étoile du Parc (championnat) » or « Entraînement ». */
  title: string;
  /** e.g. « dimanche 27 septembre à 10:30 ». */
  when: string;
  pending: readonly Responder[];
}): string {
  const header = `${input.title} — ${input.when}`;

  if (input.pending.length === 0) {
    return `${header}\nTout le monde a répondu. Merci !`;
  }

  const names = input.pending.map((player) => player.displayName).join(", ");
  const who =
    input.pending.length === 1
      ? `Il manque la réponse de : ${names}.`
      : `Il manque les réponses de : ${names}.`;

  return `${header}\n${who}\nMerci de répondre sur l’appli (dispo / pas dispo / peut-être).`;
}
