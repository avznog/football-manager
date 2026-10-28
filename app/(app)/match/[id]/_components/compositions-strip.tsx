import { PitchLayout, type KitColors } from "@/components/pitch/PitchLayout";
import { Card } from "@/components/ui/card";
import type { RecapComposition } from "@/lib/rating/recap";

export type CompositionsStripProps = {
  compositions: readonly RecapComposition[];
  kit: KitColors;
};

/**
 * « Les compositions » — every seven the match went through, at the bottom of the recap.
 *
 * The owner's words: « we need to have, on the bottom, the blocks with all the compositions that
 * happened during the match. Maybe put them in a horizontal scroll or swipe. » **Blocks** is his
 * word for them, from the paper sheets the season was rebuilt off: one drawn pitch per change, in a
 * column down the page. Decision 182.
 *
 * ## Why a strip and not a column
 *
 * Bayern has **twelve** of them. Twelve 400 px pitches down a 390 px screen is five screens of
 * scroll under a recap that already has a timeline and a minutes table, and nobody would reach the
 * ratings below it. A horizontal strip spends one block's height and asks for a thumb-flick — which
 * is the gesture this page is read with anyway.
 *
 * So: `snap-x snap-mandatory` with `snap-start`, full-bleed through the card's padding so the next
 * block peeks over the right edge and says *there is more that way* without a word. Each pane is
 * 272 px, the size `lineup-prompt.tsx` draws its proposed seven at, so the names are the same size
 * they are in game mode. The minute is the big type on every pane because that is what tells twelve
 * near-identical pitches apart; « Composition de départ » / « Changement » is its caption, and
 * « 3 / 12 » is the only thing on screen that says how far along the strip you are.
 *
 * **Nothing is on hover** (decision 072): the position code is on the disc, the name under it, the
 * minute above and who was off the pitch below. Server Component, no JavaScript — the scroll and the
 * snapping are the browser's.
 */
export function CompositionsStrip({ compositions, kit }: CompositionsStripProps) {
  // A match with no applied composition has no blocks: the recap simply has no such card. Every
  // match rebuilt from the sheets has them, and a match nobody recorded has nothing else either.
  if (compositions.length === 0) return null;

  return (
    <Card
      title="Les compositions"
      description="Chaque changement du match, dans l’ordre. Fais défiler sur le côté."
      as="h2"
      flush
    >
      <ul
        aria-label="Les compositions du match, de la première à la dernière"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4"
      >
        {compositions.map((composition, index) => (
          <li key={composition.eventId} className="w-68 shrink-0 snap-start space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate">
                <span className="text-lg font-bold text-ink">{composition.minuteLabel}</span>{" "}
                <span className="font-mono text-[10px] text-ink-subtle tabular-nums">
                  {composition.clock}
                </span>{" "}
                <span className="text-sm text-ink-muted">{composition.kindLabel}</span>
              </p>
              {/* Not decoration: it is how a reader knows whether the flick that moved the strip
                  moved it by one block or by three, and how many are left. */}
              <span className="shrink-0 text-xs font-medium text-ink-muted tabular-nums">
                {index + 1} / {compositions.length}
              </span>
            </div>

            <PitchLayout
              slots={composition.slots}
              kit={kit}
              size="sm"
              pitchLabel={`Composition à la ${composition.minuteLabel}`}
            />

            {/* « Hors du terrain : … », or the fact that there was nobody. Stated either way, so a
                block is never silent about the half of the squad it does not draw. */}
            <p className="text-xs leading-snug text-ink-muted">
              {composition.offPitchLabel ?? "Tout le monde était sur le terrain."}
            </p>
          </li>
        ))}
        {/* The last block cannot start at the left edge without something after it to scroll into,
            so it ends up half a pane in with its predecessor's « 11 / 12 » beside its own. This is
            that something: 80 px of nothing, so every block in the strip snaps to the same place. */}
        <li aria-hidden className="w-20 shrink-0" />
      </ul>
    </Card>
  );
}
