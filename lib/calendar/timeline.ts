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

import type { AvailabilityStatus, MatchStatus } from "@/db/schema";

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

/**
 * How long before a session a coach can already be at the pitch counting heads.
 *
 * Not zero: he arrives before the players and marks the first arrivals while they change. Not an
 * hour: the point of the window is that the people being marked can plausibly be in front of him.
 */
export const ATTENDANCE_OPENS_MINUTES_BEFORE = 30;

/**
 * Whether a coach may write `training_attendance` for a session starting at `startsAt`.
 *
 * Decision 090 separated the intention from the fact — « pas dispo » is a declaration about a
 * Saturday that has not happened, « absent » is an observation about one that has — and it fixed the
 * *words* on every screen that said them. It did not close the door the words came through:
 * `AttendanceList` rendered for a coach whether or not the session was over, so « Tout le monde est
 * là » was one tap on a séance four days away, and the observation went into the fact table
 * (decision 099).
 *
 * It never closes again. A coach who forgot to mark last Thursday must still be able to, which is
 * the whole premise of decision 076's « Présences pas encore pointées ».
 */
export function attendanceIsOpen(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - ATTENDANCE_OPENS_MINUTES_BEFORE * 60_000 <= now.getTime();
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

/**
 * The heading of the history section, which used to be « Déjà joué » on every list.
 *
 * Two kinds of row have never been joué. A **training** is not played, and the demo season's history
 * has three of them interleaved with the matches — the single merged agenda is the point of the screen
 * (`docs/PROJECT.md`), so the heading has to be true of both kinds. And a **match nobody recorded**:
 * the window closes, the row drops into the history with no score, and saying it was played is the
 * calendar's version of the invention decision 013 refused — the demo season keeps exactly that row,
 * FC des Deux-Ponts, nine men named on the sheet and not one event.
 *
 * So « Déjà joué » is kept for the list where every row really was a match that was played, and the
 * wider list gets the wider word. Same rule as decision 085's heading: it has to hold for the widest
 * row, not the first three.
 */
export function pastSectionTitleFr(past: readonly PastSectionItem[]): string {
  const allPlayed = past.every((event) => event.kind === "match" && event.score !== null);
  return allPlayed ? "Déjà joué" : "Déjà passé";
}

/** Declared structurally, like `TimelineItem`, so the heading is testable against literals. */
export type PastSectionItem =
  | { kind: "match"; score: { goalsFor: number; goalsAgainst: number } | null }
  | { kind: "training" };

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

/**
 * Whether the availability list earns its place on the screen.
 *
 * Before the event, always: « 0 réponse sur 13 joueurs » with thirteen names under « Sans réponse »
 * is the list of people to chase, which is the coach's whole reason for looking.
 *
 * Afterwards, only if somebody answered. A past event nobody replied to has no record to keep, and
 * the card was the largest thing on the player's page for the demo season's 29 August session:
 * thirteen names, a month old, under a question that has already been answered by what happened.
 * The présences are the answer by then.
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
 * It used to count « 1 absent », three days before a session nobody had attended yet. Availability is
 * an intention and a présence is a fact, and this app keeps them in two different tables on purpose:
 * `training_attendance` is the one that may call somebody absent, and it only ever does so about an
 * evening that has happened (decision 076 — an unmarked player is not an absent one). Saying
 * « 1 absent » about an answer borrowed the word from the fact, on the one screen where both can be on
 * the same card.
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
  /** e.g. « Étoile du Parc (championnat) » or « Entraînement ». */
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
