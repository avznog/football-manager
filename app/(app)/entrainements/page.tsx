/**
 * Entraînements: the same chronological list as `/calendrier`, filtered to trainings, plus the
 * one thing that only belongs here — the coach's présent/absent list for the session of the day.
 *
 * Declared availability and actual attendance are separate on purpose (`docs/DATA_MODEL.md`). This
 * page shows both, side by side: what the squad said, and who actually turned up.
 */

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { getCalendar } from "@/lib/calendar/queries";
import { daysFromNow } from "@/lib/calendar/time";
import { splitTimeline, type CalendarTraining } from "@/lib/calendar/timeline";
import { getSquad } from "@/lib/team/queries";
import { getTrainingAnswers, getTrainingAttendance } from "@/lib/training/queries";
import { EventRow } from "../calendrier/_components/event-row";
import { NextEventCard } from "../calendrier/_components/next-event-card";
import { AttendanceList, type AttendancePlayer } from "./_components/attendance-list";

export const metadata = { title: "Entraînements" };

export default async function TrainingsPage() {
  const { actor, team } = await requireTeamContext();
  const { events } = await getCalendar(team.id, team.membershipId);

  const now = new Date();
  const trainings = events.filter(
    (event): event is CalendarTraining => event.kind === "training",
  );
  const { next, upcoming, past } = splitTimeline(trainings, now);

  const isCoach = can(actor, "training:markAttendance", { teamId: team.id });
  // The list is offered for the session of the day — before it, during it, and in the hour after.
  const marking = isCoach && next !== null && daysFromNow(new Date(next.startsAt), now) === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">Entraînements</h1>
        <div className="flex items-center gap-2">
          <ButtonLink href="/calendrier" variant="secondary" size="sm">
            Calendrier
          </ButtonLink>
          {isCoach ? (
            <ButtonLink href="/entrainements/nouveau" size="sm">
              Nouvel entraînement
            </ButtonLink>
          ) : null}
        </div>
      </header>

      {next ? (
        <NextEventCard event={next} teamId={team.id} canDeclare={team.isPlayer} now={now} />
      ) : (
        <EmptyState
          title="Aucun entraînement prévu"
          description={
            isCoach
              ? "Programme une séance pour que l’effectif puisse se positionner."
              : "Le coach n’a pas encore programmé de séance."
          }
          action={
            isCoach ? (
              <ButtonLink href="/entrainements/nouveau">Nouvel entraînement</ButtonLink>
            ) : undefined
          }
        />
      )}

      {marking && next ? <TodayAttendance teamId={team.id} training={next} /> : null}

      {upcoming.length > 0 ? (
        <Card title="À venir" flush as="h2">
          <ul className="divide-y divide-border/60">
            {upcoming.map((training) => (
              <EventRow key={training.id} event={training} variant="upcoming" />
            ))}
          </ul>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card title="Séances passées" description="Le plus récent en premier." flush as="h2">
          <ul className="divide-y divide-border/60">
            {past.map((training) => (
              <EventRow key={training.id} event={training} variant="past" />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * The présent/absent list for today's session, inlined so the coach does not have to navigate to
 * find it. Fetched separately because it is the only place on this page that needs names.
 */
async function TodayAttendance({
  teamId,
  training,
}: {
  teamId: string;
  training: CalendarTraining;
}) {
  const [squad, answers, attendance] = await Promise.all([
    getSquad(teamId),
    getTrainingAnswers(training.id),
    getTrainingAttendance(training.id),
  ]);

  const declared = new Map(answers.map((answer) => [answer.teamMemberId, answer.status]));
  const marks = new Map(attendance.map((row) => [row.teamMemberId, row.present]));

  const players: AttendancePlayer[] = squad
    .filter((member) => member.isPlayer)
    .map((member) => ({
      membershipId: member.membershipId,
      displayName: member.displayName,
      jerseyNumber: member.jerseyNumber,
      declared: declared.get(member.membershipId) ?? null,
    }));

  return (
    <AttendanceList
      teamId={teamId}
      trainingId={training.id}
      players={players}
      marks={marks}
    />
  );
}
