/**
 * The compositions of a match: the starting seven, then every planned change.
 *
 * Coach only, like the match sheet it follows. Each composition is drawn read-only with **ghost**
 * discs (decision 006) — it is a plan, not what happened — and under it the changes it implies,
 * deduced against the composition in force just before, never typed in (decision 006 again).
 *
 * Nothing here applies anything: game mode proposes a plan at its minute and waits for the coach
 * (invariant 3). A composition that has already been confirmed is shown without its edit and delete
 * buttons, because it has stopped being a plan and become a record.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { ChangeLines, LineupPitch } from "@/components/composition";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { matchNameFr } from "@/lib/calendar/labels";
import { capitalizeFirst } from "@/lib/calendar/time";
import { deleteLineup } from "@/lib/composition/actions";
import {
  appliedNoticeFr,
  compositionsScreenFr,
  countSquadRoles,
  deduceChanges,
  findPlanIssues,
  nameOfMembers,
  planInForceBefore,
  planMinuteBadgeFr,
  planTitleFr,
  sortPlans,
  squadSummaryFr,
  suggestNextMinute,
} from "@/lib/composition/plan";
import { getCompositionMembers, getMatchLineups, toPlannedLineup } from "@/lib/composition/queries";
import { getMatch } from "@/lib/match/queries";

export async function generateMetadata({ params }: PageProps<"/match/[id]/composition">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const match = await getMatch(team.id, id);
  return { title: match ? `Compositions · ${match.opponentName}` : "Match introuvable" };
}

export default async function CompositionsPage({
  params,
  searchParams,
}: PageProps<"/match/[id]/composition">) {
  const [{ actor, team }, { id }, query] = await Promise.all([
    requireTeamContext(),
    params,
    searchParams,
  ]);
  if (!can(actor, "match:manageLineups", { teamId: team.id })) notFound();

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const [members, lineups] = await Promise.all([
    getCompositionMembers(team.id, match.id),
    getMatchLineups(match.id),
  ]);

  const plans = sortPlans(lineups.map(toPlannedLineup));
  const nameOf = nameOfMembers(members);
  const counts = countSquadRoles(members);
  const selectable = counts.starters + counts.substitutes;
  const totalMinutes = match.periodsCount * match.periodMinutes;
  const nextMinute = suggestNextMinute(plans, totalMinutes);
  const savedId = typeof query.enregistre === "string" ? query.enregistre : null;
  // The whole screen used to be written for a match still to be played: it offered « Planifier un
  // changement » under a match won three days earlier, and `saveLineup` accepted it (decision NNN).
  const screen = compositionsScreenFr(match);
  const applied = appliedNoticeFr(match.entryMode);

  const kit = { primaryColor: team.primaryColor, secondaryColor: team.secondaryColor };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={`/match/${match.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {match.opponentName}
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">Compositions</h1>
        <p className="text-sm text-ink-muted">
          {/* Which match these compositions are for, said in the header rather than only in the back
              link: a coach arrives here from the sheet and places seven players for a fixture whose
              side he is entitled to see without going back a screen. */}
          {capitalizeFirst(matchNameFr(match.opponentName, match.isHome))} · {squadSummaryFr(counts)}{" "}
          ·{" "}
          <Link
            href={`/match/${match.id}/feuille`}
            className="font-medium text-accent hover:underline"
          >
            {screen.sheetLinkFr}
          </Link>
        </p>
      </header>

      {selectable === 0 ? (
        <Card title="Feuille de match vide">
          <EmptyState
            title={screen.emptySheetFr.title}
            description={screen.emptySheetFr.description}
            action={
              screen.emptySheetFr.withCta ? (
                <ButtonLink href={`/match/${match.id}/feuille`}>Remplir la feuille</ButtonLink>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {plans.length === 0 ? (
            <Card title="Aucune composition">
              <EmptyState
                title={screen.noPlansFr.title}
                description={screen.noPlansFr.description}
                action={
                  screen.noPlansFr.withCta ? (
                    <ButtonLink href={`/match/${match.id}/composition/nouvelle?minute=0`}>
                      Composition de départ
                    </ButtonLink>
                  ) : undefined
                }
              />
            </Card>
          ) : null}

          {screen.frozenNoticeFr !== null && plans.length > 0 ? (
            <p className="text-sm text-ink-muted">{screen.frozenNoticeFr}</p>
          ) : null}

          {lineups.map((row) => {
            const plan = toPlannedLineup(row);
            const previous = planInForceBefore(plans, plan.fromMinute, plan.id);
            const changes = deduceChanges(previous, plan, nameOf);
            const issues = findPlanIssues({
              assignments: plan.assignments,
              slots: plan.slots,
              members,
            });
            const onPitch = new Set(plan.assignments.map((assignment) => assignment.memberId));
            const benchNames = members
              .filter(
                (member) =>
                  member.squadRole === "substitute" && !onPitch.has(member.membershipId),
              )
              .map((member) => member.name);

            return (
              <Card
                key={plan.id}
                title={planTitleFr(plan)}
                description={row.formationName}
                action={
                  <div className="flex items-center gap-1">
                    {plan.isApplied ? (
                      <Badge variant="success">appliquée</Badge>
                    ) : (
                      <Badge variant="neutral">{planMinuteBadgeFr(plan)}</Badge>
                    )}
                    {plan.id === savedId ? <Badge variant="accent">enregistrée</Badge> : null}
                  </div>
                }
              >
                <div className="space-y-3">
                  <LineupPitch
                    slots={row.slots}
                    assignments={plan.assignments}
                    members={members}
                    kit={kit}
                    size="md"
                    planned={!plan.isApplied}
                    label={`${planTitleFr(plan)}, ${plan.formationLabel}`}
                  />

                  {benchNames.length > 0 ? (
                    <p className="text-sm text-ink-muted">
                      <span className="font-medium text-ink">Sur le banc :</span>{" "}
                      {benchNames.join(", ")}
                    </p>
                  ) : null}

                  {previous ? (
                    <section className="space-y-1">
                      <h3 className="text-sm font-semibold text-ink">Changements</h3>
                      <ChangeLines lines={changes.lines} />
                    </section>
                  ) : null}

                  {issues.length > 0 ? (
                    <ul className="space-y-1 rounded-xl bg-warning/10 p-3">
                      {issues.map((issue) => (
                        <li key={issue.code + (issue.memberId ?? "")} className="text-sm font-medium text-warning">
                          {issue.messageFr}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {plan.isApplied ? (
                    // Not « confirmée pendant le match » on a match nobody watched: a retro saisie
                    // writes `LINEUP_APPLIED` too, and it was not a confirmation (decision NNN).
                    <p className="text-sm text-ink-muted">{applied.listFr}</p>
                  ) : !screen.editable ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      <ButtonLink
                        href={`/match/${match.id}/composition/${plan.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Modifier
                      </ButtonLink>
                      {/* A plain form: no dialog to get wrong, and it works without JavaScript. */}
                      <form action={deleteLineup}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="matchId" value={match.id} />
                        <input type="hidden" name="lineupId" value={plan.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Supprimer
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          {plans.length > 0 && screen.editable ? (
            <Card
              title="Planifier un changement"
              description={`Une composition « à partir de la minute X ». Le match dure ${totalMinutes} minutes.`}
            >
              <ButtonLink href={`/match/${match.id}/composition/nouvelle?minute=${nextMinute}`}>
                Nouvelle composition
              </ButtonLink>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
