/**
 * The card pinned at the top of `/calendrier`.
 *
 * `docs/PROJECT.md` asks for the next event with a large availability control on it, and that is
 * the whole design brief: a player opens the app to answer one question — *am I there on Sunday?* —
 * and must be able to answer it without scrolling, reading or navigating.
 */

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { matchNameFr } from "@/lib/calendar/labels";
import { capitalizeFirst, formatRelativeDays, formatWhen } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/calendar/timeline";
import { AvailabilityControl } from "./availability-control";
import {
  AnswersLine,
  AvailabilityBadge,
  MatchStatusBadge,
  ScorePill,
  matchSubtitle,
  matchTitle,
} from "./event-parts";

export type NextEventCardProps = {
  event: CalendarEvent;
  teamId: string;
  /** True for a player declaring for themselves; false for non-playing staff. */
  canDeclare: boolean;
  now: Date;
};

export function NextEventCard({ event, teamId, canDeclare, now }: NextEventCardProps) {
  const startsAt = new Date(event.startsAt);
  const href = `/match/${event.id}`;
  const title = matchTitle(event);
  const subtitle = matchSubtitle(event);
  const live = event.status === "live";

  /**
   * The control is offered while the answer can still change something. Once a match has kicked
   * off the sheet is what counts, and `setMatchAvailability` refuses anyway — so the UI must not
   * pretend otherwise.
   */
  const declarable = canDeclare && event.status === "scheduled";

  return (
    <Card className={live ? "border-danger/50" : "border-accent/40"}>
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

        {declarable ? (
          <AvailabilityControl
            teamId={teamId}
            matchId={event.id}
            value={event.myAvailability}
            legend={`Ta disponibilité pour le match ${matchNameFr(event.opponentName, event.isHome)}`}
          />
        ) : (
          <div className="flex items-center gap-2">
            <AvailabilityBadge status={event.myAvailability} />
            <ScorePill match={event} />
          </div>
        )}

        <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-3">
          <AnswersLine
            answers={event.answers}
            squadSize={event.squadSize}
            className="text-sm text-ink-muted"
          />
          <Link
            href={href}
            className="shrink-0 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Détails
          </Link>
        </div>
      </div>
    </Card>
  );
}
