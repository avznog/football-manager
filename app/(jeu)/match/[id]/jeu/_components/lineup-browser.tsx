"use client";

import { PitchLayout, type KitColors, type PitchSlot } from "@/components/pitch/PitchLayout";
import { Button, Sheet } from "@/components/ui";
import {
  pendingLineupChangesFr,
  plannedLineupStepFr,
  type PlannedLineupCard,
} from "@/lib/match/presenter";

export type LineupBrowserProps = {
  open: boolean;
  onClose: () => void;
  /** Every composition planned for this match, in minute order. Never empty: the button is hidden. */
  cards: readonly PlannedLineupCard[];
  /** Which one is on screen. */
  index: number;
  onStep: (index: number) => void;
  /** The card on screen, drawn as ghosts — `proposedPitchView` of `cards[index].slots`. */
  slots: readonly PitchSlot[];
  kit: KitColors;
  /** « 23’ · 1re période » — the minute an « Appliquer maintenant » would be stamped at. */
  stampLabel: string;
  /** Applies the composition on screen at the current minute. Null for a viewer. */
  onApply: (() => void) | null;
  /** Opens TERRAIN pre-filled with it. Null for a viewer. */
  onAdjust: (() => void) | null;
};

/**
 * Step through the match's planned compositions, and apply any of them (decision 193).
 *
 * The owner: « I want the possibility to apply any predefined composition before or later than the
 * predefined time. I should get a button where I can preview the next (or previous) compos, and apply
 * one at any time. » Until now a plan was only ever offered when its own minute arrived
 * (`pendingLineup`), which is the common case and still has its card at the top of the screen — but a
 * half that goes badly is exactly when the coach wants the 45′ shape at 23′, and the plan drawn on
 * Thursday for the last ten minutes is the one he already knows by heart.
 *
 * **Applying is a change at the minute of the tap** (decision 147): one `LINEUP_APPLIED` stamped
 * when « Appliquer maintenant » is pressed, carrying the plan's id so the server records that this is
 * what was applied. The plan's own `from_minute` is never rewritten — so a composition drawn for the
 * 45th and applied at the 23rd still reads « Prévue à la 45’ » here, and the log reads 23’. Those are
 * two different facts and the screen says both.
 *
 * Each card is described against the pitch **as it stands now**, not against the plan before it: the
 * change list is what applying it would actually do at this minute, which is the only thing a coach
 * stepping through them wants to read.
 */
export function LineupBrowser({
  open,
  onClose,
  cards,
  index,
  onStep,
  slots,
  kit,
  stampLabel,
  onApply,
  onAdjust,
}: LineupBrowserProps) {
  const card = cards[index];
  if (!card) return null;

  const changes = pendingLineupChangesFr(card);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compositions prévues"
      description={stampLabel}
      footer={
        onApply || onAdjust ? (
          <div className="space-y-2">
            {onApply ? (
              /* Disabled, not hidden, when the pitch is already this composition: applying it would
                 write a change that changed nothing — a line in the Déroulé saying « Changement »
                 with no detail under it. The sentence above already says why, which is the whole
                 reason it is `pendingLineupChangesFr`'s job and not a `title` (decision 072). */
              <Button fullWidth disabled={card.isEmpty} onClick={onApply}>
                Appliquer maintenant
              </Button>
            ) : null}
            {onAdjust ? (
              <Button variant="ghost" fullWidth onClick={onAdjust}>
                Ajuster sur le terrain
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* The stepper, above what it steps through. Grid rather than flex, for the reason every
            other two-button row in game mode is a grid: `Button` is `shrink-0`, so two of them
            beside a label push the second off a 390 px screen.

            The visible word is a word of the accessible name — « Précédente » inside « Composition
            précédente » — which is what WCAG 2.5.3 asks, so a voice-control user saying what he can
            read hits the button. The name adds the noun the chevron cannot say out loud. */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={index === 0}
            aria-label="Composition précédente"
            onClick={() => onStep(index - 1)}
          >
            <span aria-hidden="true">‹</span> Précédente
          </Button>
          <p className="text-center text-xs text-ink-muted tabular-nums">
            {plannedLineupStepFr(index, cards.length)}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={index === cards.length - 1}
            aria-label="Composition suivante"
            onClick={() => onStep(index + 1)}
          >
            Suivante <span aria-hidden="true">›</span>
          </Button>
        </div>

        <div>
          <h3 className="text-base font-semibold text-ink">{card.title}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{card.statusFr}</p>
        </div>

        {card.warnings.length > 0 ? (
          <ul className="space-y-1">
            {card.warnings.map((warning) => (
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
          pitchLabel={`${card.title} (proposition)`}
          className="mx-auto max-w-xs"
        />
      </div>
    </Sheet>
  );
}
