/**
 * The calendar: one chronological list of matches **and** trainings.
 *
 * The owner's notes ask for a single « agenda » rather than two tabs, with the next event at the
 * top and a big availability control on it (`instructions.md`, `docs/PROJECT.md`). So: one pinned
 * card, then what is still to come, then history newest first.
 *
 * Every instant is rendered through `lib/calendar/time.ts`, which pins Europe/Paris — a 20:30
 * kick-off must read as Sunday 20:30 whether the render happens on a Vercel function in UTC or
 * on a phone in Paris.
 *
 * Reads only. Availability is declared through `setMatchAvailability` / `setTrainingAvailability`,
 * both of which re-check `can()` (`CLAUDE.md`, invariant 4).
 */

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireTeamContext } from "@/lib/auth/dal";
import { getCalendar } from "@/lib/calendar/queries";
import { splitTimeline } from "@/lib/calendar/timeline";
import { EventRow } from "./_components/event-row";
import { NextEventCard } from "./_components/next-event-card";

export const metadata = { title: "Calendrier" };

export default async function CalendarPage() {
  const { team } = await requireTeamContext();
  const { events } = await getCalendar(team.id, team.membershipId);

  // One `now` for the whole render, so the pinned card and the sections cannot disagree.
  const now = new Date();
  const { next, upcoming, past } = splitTimeline(events, now);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">Calendrier</h1>
        <div className="flex items-center gap-2">
          <ButtonLink href="/entrainements" variant="secondary" size="sm">
            Entraînements
          </ButtonLink>
          {team.isCoach ? (
            <ButtonLink href="/match/nouveau" size="sm">
              Nouveau match
            </ButtonLink>
          ) : null}
        </div>
      </header>

      {next ? (
        <NextEventCard event={next} teamId={team.id} canDeclare={team.isPlayer} now={now} />
      ) : (
        <EmptyState
          title="Rien de prévu"
          description={
            team.isCoach
              ? "Ajoute un match ou un entraînement pour lancer la saison."
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
              <EventRow key={`${event.kind}-${event.id}`} event={event} variant="upcoming" />
            ))}
          </ul>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card
          title="Déjà joué"
          description="Le plus récent en premier."
          flush
          as="h2"
        >
          <ul className="divide-y divide-border/60">
            {past.map((event) => (
              <EventRow key={`${event.kind}-${event.id}`} event={event} variant="past" />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
