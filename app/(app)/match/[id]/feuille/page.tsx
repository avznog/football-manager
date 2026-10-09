/**
 * « Feuille de match » — the squad selection, coach only.
 *
 * Titulaire / remplaçant / supporter for the whole squad, in one save (`docs/PLAN.md`, screen 3).
 * A plain player gets a 404 rather than a read-only view: in an amateur team the coach announces
 * his group himself, and a half-finished selection visible to everybody is an argument waiting to
 * happen. The page is coach-only, the action checks `match:selectSquad` again, and neither trusts
 * the other.
 *
 * It used to show each player's declared availability next to his name; availability is gone
 * (decision 156), and so is the badge.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { SquadSheet, type SheetMember } from "@/components/composition";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { MATCH_STATUS_LABELS, venuePhraseFr } from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import { countSquadRoles, isSheetCandidate, sheetNextStepFr } from "@/lib/composition/plan";
import { getCompositionMembers, getFieldedMemberIds } from "@/lib/composition/queries";
import { getMatch } from "@/lib/match/queries";

export async function generateMetadata({ params }: PageProps<"/match/[id]/feuille">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const match = await getMatch(team.id, id);
  return { title: match ? `Feuille · ${match.opponentName}` : "Match introuvable" };
}

export default async function MatchSheetPage({
  params,
  searchParams,
}: PageProps<"/match/[id]/feuille">) {
  const [{ actor, team }, { id }, query] = await Promise.all([
    requireTeamContext(),
    params,
    searchParams,
  ]);
  if (!can(actor, "match:selectSquad", { teamId: team.id })) notFound();

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const [members, fielded] = await Promise.all([
    getCompositionMembers(team.id, match.id),
    getFieldedMemberIds(match.id),
  ]);

  // Coaches who never play are not offered, but one already on the sheet stays visible: dropping a
  // row behind the coach's back would be worse than showing it. The rule is `isSheetCandidate`'s,
  // shared with the counting — this screen had it inline, which is why the two screens either side
  // of it counted a thirteenth player nobody had left out (decision NNN).
  const sheetMembers: SheetMember[] = members
    .filter(isSheetCandidate)
    .map((member) => ({
      membershipId: member.membershipId,
      name: member.name,
      jerseyNumber: member.jerseyNumber,
      squadRole: member.squadRole,
      isPlayer: member.isPlayer,
      isInjured: member.isInjured,
    }));

  const kickoff = new Date(match.kickoffAt);

  // « Et maintenant ? » used to say « Le groupe est fait » on a sheet nobody had touched, and told
  // the coach to place seven players on a match played a fortnight ago (decision 084).
  const nextStep = sheetNextStepFr(countSquadRoles(sheetMembers), match.status);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={`/match/${match.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {match.opponentName}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-ink">Feuille de match</h1>
          {match.status !== "scheduled" ? (
            <Badge variant={match.status === "live" ? "danger" : "neutral"} solid={match.status === "live"}>
              {MATCH_STATUS_LABELS[match.status]}
            </Badge>
          ) : null}
        </div>
        {/* Where, under the date: the sheet is filled in while deciding who can come, and « à
            l’extérieur, Stade du Parc » is half of that decision. The venue never stands on its own —
            `venuePhraseFr` leads with the side, which stays true even when the pitch is unnamed. The
            opponent is the link above, so the line does not name him twice. */}
        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff))} à {formatTime(kickoff)} ·{" "}
          {venuePhraseFr(match.isHome, match.venue)}
        </p>
      </header>

      <SquadSheet
        teamId={team.id}
        matchId={match.id}
        members={sheetMembers}
        canEdit
        lockedMemberIds={fielded}
        frozen={match.status === "finished"}
        justSaved={query.enregistre === "1"}
      />

      <Card title="Et maintenant ?" description={nextStep.description}>
        {nextStep.cta === "composition" ? (
          <ButtonLink href={`/match/${match.id}/composition`} variant="secondary">
            Compositions
          </ButtonLink>
        ) : null}
        {nextStep.cta === "recap" ? (
          <ButtonLink href={`/match/${match.id}/recap`} variant="secondary">
            Résumé du match
          </ButtonLink>
        ) : null}
      </Card>
    </div>
  );
}
