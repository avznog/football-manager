/**
 * What is on screen while the model is being asked (decision 204).
 *
 * The call goes to a free endpoint and a 120-billion-parameter model: several seconds is normal, and a
 * blank screen for several seconds is the owner wondering whether he broke it. So the header, the
 * seven's rule, the two selects and the context field are all rendered and usable immediately, and only
 * this block is waiting.
 *
 * ## It matches the footprint rather than imitating the drawing
 *
 * `PitchLayout` draws into a fixed-aspect box — the pitch is `aspect-[2/3]` — so the placeholder is the
 * same box, and the list of seven rows under it is seven rows of the same height as `SlotList`'s
 * (`px-3 py-2` around two lines of text). That is the whole point: when the answer arrives it replaces
 * a block of the same height, so the selects and the paragraphs below do not jump under a thumb that
 * was already reaching for them.
 *
 * `animate-pulse` and nothing else. No spinner on the grass, no percentage, no « presque fini » — the
 * wait is not measurable from here, and a progress bar that cannot progress is a lie. The sentence
 * above says what is happening, once, in words.
 */

import { Card } from "@/components/ui";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@/lib/pitch/geometry";
import { SEVEN_PENDING_FR } from "@/lib/stats/best-seven-copy";

export function SevenSkeleton({ controls }: { controls: React.ReactNode }) {
  return (
    <>
      <section className="space-y-3" aria-busy="true">
        <p className="text-sm text-ink-muted" aria-live="polite">
          {SEVEN_PENDING_FR}
        </p>

        {/* The turf's box, to the pixel: the ratio is `Pitch`'s own, read from the same geometry
            constants rather than copied as a number that could drift from it. */}
        <div
          className="w-full animate-pulse rounded-2xl bg-surface-2"
          style={{ aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}` }}
        />

        {/* `SlotList`'s seven rows, same radius, same dividers, same height. */}
        <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-surface">
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <li key={row} className="flex items-center gap-3 px-3 py-2">
              <span className="h-4 w-11 shrink-0 animate-pulse rounded bg-surface-2" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block h-4 w-32 animate-pulse rounded bg-surface-2" />
                <span className="block h-3 w-20 animate-pulse rounded bg-surface-2" />
              </span>
              {/* Two bars, because the real row's right-hand column is two lines — the ranked figure
                  and the raw record under it. One bar made the placeholder 12 px shorter per row. */}
              <span className="w-16 shrink-0 space-y-1">
                <span className="block h-4 animate-pulse rounded bg-surface-2" />
                <span className="block h-3 animate-pulse rounded bg-surface-2" />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Rendered here too, and that is the point: the selects and the context field are on screen and
          working while the model is out, in the place they will still be when it answers. */}
      {controls}

      <Card className="space-y-3">
        <span className="block h-4 w-56 animate-pulse rounded bg-surface-2" />
        <span className="block h-3 w-full animate-pulse rounded bg-surface-2" />
        <span className="block h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      </Card>
    </>
  );
}
