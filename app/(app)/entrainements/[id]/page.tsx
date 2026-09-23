/**
 * One training session: when, where, what is on the programme, who said they would come, and — for
 * the coach — who actually did.
 *
 * `params` is a Promise in Next 16 and `PageProps<"/entrainements/[id]">` comes from `next typegen`
 * (`docs/NEXTJS16.md`). A training id from another team is a 404: `getTraining` scopes its query by
 * team.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import {
  attendanceCountFr,
  attendanceNotOpenFr,
  departedMarksNoteFr,
  unmarkedSessionNoteFr,
} from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime, formatWhen } from "@/lib/calendar/time";
import {
  ATTENDANCE_OPENS_MINUTES_BEFORE,
  attendanceIsOpen,
  buildReminderMessage,
  tallyAvailability,
  trainingWindowMinutes,
  type Responder,
} from "@/lib/calendar/timeline";
import { getSquad } from "@/lib/team/queries";
import { getTraining, getTrainingAnswers, getTrainingAttendance } from "@/lib/training/queries";
import { AvailabilityControl } from "../../calendrier/_components/availability-control";
import { AvailabilityGrid } from "../../calendrier/_components/availability-grid";
import { ReminderCard } from "../../calendrier/_components/reminder-card";
import { AttendanceList, type AttendancePlayer } from "../_components/attendance-list";

export async function generateMetadata({ params }: PageProps<"/entrainements/[id]">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const training = await getTraining(team.id, id);
  if (!training) return { title: "Entraînement introuvable" };
  return { title: `Entraînement · ${formatDay(new Date(training.startsAt))}` };
}

export default async function TrainingPage({ params }: PageProps<"/entrainements/[id]">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);

  const training = await getTraining(team.id, id);
  if (!training) notFound();

  const [answers, attendance, squad] = await Promise.all([
    getTrainingAnswers(training.id),
    getTrainingAttendance(training.id),
    getSquad(team.id),
  ]);

  const startsAt = new Date(training.startsAt);
  const now = new Date();
  const over = startsAt.getTime() + trainingWindowMinutes() * 60_000 <= now.getTime();
  const canMark = attendanceIsOpen(startsAt, now);

  const activePlayers = squad.filter((member) => member.isPlayer);
  const responders: Responder[] = activePlayers.map((member) => ({
    membershipId: member.membershipId,
    displayName: member.displayName,
  }));
  const tally = tallyAvailability(responders, answers);

  const isCoach = can(actor, "training:markAttendance", { teamId: team.id });
  const myAnswer =
    answers.find((answer) => answer.teamMemberId === team.membershipId)?.status ?? null;

  const declared = new Map(answers.map((answer) => [answer.teamMemberId, answer.status]));
  const marks = new Map(attendance.map((row) => [row.teamMemberId, row.present]));
  const players: AttendancePlayer[] = activePlayers.map((member) => ({
    membershipId: member.membershipId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
    declared: declared.get(member.membershipId) ?? null,
  }));

  const reminder = buildReminderMessage({
    title: "Entraînement",
    when: formatWhen(startsAt, now),
    pending: tally.pending,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/entrainements"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Entraînements
        </Link>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          {capitalizeFirst(formatDay(startsAt))}
        </h1>

        <p className="text-sm text-ink-muted">
          {formatTime(startsAt)}
          {training.venue ? ` · ${training.venue}` : ""}
        </p>

        {training.note ? <p className="text-sm text-ink">{training.note}</p> : null}

        {isCoach ? (
          <div className="pt-1">
            <ButtonLink
              href={`/entrainements/${training.id}/modifier`}
              variant="secondary"
              size="sm"
            >
              Modifier
            </ButtonLink>
          </div>
        ) : null}
      </header>

      {team.isPlayer && !over ? (
        <Card title="Ta réponse" description="Un seul appui. Tu peux changer d’avis.">
          <AvailabilityControl
            kind="training"
            teamId={team.id}
            eventId={training.id}
            value={myAnswer}
            legend="Ta disponibilité pour cet entraînement"
          />
        </Card>
      ) : null}

      {/* Before the session, the question is who is coming: the list of answers leads. Once it is
          over, what happened is the answer and the list of intentions is history, so it goes last —
          the same ordering the match page settled on (decision 068). */}
      {over ? null : <AvailabilityGrid tally={tally} selfMembershipId={team.membershipId} />}

      {isCoach && !over ? <ReminderCard message={reminder} pending={tally.pending.length} /> : null}

      {/* A coach only gets the marking list once the séance is close enough for the people in it to
          be in front of him. `PresenceSummary` had reasoned about this from the start — « before the
          session there is genuinely nothing to report » — and the coach's half of the same `if` never
          did, which is how « Tout le monde est là » ended up one tap away on a séance four days out
          (decision 099). */}
      {isCoach ? (
        canMark ? (
          <AttendanceList
            teamId={team.id}
            trainingId={training.id}
            players={players}
            marks={marks}
          />
        ) : (
          <Card title="Présences">
            <p className="text-sm text-ink-muted">
              {attendanceNotOpenFr(ATTENDANCE_OPENS_MINUTES_BEFORE)}
            </p>
          </Card>
        )
      ) : (
        <PresenceSummary marks={marks} squadSize={players.length} over={over} />
      )}

      {over ? (
        <AvailabilityGrid tally={tally} selfMembershipId={team.membershipId} past="training" />
      ) : null}
    </div>
  );
}

/**
 * What a player sees instead of the marking list: the count, once the coach has pointed — and, on a
 * session that is over and was never pointed, the fact that it was not.
 *
 * That last case used to render `null`, and nothing else on the page had anything to say about a past
 * session either: the availability grid is hidden when nobody answered (decision 069), so a player
 * opening the demo season's 19 September session got a date, a venue, and eleven hundred pixels of
 * blank. The audit passed it — an `h1`, no console error, nothing outside the viewport — which is
 * exactly the family of defect that script says it cannot catch (decision 076).
 *
 * The same sentence as the coach's card, from the same map, deliberately. It used to count the
 * présents out of the **squad** — « 11 présents sur 13 joueurs », where the calendar row for that
 * same 29 August session says « 11 présents sur 14 pointés » — and the squad is the wrong
 * denominator twice over: an unmarked player is not an absent one (decision 020), and the numerator
 * was read off every attendance row while the denominator was today's squad, so a player marked
 * présent who has since left the club counted towards a total he was no longer part of.
 */
function PresenceSummary({
  marks,
  squadSize,
  over,
}: {
  marks: ReadonlyMap<string, boolean>;
  squadSize: number;
  over: boolean;
}) {
  if (marks.size === 0) {
    // Before the session there is genuinely nothing to report; the coach has not failed to do
    // anything yet.
    if (!over) return null;
    return (
      <Card title="Présences">
        <p className="text-sm text-ink-muted">{unmarkedSessionNoteFr}</p>
      </Card>
    );
  }

  const present = [...marks.values()].filter(Boolean).length;
  // A player knows how many they are, so « sur 14 pointés » in a squad of thirteen needs the same
  // explanation the coach's card gives. There is no list here to compare against, so the count is
  // the arithmetic floor — it can only under-report, never claim a departure that did not happen.
  const departed = departedMarksNoteFr(marks.size - squadSize);

  return (
    <Card title="Présences">
      <p className="text-sm text-ink-muted">
        {attendanceCountFr(present, marks.size)}.{departed ? ` ${departed}` : ""}
      </p>
    </Card>
  );
}
