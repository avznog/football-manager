/**
 * « Nouveau match » — coach only.
 *
 * The gate is `can()`, not a role string read inline (`CLAUDE.md`, invariant 4). A player who
 * guesses the URL gets a 404 rather than a form that would be refused on submit: the action
 * checks again anyway, but showing it would be a lie.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { MatchForm } from "../_components/match-form";

export const metadata = { title: "Nouveau match" };

export default async function NewMatchPage() {
  const { actor, team } = await requireTeamContext();
  if (!can(actor, "match:create", { teamId: team.id })) notFound();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href="/calendrier"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Calendrier
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">Nouveau match</h1>
      </header>

      <Card>
        <MatchForm
          teamId={team.id}
          defaults={{
            opponentName: "",
            kickoffAt: "",
            isHome: true,
            venue: "",
            competition: "league",
            // 2×30, the format of the team (decision 009).
            periodsCount: 2,
            periodMinutes: 30,
          }}
        />
      </Card>
    </div>
  );
}
