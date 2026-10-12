/**
 * Impact par poste — the owner's Q7: « pour chaque poste, qui est le meilleur en terme d'impact pour
 * l'équipe ». The goal difference while he held that position, divided by his minutes there and
 * brought back to 60 minutes of play — **raw, with no smoothing at all** (decision 198).
 *
 * It was smoothed towards the position's own figure until 2026-10-12, so that ten minutes could not top
 * a post. What that produced on a three-match season was a table with no positive figure anywhere: the
 * team's own difference is negative, so every man was dragged below zero, `+1 / −0` printed « −1,8 » and
 * `+0 / −0` printed « −2,4 ». The owner read it and said so. The figure is now the plain division, every
 * row can be checked by hand against the two counts beside it, and a short spell *can* lead a post —
 * which is why the minutes are never printed away from the figure.
 *
 * One card, five short lists, because five cards of a handful of rows each would be the longest stretch
 * of the page for the least information on it. Each list shows five and folds the rest under « Tout
 * afficher » like every other ranking on the page (decision 176). Every row prints the figure and the
 * record it is computed from, « +5 / −2 en 120′ » — printed, because nothing is explained on hover
 * (decision 072).
 */

import { Card } from "@/components/ui/card";
import type { PositionImpact } from "@/lib/stats/impact";
import { formatSignedDecimal, impactRecordFr } from "@/lib/stats/format";
import { positionGroupLabelFr } from "@/lib/stats/positions";

import { Note, RankedRows } from "./parts";

export function ImpactByPosition({ impact }: { impact: readonly PositionImpact[] }) {
  return (
    <Card
      title="Impact par poste"
      description="Différence de buts quand il tient ce poste, ramenée à 60 minutes de jeu"
      as="h3"
      flush
    >
      <div className="divide-y divide-border/60">
        {impact.map((position) => (
          <section key={position.group} className="py-2">
            <h4 className="px-4 text-xs font-semibold text-ink-muted uppercase">
              {positionGroupLabelFr(position.group)}
            </h4>
            {position.entries.length === 0 ? (
              <p className="px-4 py-1.5 text-sm text-ink-subtle">Personne n’a encore joué à ce poste.</p>
            ) : (
              <RankedRows
                entries={position.entries}
                value={(entry) => formatSignedDecimal(entry.impactPer60)}
                detail={(entry) => impactRecordFr(entry.goalsFor, entry.goalsAgainst, entry.minutes)}
                dense
              />
            )}
          </section>
        ))}
      </div>
      <div className="px-4 pb-3">
        <Note>
          Le chiffre est brut : buts marqués moins buts encaissés pendant qu’il tenait ce poste, divisé
          par ses minutes, ramené à 60 minutes de jeu. +1 et 0 encaissé en 10′ donne +6,0 ; 0 et 0 donne
          0,0. Rien n’est lissé, donc une entrée de dix minutes peut mener un poste : les minutes sont
          écrites à côté pour que tu voies sur quoi le chiffre repose. Ailier regroupe les ailiers et les
          milieux de côté, défenseur central tous les défenseurs.
        </Note>
      </div>
    </Card>
  );
}
