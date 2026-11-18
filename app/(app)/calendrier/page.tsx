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
import { PageContainer } from "@/components/ui/page-container";
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

  /*
   * Desktop (decision 230): the page is `wide`, and its blocks sit side by side instead of in one
   * 720 px column. What is coming — the next match, then « À venir » — on the left; the history on the
   * right, in the wider column, because it is the longest list and its rows carry an opponent, a
   * venue and a score that a narrow column cut to « À Stade de la C… ». Placement is by explicit
   * `lg:` grid lines, so the phone's order and spacing are what they were. The history spans into a
   * trailing `1fr` row so its height lands there rather than stretching the two rows on the left.
   */
  return (
    <PageContainer
      width="wide"
      className="space-y-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start lg:gap-6 lg:space-y-0"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
        <h1 className="text-xl font-bold tracking-tight text-ink md:text-2xl md:leading-tight">Calendrier</h1>
        {team.isCoach ? (
          <ButtonLink href="/match/nouveau" size="sm">
            Nouveau match
          </ButtonLink>
        ) : null}
      </header>

      {next ? (
        <NextEventCard event={next} now={now} className="lg:col-start-1 lg:row-start-2" />
      ) : (
        <EmptyState
          className="lg:col-start-1 lg:row-start-2"
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
        <Card
          title="À venir"
          flush
          as="h2"
          className="lg:col-start-1 lg:row-start-3"
        >
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
          className="lg:col-start-2 lg:row-span-3 lg:row-start-2"
        >
          <ul className="divide-y divide-border/60">
            {past.map((event) => (
              <EventRow key={event.id} event={event} variant="past" />
            ))}
          </ul>
        </Card>
      ) : null}
    </PageContainer>
  );
}
