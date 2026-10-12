/**
 * « Supprimer le match » — the confirmation, and the only screen in the app that destroys a déroulé.
 *
 * Decision 191. The owner asked to be able to delete a game « and every data linked to it », and what
 * goes is not recoverable: the event log is the only record of the afternoon, the notes are a dozen
 * people's opinions collected once, and neither has a « rouvrir » the way a finished match does. So
 * this is a screen rather than a button on the match page:
 *
 * - **it names what goes, counted** (`matchDeletionWarningFr`): « 76 événements du déroulé, 342
 *   notes, la feuille de match et 2 compositions ». A category makes nobody stop; a quantity does;
 * - **it is a dead end for anybody but a coach.** `notFound()` rather than a refusal, like every other
 *   coach-only route (decision 026): a 403 would confirm which matches exist to somebody probing. The
 *   action re-checks with `can()` anyway — that is the guard, this is the courtesy;
 * - **it is a plain form**, so it works with no JavaScript, and the way out is a plain link. No
 *   dialog: a dialog is one more thing to get wrong, and on a phone it is a 44 px target next to
 *   another 44 px target.
 *
 * There is deliberately **no second gesture** — no « tape le nom de l'adversaire » box. The owner is
 * the only coach of this team and the screen he reached is already two taps and a full page of
 * consequences away from anything he can mistap; a confirmation nobody reads because it is a chore is
 * worse than one sentence he does read.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { matchDeletionWarningFr } from "@/lib/calendar/deletion";
import { matchNameFr } from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import { deleteMatch } from "@/lib/match/actions";
import { getMatch, getMatchDeletionHolds } from "@/lib/match/queries";

export const metadata = { title: "Supprimer le match" };

export default async function DeleteMatchPage({ params }: PageProps<"/match/[id]/supprimer">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);
  if (!can(actor, "match:delete", { teamId: team.id })) notFound();

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const holds = await getMatchDeletionHolds(match.id);
  const kickoff = new Date(match.kickoffAt);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={`/match/${match.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {match.opponentName}
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">Supprimer le match</h1>
        {/* Which match, spelled out: the heading above says « le match » and a coach who has walked
            here from the calendar deserves to see the one he is about to lose named. */}
        <p className="text-sm text-ink-muted">
          {capitalizeFirst(matchNameFr(match.opponentName, match.isHome))} ·{" "}
          {formatDay(kickoff)} à {formatTime(kickoff)}
        </p>
      </header>

      <Card title="Ce qui disparaît" description={matchDeletionWarningFr(holds)}>
        <div className="space-y-3">
          {/* Said once more, in the second person, because the sentence above is about the data and
              this is about him: nothing in the app brings any of it back. */}
          <p className="text-sm text-ink-muted">
            Il n’y a pas de retour en arrière : ni le déroulé, ni les notes ne peuvent être
            retrouvés.
          </p>
          <form action={deleteMatch}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="matchId" value={match.id} />
            <Button type="submit" variant="danger" fullWidth>
              Supprimer définitivement
            </Button>
          </form>
          <ButtonLink href={`/match/${match.id}`} variant="ghost" fullWidth>
            Annuler
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
