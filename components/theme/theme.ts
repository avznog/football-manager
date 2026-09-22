/**
 * Theme preference, shared by the inline boot script in `app/layout.tsx` and
 * the toggle in `theme-toggle.tsx`. The two MUST stay in sync — see the theme
 * strategy comment at the top of `app/globals.css`.
 *
 *   "dark"   → `<html class="dark">`,  color-scheme: dark
 *   "light"  → `<html class="light">`, color-scheme: light
 *   "system" → no class at all, so the `prefers-color-scheme` media query in
 *              globals.css decides and an OS change applies live.
 */

export const THEME_STORAGE_KEY = "fm-theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Reads the stored preference. Falls back to "system" on anything unexpected. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Private browsing, or storage disabled.
    return "system";
  }
}

const listeners = new Set<() => void>();

/**
 * Subscribes to preference changes, for `useSyncExternalStore`. Also listens to
 * `storage`, so switching the theme in one tab updates the others.
 */
export function subscribeThemePreference(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Server snapshot: "system" is what the CSS media query already does. */
export function getServerThemePreference(): ThemePreference {
  return "system";
}

/** Applies the preference to `<html>` and persists it. */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  if (preference === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else if (preference === "light") {
    root.classList.add("light");
    root.style.colorScheme = "light";
  } else {
    root.style.colorScheme = "light dark";
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisting is acceptable; the session still looks right.
  }

  for (const listener of listeners) listener();
}
