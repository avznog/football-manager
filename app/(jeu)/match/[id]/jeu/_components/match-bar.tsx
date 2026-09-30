"use client";

import Link from "next/link";

import { scoreLineFr } from "@/lib/calendar/labels";
import type { ClockReading } from "@/lib/match/clock";

export type MatchBarProps = {
  reading: ClockReading;
  goalsFor: number;
  goalsAgainst: number;
  /** Where the back button goes, and what it is called for a screen reader. */
  matchHref: string;
  opponentName: string;
  /** « 3 actions en attente », or null when everything has reached the server. */
  pendingLabel: string | null;
  /** TERRAIN or « Composition » — the one button that belongs beside the score. */
  action?: React.ReactNode;
};

/**
 * The whole top of game mode: one row, 56 px tall, replacing the app header, the back link and the
 * old `Scoreboard` card — 217 px of chrome down to 64 including the route's padding.
 *
 * What it keeps is what the owner asked for and nothing else: **the time and the live score**
 * (decision 112). The venue badge, the entry-mode badge and the phase line all said something true and
 * none of them is looked at at 78′; they are one tap away on the match page, which is where a reader
 * who wants them already is. The clock stays `font-mono … tabular-nums` so the digits do not jump as the seconds
 * tick, and stays **continuous** (decision 009) — the second half of a 2 × 30 reads 30′ → 60′, and a
 * half running long grows a « +2 » rather than resetting.
 *
 * Two things survive because they are the screen saying it still works: the « en cours » dot, and the
 * count of actions the outbox has not yet delivered. Both sit as a hairline rather than a row of their
 * own — a line that exists only when something is wrong costs nothing when nothing is.
 *
 * The back button is the only way out other than the final whistle, so it is an icon with an accessible
 * name rather than « ← Courges »: at 393 px the opponent's name is the width the score needs.
 */
export function MatchBar({
  reading,
  goalsFor,
  goalsAgainst,
  matchHref,
  opponentName,
  pendingLabel,
  action,
}: MatchBarProps) {
  return (
    <div className="safe-pt sticky top-0 z-40 -mx-3 border-b border-border/60 bg-canvas/95 px-3 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex min-h-14 items-center gap-2">
        <Link
          href={matchHref}
          className="-ml-1 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-xl text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">←</span>
          <span className="sr-only">Retour au match contre {opponentName}</span>
        </Link>

        <p className="flex min-w-0 items-baseline gap-1">
          {reading.running ? (
            <span
              className="mb-1 size-2 shrink-0 self-center rounded-full bg-danger"
              aria-hidden="true"
            />
          ) : null}
          <span
            className="font-mono text-3xl leading-none font-bold text-ink tabular-nums"
            aria-label={`Chrono ${reading.label}${reading.running ? ", en cours" : ""}`}
          >
            {reading.clock}
          </span>
          {reading.stoppageMs > 0 ? (
            <span className="text-sm font-semibold text-warning" aria-hidden="true">
              +{Math.floor(reading.stoppageMs / 60_000)}
            </span>
          ) : null}
        </p>

        <p
          className="ml-auto shrink-0 font-mono text-2xl leading-none font-bold text-ink tabular-nums"
          aria-label={`Score ${goalsFor} nous, ${goalsAgainst} ${opponentName}`}
        >
          {scoreLineFr(goalsFor, goalsAgainst)}
        </p>

        {action ? <span className="shrink-0">{action}</span> : null}
      </div>

      {pendingLabel ? (
        <p className="pb-1 text-xs text-ink-muted" role="status">
          {pendingLabel}
        </p>
      ) : null}
    </div>
  );
}
