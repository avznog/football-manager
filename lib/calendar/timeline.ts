/**
 * The unified calendar, as pure data.
 *
 * `docs/PROJECT.md` describes one chronological list of matches with the next one pinned at the
 * top. (It used to merge trainings in, and to carry an availability control on the pinned card;
 * decisions 155 and 156 removed both.) The chronology and the definition of "next" live here rather
 * than in the page so they can be unit tested without a database or a browser — see
 * `timeline.test.ts`.
 *
 * Instants cross the RSC boundary as ISO strings (`CLAUDE.md`: no raw `Date` objects), and are
 * rendered through `lib/calendar/time.ts`, which pins Europe/Paris.
 */

import type { MatchStatus } from "@/db/schema";

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
 * would otherwise sit under « À venir » as if still to be played while its own page says it
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
   * The one match pinned at the top of `/calendrier`.
   *
   * It is the match happening now if there is one, and otherwise the soonest one to come. Null only
   * when the season is over and nothing is planned.
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
