/**
 * The « Composition » card on the match page: where the coach starts, and what he has already
 * planned.
 *
 * Only rendered for a coach (`docs/PLAN.md`, screen 3, "for the coach: selection…, compositions"),
 * so it does no permission check of its own — the page decides, and the routes and actions it links
 * to check again.
 *
 * It shows the starting composition, not a list of pitches: the planned changes are summarised on
 * one line each (« 30ᵉ minute · Ali → Momo »), which is what the coach glances at before opening
 * the editor.
 */

import { LineupPitch } from "@/components/composition";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { ActiveTeam } from "@/lib/auth/dal";
import {
  countSquadRoles,
  deduceChanges,
  nameOfMembers,
  planInForceBefore,
  planTitleFr,
  sortPlans,
  squadSummaryFr,
} from "@/lib/composition/plan";
import { getCompositionMembers, getMatchLineups, toPlannedLineup } from "@/lib/composition/queries";
import type { MatchRow } from "@/lib/match/queries";

export async function CompositionCard({ team, match }: { team: ActiveTeam; match: MatchRow }) {
  const [members, lineups] = await Promise.all([
    getCompositionMembers(team.id, match.id),
    getMatchLineups(match.id),
  ]);

  const counts = countSquadRoles(members);
  const selected = counts.starters + counts.substitutes + counts.supporters;
  const plans = sortPlans(lineups.map(toPlannedLineup));
  const nameOf = nameOfMembers(members);

  const sheetHref = `/match/${match.id}/feuille`;
  const compositionsHref = `/match/${match.id}/composition`;

  if (selected === 0) {
    return (
      <Card title="Composition" as="h2">
        <EmptyState
          title="Le groupe n’est pas encore fait"
          description="Choisis tes titulaires, tes remplaçants et tes supporters, puis place les sept sur le terrain."
          action={<ButtonLink href={sheetHref}>Feuille de match</ButtonLink>}
        />
      </Card>
    );
  }

  const first = lineups[0];

  return (
    <Card
      title="Composition"
      as="h2"
      description={squadSummaryFr(counts)}
      action={
        /* « titulaires », the word `SquadSheet` already uses, because this badge counts the *sheet*
           while the card is titled « Composition ». Bare, it read as the composition's own progress
           — and on a match with none it sat directly above « Aucune composition », saying « 7 / 7 ». */
        <Badge variant={counts.starters === 7 ? "success" : "warning"}>
          {counts.starters} / 7 titulaires
        </Badge>
      }
    >
      <div className="space-y-3">
        {first ? (
          <>
            <LineupPitch
              slots={first.slots}
              assignments={first.assignments}
              members={members}
              kit={{ primaryColor: team.primaryColor, secondaryColor: team.secondaryColor }}
              size="md"
              planned={!first.isApplied}
              label={`${planTitleFr(first)}, ${first.formationLabel}`}
            />
            <p className="text-sm text-ink-muted">
              {planTitleFr(first)} · {first.formationName}
            </p>

            {plans.length > 1 ? (
              <ul className="space-y-1">
                {plans.slice(1).map((plan) => (
                  <li key={plan.id} className="text-sm text-ink">
                    <span className="font-semibold">{planTitleFr(plan)}</span>{" "}
                    <span className="text-ink-muted">
                      ·{" "}
                      {
                        deduceChanges(planInForceBefore(plans, plan.fromMinute, plan.id), plan, nameOf)
                          .summary
                      }
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="Aucune composition"
            description="Place tes sept joueurs sur la pelouse : tu pourras ensuite planifier les changements."
            action={
              <ButtonLink href={`${compositionsHref}/nouvelle?minute=0`}>
                Composition de départ
              </ButtonLink>
            }
          />
        )}

        <div className="flex flex-wrap gap-2">
          <ButtonLink href={compositionsHref} variant="secondary" size="sm">
            Compositions
          </ButtonLink>
          <ButtonLink href={sheetHref} variant="ghost" size="sm">
            Feuille de match
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
