"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/cn";

import { NAV_ITEMS, isActivePath } from "./nav-items";

/**
 * Fixed bottom tab bar, mobile only. Kept within thumb reach and padded for
 * the iPhone home indicator via `safe-pb`. Each tab is `--tabbar-h` tall —
 * 56px — plus the inset, well over the 44px minimum.
 *
 * The height comes from the token rather than a literal `min-h-14` because
 * anything pinned *above* this bar has to know it, and a second copy of the
 * number is how the composition editor's dock came to float 16px over it.
 *
 * Two different acknowledgements of a tap, because they cover two different
 * failures and only one of them can be written in JavaScript.
 *
 * `active:bg-surface-2` is plain CSS, so it paints on a tap that lands *before*
 * this component has hydrated — which is the tap the owner has to repeat. A tap
 * in that window does not route at all: it is a native document navigation, and
 * it was measured taking that path in 5 of 5 samples on Calendrier under CPU
 * ×4. A pressed state is the only feedback available there, and it is also why
 * nothing here depends on a transition finishing: the tab has no
 * `transition-colors`, so the fill is on screen in the same frame as the touch.
 *
 * It had to be hand-written because the platform's own tap flash is already
 * gone: Tailwind v4's preflight sets `-webkit-tap-highlight-color: transparent`
 * on `html` (`node_modules/tailwindcss/preflight.css:50`), and that property
 * inherits, so every tappable surface in this app lost the free acknowledgement
 * before anyone chose to. Nothing here adds `touch-manipulation` either; the
 * only `touch-action` in the tree is on drag surfaces.
 *
 * The fill also paints on the tab you are already on, deliberately. Tapping the
 * current tab is a real navigation that re-renders the screen, and a reader who
 * taps « Stats » from Stats is owed the same « yes, received » as anyone else —
 * suppressing it would make the one tap that looks like nothing happened the
 * one tap that genuinely says nothing.
 *
 * `TabPending` is the other half, and it only exists after hydration: the
 * navigation registered and is in flight. It says nothing a pressed state
 * already said in the first 180 ms — see the delay in `.fm-pending`.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="safe-pb safe-px fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface md:hidden"
    >
      <ul className="flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[var(--tabbar-h)] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] font-medium",
                  // The same pressed fill every `ghost` and `secondary` button in
                  // `components/ui/button.tsx` uses. The tab bar was the one tappable
                  // surface in the app with no `active:` class at all.
                  "active:bg-surface-2",
                  active ? "text-accent" : "text-ink-muted",
                )}
              >
                {item.icon}
                <span className="max-w-full truncate">{item.label}</span>
                <TabPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * A router navigation in flight, as a hairline across the top of the tab that
 * started it. Rendered *inside* the `<Link>`, which is what `useLinkStatus`
 * requires — it reads the status of its nearest ancestor link.
 *
 * `aria-hidden` and no text, deliberately: the accessible name of each tab is
 * its label and nothing else. That is decision 122's rule reused — the action
 * tiles' inline SVGs are `aria-hidden` so a drawing added for a sighted reader
 * stays out of the control's name — and the hairline is the same shape of thing,
 * a mark that means something only to the eye.
 *
 * Decision 117 is the principle behind both, and it runs the other way, which is
 * why it is not the citation here: Label in Name says the *visible* text must
 * appear in the accessible name, so when the two disagree it is the name that
 * gives way, not the label. A wordless decoration never enters that trade.
 */
function TabPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="fm-pending absolute inset-x-0 top-0 h-0.5 bg-accent"
    />
  );
}
