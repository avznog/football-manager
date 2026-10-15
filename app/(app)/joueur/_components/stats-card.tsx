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
  everyFr,
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

      {/* What he does, as a frequency: « Un but marqué · toutes les 46′ · sur 138′ » (decision 197).
          His own goals and his own passes, over his minutes **on the pitch outside the goal** since
          decision 203 — never the team's goals while he was on. The denominator is the same one
          `/stats` ranks him on, so the two screens cannot disagree about his own rate. Each rate
          carries the minutes it is over (decision 184), and a man who has never scored reads
          « jamais » rather than a division. */}
      {player.outfieldMinutes > 0 ? (
        <FigureGrid className="mt-3">
          <Figure
            label="Un but marqué"
            value={everyFr(player.outfieldMinutes, player.goals)}
            hint={`sur ${formatMinutes(player.outfieldMinutes)} sur le terrain`}
            tone="muted"
          />
          <Figure
            label="Une passe déc."
            value={everyFr(player.outfieldMinutes, player.assists)}
            hint={`sur ${formatMinutes(player.outfieldMinutes)} sur le terrain`}
            tone="muted"
          />
        </FigureGrid>
      ) : null}

      {/* His own record outfield and in goal (decision 162), raw — the same figure `/stats` ranks him
          on since decision 177, worded by the same `everyFr`.

          Each rate carries its own denominator (decision 184): his outfield minutes appear nowhere
          else on this card, so « toutes les 24′ » would be a rate over an unstated stretch of time.
          The clean minutes used to sit here beside them and are gone with decision 196: the real
          statement about invincibility is the rate, and « 85′ sans encaisser » was read as a quality
          when it is mostly a quantity of football. */}
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
            value={everyFr(player.outfieldMinutes, player.concededOutfield)}
            hint={`sur ${formatMinutes(player.outfieldMinutes)}`}
            tone="muted"
          />
        </FigureGrid>
      ) : null}

      {player.gkMinutes > 0 ? (
        <FigureGrid className="mt-3">
          <Figure label="Minutes gardien" value={formatMinutes(player.gkMinutes)} tone="muted" />
          <Figure
            label="Encaissés"
            value={player.concededWhileGk}
            hint="dans les buts"
            tone="muted"
          />
          {/* « au goal » in the label, because the grid above has a « Un but pris » of its own over a
              different stretch of minutes, and two identical labels on one card are read as one
              number measured twice. */}
          <Figure
            label="Un but pris au goal"
            value={everyFr(player.gkMinutes, player.concededWhileGk)}
            hint={`sur ${formatMinutes(player.gkMinutes)}`}
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
