/**
 * « Modifier le match » — coach only.
 *
 * `params` is a Promise in Next 16 and `PageProps<"/match/[id]/modifier">` comes from
 * `next typegen` (`docs/NEXTJS16.md`).
 *
 * **Deleting is no longer here** (decision 191). It used to be a « Supprimer » card at the bottom of
 * this form, offered only while the event log was empty — because a played match could not be deleted
 * at all. Now one can, and what that destroys is big enough to deserve a screen of its own:
 * `/match/[id]/supprimer`, reached from the match page. Two entry points to one irreversible act is
 * one too many, and the one that survives is the one on the page that shows what would be lost.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { toLocalInput } from "@/lib/calendar/time";
import { competitionOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { getMatch } from "@/lib/match/queries";
import { MatchForm } from "../../_components/match-form";

export const metadata = { title: "Modifier le match" };

export default async function EditMatchPage({ params }: PageProps<"/match/[id]/modifier">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);
  if (!can(actor, "match:update", { teamId: team.id })) notFound();

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const allCompetitions = await getTeamCompetitions(team.id);

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
    </div>
  );
}
