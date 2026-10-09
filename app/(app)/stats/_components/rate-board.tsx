/**
 * « 1 but encaissé toutes les X min » — a ranked rate, with the record it was smoothed from beside it.
 *
 * The ranked figure is shrunk towards the squad (`lib/stats/impact.ts`, decision 162), so it is not
 * the number a player would quote about himself; decision 072 leaves nothing on hover, so the raw
 * record is printed under it — « 3 encaissés en 72′ », or « aucun but encaissé en 35′ » where the raw
 * rate would be infinite — and the Note says how much the smoothing weighs.
 */

import { Card } from "@/components/ui/card";
import type { ConcededRateBoard } from "@/lib/stats/impact";
import { concededRecordFr, formatDecimal, minutesPerGoalFr } from "@/lib/stats/format";

import { CardEmpty, Note, PlayerIdentity } from "./parts";

export function RateBoard({
  title,
  description,
  board,
  emptyMessage,
}: {
  title: string;
  description: string;
  board: ConcededRateBoard;
  emptyMessage: string;
}) {
  if (board.entries.length === 0) {
    return (
      <Card title={title} description={description} as="h3">
        <CardEmpty>{emptyMessage}</CardEmpty>
      </Card>
    );
  }

  return (
    <Card title={title} description={description} as="h3" flush>
      <ol className="divide-y divide-border/60">
        {board.entries.map((entry, index) => (
          <li key={entry.teamMemberId} className="flex items-center gap-3 px-4 py-2.5">
            <span
              aria-hidden="true"
              className="w-4 shrink-0 font-mono text-xs text-ink-subtle tabular-nums"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <PlayerIdentity
                displayName={entry.displayName}
                jerseyNumber={entry.jerseyNumber}
                hasLeft={entry.hasLeft}
              />
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-ink tabular-nums">
                {minutesPerGoalFr(entry.minutesPerGoal)}
              </p>
              <p className="text-[0.6875rem] text-ink-subtle tabular-nums">
                {concededRecordFr(entry.conceded, entry.minutes)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="px-4 pb-3">
        <Note>{smoothingNoteFr(board)}</Note>
      </div>
    </Card>
  );
}

/** What the smoothing weighs, in hours of play — the prior strength of the Poisson fit. */
function smoothingNoteFr(board: ConcededRateBoard): string {
  // « 1 h », « 2,5 h » — no trailing « ,0 ».
  const hours = formatDecimal(board.model.priorStrength, 1).replace(/,0$/, "");
  return (
    `Le classement compte chaque joueur comme s’il avait aussi joué ${hours} h au niveau moyen de ` +
    "l’équipe : quelques minutes sans encaisser ne suffisent pas pour passer devant une saison entière. " +
    "Sous le chiffre classé, ce qu’il a vraiment encaissé."
  );
}
