/**
 * « Notation » — rate your teammates after the match (screen 7 of `docs/PLAN.md`).
 *
 * Who may be here, and what they see, is decided on the server:
 *
 * - only members on the **match sheet** as starter or substitute may rate (decision 007), and they
 *   rate everybody including themselves;
 * - the window closes at the **next kick-off**, after which the form is gone rather than merely
 *   disabled — an insert would be refused anyway (`lib/rating/actions.ts`). While it is open, the
 *   screen says when that is: `ratingDeadlineFr` (decision 079);
 * - this page **never shows anybody else's notes**, whatever the viewer's progress. Reading them is
 *   the recap's job, and `getRatingResults` gates that (see `lib/rating/queries.ts`).
 *
 * `params` is a Promise in Next 16 and `PageProps<"/match/[id]/notation">` comes from `next typegen`
 * (`docs/NEXTJS16.md`). A match id from another team is a 404: every query is scoped by team.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { COMPETITION_LABELS, pluralize } from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import { getMatch } from "@/lib/match/queries";
import { getNotationView } from "@/lib/rating/queries";
import { ratingDeadlineFr } from "@/lib/rating/window";
import { RatingFlow } from "./_components/rating-flow";

export async function generateMetadata({ params }: PageProps<"/match/[id]/notation">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const match = await getMatch(team.id, id);
  return { title: match ? `Notation · ${match.opponentName}` : "Match introuvable" };
}

export default async function NotationPage({ params }: PageProps<"/match/[id]/notation">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);

  const view = await getNotationView({
    teamId: team.id,
    matchId: id,
    membershipId: team.membershipId,
  });
  if (!view) notFound();

  const { match, window, onSheet, sheetRole, targets, progress } = view;
  const kickoff = new Date(match.kickoffAt);
  const now = new Date();

  // Invariant 4: the permission comes from `can()`, never from a role read on the spot.
  const mayRate = onSheet && can(actor, "rating:submit", { teamId: team.id });
  const deadline = ratingDeadlineFr(window.closesAtMs, now.getTime());

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/match/${match.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {match.opponentName}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{COMPETITION_LABELS[match.competition]}</Badge>
          {window.state === "closed" ? <Badge variant="neutral">notation fermée</Badge> : null}
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          Noter mes coéquipiers
        </h1>
        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff, now))} à {formatTime(kickoff)} · {match.opponentName}
        </p>
      </header>

      {window.state === "not-yet" ? (
        <EmptyState
          title="La notation ouvrira à la fin du match"
          description="Les notes s’ouvrent au coup de sifflet final, quand il y a quelque chose à juger."
          action={
            <ButtonLink href={`/match/${match.id}`} variant="secondary">
              Retour au match
            </ButtonLink>
          }
        />
      ) : !mayRate ? (
        /* A supporter *was* on the sheet — he simply rates nobody (decision 039). Telling him he
           was not on it contradicts the sheet he can read two taps away. */
        <EmptyState
          title={
            sheetRole === "supporter"
              ? "Tu étais supporter sur ce match"
              : "Tu n’étais pas sur la feuille de match"
          }
          description={
            sheetRole === "supporter"
              ? "Les supporters ne notent pas — mais tu peux lire les notes de l’équipe dans le résumé."
              : "Seuls les joueurs qui ont joué ou qui étaient sur le banc notent leurs coéquipiers."
          }
          action={
            <ButtonLink href={`/match/${match.id}/recap`} variant="secondary">
              Voir le résumé du match
            </ButtonLink>
          }
        />
      ) : progress.complete ? (
        <Card title="Tes notes sont envoyées" as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Tu as noté {pluralize(progress.requiredCount, "joueur")} de la feuille de match. Les
              notes de tout le monde sont maintenant visibles dans le résumé.
            </p>
            <ButtonLink href={`/match/${match.id}/recap`}>Voir le résumé et les notes</ButtonLink>
          </div>
        </Card>
      ) : window.state === "closed" ? (
        <Card title="La notation est fermée" as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Le match suivant a déjà commencé : les notes de ce match ne bougent plus.
              {progress.submittedCount > 0
                ? ` Tu en avais mis ${progress.submittedCount} sur ${progress.requiredCount}.`
                : " Tu n’en avais mis aucune."}
            </p>
            <ButtonLink href={`/match/${match.id}/recap`} variant="secondary">
              Voir le résumé du match
            </ButtonLink>
          </div>
        </Card>
      ) : targets.length === 0 ? (
        <EmptyState
          title="Aucun joueur à noter"
          description="La feuille de match de ce match est vide."
        />
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Une note de 0 à 10 par coéquipier, toi compris. Un commentaire si tu veux. Ton nom est
            visible par l’équipe.
          </p>
          {/* The deadline the app enforces, said out loud (decision 079). Null when no next match is
              on the calendar: the window has no end yet, so there is nothing to announce. */}
          {deadline ? <p className="text-sm font-medium text-ink">{deadline}</p> : null}
          <RatingFlow teamId={team.id} matchId={match.id} targets={targets} />
        </>
      )}
    </div>
  );
}
