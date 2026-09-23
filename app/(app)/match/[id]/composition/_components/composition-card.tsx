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
  compositionsScreenFr,
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
  /**
   * The same function the compositions screen uses for its own two empty states (decision 085). This
   * card had its own pair, written for a match still to be played, and kept handing them to a coach
   * looking at a match played ten days earlier — under a primary button leading to an editor that
   * refuses a finished match. 085 derived the screen and never came back to the card linking to it.
   */
  const screen = compositionsScreenFr(match);

  const sheetHref = `/match/${match.id}/feuille`;
  const compositionsHref = `/match/${match.id}/composition`;

  if (selected === 0) {
    return (
      <Card title="Composition" as="h2">
        <EmptyState
          title={screen.emptySheetFr.title}
          description={screen.emptySheetFr.description}
          /* The link stays either way — an empty sheet is worth seeing — but it stops being the
             primary thing to do on a match whose sheet can no longer be filled. */
          action={
            <ButtonLink href={sheetHref} variant={screen.editable ? "primary" : "secondary"}>
              Feuille de match
            </ButtonLink>
          }
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
            title={screen.noPlansFr.title}
            description={screen.noPlansFr.description}
            /* No button at all on a played match: the editor refuses it (decision 085), and the real
               next action on this screen is the « Saisir le match » card below. */
            action={
              screen.noPlansFr.withCta ? (
                <ButtonLink href={`${compositionsHref}/nouvelle?minute=0`}>
                  Composition de départ
                </ButtonLink>
              ) : undefined
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
