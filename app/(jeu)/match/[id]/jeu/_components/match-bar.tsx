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
  /**
   * « saisi après le match », or null — `entryModeBadgeFr(match.entryMode, { recorded })`.
   *
   * This screen prints the largest minute in the app and decision 048 stamps the minutes of a match
   * typed up afterwards, so on a `retro` log the reader is owed the sentence: without it the biggest
   * number on the screen is the one number nothing qualifies (decision 013, and the reason the old
   * `Scoreboard` carried it). It costs no height when there is nothing to say.
   */
  entryBadge?: string | null;
  /** TERRAIN or « Composition » — the one button that belongs beside the score. */
  action?: React.ReactNode;
};

/**
 * The whole top of game mode: one row, 56 px tall, replacing the app header, the back link and the
 * old `Scoreboard` card — 217 px of chrome down to 64 including the route's padding.
 *
 * What it keeps is what the owner asked for and nothing else: **the time and the live score**
 * (decision 112). The venue badge and the phase line both said something true and neither is looked at
 * at 78′; they are one tap away on the match page, which is where a reader who wants them already is.
 * The clock stays `font-mono … tabular-nums` so the digits do not jump as the seconds
 * tick, and stays **continuous** (decision 009) — the second half of a 2 × 30 reads 30′ → 60′, and a
 * half running long grows a « +2 » rather than resetting.
 *
 * **« Nous » is printed beside the score**, because the score is ours first (`scoreLineFr`) and nothing
 * in the figures says so. On an away match « 0 – 2 » is a team two goals *up*, and the old `Scoreboard`
 * had a caption saying which way round it was. Replacing that caption with an `aria-label` alone told
 * the one reader who did not need telling. It is a word and not a second line: a caption under the
 * figures would cost the row its 56 px, which is the whole of decision 112.
 *
 * Three things sit as a hairline under the row rather than in it, because a line that only exists when
 * there is something to say costs nothing when there is not: the count of actions the outbox has not
 * delivered, and « saisi après le match » for a log that was typed up afterwards. The « en cours » dot
 * stays in the row — it is the screen saying the clock is really moving.
 *
 * The back button is the only way out other than the final whistle, so it is an icon with an accessible
 * name rather than « ← Courges »: at 393 px the opponent's name is the width the score needs.
 *
 * It keeps the old `Scoreboard`'s `region` and its name: this is still the one part of the screen a
 * screen reader wants to be able to jump to, and « Chrono et score » is now literally all it holds.
 *
 * **Why the clock and the score are `role="img"`.** Both carry an `aria-label` that says more than the
 * glyphs do — « Chrono 30’, en cours », « Score 1 nous, 0 Courges » — and ARIA 1.2 forbids a name on
 * `role=generic` and `role=paragraph`, which is what a bare `<span>` and `<p>` are. A conforming
 * screen reader therefore ignored both labels and read « 1 – 0 » and nothing else. `role="img"` is a
 * role that *takes* a name, it keeps the glyphs on screen for everyone else, and it leaves the two
 * selectors the end-to-end suite uses (`p[aria-label^="Score"]`, `span[aria-label^="Chrono"]`)
 * exactly as they were.
 */
export function MatchBar({
  reading,
  goalsFor,
  goalsAgainst,
  matchHref,
  opponentName,
  pendingLabel,
  entryBadge = null,
  action,
}: MatchBarProps) {
  return (
    <div
      role="region"
      aria-label="Chrono et score"
      className="safe-pt sticky top-0 z-40 -mx-3 border-b border-border/60 bg-canvas/95 px-3 backdrop-blur md:-mx-6 md:px-6"
    >
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
            role="img"
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

        <div className="ml-auto flex shrink-0 items-baseline gap-1">
          {/* `aria-hidden`: the score's own label already says « 1 nous, 0 Courges », so announcing
              the word again would only make the figures harder to place. */}
          <span
            aria-hidden="true"
            className="text-[0.625rem] leading-none font-semibold tracking-wide text-ink-muted uppercase"
          >
            Nous
          </span>
          <p
            role="img"
            className="font-mono text-2xl leading-none font-bold text-ink tabular-nums"
            aria-label={`Score ${goalsFor} nous, ${goalsAgainst} ${opponentName}`}
          >
            {scoreLineFr(goalsFor, goalsAgainst)}
          </p>
        </div>

        {action ? <span className="shrink-0">{action}</span> : null}
      </div>

      {entryBadge !== null || pendingLabel !== null ? (
        <p className="flex flex-wrap items-center gap-x-2 pb-1 text-xs text-ink-muted">
          {entryBadge !== null ? <span>{entryBadge}</span> : null}
          {pendingLabel !== null ? <span role="status">{pendingLabel}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
