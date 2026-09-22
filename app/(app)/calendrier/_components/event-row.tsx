/**
 * One line of the chronological list.
 *
 * Dense on purpose: past and upcoming events are scanned, not read. The whole row is a single
 * link — 44px tall at minimum — because a row with two tap targets on it is a row you mis-tap
 * one-handed.
 */

import Link from "next/link";

import { formatShortDay, formatTime } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/calendar/timeline";
import {
  AvailabilityBadge,
  ScorePill,
  attendanceSummary,
  matchSubtitle,
  matchTitle,
  trainingSubtitle,
} from "./event-parts";

export type EventRowProps = {
  event: CalendarEvent;
  /** Upcoming rows show the viewer's answer; past rows show the result instead. */
  variant: "upcoming" | "past";
};

export function EventRow({ event, variant }: EventRowProps) {
  const startsAt = new Date(event.startsAt);
  const isMatch = event.kind === "match";
  const href = isMatch ? `/match/${event.id}` : `/entrainements/${event.id}`;
  const title = isMatch ? matchTitle(event) : "Entraînement";
  const subtitle = isMatch ? matchSubtitle(event) : trainingSubtitle(event);
  const attendance = !isMatch ? attendanceSummary(event) : null;

  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="w-20 shrink-0 text-xs leading-tight text-ink-subtle">
          <span className="block font-medium text-ink-muted">{formatShortDay(startsAt)}</span>
          <span className="block tabular-nums">{formatTime(startsAt)}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={
              isMatch
                ? "block truncate font-semibold text-ink"
                : "block truncate font-medium text-ink"
            }
          >
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-xs text-ink-subtle">{subtitle}</span>
          ) : null}
          {attendance ? (
            <span className="block truncate text-xs text-ink-subtle">{attendance}</span>
          ) : null}
        </span>

        {variant === "past" && isMatch ? (
          <ScorePill match={event} />
        ) : variant === "upcoming" ? (
          <AvailabilityBadge status={event.myAvailability} />
        ) : null}
      </Link>
    </li>
  );
}
