/**
 * « Modifier le match » — coach only.
 *
 * `params` is a Promise in Next 16 and `PageProps<"/match/[id]/modifier">` comes from
 * `next typegen` (`docs/NEXTJS16.md`).
 *
 * The « supprimer » button only appears while the event log is empty. A match that has been played
 * is never deleted: `match_events` is append-only and holds the only record of what happened
 * (decision 003). `deleteMatch` refuses regardless — this just avoids offering a dead button.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { matchDeletionWarningFr } from "@/lib/calendar/deletion";
import { toLocalInput } from "@/lib/calendar/time";
import { competitionOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { deleteMatch } from "@/lib/match/actions";
import { getMatch, getMatchDeletionHolds, hasMatchEvents } from "@/lib/match/queries";
import { MatchForm } from "../../_components/match-form";

export const metadata = { title: "Modifier le match" };

export default async function EditMatchPage({ params }: PageProps<"/match/[id]/modifier">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);
  if (!can(actor, "match:update", { teamId: team.id })) notFound();

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const [logged, holds, allCompetitions] = await Promise.all([
    hasMatchEvents(match.id),
    getMatchDeletionHolds(match.id),
    getTeamCompetitions(team.id),
  ]);

  // The competition this match is already filed under stays offered even once archived: saving the
  // form would otherwise silently re-file last autumn's cup match under the championship.
  const competitions = competitionOptions(allCompetitions, match.competitionId);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={`/match/${match.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {match.opponentName}
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">Modifier le match</h1>
      </header>

      <Card>
        <MatchForm
          teamId={team.id}
          matchId={match.id}
          competitions={competitions}
          defaults={{
            opponentName: match.opponentName,
            kickoffAt: toLocalInput(new Date(match.kickoffAt)),
            isHome: match.isHome,
            venue: match.venue ?? "",
            competitionId: match.competitionId,
            periodsCount: match.periodsCount,
            periodMinutes: match.periodMinutes,
          }}
        />
      </Card>

      {!logged && can(actor, "match:delete", { teamId: team.id }) ? (
        <Card title="Supprimer" description={matchDeletionWarningFr(holds)}>
          {/* A plain form: no confirmation dialog to get wrong, and it works without JavaScript.
              Which is exactly why the description above counts the sheet and the compositions the
              cascade takes too, instead of naming only the availability answers (decision 098). */}
          <form action={deleteMatch}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="matchId" value={match.id} />
            <Button type="submit" variant="danger" fullWidth>
              Supprimer ce match
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
