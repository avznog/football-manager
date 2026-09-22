/**
 * « Modifier l’entraînement » — coach only.
 *
 * The « supprimer » button only appears for a session that has not happened yet. Deleting a past
 * one would throw away the attendance record the statistics are built on, and `deleteTraining`
 * refuses regardless.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { capitalizeFirst, formatDay, toLocalInput } from "@/lib/calendar/time";
import { trainingWindowMinutes } from "@/lib/calendar/timeline";
import { deleteTraining } from "@/lib/training/actions";
import { getTraining } from "@/lib/training/queries";
import { TrainingForm } from "../../_components/training-form";

export const metadata = { title: "Modifier l’entraînement" };

export default async function EditTrainingPage({
  params,
}: PageProps<"/entrainements/[id]/modifier">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);
  if (!can(actor, "training:update", { teamId: team.id })) notFound();

  const training = await getTraining(team.id, id);
  if (!training) notFound();

  const now = new Date();
  const startsAt = new Date(training.startsAt);
  const over = startsAt.getTime() + trainingWindowMinutes() * 60_000 <= now.getTime();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={`/entrainements/${training.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {capitalizeFirst(formatDay(startsAt))}
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-ink">Modifier l’entraînement</h1>
      </header>

      <Card>
        <TrainingForm
          teamId={team.id}
          trainingId={training.id}
          defaults={{
            startsAt: toLocalInput(startsAt),
            venue: training.venue ?? "",
            note: training.note ?? "",
          }}
        />
      </Card>

      {!over && can(actor, "training:delete", { teamId: team.id }) ? (
        <Card
          title="Supprimer"
          description="La séance disparaît du calendrier, avec les réponses déjà données."
        >
          <form action={deleteTraining}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="trainingId" value={training.id} />
            <Button type="submit" variant="danger" fullWidth>
              Supprimer cette séance
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
