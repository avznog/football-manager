/**
 * « Nouvel entraînement » — coach only, gated by `can()` (`CLAUDE.md`, invariant 4).
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { TrainingForm } from "../_components/training-form";

export const metadata = { title: "Nouvel entraînement" };

export default async function NewTrainingPage() {
  const { actor, team } = await requireTeamContext();
  if (!can(actor, "training:create", { teamId: team.id })) notFound();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href="/entrainements"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Entraînements
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">Nouvel entraînement</h1>
      </header>

      <Card>
        <TrainingForm teamId={team.id} defaults={{ startsAt: "", venue: "", note: "" }} />
      </Card>
    </div>
  );
}
