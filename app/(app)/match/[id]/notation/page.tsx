/**
 * « Notation » — note the men who played (screen 7 of `docs/PLAN.md`).
 *
 * Who may be here, and what they see, is decided on the server:
 *
 * - **every member may note, played or not** (decision 139, superseding 137 and 007 on this). A
 *   supporter on the touchline watched the same hour, and a member who was not on the sheet at all may
 *   note too. The old screen turned both away with « seuls les joueurs qui ont joué donnent des notes »,
 *   and that EmptyState is gone;
 * - **only the men who played are noted** — `minutes > 0` in the log, not a role on the sheet (decision
 *   137, which survives). Nobody notes himself, so a reader who played gets the list minus his own name
 *   and everybody else gets all of it. `getNotationView` arrives that way;
 * - **nothing ever closes this.** Decision 139 deleted the rating window: a played match is rateable
 *   for ever, including after the coach has shown the means — in which case the screen says so, because
 *   the reader is about to move a figure his teammates have already read. That is the cost the owner
 *   accepted, and stating it is decision 079's rule (a limit the app enforces must be said out loud)
 *   applied to a limit that has stopped existing;
 * - this page **never shows anybody else's notes**, and under decision 137 it never will: a player
 *   reads one settled mean per match in the recap, and the individual notes are the coach's alone.
 *   `getRatingResults` is what gates that, and it is a different screen.
 *
 * What is deliberately *not* here any more: a count of how many notes the reader still owes, phrased
 * as the price of reading the team's. That trade was decision 021 and it is gone.
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
import { ratingInvitationFr } from "@/lib/rating/labels";
import { getNotationView } from "@/lib/rating/queries";
import { RatingSheet } from "./_components/rating-sheet";

/**
 * Why a reader who did not play is being asked for notes anyway, in his own case.
 *
 * Three people, three sentences, because the old screen's three EmptyStates told them apart and losing
 * that would read as a bug: a supporter was on the sheet *as* a supporter (decision 039), a named
 * substitute who never came on was on it too, and somebody not on it at all is a third thing. Telling
 * any of them the wrong one contradicts a sheet he can read two taps away.
 *
 * `null` for a man who played — he needs no explanation for being asked.
 */
function whyAskedFr(played: boolean, sheetRole: string | null): string | null {
  if (played) return null;
  if (sheetRole === "supporter") {
    return "Tu étais supporter sur ce match, et ton avis compte autant que celui des autres.";
  }
  if (sheetRole !== null) {
    return "Tu n’es pas entré en jeu, et tu notes quand même ceux qui ont joué.";
  }
  return "Tu n’étais pas sur la feuille de match, et tu peux noter quand même.";
}

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

  const { match, finished, meansVisible, played, sheetRole, targets, progress } = view;
  const kickoff = new Date(match.kickoffAt);

  // Invariant 4: the permission comes from `can()`, never from a role read on the spot. It used to be
  // `played && …`, and dropping that half is the whole of decision 139 on this screen: `rating:submit`
  // is every member's, and whether *this* member took part no longer bears on it.
  const mayRate = finished && can(actor, "rating:submit", { teamId: team.id });
  const whyAsked = whyAskedFr(played, sheetRole);

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
          {/* Not « fermée » — nothing is (decision 139). What the badge says is that the figures are
              already on the recap, which is what changes the meaning of sending notes now. */}
          {meansVisible ? <Badge variant="neutral">moyennes sorties</Badge> : null}
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          Noter mes coéquipiers
        </h1>
        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff))} à {formatTime(kickoff)} ·{" "}
          {matchNameFr(match.opponentName, match.isHome)}
        </p>
      </header>

      {!finished ? (
        /* The one state in which anybody is turned away, and it is about the match rather than about
           him: there is nothing to judge yet. */
        <EmptyState
          title="La notation ouvrira à la fin du match"
          description="Les notes s’ouvrent au coup de sifflet final, quand il y a quelque chose à juger."
          action={
            <ButtonLink href={`/match/${match.id}`} variant="secondary">
              Retour au match
            </ButtonLink>
          }
        />
      ) : targets.length === 0 ? (
        /* Nobody played: a match whose log is empty (decision 013), or one with a single minute on it
           belonging to the reader. Not an error, and not a form. Under decision 139 this is the *only*
           thing an empty list can mean — it used to double as « tu n'as pas joué ». */
        <EmptyState
          title="Personne à noter sur ce match"
          description="Le déroulé de ce match ne retient aucun joueur sur le terrain."
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
              Tu as noté {pluralize(progress.requiredCount, "joueur")}.{" "}
              {meansVisible
                ? "Les moyennes de ce match sont sorties, elles sont dans le résumé."
                : "C’est le coach qui décide quand les moyennes sortent."}
            </p>
            <ButtonLink href={`/match/${match.id}/recap`}>Voir le résumé du match</ButtonLink>
          </div>
        </Card>
      ) : !mayRate ? (
        /* `rating:submit` said no to a member of this team: somebody put in read-only by his account
           rather than by this match. Rare, and still owed a reason. */
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
            Une note de 0 à 10 par demi-points, pour chaque joueur qui était sur le terrain. L’équipe
            lira une moyenne par joueur, jamais ta note à toi — seul le coach voit les notes une par
            une.
          </p>
          {/* Why he is being asked although he did not play, when that is the case. Everybody notes
              now (decision 139), and a supporter who was told the opposite last week is owed the
              reason rather than left to guess that something broke. */}
          {whyAsked ? <p className="text-sm text-ink-muted">{whyAsked}</p> : null}
          {/* Nothing closes the notation, so there is no deadline to state — what is stated instead is
              who decides, and, when the figures are already out, that his notes will still move one the
              squad has read (decision 079's rule applied to the absence of a limit). */}
          <p className="text-sm font-medium text-ink">{ratingInvitationFr(meansVisible)}</p>
          <RatingSheet teamId={team.id} matchId={match.id} targets={targets} />
        </>
      )}
    </div>
  );
}
