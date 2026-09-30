"use client";

import Link from "next/link";
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
                  "flex min-h-[var(--tabbar-h)] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] font-medium",
                  active ? "text-accent" : "text-ink-muted",
                )}
              >
                {item.icon}
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
