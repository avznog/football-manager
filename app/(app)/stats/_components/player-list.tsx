/**
 * Every player's season, one row each — a real `<table>` (decision 178).
 *
 * It used to be a list of blocks, because fourteen figures per player do not fit a 320 px viewport.
 * The owner asked for the opposite trade: « il faudrait faire un tableau, de sorte que l'on puisse
 * comparer très rapidement ». A comparison is read down a column, so the table keeps the four figures
 * people compare — minutes, buts, passes, note — in four narrow right-aligned columns that fit 390 px
 * with no horizontal scroll, and leaves the rest where it already lives: the roles and the discipline
 * on the player's profile, the conceded figures in the Défense and Gardiens sections above.
 *
 * The column headers are the sort: plain links to `?tri=`, so it works with no JavaScript, with
 * `aria-sort` and a visible ↓ on the active one. Modelled on the recap's `minutes-table.tsx`.
 *
 * A player with nothing recorded is still listed, with dashes, because a squad list that quietly omits
 * whoever has not been selected yet reads as a bug (`aggregate.ts`).
 */

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import type { PlayerSeasonStats, PlayerSortKey } from "@/lib/stats/aggregate";
import {
  NO_DATA_FR,
  NO_VALUE_FR,
  formatRating,
  pendingRatingMatchesNoteFr,
  plural,
} from "@/lib/stats/format";

import { SORT_COLUMNS, SortHeaderLink, type StatsQuery } from "./filters";
import { CardEmpty, Note, PlayerIdentity } from "./parts";

export function PlayerList({
  players,
  query,
  pendingRatingMatches,
}: {
  players: readonly PlayerSeasonStats[];
  query: StatsQuery;
  /**
   * Matches whose means are not out yet, so a dash is not read as « nobody rated him ». It used to be
   * a count of matches *this reader* had not rated — the same number for everybody now (decision 137).
   */
  pendingRatingMatches: number;
}) {
  return (
    <Card
      title="Joueurs"
      description="Minutes, buts, passes décisives et note, par joueur. Touche une colonne pour trier."
      as="h2"
      flush
    >
      {players.length === 0 ? (
        <div className="px-4 pb-4">
          <CardEmpty>Aucun joueur dans l’effectif pour le moment.</CardEmpty>
        </div>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">
            Minutes, buts, passes décisives et note de chaque joueur
          </caption>
          <thead>
            <tr className="border-y border-border/60 text-left text-xs text-ink-subtle">
              <th scope="col" className="py-0 pl-4 font-medium">
                Joueur
              </th>
              {SORT_COLUMNS.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={query.sort === column.key ? "descending" : undefined}
                  className={cn(
                    "py-0 text-right",
                    index === SORT_COLUMNS.length - 1 ? "pr-4 pl-1" : "px-1",
                  )}
                >
                  <SortHeaderLink query={query} column={column} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {players.map((player) => (
              <PlayerRow key={player.teamMemberId} player={player} query={query} />
            ))}
          </tbody>
        </table>
      )}

      {pendingRatingMatches > 0 ? (
        // Without this, a figure short of matches is indistinguishable from an average nobody has
        // given. One sentence from one place, so this table and « Meilleures notes » above it
        // cannot come to disagree about a rule that belongs to neither of them.
        <div className="px-4 pb-3">
          <Note>{pendingRatingMatchesNoteFr(pendingRatingMatches)}</Note>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Whether this player has any match record at all.
 *
 * A player nobody has ever put on a sheet has not "scored 0 goals" — he has no match to have scored
 * in. So his football figures are a dash, not `0`, while his ratings keep their real values
 * (`aggregate.ts`, rule 1). A substitute who was named and stayed on the bench *does* have a record:
 * 0 goals in 0 minutes is a fact about him.
 */
function hasMatchRecord(player: PlayerSeasonStats): boolean {
  return player.appearances.selected > 0 || player.minutes > 0;
}

function PlayerRow({ player, query }: { player: PlayerSeasonStats; query: StatsQuery }) {
  const played = hasMatchRecord(player);
  const rated = player.rating.count > 0;
  // The sorted column reads a shade stronger, so the eye finds the figure the order comes from.
  const cell = (key: PlayerSortKey, last = false) =>
    cn(
      "py-2 text-right align-top font-mono tabular-nums",
      last ? "pr-4 pl-1" : "px-1",
      query.sort === key ? "font-semibold text-ink" : "text-ink-muted",
    );

  return (
    <tr>
      {/* `max-w-0 w-full`: the name column takes what the four numbers leave and truncates in it,
          rather than pushing the table wider than the phone. */}
      <th scope="row" className="w-full max-w-0 py-2 pl-4 text-left align-top font-normal">
        <PlayerIdentity
          displayName={player.displayName}
          jerseyNumber={player.jerseyNumber}
          hasLeft={player.hasLeft}
        />
      </th>
      <td className={cell("minutes")}>{played ? player.minutes : <Missing />}</td>
      <td className={cell("goals")}>{played ? <Count value={player.goals} /> : <Missing />}</td>
      <td className={cell("assists")}>{played ? <Count value={player.assists} /> : <Missing />}</td>
      <td className={cell("rating", true)}>
        {rated ? (
          <>
            {formatRating(player.rating.average)}
            {/* The denominator, printed (decision 072): « 4 notés » is four matches whose mean he
                received (decision 137), so a 9,0 on one match does not read like a season. */}
            <span className="block font-sans text-[0.625rem] leading-tight font-normal text-ink-subtle">
              {plural(player.rating.count, "noté", "notés")}
            </span>
          </>
        ) : (
          <Missing />
        )}
      </td>
    </tr>
  );
}

/** A zero is a fact and is printed — only lighter, so the figures that are not zero stand out. */
function Count({ value }: { value: number }) {
  return value === 0 ? <span className="text-ink-subtle">0</span> : <>{value}</>;
}

/** Nobody has this number: a dash, announced as such (`parts.tsx`, rule 2). */
function Missing() {
  return (
    <span className="text-ink-subtle">
      <span aria-hidden="true">{NO_VALUE_FR}</span>
      <span className="sr-only">{NO_DATA_FR}</span>
    </span>
  );
}
