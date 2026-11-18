/**
 * The card pinned at the top of `/calendrier`: when the next match is, against whom, and where.
 *
 * It used to carry the big « Dispo / Pas dispo / Peut-être » control and a tally of the answers
 * under it, because the original brief made the pinned card the place a player declares himself.
 * Availability is gone (decision 156), so the card is now a reading card: the date in words, the
 * fixture, the ground — and, once the match is under way, its live score. One link opens the match.
 */

import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { capitalizeFirst, formatRelativeDays, formatWhen } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/calendar/timeline";
import { MatchStatusBadge, ScorePill, matchSubtitle, matchTitle } from "./event-parts";

export type NextEventCardProps = {
  event: CalendarEvent;
  now: Date;
  /** Desktop placement only (decision 230): where the calendar's grid puts the card. */
  className?: string;
};

export function NextEventCard({ event, now, className }: NextEventCardProps) {
  const startsAt = new Date(event.startsAt);
  const href = `/match/${event.id}`;
  const title = matchTitle(event);
  const subtitle = matchSubtitle(event);
  const live = event.status === "live";

  return (
    <Card className={cn(live ? "border-danger/50" : "border-accent/40", className)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <MatchStatusBadge status={event.status} />
          <span className="text-xs font-medium text-ink-subtle">
            {formatRelativeDays(startsAt, now)}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-ink-muted">
            {capitalizeFirst(formatWhen(startsAt, now))}
          </p>
          <h2 className="text-2xl leading-tight font-bold tracking-tight text-ink">
            <Link
              href={href}
              className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {title}
            </Link>
          </h2>
          {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
        </div>

        {event.score !== null ? <ScorePill match={event} /> : null}

        {/* The thumb's full-width target on a phone; on desktop the size of its label rather than a
            bar across the card (decision 230). */}
        <ButtonLink href={href} variant="secondary" fullWidth className="lg:w-auto">
          Voir le match
        </ButtonLink>
      </div>
    </Card>
  );
}
