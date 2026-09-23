"use client";

import { PitchLayout, type KitColors, type PitchSlot } from "@/components/pitch/PitchLayout";
import { Button, Card } from "@/components/ui";
import type { PendingLineupView } from "@/lib/match/presenter";

export type LineupPromptProps = {
  view: PendingLineupView;
  /** The proposal, drawn as ghosts. */
  slots: readonly PitchSlot[];
  kit: KitColors;
  onApply: () => void;
  /**
   * Opens TERRAIN pre-filled with this composition, for the coach who wants it *almost* as planned.
   * Null when the viewer cannot operate the match.
   */
  onAdjust: (() => void) | null;
  onLater: () => void;
};

/**
 * The planned composition, proposed and waiting.
 *
 * **Invariant 3**: a planned composition is never applied automatically. This card describes what
 * would change, flags the players it would be odd to field — injured, already substituted off, not
 * on the match sheet — and does nothing at all until the coach taps « Appliquer ». « Plus tard »
 * only hides the card: the plan stays in `lineups`, unapplied, and the log is untouched.
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
export function LineupPrompt({ view, slots, kit, onApply, onAdjust, onLater }: LineupPromptProps) {
  return (
    <Card
      title={view.title}
      description="Proposée, pas appliquée : rien ne change avant votre confirmation."
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

        {view.changes.length > 0 ? (
          <ol className="space-y-1">
            {view.changes.map((change) => (
              <li key={change} className="text-sm text-ink">
                {change}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">Cette composition ne change rien sur le terrain.</p>
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
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" fullWidth onClick={onLater}>
              Plus tard
            </Button>
            <Button fullWidth onClick={onApply}>
              Appliquer
            </Button>
          </div>
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
