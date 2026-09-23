/**
 * « Statistiques personnelles » on a player's profile.
 *
 * A slice of the very same season aggregate `/stats` renders, on purpose: `getPlayerSeasonStats`
 * reads one row out of `getSeasonStats`, so this card and the season table can never disagree about
 * how many goals somebody has. `getSeasonStats` is `cache()`d, so a page showing both pays once.
 *
 * No competition filter here — a profile shows the whole season. The link at the bottom is where a
 * reader goes to slice it.
 *
 * The same rule as everywhere in `lib/stats/`: a number nobody has yet is a dash with an
 * explanation, never a `0` pretending to be a fact.
 */

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatAttendance,
  formatMinutes,
  formatRating,
  matchCount,
  plural,
} from "@/lib/stats/format";
import { getPlayerSeasonStats } from "@/lib/stats/queries";

import { Figure, FigureGrid, Note } from "../../stats/_components/parts";

export async function PlayerStatsCard({
  teamId,
  viewerMemberId,
  memberId,
}: {
  teamId: string;
  /** The reader's membership, so decision 007's rating gate applies to them and not to the page. */
  viewerMemberId: string | null;
  memberId: string;
}) {
  const { player, season } = await getPlayerSeasonStats(teamId, viewerMemberId, memberId);

  if (!player || !player.hasData) {
    return (
      <Card title="Statistiques personnelles">
        <p className="text-sm text-ink-muted">
          Pas encore de données : aucun match joué, aucune note reçue et aucune séance pointée pour
          ce joueur.
        </p>
      </Card>
    );
  }

  const { appearances, attendance, rating } = player;
  const roles: string[] = [];
  if (appearances.starter > 0) roles.push(`${appearances.starter} fois titulaire`);
  if (appearances.substitute > 0) roles.push(`${appearances.substitute} fois remplaçant`);
  if (appearances.supporter > 0) roles.push(`${appearances.supporter} fois supporter`);
  if (appearances.goalkeeper > 0) roles.push(`${appearances.goalkeeper} fois gardien`);

  return (
    <Card
      title="Statistiques personnelles"
      description={`Saison en cours, toutes compétitions · ${matchCount(appearances.selected)} sur la feuille`}
      action={
        <ButtonLink href="/stats" variant="secondary" size="sm">
          Toute l’équipe
        </ButtonLink>
      }
    >
      <FigureGrid>
        <Figure label="Matchs joués" value={player.matchesPlayed} tone="strong" />
        <Figure label="Minutes" value={formatMinutes(player.minutes)} tone="strong" />
        <Figure label="Buts" value={player.goals} tone="strong" />
        <Figure label="Passes déc." value={player.assists} />
        <Figure
          label="Note"
          value={rating.count > 0 ? formatRating(rating.average) : null}
          hint={rating.count > 0 ? `moyenne sur ${plural(rating.count, "note")}` : undefined}
        />
        <Figure
          label="Présence"
          value={
            attendance.marked > 0
              ? formatAttendance(attendance.present, attendance.marked, attendance.rate)
              : null
          }
          hint="présences / séances pointées"
        />
      </FigureGrid>

      {player.gkMinutes > 0 ? (
        <FigureGrid className="mt-3">
          <Figure label="Minutes gardien" value={formatMinutes(player.gkMinutes)} tone="muted" />
          <Figure label="Clean sheets" value={player.gkCleanSheets} tone="muted" />
          <Figure
            label="Sans encaisser"
            value={formatMinutes(player.gkCleanMinutes)}
            hint="Minutes dans les buts avec la cage inviolée"
            tone="muted"
          />
        </FigureGrid>
      ) : null}

      {roles.length > 0 ? <p className="mt-3 text-xs text-ink-muted">{roles.join(" · ")}</p> : null}

      {attendance.marked > 0 ? (
        <Note>
          Présence calculée sur les séances où ce joueur a été pointé
          {season.markedSessions > attendance.marked
            ? ` (${attendance.marked} sur ${plural(season.markedSessions, "séance")} pointée${season.markedSessions > 1 ? "s" : ""})`
            : ""}
          , pas sur toutes les séances de la saison.
        </Note>
      ) : null}

      {season.hiddenRatingMatches > 0 ? (
        <Note>
          {matchCount(season.hiddenRatingMatches)}{" "}
          {season.hiddenRatingMatches > 1 ? "sont exclus" : "est exclu"} de cette moyenne : tu étais
          sur la feuille et tu n’as pas encore noté tes coéquipiers.
        </Note>
      ) : null}
    </Card>
  );
}
