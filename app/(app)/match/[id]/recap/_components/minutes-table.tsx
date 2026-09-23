/**
 * Minutes played, per player — derived by the reducer, never stored (invariant 2).
 *
 * A real `<table>`, because that is what this is, with four narrow numeric columns that still fit a
 * 360 px screen. The players who came on are listed first; an unused substitute shows 0’ rather than
 * disappearing, which is the honest record of a Sunday.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RETRO_MINUTES_NOTE } from "@/lib/calendar/labels";
import type { EntryMode } from "@/db/schema";
import type { RecapPlayerLine } from "@/lib/rating/recap";

export function MinutesTable({
  players,
  entryMode,
}: {
  players: readonly RecapPlayerLine[];
  /** `retro` adds the caveat below the table: these minutes were reconstructed, not timed. */
  entryMode: EntryMode;
}) {
  if (players.length === 0) return null;

  return (
    <Card title="Temps de jeu" as="h2" flush>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Minutes jouées, buts et passes décisives par joueur</caption>
          <thead>
            <tr className="border-y border-border/60 text-left text-xs text-ink-subtle">
              <th scope="col" className="py-2 pl-4 font-medium">
                Joueur
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Min
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Buts
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                PD
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {players.map((player) => (
              <tr key={player.memberId}>
                <th scope="row" className="py-2 pl-4 text-left font-normal">
                  <span className="flex items-center gap-1.5">
                    {player.jerseyNumber !== null ? (
                      <span className="font-mono text-xs text-ink-subtle tabular-nums">
                        {player.jerseyNumber}
                      </span>
                    ) : null}
                    <span className="truncate font-medium text-ink">{player.name}</span>
                    {player.wasGoalkeeper ? <Badge variant="neutral">GB</Badge> : null}
                    {/* A supporter was on the sheet without being an option: « non entré » would
                        read as a choice the coach made about him. */}
                    {!player.playedMatch ? (
                      <Badge variant="neutral">
                        {player.squadRole === "supporter" ? "supporter" : "non entré"}
                      </Badge>
                    ) : null}
                  </span>
                  {player.wasGoalkeeper && player.gkCleanMinutes > 0 ? (
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {player.gkCleanMinutes}’ sans encaisser
                    </span>
                  ) : null}
                  {player.ownGoals > 0 ? (
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {player.ownGoals} csc
                    </span>
                  ) : null}
                </th>
                <td className="px-2 py-2 text-right font-mono text-ink tabular-nums">
                  {player.minutes}
                </td>
                <td className="px-2 py-2 text-right font-mono text-ink tabular-nums">
                  {player.goals > 0 ? player.goals : <span className="text-ink-subtle">—</span>}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-ink tabular-nums">
                  {player.assists > 0 ? player.assists : <span className="text-ink-subtle">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The one number on this table that can be an estimate is the one it is named after. A player
          reading « 43’ » next to his name should know whether somebody timed it or the app placed it
          at the midpoint of his spell (decision 048) — the entry form says so while the coach types,
          and until now nothing said it to the eleven people who read it afterwards. */}
      {entryMode === "retro" ? (
        <p className="px-4 pt-3 pb-4 text-xs text-ink-subtle">{RETRO_MINUTES_NOTE}</p>
      ) : null}
    </Card>
  );
}
