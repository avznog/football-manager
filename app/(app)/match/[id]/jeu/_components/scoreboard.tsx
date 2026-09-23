"use client";

import { Badge } from "@/components/ui";
import type { ClockReading } from "@/lib/match/clock";

export type ScoreboardProps = {
  reading: ClockReading;
  phaseLabel: string;
  goalsFor: number;
  goalsAgainst: number;
  opponentName: string;
  isHome: boolean;
  /** « 3 actions en attente », or null when everything has reached the server. */
  pendingLabel: string | null;
};

/**
 * The clock, the score, and nothing else.
 *
 * Read at arm's length, in daylight, by someone who is also watching the match: the minute is the
 * biggest thing on the screen, in tabular figures so the digits do not jump as the seconds tick.
 * The clock is **continuous** (decision 009) — the second half of a 2 × 30 reads 30′ → 60′, and a
 * half that runs long reads « 30’+2 » rather than resetting, because the log stores match time and
 * this is what it says.
 */
export function Scoreboard({
  reading,
  phaseLabel,
  goalsFor,
  goalsAgainst,
  opponentName,
  isHome,
  pendingLabel,
}: ScoreboardProps) {
  const home = isHome ? "Nous" : opponentName;
  const away = isHome ? opponentName : "Nous";
  const homeGoals = isHome ? goalsFor : goalsAgainst;
  const awayGoals = isHome ? goalsAgainst : goalsFor;

  return (
    <section
      aria-label="Chrono et score"
      className="rounded-2xl border border-border/60 bg-surface px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0">
          <span
            className="block font-mono text-5xl leading-none font-bold text-ink tabular-nums"
            aria-label={`Chrono ${reading.label}`}
          >
            {reading.clock}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{phaseLabel}</span>
            {reading.stoppageMs > 0 ? (
              <Badge variant="warning">{reading.label}</Badge>
            ) : null}
            {reading.running ? (
              <span className="inline-flex items-center gap-1 text-danger">
                <span className="size-2 rounded-full bg-danger" aria-hidden="true" />
                en cours
              </span>
            ) : null}
          </span>
        </p>

        <p className="shrink-0 text-right">
          <span className="block font-mono text-4xl leading-none font-bold text-ink tabular-nums">
            {homeGoals} – {awayGoals}
          </span>
          <span className="mt-1 block truncate text-xs text-ink-muted">
            {home} – {away}
          </span>
        </p>
      </div>

      {pendingLabel ? (
        <p className="mt-2 text-xs text-ink-muted" role="status">
          {pendingLabel}
        </p>
      ) : null}
    </section>
  );
}
