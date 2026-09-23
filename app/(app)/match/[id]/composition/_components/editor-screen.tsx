/**
 * Everything the composition editor needs, loaded once and shared by the two routes that open it:
 * `composition/nouvelle` and `composition/[lineupId]`.
 *
 * A Server Component, so the reads stay on the server and only the editor itself — the one thing
 * that genuinely needs pointer events — crosses into the browser. The guard is *not* here: each
 * route checks `can()` before rendering this, and the actions check again.
 */

import type { ReactNode } from "react";

import Link from "next/link";

import { CompositionEditor, type EditorMember } from "@/components/composition";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BUILTIN_FORMATIONS } from "@/db/reference";
import type { ActiveTeam } from "@/lib/auth/dal";
import { matchNameFr } from "@/lib/calendar/labels";
import { capitalizeFirst } from "@/lib/calendar/time";
import {
  appliedNoticeFr,
  lineupsFrozenFr,
  planTitleFr,
  sortPlans,
  suggestNextMinute,
} from "@/lib/composition/plan";
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

  const plans = sortPlans(lineups.map(toPlannedLineup));
  const otherPlans = plans.filter((plan) => plan.id !== lineupId);

  const fromMinute =
    target?.fromMinute ??
    (requestedMinute !== null
      ? requestedMinute
      : plans.length === 0
        ? 0
        : suggestNextMinute(plans, match.periodsCount * match.periodMinutes));

  /*
   * Computed before the dead ends below, not after, because they render the same header: an audit of
   * every screen at 390 px found this route reaching four different states with no `h1` at all — a
   * bare centred panel saying « Cette composition a été appliquée » about no match in particular.
   * The title is the one thing all six states can state truthfully, so it is outside all of them.
   */
  const title = target
    ? planTitleFr(target)
    : lineupId
      ? "Composition introuvable"
      : fromMinute === 0
        ? "Composition de départ"
        : "Nouvelle composition";

  const shell = (body: ReactNode) => (
    <Shell backHref={backHref} title={title} match={match}>
      {body}
    </Shell>
  );

  if (lineupId && !target) {
    return shell(
      <Guidance
        title="Rien à modifier ici"
        description="Cette composition n’existe pas, ou plus : elle a peut-être été supprimée depuis."
        backHref={backHref}
      />,
    );
  }

  if (target?.isApplied) {
    return shell(
      <Guidance
        title="Elle ne se modifie plus"
        description={appliedNoticeFr(match.entryMode).editorFr}
        backHref={backHref}
      />,
    );
  }

  // A sixth dead end, and the one this route had no opinion about: `saveLineup` now refuses a finished
  // match (decision NNN), so the editor says so here instead of taking a composition and losing it on
  // submit. Same sentence as the list's notice, `lineupsFrozenFr`.
  if (match.status === "finished") {
    return shell(
      <Guidance
        title="Le match est joué"
        description={lineupsFrozenFr(match.entryMode)}
        backHref={backHref}
      />,
    );
  }

  const selectable = members.filter(
    (member) => member.squadRole === "starter" || member.squadRole === "substitute",
  );
  if (selectable.length === 0) {
    return shell(
      <Card title="Feuille de match vide">
        <EmptyState
          title="Personne n’est encore retenu"
          description="Seuls les titulaires et les remplaçants de la feuille de match peuvent être placés sur le terrain."
          action={<ButtonLink href={`/match/${match.id}/feuille`}>Remplir la feuille</ButtonLink>}
        />
      </Card>,
    );
  }

  if (formations.length === 0) {
    return shell(
      <Guidance
        title="Aucune formation disponible"
        description="Les formations types n’ont pas été chargées dans la base."
        backHref={backHref}
      />,
    );
  }

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

  return shell(
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
    />,
  );
}

/** The back link, the title and the match, above whatever state the editor is in. */
function Shell({
  backHref,
  title,
  match,
  children,
}: {
  backHref: string;
  title: string;
  match: MatchRow;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Compositions
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="text-sm text-ink-muted">
          {capitalizeFirst(matchNameFr(match.opponentName, match.isHome))} · {match.periodsCount}×
          {match.periodMinutes} minutes
        </p>
      </header>
      {children}
    </div>
  );
}

/**
 * A dead end in the editor. The page's `h1` says *which* composition — `Shell` puts it there in every
 * state — so this says only what is wrong with it and where to go instead.
 */
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
