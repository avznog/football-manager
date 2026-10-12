/**
 * Minutes played, per player — derived by the reducer, never stored (invariant 2).
 *
 * A real `<table>`, because that is what this is, with four narrow numeric columns that still fit a
 * 360 px screen. The players who came on are listed first; an unused substitute shows 0’ rather than
 * disappearing, which is the honest record of a Sunday.
 *
 * ## The two figures decision 189 added, and why they are lines rather than columns
 *
 * The owner asked for « the minutes played as a goal, and the minutes of invincibility (X goal taken
 * every X minutes, goal included) ». Both are per-player facts, and both are **sentences**: a fifth
 * and sixth right-aligned numeric column would not fit 390 px, and « 30 » under a header reading
 * « But » would be read as goals scored by anybody glancing. So they go under the name, where
 * « 43’ sans encaisser » and « 1 csc » already live, and they say what they are.
 *
 * The rate is `concededWhileOn` over `minutes` — his whole time on the turf, goals taken while he
 * wore the gloves included, which is the owner's « goal included » — and it is printed by
 * `concededRateLineFr`, the same formatter `/stats` prints its « Buts encaissés » cards with. One
 * formatter, two screens: a player must read the same sentence about himself on both.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RETRO_MINUTES_NOTE } from "@/lib/calendar/labels";
import { capitalizeFirst } from "@/lib/calendar/time";
import type { EntryMode } from "@/db/schema";
import type { RecapPlayerLine } from "@/lib/rating/recap";
import { concededRateLineFr, formatMinutes } from "@/lib/stats/format";

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
          <caption className="sr-only">
            Minutes jouées, temps au but, buts encaissés, buts et passes décisives par joueur
          </caption>
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
              {/* « Passes », never the two-letter abbreviation for « passes décisives »: in French
                  those two letters are a slur, and this table is read by the whole squad on a
                  celebration screen. The word is what the scoreboard directly above it already uses,
                  and the column holds single digits, so the header sets its width either way. */}
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Passes
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
                  {/* « 20′ au but ». This line used to read « 13′ sans encaisser » instead, and that
                      figure is **gone from every screen in the app** by the owner's decision: he had
                      « minutes d'invincibilité » removed as meaningless, and a stretch of minutes
                      with nothing conceded in it is the same quantity under another name. What
                      replaces it on this row is the rate below — how often, not how long. */}
                  {player.gkMinutes > 0 ? (
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {formatMinutes(player.gkMinutes)} au but
                    </span>
                  ) : null}
                  {/* « Aucun but encaissé en 87′ », or « 1 but toutes les 30′ sur 60′ » — the owner's
                      « minutes of invincibility », which he defines as the rate. Only for a man who
                      was on the pitch: a rate over no minutes is a division about nothing, and an
                      unused substitute conceded nothing in a way that says nothing about him. */}
                  {player.minutes > 0 ? (
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {capitalizeFirst(
                        concededRateLineFr(player.concededWhileOn, player.minutes),
                      )}
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
