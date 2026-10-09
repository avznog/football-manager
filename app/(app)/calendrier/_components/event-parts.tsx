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
  AVAILABILITY_LABELS,
  matchNameFr,
  NOT_RECORDED_FR,
  resultLabel,
  resultLetter,
  scoreLineFr,
  venuePhraseFr,
} from "@/lib/calendar/labels";
import { capitalizeFirst } from "@/lib/calendar/time";
import type { AvailabilityCounts, CalendarMatch } from "@/lib/calendar/timeline";
import { answersLineFr } from "@/lib/calendar/timeline";

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

/**
 * « 9 dispo · 2 pas dispo · 1 peut-être · 1 sans réponse », dropping whatever is zero.
 *
 * The wording is `answersLineFr`, in `lib/calendar/timeline.ts`, because it was wrong here and
 * untestable here: nothing under `app/` is collected by Vitest (decision NNN).
 */
export function AnswersLine({
  answers,
  squadSize,
  className,
}: {
  answers: AvailabilityCounts;
  squadSize: number;
  className?: string;
}) {
  return <p className={className}>{answersLineFr(answers, squadSize)}</p>;
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
        {capitalizeFirst(NOT_RECORDED_FR)}
      </Badge>
    );
  }

  return <ScorePill match={match} />;
}

/** « Championnat · à domicile, Stade des Tilleuls » — `venuePhraseFr` keeps the two together. */
export function matchSubtitle(match: CalendarMatch): string {
  // The label is the team's own row in `competitions` now (decision 107), not an enum value.
  return [match.competitionLabel, venuePhraseFr(match.isHome, match.venue)].join(" · ");
}

/**
 * The name of the fixture, as the coach says it: « Contre Étoile du Parc », « À Étoile du Parc ».
 *
 * The row's own line, not the subtitle under it. A list of a season's matches printed the bare
 * opponent's name, so every row read the same whether the team travelled or received — and the
 * subtitle that did say so is 12 px and truncates. The preposition is on the line nothing truncates,
 * and capitalised because it is a heading: the first letter is the difference, so it is the letter
 * the eye lands on down a column of rows.
 */
export function matchTitle(match: CalendarMatch): string {
  return capitalizeFirst(matchNameFr(match.opponentName, match.isHome));
}
