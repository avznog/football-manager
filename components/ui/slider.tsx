import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";

/**
 * A note, as a native `<input type="range">`.
 *
 * **Native, and that is the whole design.** Arrow keys, Home and End, the iOS thumb a finger can
 * actually catch, the `FormData` entry, the screen reader announcing a slider with its range: all of it
 * comes free, and none of it would survive a div with a `pointermove` handler.
 *
 * It is not a `type` of `Input`: `components/ui/input.tsx` whitelists its `type` and deliberately
 * excludes `range`, because `controlClassName` is a box with a border, a background and `min-h-12` —
 * everything a track is not. The one thing borrowed from it is the 48 px target, bought here with
 * `h-12` on the input, so the invisible hit area is the whole row even though the rail the eye sees is
 * a few pixels of it.
 *
 * ## Why there is no `appearance-none`
 *
 * The usual Tailwind range recipe strips the native look and rebuilds the track and the thumb in two
 * vendor pseudo-elements. **That recipe would be a bug here**: `accent-color` only paints a control the
 * browser is still drawing, so `appearance-none` takes the colour with it and leaves a theme-blind
 * grey rail in dark mode. Keeping the native appearance and setting one property gives both themes, the
 * filled portion of the track, the focus ring iOS draws itself, and a thumb sized by the platform for a
 * finger. There is nothing here worth overriding.
 *
 * `accent-accent` is all it takes because `app/globals.css` declares its tokens in `@theme` **without**
 * `inline` and overrides them in both the `prefers-color-scheme` block and the explicit class block — so
 * `--color-accent` already holds `#0b5fa4` or `#6bb0f5` by the time the browser paints.
 *
 * ## Why `aria-valuetext` is not optional
 *
 * A screen reader reads the raw `value` of a range, so 7,5 comes out « seven point five » in English on
 * a French page, and a bare « 7.5 » says nothing about the scale it sits on. The caller passes the
 * sentence — `ratingScoreValueTextFr` gives « 7,5 sur 10 » — because this component knows nothing about
 * notes and should not learn.
 */
export type SliderProps = Omit<ComponentPropsWithRef<"input">, "type" | "children"> & {
  /**
   * What the value *means*, in French: « 7,5 sur 10 ». Required rather than optional — see above.
   * `aria-valuenow`, `aria-valuemin` and `aria-valuemax` are the browser's job and must not be set by
   * hand: `min` and `max` are already on the element.
   */
  valueText: string;
};

export function Slider({ className, valueText, ...props }: SliderProps) {
  return (
    <input
      type="range"
      aria-valuetext={valueText}
      className={cn(
        // 48 px of target for a rail of a few pixels — a control a thumb cannot catch is a control that
        // lies about being there, and on a phone that is every control that is not sized for one.
        "block h-12 w-full cursor-pointer",
        "accent-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
