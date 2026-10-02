"use client";

/**
 * The notation screen: every teammate who played, a slider each, one button.
 *
 * It replaces a card-at-a-time flow with an eleven-button pad per card, and the reason is decision
 * 137 rather than taste. Under the old rule a note was worth something to the reader — a complete set
 * unlocked the match's notes for him — so the flow could afford to ask for one at a time, count what
 * was still owed, and nag. Nothing is unlocked by submitting any more: the means come out when
 * *everybody* has rated. So the only thing the screen owes the reader is to be over quickly.
 *
 * - **One list, one POST, no pagination.** Twelve sliders cost one request. There is no « Suivant »,
 *   no progress bar, no index to clamp — and `lib/rating/flow.ts`, which existed to decide what the
 *   forward button said, is deleted rather than kept for a screen that has no forward button.
 * - **It works with JavaScript disabled.** Native `<input type="range">` inside one `<form>`, each
 *   with a `defaultValue`. Server-rendered, the page is a complete and submittable form; the only
 *   thing the client adds is the figure beside the name updating as the thumb moves.
 * - **Every slider submits.** That is the whole of the sentence at the top of the list
 *   (`RATING_SLIDERS_START_AT_FR`): a range has no unset state, so an untouched one is an opinion of
 *   5,0 and the reader is told so before he starts, not after. There is deliberately no « passer sans
 *   noter » — it would be a button claiming to do something a range input cannot do.
 * - **A note already given is shown, locked.** Ratings are final (`lib/rating/actions.ts`), so those
 *   rows render as a read-only figure with no control to resubmit. In practice they only appear after
 *   a partial submit — the whole set goes in one POST now — but a row that silently re-sent a note
 *   that cannot change would be a lie about what the button does.
 * - **No animation, no self row.** Nobody rates himself (decision 137), so the list is simply who
 *   played, minus the reader, and `targets` arrives that way from `getNotationView`.
 */

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { submitRatings } from "@/lib/rating/actions";
import {
  RATING_SCORE_DEFAULT,
  RATING_SCORE_MAX,
  RATING_SCORE_MIN,
  RATING_SCORE_STEP,
} from "@/lib/rating/aggregate";
import {
  RATING_IS_FINAL_FR,
  RATING_SLIDERS_START_AT_FR,
  ratingScoreFr,
  ratingScoreValueTextFr,
  ratingsSavedFr,
} from "@/lib/rating/labels";
import { playedLabelFr } from "@/lib/rating/progress";
import type { RatingTarget } from "@/lib/rating/queries";

export type RatingSheetProps = {
  teamId: string;
  matchId: string;
  /** Who played, minus the reader, in team-sheet order. Already filtered by the server. */
  targets: readonly RatingTarget[];
};

export function RatingSheet({ teamId, matchId, targets }: RatingSheetProps) {
  const [state, action, pending] = useActionState(submitRatings, undefined);

  /*
   * Only the *figure* beside each name is state. The slider itself is uncontrolled — `defaultValue`,
   * not `value` — so that the server-rendered form is already correct and a reader with no JavaScript
   * drags a working thumb. Controlling it would buy nothing and would mean a note that cannot be
   * changed until React has hydrated.
   */
  const [scores, setScores] = useState<Record<string, number>>({});
  const scoreOf = (membershipId: string) => scores[membershipId] ?? RATING_SCORE_DEFAULT;

  const open = targets.filter((target) => target.myScore === null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="matchId" value={matchId} />

      {open.length > 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-muted">
          {RATING_SLIDERS_START_AT_FR}
        </p>
      ) : null}

      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl bg-danger/15 px-3 py-2 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      ) : null}

      {state?.saved !== undefined && !state.error ? (
        <p
          role="status"
          className="rounded-xl bg-success/15 px-3 py-2 text-sm font-medium text-success"
        >
          {ratingsSavedFr(state.saved, state.unchanged ?? 0)}
        </p>
      ) : null}

      {/* `divide-y` rather than a `Card` each: twelve cards is twelve borders and a screen the reader
          has to scroll through twice. One list, one rule between rows. */}
      <ul className="divide-y divide-border/60">
        {targets.map((target) => (
          <li key={target.membershipId} className="py-3 first:pt-0">
            <RatingRow
              target={target}
              score={scoreOf(target.membershipId)}
              onScore={(score) =>
                setScores((previous) => ({ ...previous, [target.membershipId]: score }))
              }
            />
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <Button type="submit" fullWidth pending={pending} disabled={open.length === 0}>
          Envoyer mes notes
        </Button>
        <p className="text-center text-xs text-ink-subtle">{RATING_IS_FINAL_FR}</p>
      </div>
    </form>
  );
}

type RatingRowProps = {
  target: RatingTarget;
  score: number;
  onScore: (score: number) => void;
};

function RatingRow({ target, score, onScore }: RatingRowProps) {
  const field = `score:${target.membershipId}`;
  // What he did, not what the sheet planned. Null only for a finished match nobody recorded.
  const playedLabel = playedLabelFr(target.minutes);

  const who = (
    <>
      <span className="truncate">{target.displayName}</span>
      <span className="font-normal text-ink-subtle">
        {target.jerseyNumber !== null ? ` · n° ${target.jerseyNumber}` : null}
        {playedLabel !== null ? ` · ${playedLabel}` : null}
      </span>
    </>
  );
  const whoClassName = "min-w-0 flex-1 text-sm font-medium text-ink";

  /*
   * A note already sent: a figure and a badge, no control. The figure is **not** `aria-hidden` here,
   * unlike the live row below — there is no slider on this row to announce it instead.
   */
  if (target.myScore !== null) {
    return (
      <p className="flex items-baseline gap-2">
        <span className={whoClassName}>{who}</span>
        <span className="font-mono text-lg font-bold text-ink tabular-nums">
          {ratingScoreFr(target.myScore)}
        </span>
        <Badge variant="success">envoyée</Badge>
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        {/* The whole line is the slider's label, so the thumb is announced « Karim · n° 8 · 58’ » and
            a tap on the name moves focus to the control under it. */}
        <label htmlFor={field} className={whoClassName}>
          {who}
        </label>

        {/* `aria-hidden`: the slider's own `aria-valuetext` already says « 7,5 sur 10 ». Announcing
            the number twice on one row is how a screen reader makes a one-minute form take five. */}
        <span aria-hidden="true" className="font-mono text-lg font-bold text-ink tabular-nums">
          {ratingScoreFr(score)}
        </span>
      </div>

      <Slider
        id={field}
        name={field}
        min={RATING_SCORE_MIN}
        max={RATING_SCORE_MAX}
        step={RATING_SCORE_STEP}
        defaultValue={RATING_SCORE_DEFAULT}
        valueText={ratingScoreValueTextFr(score)}
        onChange={(event) => onScore(Number(event.target.value))}
      />
    </div>
  );
}
