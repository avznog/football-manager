/**
 * The four controls of `/stats/equipe-type` — criterion, direction, shape, competition — and not one
 * of them is state.
 *
 * Every one is a `<Link>` that rewrites the query string, exactly like `/stats`'s own filters, for the
 * same three reasons: the URL is shareable (« regarde le pire sept sur les notes »), it survives a
 * reload, and the screen works with JavaScript off. A `SegmentedControl` here would have needed a
 * client parent and an `onChange` to do strictly less.
 *
 * `scroll={false}` on all of them (decision 100). A chip replaces the numbers under the reader's
 * thumb; without it Next scrolls back to the document title, which is the one thing he was not
 * looking at.
 *
 * The chips are `min-h-11` — 44 px — rather than `/stats`'s `min-h-9`. There are three rows of them
 * here instead of one, they are the only way to change what the pitch says, and 36 px is under the tap
 * floor this project measures against.
 */

import Link from "next/link";

import { cn } from "@/components/ui/cn";
import type { CompetitionOption } from "@/lib/competition/options";
import { BEST_SEVEN_CRITERIA } from "@/lib/stats/best-seven";
import {
  CRITERION_CHIP_FR,
  type BestSevenDirection,
  type BestSevenQuery,
  equipeTypeHref,
} from "@/lib/stats/best-seven-copy";

const CHIP_BASE =
  "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap " +
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
      // The colour alone says nothing to a screen reader; `aria-current` is what names the choice.
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

/** One horizontal, sideways-scrolling row. Four criteria do not fit on 320 px, and a second line
 * would push the pitch below the fold. */
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex w-max gap-2">{children}</div>
    </nav>
  );
}

const DIRECTION_CHIP_FR: Readonly<Record<BestSevenDirection, string>> = {
  best: "La meilleure",
  worst: "La pire",
};

export function SevenControls({
  query,
  competitions,
  formations,
  mostUsedLabel,
}: {
  query: BestSevenQuery;
  competitions: readonly CompetitionOption[];
  /**
   * The shapes the team has actually played, most-used first — `getFormationUsage().formations`.
   * Never the whole catalogue: a chip for a shape nobody has ever played would invite a seven laid out
   * on a formation this team does not use.
   */
  formations: readonly { formationId: string; label: string }[];
  /** The shape chosen when nothing overrides it, named on the « Forme la plus jouée » chip. */
  mostUsedLabel: string | null;
}) {
  return (
    <div className="space-y-2">
      {/* One criterion at a time, on purpose: a seven that mixed goals and notes would be ranked on
          a scale nobody could name, and rule 1 of `best-seven.ts` is that every criterion is its own
          rate. */}
      <ChipRow label="Choisir le critère">
        {BEST_SEVEN_CRITERIA.map((criterion) => (
          <Chip
            key={criterion}
            href={equipeTypeHref({ ...query, criterion })}
            active={query.criterion === criterion}
          >
            {CRITERION_CHIP_FR[criterion]}
          </Chip>
        ))}
      </ChipRow>

      {/* Rule 6: the worst seven is the best seven of the negated criterion, so it costs one chip and
          it is the half of the truth a « meilleure équipe » screen normally hides. */}
      <ChipRow label="Meilleure ou pire équipe">
        {(["best", "worst"] as const).map((direction) => (
          <Chip
            key={direction}
            href={equipeTypeHref({ ...query, direction })}
            active={query.direction === direction}
          >
            {DIRECTION_CHIP_FR[direction]}
          </Chip>
        ))}
      </ChipRow>

      {formations.length > 1 ? (
        <ChipRow label="Choisir la forme">
          <Chip
            href={equipeTypeHref({ ...query, formationId: null })}
            active={query.formationId === null}
          >
            {mostUsedLabel === null ? "Forme la plus jouée" : `${mostUsedLabel} (la plus jouée)`}
          </Chip>
          {formations.map((formation) => (
            <Chip
              key={formation.formationId}
              href={equipeTypeHref({ ...query, formationId: formation.formationId })}
              active={query.formationId === formation.formationId}
            >
              {formation.label}
            </Chip>
          ))}
        </ChipRow>
      ) : null}

      {/* Kept working across this screen, as on `/stats`: a seven of the championship is a different
          claim from a seven of the season, and decision 107 keys it by id so a rename cannot break a
          bookmark. */}
      {competitions.length > 1 ? (
        <ChipRow label="Filtrer par compétition">
          <Chip
            href={equipeTypeHref({ ...query, competitionId: null })}
            active={query.competitionId === null}
          >
            Toutes
          </Chip>
          {competitions.map((competition) => (
            <Chip
              key={competition.id}
              href={equipeTypeHref({ ...query, competitionId: competition.id })}
              active={query.competitionId === competition.id}
            >
              {competition.labelFr}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
    </div>
  );
}
