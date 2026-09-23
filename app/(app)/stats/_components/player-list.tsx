/**
 * Every player's season, one row each.
 *
 * Not a table. Fourteen figures per player against a 320 px viewport leaves two honest options —
 * scroll sideways, or make each player a small block — and a block wins: no hidden columns, no
 * horizontal scroll inside a vertically scrolling page, and the sorted figure can be promoted to
 * the right of the name where the eye already is.
 *
 * A player with nothing recorded is still listed, saying so, because a squad list that quietly
 * omits whoever has not been selected yet reads as a bug (`aggregate.ts`).
 */

import { Card } from "@/components/ui/card";
import type { PlayerSeasonStats, PlayerSortKey } from "@/lib/stats/aggregate";
import {
  ATTENDANCE_NOT_FILTERED_FR,
  NO_DATA_FR,
  appearancesLineFr,
  attendanceHintFr,
  formatAttendance,
  formatMinutes,
  formatRating,
  matchCount,
  plural,
} from "@/lib/stats/format";

import { SortTabs, type StatsQuery, sortLabel } from "./filters";
import { CardEmpty, Figure, FigureGrid, Note, PlayerIdentity } from "./parts";

export function PlayerList({
  players,
  query,
  markedSessions,
  hiddenRatingMatches,
}: {
  players: readonly PlayerSeasonStats[];
  query: StatsQuery;
  markedSessions: number;
  /** Matches whose ratings decision 007 keeps from this reader, so a dash is not read as "none". */
  hiddenRatingMatches: number;
}) {
  /**
   * Every figure on a row is inside the competition filter except the attendance, which cannot be:
   * a training belongs to no competition. So the rows have to say which one is the exception
   * (decision 080).
   */
  const filtered = query.competition !== null;

  return (
    <Card
      title="Joueurs"
      description="Buts, minutes, notes et présence, par joueur."
      as="h2"
      flush
    >
      <div className="border-b border-border/60 pb-2">
        <SortTabs query={query} />
      </div>

      {players.length === 0 ? (
        <div className="p-4">
          <CardEmpty>Aucun joueur dans l’effectif pour le moment.</CardEmpty>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {players.map((player) => (
            <PlayerRow
              key={player.teamMemberId}
              player={player}
              sort={query.sort}
              filtered={filtered}
            />
          ))}
        </ul>
      )}

      <div className="px-4 pb-3">
        <Note>
          La présence est calculée sur les séances où le joueur a été pointé, pas sur toutes les
          séances : {markedSessions > 0 ? `${plural(markedSessions, "séance")} pointée${markedSessions > 1 ? "s" : ""} au total` : "aucune séance pointée pour l’instant"}.
          Un joueur non pointé n’est pas un absent.
          {filtered ? ` ${ATTENDANCE_NOT_FILTERED_FR}` : ""}
        </Note>
        {hiddenRatingMatches > 0 ? (
          // Without this, a masked average is indistinguishable from an average nobody has given.
          <Note>
            Les notes de {matchCount(hiddenRatingMatches)} ne sont pas comptées ici : tu étais sur
            la feuille et tu n’as pas encore noté tes coéquipiers.
          </Note>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Whether this player has any match record at all.
 *
 * A player nobody has ever put on a sheet has not "scored 0 goals" — he has no match to have scored
 * in. So his football figures are `null`, not `0`, while his ratings and his attendance keep their
 * real values (`aggregate.ts`, rule 1). A substitute who was named and stayed on the bench *does*
 * have a record: 0 goals in 0 minutes is a fact about him.
 */
function hasMatchRecord(player: PlayerSeasonStats): boolean {
  return player.appearances.selected > 0 || player.minutes > 0;
}

/**
 * The figure promoted next to the name: whatever the list is sorted by. It replaces the grid
 * column, so it has to carry everything that column carried — notably the attendance denominator,
 * which decision 020 forbids dropping.
 */
function promoted(
  player: PlayerSeasonStats,
  sort: PlayerSortKey,
  filtered: boolean,
): { value: string | null; hint?: string } {
  const played = hasMatchRecord(player);
  switch (sort) {
    case "minutes":
      return { value: played ? formatMinutes(player.minutes) : null };
    case "goals":
      return { value: played ? `${player.goals}` : null };
    case "assists":
      return { value: played ? `${player.assists}` : null };
    case "rating":
      return player.rating.count > 0
        ? {
            value: formatRating(player.rating.average),
            hint: `sur ${plural(player.rating.count, "note")}`,
          }
        : { value: null };
    case "attendance":
      return player.attendance.marked > 0
        ? {
            value: formatAttendance(
              player.attendance.present,
              player.attendance.marked,
              player.attendance.rate,
            ),
            hint: attendanceHintFr(filtered),
          }
        : { value: null };
  }
}

function PlayerRow({
  player,
  sort,
  filtered,
}: {
  player: PlayerSeasonStats;
  sort: PlayerSortKey;
  /** A competition filter is on, so the attendance figure is the odd one out on the row. */
  filtered: boolean;
}) {
  const played = hasMatchRecord(player);
  const headline = promoted(player, sort, filtered);
  // The sorted figure is already promoted next to the name; repeating it in the grid would show the
  // same number twice on a 320 px row.
  const show = (key: PlayerSortKey) => key !== sort;

  return (
    <li className="px-4 py-3">
      <PlayerIdentity
        displayName={player.displayName}
        jerseyNumber={player.jerseyNumber}
        hasLeft={player.hasLeft}
        trailing={
          <dl className="text-right">
            <Figure label={sortLabel(sort)} tone="strong" className="text-right" {...headline} />
          </dl>
        }
      />

      {player.hasData ? (
        <>
          <FigureGrid className="mt-2">
            {/* The sheet total that reconciles this with « 7 fois titulaire » is on the appearances
                line below, in full width: « 7 matchs sur la feuille » does not fit a 110 px column,
                and it used to be a `title` nobody on a phone could read (decision 072). */}
            <Figure label="Matchs" value={played ? player.matchesPlayed : null} />
            {show("minutes") ? (
              <Figure label="Minutes" value={played ? formatMinutes(player.minutes) : null} />
            ) : null}
            {show("goals") ? <Figure label="Buts" value={played ? player.goals : null} /> : null}
            {show("assists") ? (
              <Figure label="Passes déc." value={played ? player.assists : null} />
            ) : null}
            {show("rating") ? (
              <Figure
                label="Note"
                value={player.rating.count > 0 ? formatRating(player.rating.average) : null}
                hint={
                  player.rating.count > 0 ? `sur ${plural(player.rating.count, "note")}` : undefined
                }
              />
            ) : null}
            {show("attendance") ? (
              <Figure
                label="Présence"
                value={
                  player.attendance.marked > 0
                    ? formatAttendance(
                        player.attendance.present,
                        player.attendance.marked,
                        player.attendance.rate,
                      )
                    : null
                }
                hint={attendanceHintFr(filtered)}
              />
            ) : null}
          </FigureGrid>

          <Roles player={player} />
          <Discipline player={player} />
        </>
      ) : (
        <p className="mt-1 text-xs text-ink-subtle">{NO_DATA_FR} sur cette sélection.</p>
      )}
    </li>
  );
}

/**
 * « 6 matchs sur la feuille · 1 fois titulaire · 5 fois remplaçant ».
 *
 * Titulaire / remplaçant / supporter come from the match sheet; gardien comes from the minutes
 * actually spent in goal, because it is not a sheet role (`aggregate.ts`, rule 4). The sheet total
 * leads the line here — it is what explains « MATCHS 6 » standing above « 7 fois titulaire », and it
 * has nowhere else to go on this card (decision 072).
 *
 * The wording is `appearancesLineFr`'s, shared with the profile card so the two screens cannot
 * disagree, and testable: this component is under `app/`, where Vitest does not look.
 */
function Roles({ player }: { player: PlayerSeasonStats }) {
  const line = appearancesLineFr(player.appearances, { withSheetTotal: true });
  if (line === null) return null;

  return <p className="mt-2 text-xs text-ink-muted">{line}</p>;
}

/** Only shown when there is something to show: a row of zeros is noise. */
function Discipline({ player }: { player: PlayerSeasonStats }) {
  const parts: string[] = [];
  if (player.penaltiesScored > 0 || player.penaltiesMissed > 0) {
    // The scored penalty is already inside « Buts » — spelled out so nobody adds them twice.
    parts.push(`pénos ${player.penaltiesScored}/${player.penaltiesScored + player.penaltiesMissed}`);
  }
  if (player.ownGoals > 0) parts.push(plural(player.ownGoals, "csc", "csc"));
  if (player.fouls > 0) parts.push(plural(player.fouls, "faute"));
  if (player.cleanMinutes > 0) parts.push(`${formatMinutes(player.cleanMinutes)} sans encaisser`);
  if (parts.length === 0) return null;

  return <p className="mt-1 text-xs text-ink-subtle">{parts.join(" · ")}</p>;
}
