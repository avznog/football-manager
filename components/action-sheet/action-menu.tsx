"use client";

import { Sheet, cn } from "@/components/ui";
import type { MatchEventType } from "@/lib/match/events";

/**
 * Generic over its key, because not every tile in the menu records an event: « Autre… » opens a
 * second menu and has no `MatchEventType` to be typed as. The default keeps every existing call
 * site reading `ActionChoice`.
 */
export type ActionChoice<T extends string = MatchEventType> = {
  type: T;
  /** « But », « But encaissé »… */
  label: string;
  /** « qui a marqué ? » — what the next step will ask, so nothing is a surprise. */
  hint?: string;
  /** `accent` for what happens most, `danger` for what goes against us. */
  tone?: "accent" | "danger" | "neutral";
  /** Spans both columns. For the tile that opens another menu rather than recording anything. */
  wide?: boolean;
};

export type ActionMenuProps<T extends string = MatchEventType> = {
  open: boolean;
  onClose: () => void;
  /** « Action », or what the second menu is called. */
  title?: string;
  /** « 58’ · 2e période » — which match time the action will be stamped with. */
  stampLabel: string;
  choices: readonly ActionChoice<T>[];
  onPick: (type: T) => void;
};

const TONES = {
  accent: "border-accent/40 bg-accent/10 text-ink hover:bg-accent/15",
  danger: "border-danger/40 bg-danger/10 text-ink hover:bg-danger/15",
  neutral: "border-border/60 bg-surface text-ink hover:bg-surface-2",
} as const;

/**
 * The ACTION menu: the one screen the coach uses at 78′.
 *
 * A two-column grid of tall tiles rather than a list, because the whole point is that the target
 * is found without reading: « But » is always top left, « Changement » is always in the same
 * place. The match time is printed at the top because the action is stamped when the coach *taps*,
 * not when they finish choosing the player — so if the sheet has been open for thirty seconds, the
 * minute shown here is still the minute that will be recorded.
 *
 * The same component renders the second menu behind « Autre… ». Four tiles is what a thumb finds
 * without reading; nine was a list wearing a grid's clothes, and the four that matter were being
 * scrolled past to reach « Blessure ».
 */
export function ActionMenu<T extends string = MatchEventType>({
  open,
  onClose,
  title = "Action",
  stampLabel,
  choices,
  onPick,
}: ActionMenuProps<T>) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={stampLabel}>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((choice) => (
          <button
            key={choice.type}
            type="button"
            onClick={() => onPick(choice.type)}
            className={cn(
              "flex min-h-20 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              TONES[choice.tone ?? "neutral"],
              choice.wide ? "col-span-2 min-h-14" : undefined,
            )}
          >
            <span className="text-[0.9375rem] leading-tight font-semibold">{choice.label}</span>
            {choice.hint ? (
              <span className="text-xs leading-tight text-ink-muted">{choice.hint}</span>
            ) : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
