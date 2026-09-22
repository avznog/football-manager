"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/cn";

import { NAV_ITEMS, isActivePath } from "./nav-items";

/** Vertical navigation used inside the desktop sidebar. */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigation principale" className="px-2">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
