/**
 * Présence aux entraînements — decision 020, stated out loud.
 *
 * The rate is `présent / pointé`, never `présent / effectif`: a player nobody marked is not an
 * absent player. Two consequences the screen has to say rather than imply:
 *
 *   - the denominator is printed next to every rate, because a bare « 50 % » invites the reader to
 *     assume it is out of the number of sessions;
 *   - the competition filter does not apply here. A training belongs to no competition, so filtering
 *     by « Coupe » would leave this card either empty or, worse, unchanged and misread.
 */

import { Card } from "@/components/ui/card";
import type { PlayerSeasonStats } from "@/lib/stats/aggregate";
import { formatAttendance, plural } from "@/lib/stats/format";

import { CardEmpty, Note, PlayerIdentity } from "./parts";

export function Attendance({
  players,
  markedSessions,
  filtered,
}: {
  players: readonly PlayerSeasonStats[];
  markedSessions: number;
  /** True when a competition filter is on, so the card can say it does not apply. */
  filtered: boolean;
}) {
  const marked = players
    .filter((player) => player.attendance.marked > 0)
    .sort(
      (a, b) =>
        (b.attendance.rate ?? 0) - (a.attendance.rate ?? 0) ||
        b.attendance.marked - a.attendance.marked ||
        a.displayName.localeCompare(b.displayName, "fr"),
    );
  const unmarked = players.filter((player) => player.attendance.marked === 0);

  if (markedSessions === 0) {
    return (
      <Card title="Présence aux entraînements" as="h3">
        <CardEmpty>
          Aucune séance pointée pour l’instant. Le taux de présence apparaîtra dès qu’un coach aura
          pointé une séance.
        </CardEmpty>
      </Card>
    );
  }

  return (
    <Card
      title="Présence aux entraînements"
      description={`${plural(markedSessions, "séance")} pointée${markedSessions > 1 ? "s" : ""}`}
      as="h3"
      flush
    >
      <ul className="divide-y divide-border/60">
        {marked.map((player) => (
          <li key={player.teamMemberId} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <PlayerIdentity
                displayName={player.displayName}
                jerseyNumber={player.jerseyNumber}
                hasLeft={player.hasLeft}
              />
            </div>
            <p className="shrink-0 text-sm font-semibold text-ink tabular-nums">
              {formatAttendance(
                player.attendance.present,
                player.attendance.marked,
                player.attendance.rate,
              )}
            </p>
          </li>
        ))}
      </ul>

      <div className="px-4 pb-3">
        <Note>
          Le taux est le nombre de présences sur le nombre de séances où le joueur a été pointé, et
          non sur le nombre de séances de la saison : un joueur non pointé n’est pas compté comme
          absent.
          {unmarked.length > 0
            ? ` ${plural(unmarked.length, "joueur")} n’${unmarked.length > 1 ? "ont" : "a"} encore jamais été pointé${unmarked.length > 1 ? "s" : ""} : ${unmarked.map((player) => player.displayName).join(", ")}.`
            : ""}
          {filtered
            ? " Le filtre par compétition ne s’applique pas à cette carte : un entraînement n’appartient à aucune compétition."
            : ""}
        </Note>
      </div>
    </Card>
  );
}
