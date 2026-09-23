/**
 * The scoreline, big.
 *
 * This is the one place the app is allowed to celebrate (`docs/PLAN.md`, « Personnalité »): the score
 * is the largest type in the product, the result is stated in words, and a win is tinted. That is the
 * whole celebration — no animation, no confetti, nothing that stutters on a 2018 Android or that
 * `prefers-reduced-motion` has to switch off.
 *
 * Three states, and the difference between the last two matters: a match **in progress**, a match
 * **finished** (the result, in words), and a match that is over but whose log is **empty** — nobody
 * opened game mode and nobody backfilled it. That last one used to print « 0 – 0 » under an « en
 * cours » badge, which was wrong twice over: 0-0 is not the same fact as « rien n'a été saisi »
 * (decision 013), and a match closed weeks ago is not in progress. The status comes from the row, the
 * rest from the reducer.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import type { MatchStatus } from "@/db/schema";
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
  status,
}: {
  recap: MatchRecap;
  opponentName: string;
  isHome: boolean;
  /** The row's own status: the only thing that can tell « terminé sans rien saisi » from « en cours ». */
  status: MatchStatus;
}) {
  const us = "Nous";
  /** Over, with nothing in the log: there is no score to print, only a fact to state. */
  const unrecorded = status === "finished" && !recap.recorded;

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
          {unrecorded
            ? "? – ?"
            : isHome
              ? `${recap.goalsFor} – ${recap.goalsAgainst}`
              : `${recap.goalsAgainst} – ${recap.goalsFor}`}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {unrecorded ? (
            <Badge variant="neutral">rien saisi</Badge>
          ) : recap.resultLabel ? (
            <Badge variant={recap.result === "win" ? "success" : "neutral"} solid={recap.result === "win"}>
              {recap.resultLabel}
            </Badge>
          ) : status === "finished" ? (
            /* Closed without a final whistle in the log — the freeze path appends one, so this is
               the amended or half-recorded match rather than the normal case. */
            <Badge variant="neutral">terminé</Badge>
          ) : (
            <Badge variant="danger" solid>
              en cours
            </Badge>
          )}
          {recap.cleanSheet ? <Badge variant="success">clean sheet</Badge> : null}
        </div>

        {unrecorded ? (
          <p className="text-sm text-ink-muted">
            Ce match est terminé mais rien n’a été saisi : ni score, ni buteurs, ni temps de jeu.
          </p>
        ) : null}

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

        {/* « 0 joueur utilisé » adds nothing once the line above has said nothing was recorded. */}
        {unrecorded ? null : <p className="text-xs text-ink-subtle">{recap.playersUsedLabel}</p>}
      </div>
    </Card>
  );
}
