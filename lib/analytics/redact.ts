/**
 * Redaction of the URLs Vercel Web Analytics sends.
 *
 * Web Analytics records the **literal pathname** of every page view, and this app's URLs carry
 * identifiers: `/match/<uuid>/recap`, `/joueur/<uuid>`. Left alone, the dashboard fills with the
 * primary keys of a dozen amateur footballers — a leak of our own data into a third-party dashboard,
 * and useless on top of it, since a row per match aggregates nothing. What we actually want to read
 * is the route pattern: how often anybody opens *a* recap, not which one.
 *
 * So `<Analytics />` gets a `beforeSend` that rewrites the path into its Next route pattern before
 * the beacon leaves the browser. Speed Insights needs none of this: its `/next` entry point derives
 * the route itself from `useParams()` and reports `/match/[id]/jeu` already.
 *
 * Everything here is pure, exported and tested on purpose. A redaction that silently stops matching
 * is worse than no redaction at all — it leaks while looking like it does not — and the two ways
 * that happens are a new dynamic segment nobody taught it about and a new *static* route in a
 * dynamic position (`/match/nouveau` must stay `/match/nouveau`, not become `/match/[id]`).
 * `redact.test.ts` walks `app/` on disk to pin both, rather than restating the route tree by hand.
 */

/**
 * Parent segment → the placeholder its child carries in the route pattern.
 *
 * Keyed on the parent rather than on the shape of the value: matching ids by shape (a UUID, a run
 * of digits) would quietly stop redacting the day an id looked like something else, which is the
 * failure mode that leaks. A position in the path cannot change under us without `app/` changing.
 */
const DYNAMIC_CHILDREN: Record<string, string> = {
  joueur: "[id]",
  match: "[id]",
  composition: "[lineupId]",
};

/**
 * Segments that sit in a dynamic position and are nonetheless routes of their own.
 *
 * `app/(app)/match/nouveau` and `app/(app)/match/[id]/composition/nouvelle` are static pages that
 * share a parent with a dynamic segment, so positional redaction would turn both into placeholders
 * and lose the two most interesting pages in the app — creating a match and composing a lineup.
 */
const STATIC_SIBLINGS: Record<string, readonly string[]> = {
  match: ["nouveau"],
  composition: ["nouvelle"],
};

/** The tables above, exported for the test that checks them against `app/` on disk. */
export const ROUTE_PATTERNS = { DYNAMIC_CHILDREN, STATIC_SIBLINGS } as const;

/**
 * Replaces every identifier-carrying segment of a pathname with its route placeholder.
 *
 * `/match/5f3c4ee3-…/recap` → `/match/[id]/recap`. A path with nothing dynamic in it comes back
 * unchanged, and so does one whose dynamic position holds a static sibling.
 */
export function redactPathname(pathname: string): string {
  const segments = pathname.split("/");

  return segments
    .map((segment, i) => {
      const parent = segments[i - 1];
      if (!segment || !parent) return segment;
      const placeholder = DYNAMIC_CHILDREN[parent];
      if (!placeholder) return segment;
      if (STATIC_SIBLINGS[parent]?.includes(segment)) return segment;
      return placeholder;
    })
    .join("/");
}

/**
 * The same, over whatever `beforeSend` hands us.
 *
 * The event's `url` is an absolute href in the browser, but the type says `string` and nothing
 * stops the script from passing a bare path, so both are handled: a value `URL` cannot parse is
 * treated as a pathname. The query string is left alone — no route in this app carries an id in
 * one — and a URL that cannot be read at all is returned untouched rather than dropped.
 */
export function redactAnalyticsUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = redactPathname(parsed.pathname);
    return parsed.toString();
  } catch {
    return url.startsWith("/") ? redactPathname(url) : url;
  }
}
