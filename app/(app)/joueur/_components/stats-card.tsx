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
  appearancesLineFr,
  concededEveryFr,
  formatMinutes,
  formatRating,
  matchCount,
  pendingRatingsNoteFr,
  plural,
} from "@/lib/stats/format";
import { positionGroupLabelFr } from "@/lib/stats/positions";
import { getPlayerSeasonStats } from "@/lib/stats/queries";

import { Figure, FigureGrid, Note } from "../../stats/_components/parts";

export async function PlayerStatsCard({
  teamId,
  memberId,
  isSelf,
}: {
  teamId: string;
  memberId: string;
  /**
   * Whose profile this is, and the **only** thing left that depends on the reader: « Tes notes » or
   * « Ses notes ». It used to be a `viewerMemberId` passed into the query, because under decision 021
   * the figures themselves were the reader's — two people looking at the same profile saw two
   * averages. Decision 137 makes every statistic the same for everybody, so what is left of the
   * viewer is a pronoun.
   */
  isSelf: boolean;
}) {
  const { player, season } = await getPlayerSeasonStats(teamId, memberId);

  if (!player || !player.hasData) {
    return (
      <Card title="Statistiques personnelles">
        <p className="text-sm text-ink-muted">
          Pas encore de données : aucun match joué et aucune note reçue pour ce joueur.
        </p>
      </Card>
    );
  }

  const { appearances, rating } = player;
  // The card header already prints « 7 matchs sur la feuille » in full width, so the roles line does
  // not repeat it. Same wording as `/stats`, from the same function.
  const roles = appearancesLineFr(appearances);
  const pendingNote = pendingRatingsNoteFr(season.pendingRatingMatches, isSelf);

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
          /* « sur 6 matchs notés », not « sur 6 notes » (decision 137): a season average is now the
             mean of one figure per match, and the old wording would read as six opinions. */
          hint={rating.count > 0 ? `sur ${plural(rating.count, "match noté", "matchs notés")}` : undefined}
        />
      </FigureGrid>

      {/* His own record outfield and in goal (decision 162), raw — the same figure `/stats` ranks him
          on since decision 177, worded by the same `concededEveryFr`. */}
      {player.outfieldMinutes > 0 ? (
        <FigureGrid className="mt-3">
          <Figure
            label="Encaissés"
            value={player.concededOutfield}
            hint="joueur de champ"
            tone="muted"
          />
          <Figure
            label="Un but pris"
            value={concededEveryFr(player.outfieldMinutes, player.concededOutfield)}
            tone="muted"
          />
          <Figure label="Sans encaisser" value={formatMinutes(player.cleanMinutes)} tone="muted" />
        </FigureGrid>
      ) : null}

      {player.gkMinutes > 0 ? (
        <FigureGrid className="mt-3">
          <Figure label="Minutes gardien" value={formatMinutes(player.gkMinutes)} tone="muted" />
          <Figure
            label="Encaissés"
            value={player.concededWhileGk}
            hint={
              player.concededWhileGk > 0
                ? concededEveryFr(player.gkMinutes, player.concededWhileGk)
                : undefined
            }
            tone="muted"
          />
          <Figure label="Clean sheets" value={player.gkCleanSheets} tone="muted" />
          <Figure
            label="Sans encaisser"
            value={formatMinutes(player.gkCleanMinutes)}
            hint="dans les buts"
            tone="muted"
          />
        </FigureGrid>
      ) : null}

      {player.positions.length > 0 ? (
        <p className="mt-3 text-xs text-ink-muted">
          {player.positions
            .map((position) => `${positionGroupLabelFr(position.group)} ${formatMinutes(position.minutes)}`)
            .join(" · ")}
        </p>
      ) : null}

      {roles !== null ? <p className="mt-3 text-xs text-ink-muted">{roles}</p> : null}

      {/* How many of the season's matches are still waiting for notes — a fact about the team's
          calendar, identical on every profile. It used to be a per-reader count of matches *he* had
          not rated, printed under this player's average and sometimes over a « — » where there was no
          average for it to be excluded from. */}
      {pendingNote !== null ? <Note>{pendingNote}</Note> : null}
    </Card>
  );
}
