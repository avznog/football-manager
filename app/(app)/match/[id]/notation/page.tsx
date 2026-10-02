/**
 * « Notation » — rate the teammates you played with (screen 7 of `docs/PLAN.md`).
 *
 * Who may be here, and what they see, is decided on the server:
 *
 * - **only players who played may rate, and only they may be rated** — `minutes > 0` in the log, not
 *   a role on the sheet (decision 137, superseding 007 on both counts). A named substitute who never
 *   came on is told so rather than asked for opinions about a match he watched; a supporter was never
 *   asked under 007 either (decision 039). Nobody rates himself, so the list is who played minus the
 *   reader, and `getNotationView` arrives that way;
 * - the window closes at the **next kick-off**, after which the form is gone rather than merely
 *   disabled — an insert would be refused anyway (`lib/rating/actions.ts`). While it is open, the
 *   screen says when that is: `ratingDeadlineFr` (decision 079);
 * - this page **never shows anybody else's notes**, and under decision 137 it never will: a player
 *   reads one settled mean per match in the recap, and the individual notes are the coach's alone.
 *   `getRatingResults` is what gates that, and it is a different screen.
 *
 * What is deliberately *not* here any more: a count of how many notes the reader still owes, phrased
 * as the price of reading the team's. That trade was decision 021 and it is gone — the means come out
 * when everybody has rated, so his debt is to the team's calendar and not to his own access.
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
import { matchNameFr, pluralize } from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import { getMatch } from "@/lib/match/queries";
import { getNotationView } from "@/lib/rating/queries";
import { ratingDeadlineFr } from "@/lib/rating/window";
import { RatingSheet } from "./_components/rating-sheet";

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

  const { match, window, played, sheetRole, blocked, targets, progress } = view;
  const kickoff = new Date(match.kickoffAt);
  const now = new Date();

  // Invariant 4: the permission comes from `can()`, never from a role read on the spot. `played` is
  // the other half — `rating:submit` says « a member may rate », the log says « this one took part ».
  const mayRate = played && blocked === null && can(actor, "rating:submit", { teamId: team.id });
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
          <Badge variant="accent">{match.competitionLabel}</Badge>
          {window.state === "closed" ? <Badge variant="neutral">notation fermée</Badge> : null}
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          Noter mes coéquipiers
        </h1>
        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff))} à {formatTime(kickoff)} ·{" "}
          {matchNameFr(match.opponentName, match.isHome)}
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
      ) : blocked === "did-not-play" || blocked === "not-in-match" ? (
        /*
         * Two different people, two different sentences. A supporter or a substitute who stayed on
         * the bench **was** on the sheet (decision 039), and telling him he was not contradicts the
         * sheet he can read two taps away; `sheetRole` is what tells them apart. Neither is told
         * about the deadline: a man who did not play is not waiting for a window.
         */
        <EmptyState
          title={
            sheetRole === "supporter"
              ? "Tu étais supporter sur ce match"
              : sheetRole !== null
                ? "Tu n’es pas entré en jeu"
                : "Tu n’étais pas sur la feuille de match"
          }
          description={
            sheetRole === null
              ? "Seuls les joueurs qui ont joué notent leurs coéquipiers."
              : "On note les joueurs sur ce qu’ils ont fait sur le terrain, donc seuls ceux qui ont " +
                "joué donnent des notes — mais tu pourras lire les moyennes dans le résumé."
          }
          action={
            <ButtonLink href={`/match/${match.id}/recap`} variant="secondary">
              Voir le résumé du match
            </ButtonLink>
          }
        />
      ) : progress.complete && progress.requiredCount > 0 ? (
        <Card title="Tes notes sont envoyées" as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Tu as noté {pluralize(progress.requiredCount, "coéquipier")}. Les moyennes sortiront
              dans le résumé quand tout le monde aura noté.
            </p>
            <ButtonLink href={`/match/${match.id}/recap`}>Voir le résumé du match</ButtonLink>
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
        /* He played, and nobody else did — a match with one minute logged, or a log so thin that the
           reader is the only name in it. Not an error, and not a form. */
        <EmptyState
          title="Personne d’autre à noter"
          description="Le déroulé de ce match ne retient aucun autre joueur sur le terrain."
        />
      ) : !mayRate ? (
        /* `rating:submit` said no to somebody the log says played: a member put in read-only by his
           role rather than by this match. Rare, and still owed a reason. */
        <EmptyState
          title="Tu ne peux pas noter ce match"
          description="Ton compte n’a pas le droit de donner des notes dans cette équipe."
          action={
            <ButtonLink href={`/match/${match.id}/recap`} variant="secondary">
              Voir le résumé du match
            </ButtonLink>
          }
        />
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Une note de 0 à 10 par demi-points, pour chaque joueur qui était sur le terrain avec toi.
            L’équipe lira une moyenne par joueur, jamais ta note à toi — seul le coach voit les notes
            une par une.
          </p>
          {/* The deadline the app enforces, said out loud (decision 079). Null when no next match is
              on the calendar: the window has no end yet, so there is nothing to announce. */}
          {deadline ? <p className="text-sm font-medium text-ink">{deadline}</p> : null}
          <RatingSheet teamId={team.id} matchId={match.id} targets={targets} />
        </>
      )}
    </div>
  );
}
