/**
 * Everything the composition editor needs, loaded once and shared by the two routes that open it:
 * `composition/nouvelle` and `composition/[lineupId]`.
 *
 * A Server Component, so the reads stay on the server and only the editor itself — the one thing
 * that genuinely needs pointer events — crosses into the browser. The guard is *not* here: each
 * route checks `can()` before rendering this, and the actions check again.
 */

import Link from "next/link";

import { CompositionEditor, type EditorMember } from "@/components/composition";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BUILTIN_FORMATIONS } from "@/db/reference";
import type { ActiveTeam } from "@/lib/auth/dal";
import { planTitleFr, sortPlans, suggestNextMinute } from "@/lib/composition/plan";
import { getCompositionMembers, getMatchLineups, toPlannedLineup } from "@/lib/composition/queries";
import { getFormations } from "@/lib/formation/queries";
import type { MatchRow } from "@/lib/match/queries";

/** The shape a coach gets when nothing else is indicated: the 7-a-side default (decision 005). */
const DEFAULT_LABEL = BUILTIN_FORMATIONS[0].label;

export type EditorScreenProps = {
  team: ActiveTeam;
  match: MatchRow;
  /** `null` to create a composition, a `lineups.id` to edit one. */
  lineupId: string | null;
  /** From `?minute=`, when the list proposed a minute. Ignored when editing. */
  requestedMinute: number | null;
};

export async function EditorScreen({ team, match, lineupId, requestedMinute }: EditorScreenProps) {
  const [members, lineups, formations] = await Promise.all([
    getCompositionMembers(team.id, match.id),
    getMatchLineups(match.id),
    getFormations(team.id),
  ]);

  const backHref = `/match/${match.id}/composition`;
  const target = lineupId ? lineups.find((lineup) => lineup.id === lineupId) : undefined;

  if (lineupId && !target) {
    return (
      <Guidance
        title="Composition introuvable"
        description="Elle a peut-être été supprimée depuis."
        backHref={backHref}
      />
    );
  }

  if (target?.isApplied) {
    return (
      <Guidance
        title="Cette composition a été appliquée"
        description="Elle a été confirmée pendant le match : elle décrit ce qui s’est passé et ne se modifie plus."
        backHref={backHref}
      />
    );
  }

  const selectable = members.filter(
    (member) => member.squadRole === "starter" || member.squadRole === "substitute",
  );
  if (selectable.length === 0) {
    return (
      <Card title="Feuille de match vide">
        <EmptyState
          title="Personne n’est encore retenu"
          description="Seuls les titulaires et les remplaçants de la feuille de match peuvent être placés sur le terrain."
          action={<ButtonLink href={`/match/${match.id}/feuille`}>Remplir la feuille</ButtonLink>}
        />
      </Card>
    );
  }

  if (formations.length === 0) {
    return (
      <Guidance
        title="Aucune formation disponible"
        description="Les formations types n’ont pas été chargées dans la base."
        backHref={backHref}
      />
    );
  }

  const plans = sortPlans(lineups.map(toPlannedLineup));
  const otherPlans = plans.filter((plan) => plan.id !== lineupId);

  const fromMinute =
    target?.fromMinute ??
    (requestedMinute !== null
      ? requestedMinute
      : plans.length === 0
        ? 0
        : suggestNextMinute(plans, match.periodsCount * match.periodMinutes));

  const formationId =
    target?.formationId ??
    (formations.find((formation) => formation.isBuiltin && formation.label === DEFAULT_LABEL)?.id ??
      formations[0].id);

  const editorMembers: EditorMember[] = members.map((member) => ({
    membershipId: member.membershipId,
    name: member.name,
    jerseyNumber: member.jerseyNumber,
    squadRole: member.squadRole,
    isInjured: member.isInjured,
    primaryPositionCode: member.primaryPositionCode,
  }));

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Compositions
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">
          {target
            ? planTitleFr(target)
            : fromMinute === 0
              ? "Composition de départ"
              : "Nouvelle composition"}
        </h1>
        <p className="text-sm text-ink-muted">
          {match.opponentName} · {match.periodsCount}×{match.periodMinutes} minutes
        </p>
      </header>

      <CompositionEditor
        teamId={team.id}
        matchId={match.id}
        lineupId={target?.id ?? null}
        kit={{ primaryColor: team.primaryColor, secondaryColor: team.secondaryColor }}
        members={editorMembers}
        formations={formations}
        formationId={formationId}
        assignments={target?.assignments ?? []}
        fromMinute={fromMinute}
        otherPlans={otherPlans}
        totalMinutes={match.periodsCount * match.periodMinutes}
        cancelHref={backHref}
      />
    </div>
  );
}

function Guidance({
  title,
  description,
  backHref,
}: {
  title: string;
  description: string;
  backHref: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <ButtonLink href={backHref} variant="secondary">
          Retour aux compositions
        </ButtonLink>
      }
    />
  );
}
