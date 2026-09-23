/**
 * Gardiens — decision 018's own columns, and the reason they exist.
 *
 * In 7-a-side the gloves move: a keeper replaced at half time in a match the team then loses still
 * kept a clean half. So two figures live side by side: the clean sheet (« gkMinutes > 0 and nothing
 * conceded while in goal »), and the clean minutes, which keep crediting the half that was clean.
 */

import { Card } from "@/components/ui/card";
import type { PlayerSeasonStats } from "@/lib/stats/aggregate";
import { formatMinutes, matchCount, plural } from "@/lib/stats/format";

import { CardEmpty, Figure, FigureGrid, Note, PlayerIdentity } from "./parts";

export function Keepers({ keepers }: { keepers: readonly PlayerSeasonStats[] }) {
  if (keepers.length === 0) {
    return (
      <Card title="Gardiens" as="h3">
        <CardEmpty>
          Personne n’a encore de minutes dans les buts sur cette sélection. Les minutes de gardien
          viennent du poste occupé pendant le match, pas de la feuille de match.
        </CardEmpty>
      </Card>
    );
  }

  return (
    <Card title="Gardiens" as="h3" flush>
      <ul className="divide-y divide-border/60">
        {keepers.map((keeper) => (
          <li key={keeper.teamMemberId} className="px-4 py-3">
            <PlayerIdentity
              displayName={keeper.displayName}
              jerseyNumber={keeper.jerseyNumber}
              hasLeft={keeper.hasLeft}
            />
            <FigureGrid className="mt-2">
              <Figure
                label="Clean sheets"
                value={keeper.gkCleanSheets}
                hint={`sur ${matchCount(keeper.appearances.goalkeeper)}`}
                tone="strong"
              />
              <Figure label="Minutes" value={formatMinutes(keeper.gkMinutes)} />
              {/* No hint: « minutes dans les buts avec la cage inviolée » is the Note under the
                  card, in the width a sentence needs (decision 072). */}
              <Figure label="Sans encaisser" value={formatMinutes(keeper.gkCleanMinutes)} />
              <Figure label="Encaissés" value={keeper.concededWhileGk} />
            </FigureGrid>
          </li>
        ))}
      </ul>
      <div className="px-4 pb-3">
        <Note>
          Un clean sheet est compté par match, pour le gardien qui n’a rien encaissé pendant son
          temps de jeu : deux gardiens peuvent donc en avoir un chacun sur des matchs différents, et
          un gardien remplacé à la mi-temps garde ses minutes sans encaisser même si l’équipe a
          ensuite pris un but.
          {keepers.length > 1
            ? ` ${plural(keepers.length, "joueur")} ont gardé les buts sur cette sélection.`
            : ""}
        </Note>
      </div>
    </Card>
  );
}
