/**
 * Impact par poste — the owner's Q7: « pour chaque poste, qui est le meilleur en terme d'impact pour
 * l'équipe ». The goal difference while he held that position, per 60 minutes, smoothed towards the
 * position's own figure so ten minutes cannot top the table (`lib/stats/impact.ts`, decision 162).
 *
 * One card, five short lists, because five cards of three rows each would be the longest stretch of the
 * page for the least information on it. Every row prints the ranked figure and the record it rests on,
 * « +5 / −2 en 120′ », since the smoothed figure is not the one a player would work out himself and
 * nothing is explained on hover (decision 072).
 */

import { Card } from "@/components/ui/card";
import type { PositionImpact } from "@/lib/stats/impact";
import { formatSignedDecimal, impactRecordFr, plural } from "@/lib/stats/format";
import { positionGroupLabelFr } from "@/lib/stats/positions";

import { Note, PlayerIdentity } from "./parts";

export function ImpactByPosition({ impact }: { impact: readonly PositionImpact[] }) {
  return (
    <Card
      title="Impact par poste"
      description="Différence de buts quand il joue à ce poste, pour 60 minutes"
      as="h3"
      flush
    >
      <div className="divide-y divide-border/60">
        {impact.map((position) => (
          <section key={position.group} className="py-2">
            <h4 className="flex items-baseline justify-between px-4 text-xs font-semibold text-ink-muted uppercase">
              <span>{positionGroupLabelFr(position.group)}</span>
              {position.considered > position.entries.length ? (
                <span className="font-normal normal-case">
                  {plural(position.considered, "joueur")} à ce poste
                </span>
              ) : null}
            </h4>
            {position.entries.length === 0 ? (
              <p className="px-4 py-1.5 text-sm text-ink-subtle">Personne n’a encore joué à ce poste.</p>
            ) : (
              <ol>
                {position.entries.map((entry, index) => (
                  <li key={entry.teamMemberId} className="flex items-center gap-3 px-4 py-1.5">
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
                        {formatSignedDecimal(entry.impactPer60)}
                      </p>
                      <p className="text-[0.6875rem] text-ink-subtle tabular-nums">
                        {impactRecordFr(entry.goalsFor, entry.goalsAgainst, entry.minutes)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
      <div className="px-4 pb-3">
        <Note>
          Le chiffre classé est lissé vers la moyenne du poste : dix minutes et un but ne suffisent pas
          pour passer devant une saison entière. Sous lui, les buts marqués et encaissés pendant qu’il
          occupait ce poste, et ses minutes. Ailier regroupe les ailiers et les milieux de côté,
          défenseur central tous les défenseurs.
        </Note>
      </div>
    </Card>
  );
}
