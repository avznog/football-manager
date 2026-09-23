/**
 * The scoreline, big.
 *
 * This is the one place the app is allowed to celebrate (`docs/PLAN.md`, « Personnalité »): the score
 * is the largest type in the product, the result is stated in words, and a win is tinted. That is the
 * whole celebration — no animation, no confetti, nothing that stutters on a 2018 Android or that
 * `prefers-reduced-motion` has to switch off.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import type { MatchRecap } from "@/lib/rating/recap";

const RESULT_TONE: Record<"win" | "draw" | "loss", string> = {
  win: "text-success",
  draw: "text-ink",
  loss: "text-ink",
};

export function Scoreboard({
  recap,
  opponentName,
  isHome,
}: {
  recap: MatchRecap;
  opponentName: string;
  isHome: boolean;
}) {
  const us = "Nous";

  return (
    <Card>
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <p className="text-sm text-ink-muted">
          {isHome ? `${us} — ${opponentName}` : `${opponentName} — ${us}`}
        </p>

        <p
          className={cn(
            "font-mono text-6xl leading-none font-bold tracking-tight tabular-nums",
            recap.result ? RESULT_TONE[recap.result] : "text-ink",
          )}
        >
          {isHome
            ? `${recap.goalsFor} – ${recap.goalsAgainst}`
            : `${recap.goalsAgainst} – ${recap.goalsFor}`}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {recap.resultLabel ? (
            <Badge variant={recap.result === "win" ? "success" : "neutral"} solid={recap.result === "win"}>
              {recap.resultLabel}
            </Badge>
          ) : (
            <Badge variant="danger" solid>
              en cours
            </Badge>
          )}
          {recap.cleanSheet ? <Badge variant="success">clean sheet</Badge> : null}
        </div>

        {recap.scorers.length > 0 ? (
          <p className="text-sm text-ink-muted">
            <span className="text-ink-subtle">Buts : </span>
            {recap.scorers.map((scorer) => scorer.label).join(", ")}
          </p>
        ) : null}

        {recap.assisters.length > 0 ? (
          <p className="text-sm text-ink-muted">
            <span className="text-ink-subtle">Passes : </span>
            {recap.assisters.map((assister) => assister.label).join(", ")}
          </p>
        ) : null}

        <p className="text-xs text-ink-subtle">{recap.playersUsedLabel}</p>
      </div>
    </Card>
  );
}
