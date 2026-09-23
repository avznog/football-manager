/**
 * The team's season: the record, the goals, and the form guide.
 *
 * Everything here comes from the match scores the reducer derived from the log, never from the
 * players' goals — a goal may have no scorer (decision 017), so the two do not have to add up, and
 * the gap is stated rather than hidden.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatShortDay } from "@/lib/calendar/time";
import type { FormEntry, TeamSeasonStats } from "@/lib/stats/aggregate";
import {
  formatRecord,
  formatScore,
  formatSigned,
  matchCount,
  plural,
  resultLabelOf,
  resultLetterOf,
} from "@/lib/stats/format";

import { CardEmpty, Figure, FigureGrid, Note } from "./parts";

const RESULT_VARIANT = {
  win: "success",
  draw: "warning",
  loss: "danger",
} as const;

export function TeamSummary({
  team,
  matchesConsidered,
  liveMatches,
}: {
  team: TeamSeasonStats;
  matchesConsidered: number;
  liveMatches: number;
}) {
  if (matchesConsidered === 0) {
    return (
      <Card title="Bilan de l’équipe">
        <CardEmpty>
          Aucun match terminé dans cette sélection. Le bilan apparaîtra dès qu’un match aura été
          joué et saisi.
        </CardEmpty>
        {liveMatches > 0 ? <LiveNote count={liveMatches} /> : null}
      </Card>
    );
  }

  return (
    <Card
      title="Bilan de l’équipe"
      description={`${matchCount(team.played)} ${team.played > 1 ? "comptés" : "compté"} · ${formatRecord(team.wins, team.draws, team.losses)}`}
      action={
        <Badge variant={team.goalDifference >= 0 ? "success" : "danger"}>
          {formatSigned(team.goalDifference)}
        </Badge>
      }
    >
      <FigureGrid>
        <Figure label="Buts pour" value={team.goalsFor} tone="strong" />
        <Figure label="Buts contre" value={team.goalsAgainst} tone="strong" />
        <Figure
          label="Clean sheets"
          value={team.cleanSheets}
          hint="Matchs terminés sans encaisser"
          tone="strong"
        />
        <Figure label="Victoires" value={team.wins} tone="muted" />
        <Figure label="Nuls" value={team.draws} tone="muted" />
        <Figure label="Défaites" value={team.losses} tone="muted" />
      </FigureGrid>

      {team.form.length > 0 ? <Form entries={team.form} /> : null}

      {team.unattributedGoals > 0 ? (
        <Note>
          {plural(team.unattributedGoals, "but")} sans buteur renseigné : le score de l’équipe est
          toujours juste, mais la somme des buts des joueurs est plus basse (c’est prévu — un but
          peut être saisi sans buteur).
        </Note>
      ) : null}

      {team.unrecordedMatches > 0 ? (
        <Note>
          {matchCount(team.unrecordedMatches)} terminé{team.unrecordedMatches > 1 ? "s" : ""} sans
          aucun évènement saisi : ils ne sont comptés nulle part, ni en victoire ni en défaite. Une
          saisie rétroactive les ferait apparaître.
        </Note>
      ) : null}

      {liveMatches > 0 ? <LiveNote count={liveMatches} /> : null}
    </Card>
  );
}

function LiveNote({ count }: { count: number }) {
  return (
    <Note>
      {matchCount(count)} en cours {count > 1 ? "sont exclus" : "est exclu"} de ces statistiques :
      ses minutes bougent encore. Il sera compté après le coup de sifflet final.
    </Note>
  );
}

/** Most recent first: the way a form guide is always read. */
function Form({ entries }: { entries: FormEntry[] }) {
  return (
    <div className="mt-4">
      <p className="text-[0.6875rem] font-medium text-ink-subtle uppercase">Forme récente</p>
      <ol className="mt-1.5 flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <li key={entry.matchId}>
            <span
              className="inline-flex flex-col items-center gap-0.5"
              title={`${resultLabelOf(entry.result)} ${formatScore(entry.goalsFor, entry.goalsAgainst)} — ${entry.isHome ? "domicile" : "extérieur"} contre ${entry.opponentName}, ${formatShortDay(new Date(entry.kickoffAt))}`}
            >
              <Badge variant={RESULT_VARIANT[entry.result]} solid className="justify-center px-2">
                <span aria-hidden="true">{resultLetterOf(entry.result)}</span>
                <span className="sr-only">
                  {resultLabelOf(entry.result)} contre {entry.opponentName}
                </span>
              </Badge>
              <span className="font-mono text-[0.625rem] text-ink-subtle tabular-nums">
                {entry.goalsFor}-{entry.goalsAgainst}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
