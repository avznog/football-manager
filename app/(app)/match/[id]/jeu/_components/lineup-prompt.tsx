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
 */
export function LineupPrompt({ view, slots, kit, onApply, onLater }: LineupPromptProps) {
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

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onLater}>
            Plus tard
          </Button>
          <Button fullWidth onClick={onApply}>
            Appliquer
          </Button>
        </div>
      </div>
    </Card>
  );
}
