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
import type { ActiveTeam } from "@/lib/auth/dal";
import { matchNameFr } from "@/lib/calendar/labels";
import { capitalizeFirst } from "@/lib/calendar/time";
import {
  appliedNoticeFr,
  lineupsFrozenFr,
  nameOfMembers,
  planTitleFr,
  sortPlans,
  suggestNextMinute,
} from "@/lib/composition/plan";
import { prefillFromPlans, prefillNoticeFr } from "@/lib/composition/prefill";
import { getCompositionMembers, getMatchLineups, toPlannedLineup } from "@/lib/composition/queries";
import { getTheFormation } from "@/lib/formation/queries";
import type { MatchRow } from "@/lib/match/queries";

export type EditorScreenProps = {
  team: ActiveTeam;
  match: MatchRow;
  /** `null` to create a composition, a `lineups.id` to edit one. */
  lineupId: string | null;
  /** From `?minute=`, when the list proposed a minute. Ignored when editing. */
  requestedMinute: number | null;
};

export async function EditorScreen({ team, match, lineupId, requestedMinute }: EditorScreenProps) {
  const [members, lineups, formation] = await Promise.all([
    getCompositionMembers(team.id, match.id),
    getMatchLineups(match.id),
    getTheFormation(),
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

  if (formation === null) {
    return shell(
      <Guidance
        title="Aucune formation disponible"
        description="La formation n’a pas été chargée dans la base."
        backHref={backHref}
      />,
    );
  }

  /*
   * A new composition opens with the team already on the pitch at that minute — the coach came to
   * make one substitution, not to place seven players again (decision 106). It is the *editor's*
   * initial state and nothing else: no row is written, the form is still submitted by hand, and
   * `saveLineup` is unchanged, so invariant 3 holds exactly as before.
   *
   * `planInForceBefore` inside `prefillFromPlans` is the same function that chooses which two teams
   * the « Changements déduits » card compares, so what the pitch opens with and what the diff is
   * measured against cannot disagree: the changes are empty until the coach moves somebody.
   */
  const prefill =
    lineupId === null
      ? prefillFromPlans({
          plans,
          minute: fromMinute,
          placeableMemberIds: selectable.map((member) => member.membershipId),
          formationIds: [formation.id],
        })
      : null;

  /*
   * What the pitch opens with, always on the one formation's slots (decision 157). A plan drawn before
   * that, on a shape that is no longer offered, is carried over **post by post in store order** — the
   * keeper stays the keeper, the back two stay at the back — and saving it moves it onto the formation.
   * Every such plan on production was already a `1-2-3-1`, so this is the theoretical case.
   */
  const assignments = target
    ? target.formationId === formation.id
      ? target.assignments
      : carryOver(target.assignments, target.slots, formation.slots)
    : (prefill?.assignments ?? []);

  const editorMembers: EditorMember[] = members.map((member) => ({
    membershipId: member.membershipId,
    name: member.name,
    jerseyNumber: member.jerseyNumber,
    squadRole: member.squadRole,
    isInjured: member.isInjured,
  }));

  return shell(
    <CompositionEditor
        teamId={team.id}
        matchId={match.id}
        lineupId={target?.id ?? null}
        kit={{ primaryColor: team.primaryColor, secondaryColor: team.secondaryColor }}
        members={editorMembers}
        formation={formation}
        assignments={assignments}
        prefillNoticeFr={prefill ? prefillNoticeFr(prefill, nameOfMembers(members)) : []}
        fromMinute={fromMinute}
        otherPlans={otherPlans}
      totalMinutes={match.periodsCount * match.periodMinutes}
      cancelHref={backHref}
    />,
  );
}

/**
 * A composition's players moved from one formation's slots to another's, by `sort`: the n-th post of
 * the old shape becomes the n-th post of the new one. Both shapes number their slots goalkeeper first,
 * then back to front (`db/reference.ts`), so the keeper always lands in goal.
 */
function carryOver(
  assignments: readonly { slotId: string; memberId: string }[],
  fromSlots: readonly { id: string; sort: number }[],
  toSlots: readonly { id: string; sort: number }[],
): { slotId: string; memberId: string }[] {
  const from = [...fromSlots].sort((a, b) => a.sort - b.sort);
  const to = [...toSlots].sort((a, b) => a.sort - b.sort);
  return assignments.flatMap((assignment) => {
    const index = from.findIndex((slot) => slot.id === assignment.slotId);
    const slot = index >= 0 ? to[index] : undefined;
    return slot ? [{ slotId: slot.id, memberId: assignment.memberId }] : [];
  });
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
