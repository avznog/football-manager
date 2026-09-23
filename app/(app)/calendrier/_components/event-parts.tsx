/**
 * The small pieces every calendar surface shares: badges, score pills, answer summaries.
 *
 * Server Components — pure presentation, no interaction. Keeping them here rather than inlining
 * them in three pages is what makes a match row on `/calendrier` and the header of `/match/[id]`
 * read the same way.
 */

import { Badge } from "@/components/ui/badge";
import type { AvailabilityStatus, MatchStatus } from "@/db/schema";
import {
  attendanceLineFr,
  AVAILABILITY_LABELS,
  COMPETITION_LABELS,
  pluralize,
  resultLabel,
  resultLetter,
  SCORE_NOT_RECORDED_FR,
  scoreLineFr,
  venueSideLabel,
} from "@/lib/calendar/labels";
import type { AvailabilityCounts, CalendarMatch, CalendarTraining } from "@/lib/calendar/timeline";
import { pendingCount } from "@/lib/calendar/timeline";

/** « Match » or « Entraînement » — the one thing to read first on a mixed list. */
export function KindBadge({ kind }: { kind: "match" | "training" }) {
  return (
    <Badge variant={kind === "match" ? "accent" : "neutral"}>
      {kind === "match" ? "Match" : "Entraînement"}
    </Badge>
  );
}

const AVAILABILITY_VARIANT = {
  yes: "success",
  no: "danger",
  maybe: "warning",
} as const;

/** The viewer's own answer. Deliberately loud when it is missing: that is the call to action. */
export function AvailabilityBadge({ status }: { status: AvailabilityStatus | null }) {
  if (status === null) {
    return <Badge variant="neutral">Sans réponse</Badge>;
  }
  return (
    <Badge variant={AVAILABILITY_VARIANT[status]} solid>
      {AVAILABILITY_LABELS[status]}
    </Badge>
  );
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  if (status === "live") {
    return (
      <Badge variant="danger" solid>
        En cours
      </Badge>
    );
  }
  return null;
}

/** « 9 dispo · 2 absents · 1 peut-être · 1 sans réponse », dropping whatever is zero. */
export function AnswersLine({
  answers,
  squadSize,
  className,
}: {
  answers: AvailabilityCounts;
  squadSize: number;
  className?: string;
}) {
  const pending = pendingCount(squadSize, answers);
  const parts = [
    answers.yes > 0 ? `${answers.yes} dispo` : null,
    answers.no > 0 ? pluralize(answers.no, "absent") : null,
    answers.maybe > 0 ? `${answers.maybe} peut-être` : null,
    pending > 0 ? `${pending} sans réponse` : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return <p className={className}>Personne n’a encore répondu.</p>;
  }

  return <p className={className}>{parts.join(" · ")}</p>;
}

/**
 * The derived score, from the team's point of view: our goals first, whether the match was at
 * home or away. Never « 1-3 » read the wrong way round — `scoreLineFr` is now that rule, and the app
 * follows it on every screen rather than only on this one.
 */
export function ScorePill({ match }: { match: CalendarMatch }) {
  if (match.score === null) return null;

  const { goalsFor, goalsAgainst } = match.score;
  const letter = resultLetter(goalsFor, goalsAgainst);
  const variant = letter === "V" ? "success" : letter === "D" ? "danger" : "neutral";

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="font-mono text-base font-bold text-ink tabular-nums">
        <span className="sr-only">{resultLabel(goalsFor, goalsAgainst)}, </span>
        {scoreLineFr(goalsFor, goalsAgainst)}
      </span>
      <Badge variant={variant} solid aria-hidden>
        {letter}
      </Badge>
    </span>
  );
}

/**
 * The right-hand end of a past match row: the score, or the fact that there is not one.
 *
 * `ScorePill` says nothing when nobody has recorded the match, which is correct where it is pinned
 * at the top of the screen — a match starting in an hour has no score and needs no excuse. In the
 * history it left the one row asking to be filled in as the only silent row of the list.
 */
export function PastMatchResult({ match }: { match: CalendarMatch }) {
  if (match.score === null) {
    return (
      <Badge variant="neutral" className="shrink-0">
        {SCORE_NOT_RECORDED_FR}
      </Badge>
    );
  }

  return <ScorePill match={match} />;
}

/** « Championnat · à domicile · Stade des Tilleuls ». */
export function matchSubtitle(match: CalendarMatch): string {
  return [
    COMPETITION_LABELS[match.competition],
    venueSideLabel(match.isHome),
    match.venue,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** The name of the fixture, as the coach says it: « Étoile du Parc ». */
export function matchTitle(match: CalendarMatch): string {
  return match.opponentName;
}

/** « Gymnase Jean-Moulin » or the session's note, whichever there is. */
export function trainingSubtitle(training: CalendarTraining): string {
  return [training.venue, training.note].filter((part): part is string => Boolean(part)).join(" · ");
}

/**
 * « 10 présents sur 13 pointés » once the coach has ticked the list, « Présences pas encore
 * pointées » on a session that is over and never was — `attendanceLineFr` decides which, and
 * nothing at all before the session happens.
 */
export function attendanceSummary(
  training: CalendarTraining,
  variant: "upcoming" | "past",
): string | null {
  return attendanceLineFr(training.attendance.present, training.attendance.marked, {
    isPast: variant === "past",
  });
}
