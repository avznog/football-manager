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
 * - **Tapping a note moves you on.** That is the whole interaction: tap, tap, tap. It does *not*
 *   advance if you have started a comment for that player — you would lose the thread of what you
 *   were writing.
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
import { RATING_COMMENT_MAX } from "@/lib/rating/validation";

export type RatingFlowTarget = {
  membershipId: string;
  displayName: string;
  jerseyNumber: number | null;
  squadRole: "starter" | "substitute" | "supporter";
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
  const draftOf = (membershipId: string): Draft =>
    drafts[membershipId] ?? { score: null, comment: "" };

  const filled = remaining.filter((target) => draftOf(target.membershipId).score !== null).length;
  const done = targets.length - remaining.length;
  const total = targets.length;

  function setScore(target: RatingFlowTarget, score: number) {
    const draft = draftOf(target.membershipId);
    setDrafts((previous) => ({
      ...previous,
      [target.membershipId]: { ...draft, score },
    }));

    // Move on — unless the player is in the middle of writing something about this teammate.
    if (draft.comment.trim().length === 0) goNext();
  }

  function setComment(membershipId: string, comment: string) {
    setDrafts((previous) => ({
      ...previous,
      [membershipId]: { ...draftOf(membershipId), comment },
    }));
  }

  function goNext() {
    setIndex((value) => Math.min(value + 1, targets.length - 1));
  }

  const allFilled = filled === remaining.length && remaining.length > 0;

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
          <li key={target.membershipId} hidden={paginated && position !== index}>
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
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
            className="flex-1"
          >
            Précédent
          </Button>
          <Button
            variant="secondary"
            onClick={goNext}
            disabled={index >= total - 1}
            className="flex-1"
          >
            {current && draftOf(current.membershipId).score === null && current.myScore === null
              ? "Passer"
              : "Suivant"}
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <Button type="submit" fullWidth pending={pending} disabled={filled === 0}>
          {allFilled ? "Terminer et voir le résumé" : "Enregistrer mes notes"}
        </Button>
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

  return (
    <Card
      // `Card`'s `title` intersects the `<section>` title attribute, so it takes a string only —
      // the badges go in `action`, which is a proper `ReactNode`.
      title={target.displayName}
      description={[
        target.jerseyNumber !== null ? `n° ${target.jerseyNumber}` : null,
        showPosition ? `${position + 1} / ${total}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      action={
        <span className="flex items-center gap-1.5">
          {target.isSelf ? <Badge variant="accent">toi</Badge> : null}
          {target.squadRole === "substitute" ? <Badge>entré en jeu</Badge> : null}
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
            <legend className="mb-2 text-sm text-ink-muted">
              Sa note pour ce match{target.isSelf ? " (la tienne)" : ""}
            </legend>
            <div className="grid grid-cols-6 gap-1.5">
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
                        "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-surface-2 font-mono text-base font-semibold text-ink-muted tabular-nums select-none",
                        "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink",
                        "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                      )}
                    >
                      {score}
                    </label>
                  </div>
                );
              })}
            </div>
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
