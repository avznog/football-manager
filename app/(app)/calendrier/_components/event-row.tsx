/**
 * One line of the chronological list.
 *
 * Dense on purpose: past and upcoming events are scanned, not read. The whole row is a single
 * link — 44px tall at minimum — because a row with two tap targets on it is a row you mis-tap
 * one-handed.
 */

import Link from "next/link";

import { formatDate, formatShortWeekday, formatTime } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/calendar/timeline";
import { PastMatchResult, matchSubtitle, matchTitle } from "./event-parts";

export type EventRowProps = {
  event: CalendarEvent;
  /** Past rows show the result; upcoming rows end on the fixture. */
  variant: "upcoming" | "past";
};

export function EventRow({ event, variant }: EventRowProps) {
  const startsAt = new Date(event.startsAt);
  /*
   * One destination for both variants, since decision 189 merged the match page and the recap: a
   * played match is opened to be *read* — who scored, who played, the notes — and that is now the
   * bottom of the same page a match still to be played opens on. This used to be `/recap` for a past
   * row and the `variant` is kept because the row's own contents still depend on it.
   */
  const href = `/match/${event.id}`;
  const title = matchTitle(event);
  const subtitle = matchSubtitle(event);

  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        {/*
          The weekday, then the date in digits, then the kick-off. Three short lines rather than
          « dim. 27/09/2026 », because this list spans a season that crosses a new year and a row
          with no year on it cannot say which 27 September it means.
        */}
        <span className="w-20 shrink-0 text-xs leading-tight text-ink-subtle">
          <span className="block font-medium text-ink-muted">{formatShortWeekday(startsAt)}</span>
          <span className="block tabular-nums text-ink-muted">{formatDate(startsAt)}</span>
          <span className="block tabular-nums">{formatTime(startsAt)}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{title}</span>
          {subtitle ? (
            <span className="block truncate text-xs text-ink-subtle">{subtitle}</span>
          ) : null}
        </span>

        {variant === "past" ? <PastMatchResult match={event} /> : null}
      </Link>
    </li>
  );
}
