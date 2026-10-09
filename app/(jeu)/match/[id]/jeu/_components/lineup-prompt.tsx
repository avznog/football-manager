"use client";

import { PitchLayout, type KitColors, type PitchSlot } from "@/components/pitch/PitchLayout";
import { Button, Card } from "@/components/ui";
import { pendingLineupChangesFr, type PendingLineupView } from "@/lib/match/presenter";

export type LineupPromptProps = {
  view: PendingLineupView;
  /** The proposal, drawn as ghosts. */
  slots: readonly PitchSlot[];
  kit: KitColors;
  /**
   * Applies the plan. Null when the viewer cannot operate the match — the card still shows, because
   * following the plan from the touchline is the point, but the operator's button is not offered.
   */
  onApply: (() => void) | null;
  /**
   * Opens TERRAIN pre-filled with this composition, for the coach who wants it *almost* as planned.
   * Null when the viewer cannot operate the match.
   */
  onAdjust: (() => void) | null;
  onLater: () => void;
  /**
   * The starting composition before the kick-off, seen by somebody who does not operate the match:
   * nobody will tap « Appliquer », the operator opening game mode applies it (decision 153).
   */
  appliesOnOpen?: boolean;
};

/**
 * The planned composition, proposed and waiting.
 *
 * **Invariant 3**: a planned composition is never applied automatically — except the starting one,
 * which game mode applies when the operator opens it before the kick-off (decision 153), so the
 * operator never sees this card for it. This card describes what would change, flags the players it
 * would be odd to field — injured, already substituted off, not on the match sheet — and does nothing
 * at all until the coach taps « Appliquer ». « Plus tard » only hides the card: the plan stays in
 * `lineups`, unapplied, and the log is untouched.
 *
 * It is a card at the top of the page and not a modal on purpose: a dialog that appears at 45′ over
 * the pitch, while the coach is mid-tap on something else, is a dialog that gets dismissed by
 * accident — and the composition would be lost from view.
 *
 * « Ajuster » is the third answer, and the honest one: the plan was drawn on Thursday and somebody
 * did not turn up. It opens TERRAIN pre-filled with the plan, so the coach changes the one thing that
 * is wrong instead of applying a composition he knows to be stale — and it still writes nothing until
 * he validates there.
 */
export function LineupPrompt({
  view,
  slots,
  kit,
  onApply,
  onAdjust,
  onLater,
  appliesOnOpen = false,
}: LineupPromptProps) {
  const changes = pendingLineupChangesFr(view);

  return (
    <Card
      title={view.title}
      description={
        onApply
          ? "Proposée, pas appliquée : rien ne change avant ta confirmation."
          : appliesOnOpen
            ? "Pas encore appliquée : elle entre sur le terrain dès que l’opérateur ouvre le mode match."
            : "Proposée, pas appliquée : rien ne change avant la confirmation de l’opérateur."
      }
      className="border-accent/50 ring-1 ring-accent/20"
    >
      <div className="space-y-4">
        {view.warnings.length > 0 ? (
          <ul className="space-y-1">
            {view.warnings.map((warning) => (
              <li key={warning} className="text-sm font-medium text-danger">
                {warning}
              </li>
            ))}
          </ul>
        ) : null}

        {changes.kind === "list" ? (
          <ol className="space-y-1">
            {changes.lines.map((change) => (
              <li key={change} className="text-sm text-ink">
                {change}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">{changes.text}</p>
        )}

        <PitchLayout
          slots={slots}
          kit={kit}
          size="sm"
          pitchLabel={`${view.title} (proposition)`}
          className="mx-auto max-w-xs"
        />

        <div className="space-y-2">
          {/* Grid, not flex: `Button` is `shrink-0`, and two `w-full` buttons in a flex row push the
              second one off a 390 px screen. */}
          {onApply ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" fullWidth onClick={onLater}>
                Plus tard
              </Button>
              <Button fullWidth onClick={onApply}>
                Appliquer
              </Button>
            </div>
          ) : (
            /* A viewer who cannot operate the match was being offered « Appliquer » all the same, and
               the server refused the event it produced — a rejected action in the queue for a tap the
               screen should never have invited. Hiding the card is still theirs to do, but it is
               « Masquer »: « Plus tard » would promise them something they will not be doing. */
            <Button variant="secondary" fullWidth onClick={onLater}>
              Masquer
            </Button>
          )}
          {onAdjust ? (
            <Button variant="ghost" fullWidth onClick={onAdjust}>
              Ajuster sur le terrain
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
