/**
 * The competition filter and the sort control — both plain links.
 *
 * Deliberately not a client component. The filter is a *view of the URL*, so `?competition=cup` is
 * shareable, survives a reload, and works with no JavaScript at all: the same reasoning as the
 * coach's forms on `/equipe`. `SegmentedControl` would have needed a client parent and an
 * `onChange` handler to do less.
 *
 * Both carry `scroll={false}`: a chip only ever replaces the numbers already under the reader's
 * thumb, and Next scrolls to the top of the document on every navigation unless told not to. Sorting
 * the player list from halfway down the page sent the reader back to the title — the one thing he
 * was not looking at.
 */

import Link from "next/link";

import { cn } from "@/components/ui/cn";
import type { Competition } from "@/db/schema";
import { COMPETITION_LABELS, COMPETITION_ORDER } from "@/lib/calendar/labels";
import type { PlayerSortKey } from "@/lib/stats/aggregate";

/** The query keys `/stats` reads. Spelled once so the page and the links cannot drift. */
export const COMPETITION_PARAM = "competition";
export const SORT_PARAM = "tri";

export type StatsQuery = {
  competition: Competition | null;
  sort: PlayerSortKey;
};

/** The default sort, and therefore the value that is left out of the URL. */
export const DEFAULT_SORT: PlayerSortKey = "minutes";

/** Builds `/stats?…`, omitting whatever is at its default so the clean URL stays clean. */
export function statsHref(query: StatsQuery): string {
  const params = new URLSearchParams();
  if (query.competition !== null) params.set(COMPETITION_PARAM, query.competition);
  if (query.sort !== DEFAULT_SORT) params.set(SORT_PARAM, query.sort);
  const search = params.toString();
  return search === "" ? "/stats" : `/stats?${search}`;
}

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap " +
  "ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent";

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      // `aria-current` is what tells a screen reader which filter is on; the colour alone would not.
      aria-current={active ? "true" : undefined}
      className={cn(
        CHIP_BASE,
        active
          ? "bg-accent text-accent-ink ring-accent"
          : "bg-surface text-ink-muted ring-border/60 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * « Toutes / Championnat / Coupe / Amical / Tournoi ».
 *
 * Scrolls sideways rather than wrapping: four chips and a « Toutes » do not fit on 320 px, and a
 * second line here would push the whole season below the fold.
 */
export function CompetitionFilter({ query }: { query: StatsQuery }) {
  return (
    <nav aria-label="Filtrer par compétition" className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex w-max gap-2">
        <Chip
          href={statsHref({ ...query, competition: null })}
          active={query.competition === null}
        >
          Toutes
        </Chip>
        {COMPETITION_ORDER.map((competition) => (
          <Chip
            key={competition}
            href={statsHref({ ...query, competition })}
            active={query.competition === competition}
          >
            {COMPETITION_LABELS[competition]}
          </Chip>
        ))}
      </div>
    </nav>
  );
}

const SORT_LABELS: Record<PlayerSortKey, string> = {
  minutes: "Minutes",
  goals: "Buts",
  assists: "Passes déc.",
  rating: "Note",
  attendance: "Présence",
};

export const SORT_OPTIONS: readonly PlayerSortKey[] = [
  "minutes",
  "goals",
  "assists",
  "rating",
  "attendance",
];

/** How the player list is ordered. Same link-based approach, scoped to the list it sorts. */
export function SortTabs({ query }: { query: StatsQuery }) {
  return (
    <nav aria-label="Trier les joueurs" className="-mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-1.5">
        {SORT_OPTIONS.map((sort) => {
          const active = query.sort === sort;
          return (
            <Link
              key={sort}
              href={statsHref({ ...query, sort })}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "bg-surface-2 text-ink ring-1 ring-border/60 ring-inset"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {SORT_LABELS[sort]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** The label of a sort key, for the emphasised column of the player list. */
export function sortLabel(sort: PlayerSortKey): string {
  return SORT_LABELS[sort];
}
