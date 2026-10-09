/**
 * The unified calendar, as pure data.
 *
 * `docs/PROJECT.md` describes one chronological list of matches, with the next one pinned at the
 * top and a big availability control on it. (It used to merge trainings in too; they were removed by
 * decision 155.) That merge, and the definition of
 * "next", live here rather than in the page so they can be unit tested without a database or a
 * browser — see `timeline.test.ts`.
 *
 * Instants cross the RSC boundary as ISO strings (`CLAUDE.md`: no raw `Date` objects), and are
 * rendered through `lib/calendar/time.ts`, which pins Europe/Paris.
 */

import type { AvailabilityStatus, MatchStatus } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Durations                                                                  */
/* -------------------------------------------------------------------------- */

/** Half-time, so a 2×30 occupies 75 minutes of a Sunday morning rather than 60. */
export const HALF_TIME_MINUTES = 15;

/**
 * A generous tail after the final whistle. Nothing is stored about the end of a match, so it is
 * estimated, and the squad rates each other in the minutes after it, so it must stay pinned rather
 * than vanish on the whistle. The estimate is only used to decide when a match stops being "next"
 * and becomes history.
 */
export const GRACE_MINUTES = 60;

/** Total wall-clock length of a match, breaks and grace included (decision 009). */
export function matchWindowMinutes(periodsCount: number, periodMinutes: number): number {
  const play = periodsCount * periodMinutes;
  const breaks = Math.max(0, periodsCount - 1) * HALF_TIME_MINUTES;
  return play + breaks + GRACE_MINUTES;
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
  /** The team's own word for the competition (decision 107), not a code to look up. */
  competitionLabel: string;
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

export type CalendarEvent = CalendarMatch;

/** `true` while a match is being played — such an event is never history. */
export function isLiveEvent(event: TimelineItem): boolean {
  return event.kind === "match" && event.status === "live";
}

/**
 * `true` once a match is over — such an event is **always** history, whatever the clock says.
 *
 * The mirror image of `isLiveEvent`, and the reason it exists is decision 121: the coach can now
 * declare a match over at any moment, including before its own kick-off, so `endsAt` on its own is
 * no longer a safe answer to « has this happened ». A match dated next Sunday and typed up today
 * would otherwise sit under « À venir » with a « Je suis dispo » control while its own page says it
 * is finished and `/stats` counts it in the season — one screen contradicting another, which is the
 * whole family of defect the screen audits went looking for.
 *
 * It also settles a case that predates the feature: a match that ends early — a forfeit, a 2×25
 * agreed on the pitch — used to linger under « À venir » until its scheduled `endsAt`.
 */
export function isFinishedEvent(event: TimelineItem): boolean {
  return event.kind === "match" && event.status === "finished";
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
  kind: "match";
  status: MatchStatus;
};

/** Oldest first. */
export function byStartAscending(a: TimelineItem, b: TimelineItem): number {
  return Date.parse(a.startsAt) - Date.parse(b.startsAt);
}

/** Started, not finished: the event that is happening right now. */
export function isOngoing(item: TimelineItem, now: Date): boolean {
  if (isLiveEvent(item)) return true;
  if (isFinishedEvent(item)) return false;
  const start = Date.parse(item.startsAt);
  const end = Date.parse(item.endsAt);
  return start <= now.getTime() && now.getTime() < end;
}

/**
 * Over and done with — including its grace window. A live match is never past; a finished one
 * always is, even if its kick-off has not come round yet.
 */
export function isPast(item: TimelineItem, now: Date): boolean {
  if (isLiveEvent(item)) return false;
  if (isFinishedEvent(item)) return true;
  return Date.parse(item.endsAt) <= now.getTime();
}

export type Timeline<T extends TimelineItem> = {
  /**
   * The one event pinned at the top of `/calendrier`, with the big « Je suis dispo » control.
   *
   * It is the match happening now if there is one, and otherwise the soonest one to come. Null only when the
   * season is over and nothing is planned.
   */
  next: T | null;
  /** Everything else still to come, chronological. */
  upcoming: T[];
  /** Everything finished, **most recent first**: that is the order you want to read results in. */
  past: T[];
};

/**
 * Splits the list of matches into what the page renders.
 *
 * `now` is a parameter, never `Date.now()`: that is what makes the boundary cases — a match
 * starting this second, one that overran, one whose grace window ended a minute ago — testable.
 */
export function splitTimeline<T extends TimelineItem>(items: readonly T[], now: Date): Timeline<T> {
  const sorted = [...items].sort(byStartAscending);
  const active = sorted.filter((item) => !isPast(item, now));
  const past = sorted.filter((item) => isPast(item, now)).reverse();

  return { next: active[0] ?? null, upcoming: active.slice(1), past };
}

/**
 * The heading of the history section, which used to be « Déjà joué » on every list.
 *
 * One kind of row has never been joué — a **match nobody recorded** (trainings, the other kind, were
 * removed by decision 155): the window closes, the row drops into the history with no score, and saying it was played is the
 * calendar's version of the invention decision 013 refused — the demo season keeps exactly that row,
 * FC des Deux-Ponts, nine men named on the sheet and not one event.
 *
 * So « Déjà joué » is kept for the list where every row really was a match that was played, and the
 * wider list gets the wider word. Same rule as decision 085's heading: it has to hold for the widest
 * row, not the first three.
 */
export function pastSectionTitleFr(past: readonly PastSectionItem[]): string {
  const allPlayed = past.every((event) => event.score !== null);
  return allPlayed ? "Déjà joué" : "Déjà passé";
}

/** Declared structurally, like `TimelineItem`, so the heading is testable against literals. */
export type PastSectionItem = {
  score: { goalsFor: number; goalsAgainst: number } | null;
};

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
  /** No row in `match_availability` at all. */
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

/**
 * Whether the availability list earns its place on the screen.
 *
 * Before the event, always: « 0 réponse sur 13 joueurs » with thirteen names under « Sans réponse »
 * is the list of people to chase, which is the coach's whole reason for looking.
 *
 * Afterwards, only if somebody answered. A past event nobody replied to has no record to keep:
 * thirteen names, a month old, under a question that has already been answered by what happened.
 */
export function availabilityIsWorthShowing(
  tally: Pick<AvailabilityTally, "answered">,
  past: boolean,
): boolean {
  return past ? tally.answered > 0 : true;
}

/** Counts from a tally, for the compact badges on a list row. */
export function countsOf(tally: AvailabilityTally): AvailabilityCounts {
  return { yes: tally.yes.length, no: tally.no.length, maybe: tally.maybe.length };
}

/**
 * The tally under a pinned event: « 7 dispo · 1 pas dispo · 1 peut-être · 4 sans réponse ».
 *
 * It used to count « 1 absent », days before an event nobody had attended yet. Availability is an
 * intention, not a fact: saying « 1 absent » about an answer borrowed the word of an observation about
 * an evening that has happened (decision 076).
 *
 * « pas dispo » is what the player tapped, what his badge says, and what the relance message asks for.
 * Nothing is pluralised: « 2 pas dispo » is the same words as « 1 pas dispo », which is what makes the
 * line scannable.
 */
export function answersLineFr(answers: AvailabilityCounts, squadSize: number): string {
  const pending = pendingCount(squadSize, answers);
  const parts = [
    answers.yes > 0 ? `${answers.yes} dispo` : null,
    answers.no > 0 ? `${answers.no} pas dispo` : null,
    answers.maybe > 0 ? `${answers.maybe} peut-être` : null,
    pending > 0 ? `${pending} sans réponse` : null,
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? "Personne n’a encore répondu." : parts.join(" · ");
}

/**
 * The relance card's own heading, which said « Relancer les absents » over « 4 joueurs n'ont pas
 * répondu ».
 *
 * Nobody in that list is absent: they have not answered, which is the opposite of having said they
 * would not come, and the card's own description said so one line below its title. Decision 087's rule
 * — a heading is a claim about every row under it — and `answersLineFr`'s, in the same card.
 */
export function reminderCardFr(pending: number): { titleFr: string; descriptionFr: string } {
  if (pending === 0) {
    return {
      titleFr: "Personne à relancer",
      descriptionFr: "Tout le monde a répondu. Rien à faire.",
    };
  }

  return {
    titleFr: "Relancer ceux qui n’ont pas répondu",
    descriptionFr:
      pending === 1 ? "1 joueur n’a pas répondu." : `${pending} joueurs n’ont pas répondu.`,
  };
}

/**
 * The message a coach pastes into the team's WhatsApp group.
 *
 * There are no notifications and no e-mails by design (decision 015): the app's job is to tell
 * the coach exactly who to nag, in a form he can copy in one tap.
 */
export function buildReminderMessage(input: {
  /** e.g. « Étoile du Parc (championnat) ». */
  title: string;
  /** e.g. « dimanche 27/09/2026 à 10:30 ». */
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
