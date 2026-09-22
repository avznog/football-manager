import type { ReactNode } from "react";

export type NavItem = {
  /** French label shown in the tab bar and the sidebar. */
  label: string;
  href: string;
  icon: ReactNode;
};

const iconProps = {
  "aria-hidden": true as const,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "size-6 shrink-0",
};

/**
 * The four destinations of the app. Order is the tab order, left to right on
 * mobile and top to bottom on desktop.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Calendrier",
    href: "/calendrier",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    label: "Équipe",
    href: "/equipe",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.25" />
        <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16.5 5.2a3.25 3.25 0 0 1 0 5.6M18 14.4a5.5 5.5 0 0 1 2.5 4.6" />
      </svg>
    ),
  },
  {
    label: "Stats",
    href: "/stats",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    label: "Moi",
    href: "/moi",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
  },
];

/** A tab is active on its own route and on anything nested under it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
