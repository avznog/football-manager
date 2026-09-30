/**
 * « Saisie rétroactive » — screen 8 of `docs/PLAN.md`.
 *
 * The match was played without the phone. Somebody's cousin was in goal, the coach was refereeing
 * the second half, and nobody opened the app. Two days later, on the bus, he types it up.
 *
 * What this screen produces is **an ordinary event log**. There is no retro-flavoured score column,
 * no parallel table, no `if (entryMode === "retro")` anywhere downstream: `lib/retro/log.ts`
 * synthesises `KICKOFF`, `LINEUP_APPLIED`, the goals, the substitutions and the `FINAL_WHISTLE`, and
 * from then on the reducer, `match_player_stats`, `/stats`, the recap and the ratings all read a
 * match they cannot tell from one recorded live (decision 013).
 *
 * Two shapes, one route:
 *
 * - **empty log** → the entry form. The coach names the seven who started, the changes and the
 *   facts. Minutes are optional everywhere, because a fortnight later he does not remember them and
 *   an app that insists gets a made-up number instead of a blank.
 * - **log already there** → the corrections list. Every action of the match, each with « Corriger »
 *   and « Annuler ». Both append (invariant 1); nothing is ever updated or deleted.
 *
 * Coach only, through `can()` (invariant 4) — `match:amend`, which unlike `match:operate` is not
 * delegable: game mode's operator holds the phone for an afternoon (decision 004), rewriting a
 * finished match is the coach's alone. A non-coach gets a 404, not a disabled button.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import { matchNameFr, periodsLabel } from "@/lib/calendar/labels";
import { getRetroView } from "@/lib/retro/queries";
import { RetroCorrections } from "./_components/retro-corrections";
import { RetroForm } from "./_components/retro-form";

export async function generateMetadata({ params }: PageProps<"/match/[id]/saisie">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const view = await getRetroView(team.id, id);
  return {
    title: view ? `Saisie · ${view.match.opponentName}` : "Match introuvable",
  };
}

export default async function SaisiePage({ params, searchParams }: PageProps<"/match/[id]/saisie">) {
  const [{ actor, team }, { id }, query] = await Promise.all([
    requireTeamContext(),
    params,
    searchParams,
  ]);
  if (!can(actor, "match:amend", { teamId: team.id })) notFound();

  const view = await getRetroView(team.id, id);
  if (!view) notFound();

  const kickoff = new Date(view.match.kickoffAt);
  const now = new Date();
  /*
   * The clock, unless the coach has overruled it. `status === "finished"` is now something he can
   * declare himself, at any moment and including before the kick-off (decision 121) — and refusing
   * to open the form for a match the app itself calls terminé would be the app contradicting its
   * own match page. The clock still answers for a match nobody has closed, which is the case the
   * EmptyState below was written for: somebody arriving early on next Sunday's fixture.
   */
  const played = view.match.status === "finished" || kickoff.getTime() <= now.getTime();
  const corrected = query.corrige === "1";

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={`/match/${view.match.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {view.match.opponentName}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {/* Only once there is something to have been entered: « saisi après le match » on an empty
              log is a claim about a thing that has not happened yet, and this is the page where it is
              about to. */}
          {view.match.entryMode === "retro" && view.hasLog ? (
            <Badge variant="neutral">saisi après le match</Badge>
          ) : null}
          {view.scoreLabel ? <Badge variant="accent">{view.scoreLabel}</Badge> : null}
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          {view.hasLog ? "Corriger le match" : "Saisie du match"}
        </h1>
        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff))} à {formatTime(kickoff)} ·{" "}
          {matchNameFr(view.match.opponentName, view.match.isHome)} ·{" "}
          {periodsLabel(view.match.periodsCount, view.match.periodMinutes)}
        </p>
      </header>

      {corrected ? (
        <p
          role="status"
          className="rounded-xl bg-success/15 px-3 py-2 text-sm font-medium text-success"
        >
          Correction enregistrée. Les statistiques de la saison ont été recalculées.
        </p>
      ) : null}

      {!played ? (
        <EmptyState
          title="Ce match n’a pas encore eu lieu"
          description="La saisie rétroactive sert à rattraper un match joué sans le téléphone. Reviens après le coup de sifflet final."
          action={
            <ButtonLink href={`/match/${view.match.id}`} variant="secondary">
              Retour au match
            </ButtonLink>
          }
        />
      ) : view.hasLog ? (
        <RetroCorrections teamId={team.id} view={view} />
      ) : view.slots.length === 0 ? (
        <EmptyState
          title="Aucune formation disponible"
          description="Il faut une formation pour placer les titulaires. Crée-en une depuis les compositions du match."
          action={
            <ButtonLink href={`/match/${view.match.id}/composition`} variant="secondary">
              Aller aux compositions
            </ButtonLink>
          }
        />
      ) : view.players.length === 0 ? (
        <EmptyState
          title="L’effectif est vide"
          description="Ajoute des joueurs à l’équipe avant de saisir un match."
          action={
            <ButtonLink href="/equipe" variant="secondary">
              Aller à l’effectif
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Card>
            <p className="text-sm text-ink-muted">
              Tout se déduit de ce que tu remplis&nbsp;: le score, les minutes jouées, les clean
              sheets. Les minutes des actions sont facultatives — laisse le champ vide si tu ne t’en
              souviens plus, l’app placera l’action au mieux.
            </p>
          </Card>
          <RetroForm teamId={team.id} view={view} />
        </>
      )}
    </div>
  );
}
