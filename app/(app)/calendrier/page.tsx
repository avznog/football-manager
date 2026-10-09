/**
 * The calendar: one chronological list of the season's matches.
 *
 * The owner's notes asked for a single « agenda », with the next event at the top
 * (`instructions.md`, `docs/PROJECT.md`). Trainings used to share the list and the pinned card used
 * to carry an availability control, until decisions 155 and 156 removed them. So: one pinned card,
 * then what is still to come, then history newest first.
 *
 * Every instant is rendered through `lib/calendar/time.ts`, which pins Europe/Paris — a 20:30
 * kick-off must read as Sunday 20:30 whether the render happens on a Vercel function in UTC or
 * on a phone in Paris.
 *
 * Reads only, and the same for every reader.
 */

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireTeamContext } from "@/lib/auth/dal";
import { getCalendar } from "@/lib/calendar/queries";
import { pastSectionTitleFr, splitTimeline } from "@/lib/calendar/timeline";
import { EventRow } from "./_components/event-row";
import { NextEventCard } from "./_components/next-event-card";

export const metadata = { title: "Calendrier" };

export default async function CalendarPage() {
  const { team } = await requireTeamContext();
  const { events } = await getCalendar(team.id);

  // One `now` for the whole render, so the pinned card and the sections cannot disagree.
  const now = new Date();
  const { next, upcoming, past } = splitTimeline(events, now);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">Calendrier</h1>
        {team.isCoach ? (
          <ButtonLink href="/match/nouveau" size="sm">
            Nouveau match
          </ButtonLink>
        ) : null}
      </header>

      {next ? (
        <NextEventCard event={next} now={now} />
      ) : (
        <EmptyState
          title="Rien de prévu"
          description={
            team.isCoach
              ? "Ajoute un match pour lancer la saison."
              : "Le coach n’a pas encore programmé la suite."
          }
          action={
            team.isCoach ? <ButtonLink href="/match/nouveau">Nouveau match</ButtonLink> : undefined
          }
        />
      )}

      {upcoming.length > 0 ? (
        <Card title="À venir" flush as="h2">
          <ul className="divide-y divide-border/60">
            {upcoming.map((event) => (
              <EventRow key={event.id} event={event} variant="upcoming" />
            ))}
          </ul>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card
          title={pastSectionTitleFr(past)}
          description="Le plus récent en premier."
          flush
          as="h2"
        >
          <ul className="divide-y divide-border/60">
            {past.map((event) => (
              <EventRow key={event.id} event={event} variant="past" />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
