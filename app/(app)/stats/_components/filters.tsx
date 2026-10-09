/**
 * The competition filter and the squad table's sortable column headers — both plain links.
 *
 * Deliberately not a client component. The filter is a *view of the URL*, so `?competition=<id>` is
 * shareable, survives a reload, and works with no JavaScript at all: the same reasoning as the
 * coach's forms on `/equipe`. `SegmentedControl` would have needed a client parent and an
 * `onChange` handler to do less.
 *
 * Both carry `scroll={false}`: a chip or a header only ever replaces the numbers already under the reader's
 * thumb, and Next scrolls to the top of the document on every navigation unless told not to. Sorting
 * the player list from halfway down the page sent the reader back to the title — the one thing he
 * was not looking at.
 */

import Link from "next/link";

import { cn } from "@/components/ui/cn";
import type { CompetitionOption } from "@/lib/competition/options";
import type { PlayerSortKey } from "@/lib/stats/aggregate";

/** The query keys `/stats` reads. Spelled once so the page and the links cannot drift. */
export const COMPETITION_PARAM = "competition";
export const SORT_PARAM = "tri";

export type StatsQuery = {
  /**
   * A row of the team's own `competitions` table (decision 107), by id and never by label: a coach
   * who renames « Coupe » into « Coupe du Crédit Mutuel » must not break a bookmarked URL.
   */
  competitionId: string | null;
  sort: PlayerSortKey;
};

/** The default sort, and therefore the value that is left out of the URL. */
export const DEFAULT_SORT: PlayerSortKey = "minutes";

/** Builds `/stats?…`, omitting whatever is at its default so the clean URL stays clean. */
export function statsHref(query: StatsQuery): string {
  const params = new URLSearchParams();
  if (query.competitionId !== null) params.set(COMPETITION_PARAM, query.competitionId);
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
 * « Toutes » plus one chip per competition the team has actually played in — the coach's own words
 * now, not four fixed ones (decision 107). `statsFilterOptions` owns which of them earn a chip.
 *
 * Scrolls sideways rather than wrapping: a « Toutes » and a handful of chips do not fit on 320 px,
 * and a second line here would push the whole season below the fold. With a single competition there
 * is nothing to choose between, so the row is not rendered at all.
 */
export function CompetitionFilter({
  query,
  competitions,
}: {
  query: StatsQuery;
  competitions: readonly CompetitionOption[];
}) {
  if (competitions.length < 2) return null;

  return (
    <nav aria-label="Filtrer par compétition" className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex w-max gap-2">
        <Chip
          href={statsHref({ ...query, competitionId: null })}
          active={query.competitionId === null}
        >
          Toutes
        </Chip>
        {competitions.map((competition) => (
          <Chip
            key={competition.id}
            href={statsHref({ ...query, competitionId: competition.id })}
            active={query.competitionId === competition.id}
          >
            {competition.labelFr}
          </Chip>
        ))}
      </div>
    </nav>
  );
}

/** One sortable column of the squad table. */
export type SortColumn = {
  key: PlayerSortKey;
  /** The header as printed. */
  label: string;
  /** The same header in full, for a screen reader: « Min » alone is not a word. */
  spoken: string;
};

/**
 * The squad table's sortable columns, in the order they are printed (decision 178). « Passes », never
 * the two-letter abbreviation (`minutes-table.tsx` says why), and « Min » because the column holds
 * three digits and a 390 px row has no room for the word.
 */
export const SORT_COLUMNS: readonly SortColumn[] = [
  { key: "minutes", label: "Min", spoken: "minutes" },
  { key: "goals", label: "Buts", spoken: "buts" },
  { key: "assists", label: "Passes", spoken: "passes décisives" },
  { key: "rating", label: "Note", spoken: "note" },
];

/**
 * A column header of the squad table that sorts by its column — the same plain link as the chips, so
 * `?tri=` keeps working with no JavaScript and survives a reload. Every sort is descending, best
 * first; the active column says so with `aria-sort` on its `<th>` (set by the table) and a visible ↓,
 * and the others are coloured as the links they are, since nothing is explained on hover (072).
 */
export function SortHeaderLink({ query, column }: { query: StatsQuery; column: SortColumn }) {
  const active = query.sort === column.key;
  return (
    <Link
      href={statsHref({ ...query, sort: column.key })}
      scroll={false}
      className={cn(
        "inline-flex min-h-11 items-center justify-end whitespace-nowrap",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active ? "font-semibold text-ink" : "font-medium text-accent hover:text-ink",
      )}
    >
      {/* Always laid out, visible only on the active column, so a column does not change width when
          the sort moves to it. On the left of the word, so the word's right edge lines up with the
          right-aligned figures under it. */}
      <span aria-hidden="true" className={cn("mr-0.5 w-2.5 text-right", !active && "invisible")}>
        ↓
      </span>
      <span className="sr-only">{active ? "Trié par " : "Trier par "}</span>
      <span aria-hidden="true">{column.label}</span>
      <span className="sr-only">{column.spoken}</span>
    </Link>
  );
}
