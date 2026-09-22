"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";

import {
  applyThemePreference,
  getServerThemePreference,
  readThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "./theme";

function MonitorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

const OPTIONS: readonly {
  value: ThemePreference;
  label: string;
  icon: ReactNode;
}[] = [
  { value: "system", label: "Système", icon: <MonitorIcon /> },
  { value: "light", label: "Clair", icon: <SunIcon /> },
  { value: "dark", label: "Sombre", icon: <MoonIcon /> },
];

export type ThemeToggleProps = {
  /** Show the « Thème de l'application » legend above the control. */
  showLegend?: boolean;
  /**
   * Icons only, with the French label kept for screen readers. For narrow
   * places such as the desktop sidebar, where the words would truncate.
   */
  compact?: boolean;
  className?: string;
};

/**
 * Système / Clair / Sombre. Native radios, so arrow keys work and each option
 * is announced with its French label.
 *
 * The stored preference is read through `useSyncExternalStore`: the server
 * snapshot is "system" (which is what the CSS media query already does), and
 * the real value lands on hydration. The boot script in `app/layout.tsx` has
 * already painted the right theme, so nothing flashes. Switching in one tab
 * also updates the control in the others, via the `storage` event.
 */
export function ThemeToggle({
  showLegend = false,
  compact = false,
  className,
}: ThemeToggleProps) {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    getServerThemePreference,
  );

  return (
    <SegmentedControl<ThemePreference>
      name="fm-theme-preference"
      legend="Thème de l'application"
      hideLegend={!showLegend}
      className={className}
      value={preference}
      onChange={applyThemePreference}
      options={OPTIONS.map((option) => ({
        value: option.value,
        label: (
          <span className="inline-flex items-center gap-1.5">
            {option.icon}
            <span className={compact ? "sr-only" : "truncate"}>
              {option.label}
            </span>
          </span>
        ),
      }))}
    />
  );
}
