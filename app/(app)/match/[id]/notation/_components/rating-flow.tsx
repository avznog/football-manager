"use client";

/**
 * The rating flow: one teammate per card, a 0–10 pad, an optional comment, next.
 *
 * Used on a phone on the way home from the match, with one thumb, by people who will close the tab
 * if it takes more than a minute. Everything below follows from that.
 *
 * - **One POST for the whole sheet.** Every card stays in the DOM — the cards that are not on screen
 *   are `hidden`, which keeps their inputs in the submission. Twelve players cost one request, not
 *   twelve, so a patchy connection costs one retry.
 * - **It works with JavaScript disabled.** The markup is native radios and textareas inside one
 *   `<form>`; the pagination only starts once the component has mounted. Server-rendered, the page
 *   is a long but complete form that submits correctly.
 * - **Selecting and advancing are two taps** (decision 102). Tapping a note used to move you on by
 *   itself, which meant the number you had just chosen was replaced by the next teammate's card
 *   before it had time to look chosen: the reader never saw his own answer register. Now the tap
 *   selects, the selection is unmistakable, and « Suivant » is the only thing that advances.
 * - **A note already given is shown, locked.** Ratings are final (see `lib/rating/actions.ts`), so
 *   those cards render as a read-only line with no input to resubmit.
 * - **No animation.** The card swap is a visibility change. Nothing here to stutter on an old
 *   Android or to fight `prefers-reduced-motion`.
 */

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Textarea } from "@/components/ui/textarea";
import { submitRatings } from "@/lib/rating/actions";
import { chosenScoreFr, nextIndex, previousIndex, ratingStep } from "@/lib/rating/flow";
import { ratingLegendFr } from "@/lib/rating/labels";
import { playedLabelFr, ratingCardPositionFr } from "@/lib/rating/progress";
import { RATING_COMMENT_MAX } from "@/lib/rating/validation";

export type RatingFlowTarget = {
  membershipId: string;
  displayName: string;
  jerseyNumber: number | null;
  squadRole: "starter" | "substitute" | "supporter";
  /** Minutes actually played, from the log — null when the match has no log to read. */
  minutes: number | null;
  isSelf: boolean;
  /** Already submitted, and therefore final. */
  myScore: number | null;
  myComment: string | null;
};

export type RatingFlowProps = {
  teamId: string;
  matchId: string;
  targets: readonly RatingFlowTarget[];
};

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Nothing ever changes: the store exists only so the snapshot differs between server and client. */
const subscribeToNothing = () => () => {};

type Draft = { score: number | null; comment: string };

const EMPTY_DRAFT: Draft = { score: null, comment: "" };

export function RatingFlow({ teamId, matchId, targets }: RatingFlowProps) {
  const [state, action, pending] = useActionState(submitRatings, undefined);

  // Pagination is a progressive enhancement: server-rendered, every card is on screen and the form
  // is a plain, complete, submittable page. `useSyncExternalStore` with two different snapshots is
  // the supported way to ask "am I hydrated?" — an effect that calls `setState` would be a cascading
  // render, which the lint rules rightly refuse.
  const paginated = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const remaining = useMemo(
    () => targets.filter((target) => target.myScore === null),
    [targets],
  );

  // Start on the first player who still needs a note, not on a card that is already done.
  const firstOpen = Math.max(
    0,
    targets.findIndex((target) => target.myScore === null),
  );
  const [index, setIndex] = useState(firstOpen);

  const current = targets[Math.min(index, targets.length - 1)];
  const draftOf = (membershipId: string): Draft => drafts[membershipId] ?? EMPTY_DRAFT;

  const filled = remaining.filter((target) => draftOf(target.membershipId).score !== null).length;
  const done = targets.length - remaining.length;
  const total = targets.length;

  // Selecting a note no longer advances (decision 102): it replaces the draft's score and stops
  // there, so the chosen number stays on screen long enough to be seen — and long enough to be
  // changed by tapping another one.
  function setScore(target: RatingFlowTarget, score: number) {
    setDrafts((previous) => ({
      ...previous,
      [target.membershipId]: { ...(previous[target.membershipId] ?? EMPTY_DRAFT), score },
    }));
  }

  function setComment(membershipId: string, comment: string) {
    setDrafts((previous) => ({
      ...previous,
      [membershipId]: { ...(previous[membershipId] ?? EMPTY_DRAFT), comment },
    }));
  }

  const step = ratingStep({
    index,
    total,
    currentLocked: current !== undefined && current.myScore !== null,
    currentSelected: current ? draftOf(current.membershipId).score !== null : false,
    filled,
    remaining: remaining.length,
  });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="matchId" value={matchId} />

      <Progress done={done} filled={filled} total={total} />

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
          {state.saved > 0
            ? `${state.saved} note${state.saved > 1 ? "s" : ""} enregistrée${state.saved > 1 ? "s" : ""}. Il en reste à mettre pour voir celles des autres.`
            : "Ces notes étaient déjà enregistrées."}
        </p>
      ) : null}

      <ul className="space-y-4">
        {targets.map((target, position) => (
          <li key={target.membershipId} hidden={paginated && position !== step.index}>
            <RatingCard
              target={target}
              draft={draftOf(target.membershipId)}
              onScore={(score) => setScore(target, score)}
              onComment={(comment) => setComment(target.membershipId, comment)}
              position={position}
              total={total}
              showPosition={paginated}
            />
          </li>
        ))}
      </ul>

      {paginated ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setIndex((value) => previousIndex(value, total))}
              disabled={!step.canGoPrevious}
              className="flex-1"
            >
              Précédent
            </Button>
            {/* Nothing on the last card: there is no teammate after him, and a greyed « Suivant »
                there would be the third button in this repository to look pressable and do nothing.
                The submit button underneath is the way out. */}
            {step.next ? (
              <Button
                variant={step.next.variant}
                onClick={() => setIndex((value) => nextIndex(value, total))}
                className="flex-1"
              >
                {step.next.label}
              </Button>
            ) : null}
          </div>
          {step.hint ? (
            <p className="text-center text-xs text-ink-muted" aria-live="polite">
              {step.hint}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Button type="submit" fullWidth pending={pending} disabled={!step.submit.enabled}>
          {step.submit.label}
        </Button>
        {/* Nothing is written card by card — the whole sheet is one POST — so the notes chosen so far
            are still only on this phone. The reader has to be told, now that choosing a note no
            longer looks like committing it. */}
        {step.unsent ? (
          <p className="text-center text-xs font-medium text-warning" aria-live="polite">
            {step.unsent}
          </p>
        ) : null}
        <p className="text-center text-xs text-ink-subtle">
          Une note est définitive. Tu verras les notes des autres quand tu auras noté tout le monde.
        </p>
      </div>
    </form>
  );
}

function Progress({ done, filled, total }: { done: number; filled: number; total: number }) {
  const ready = Math.min(done + filled, total);
  const percent = total === 0 ? 0 : Math.round((ready / total) * 100);

  return (
    <div className="space-y-1.5">
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">
          {ready} / {total} notés
        </span>
        <span className="text-ink-subtle" aria-live="polite">
          {ready === total ? "Prêt à envoyer" : `Reste ${total - ready}`}
        </span>
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={ready}
        aria-label="Progression de la notation"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

type RatingCardProps = {
  target: RatingFlowTarget;
  draft: Draft;
  onScore: (score: number) => void;
  onComment: (comment: string) => void;
  position: number;
  total: number;
  showPosition: boolean;
};

function RatingCard({
  target,
  draft,
  onScore,
  onComment,
  position,
  total,
  showPosition,
}: RatingCardProps) {
  const scoreField = `score:${target.membershipId}`;
  const commentField = `comment:${target.membershipId}`;
  const commentId = `${commentField}-input`;
  const playedLabel = playedLabelFr(target.minutes);
  const chosenLabel = chosenScoreFr(draft.score);

  return (
    <Card
      // `Card`'s `title` intersects the `<section>` title attribute, so it takes a string only —
      // the badges go in `action`, which is a proper `ReactNode`.
      title={target.displayName}
      description={[
        target.jerseyNumber !== null ? `n° ${target.jerseyNumber}` : null,
        showPosition ? ratingCardPositionFr(position, total) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      action={
        <span className="flex items-center gap-1.5">
          {target.isSelf ? <Badge variant="accent">toi</Badge> : null}
          {/* What he did, not what the sheet planned: « entré en jeu » here was read off
              `squadRole === "substitute"`, so a substitute who never left the bench was announced
              as having come on — to the whole team, at the moment they rated him. */}
          {playedLabel !== null ? <Badge variant="neutral">{playedLabel}</Badge> : null}
        </span>
      }
      as="h2"
    >
      {target.myScore !== null ? (
        <div className="space-y-2">
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-ink tabular-nums">
              {target.myScore}
            </span>
            <span className="text-sm text-ink-muted">/ 10</span>
            <Badge variant="success">envoyée</Badge>
          </p>
          {target.myComment ? (
            <p className="text-sm text-ink-muted italic">« {target.myComment} »</p>
          ) : null}
          <p className="text-xs text-ink-subtle">Une note envoyée ne peut plus être modifiée.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <fieldset>
            {/* « Sa note pour ce match (la tienne) » patched the pronoun instead of choosing it,
                under a card already badged « toi » (decision 095). */}
            <legend className="mb-2 text-sm text-ink-muted">
              {ratingLegendFr(target.isSelf)}
            </legend>
            {/* `gap-2` is what the selected token's ring needs: 2 px of ring plus 1 px of offset on
                each of two neighbours is exactly 6 px, and at `gap-1.5` two rings touched. */}
            <div className="grid grid-cols-6 gap-2">
              {SCORES.map((score) => {
                const id = `${scoreField}-${score}`;
                return (
                  <div key={score}>
                    <input
                      type="radio"
                      id={id}
                      name={scoreField}
                      value={score}
                      checked={draft.score === score}
                      onChange={() => onScore(score)}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={id}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-border/60 bg-surface-2 font-mono text-base font-semibold text-ink-muted tabular-nums select-none",
                        // The selection has to survive being glanced at in daylight, one-handed, and
                        // it cannot lean on colour alone: the fill and the border change hue, and the
                        // ring and the bigger, bolder digit change the shape of the token.
                        // accent/accent-ink is the pair `globals.css` documents at 6.59 light and
                        // 7.16 dark, so the fill is legible in either theme.
                        "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink",
                        "peer-checked:text-lg peer-checked:font-bold",
                        "peer-checked:ring-2 peer-checked:ring-accent peer-checked:ring-offset-1 peer-checked:ring-offset-surface",
                        "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                      )}
                    >
                      {score}
                    </label>
                  </div>
                );
              })}
            </div>
            {/* The token is highlighted, but a phone in the sun is a poor place to read a fill, and
                a live region is the only way the choice is announced at all. */}
            {chosenLabel !== null ? (
              <p className="mt-2 text-sm font-semibold text-ink" aria-live="polite">
                {chosenLabel}
              </p>
            ) : null}
          </fieldset>

          <div>
            <label htmlFor={commentId} className="mb-1 block text-sm text-ink-muted">
              Un mot ? <span className="text-ink-subtle">(facultatif)</span>
            </label>
            <Textarea
              id={commentId}
              name={commentField}
              rows={2}
              maxLength={RATING_COMMENT_MAX}
              value={draft.comment}
              onChange={(event) => onComment(event.target.value)}
              placeholder="Énorme match, dommage pour le penalty…"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
