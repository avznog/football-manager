/**
 * What a planned composition changes, in French: « Ali → Momo, Karim passe MC → AT ».
 *
 * A coach plans **teams**, not substitutions (decision 006), so the changes are never typed in:
 * they are deduced by diffing the plan against the composition in force just before it. The diff
 * itself is `lib/match/lineup.ts`, the choice of which two teams to compare is
 * `lib/composition/plan.ts`, and this file only decides what it looks like.
 *
 * Pure presentation, no state — it renders from the editor (a client component) and from the list
 * of compositions (a Server Component) unchanged.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import type { DeducedChanges } from "@/lib/composition/plan";

export type ChangeLinesProps = {
  lines: readonly string[];
  className?: string;
};

/** The bare list, for a card that already has a heading. */
export function ChangeLines({ lines, className }: ChangeLinesProps) {
  if (lines.length === 0) {
    return <p className={cn("text-sm text-ink-muted", className)}>Aucun changement.</p>;
  }

  return (
    <ul className={cn("space-y-1", className)}>
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2 text-sm text-ink">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

export type PlanChangesProps = {
  changes: DeducedChanges;
  /** « Composition de départ », or null when this is the first composition of the match. */
  previousTitleFr: string | null;
  /** Non-blocking problems: a player dropped from the sheet, someone injured. */
  warningsFr?: readonly string[];
  className?: string;
};

export function PlanChanges({
  changes,
  previousTitleFr,
  warningsFr = [],
  className,
}: PlanChangesProps) {
  const substitutions = changes.substitutions.length;
  const moves = changes.positionChanges.length;

  return (
    <Card
      title="Changements déduits"
      description={
        previousTitleFr
          ? `Par rapport à : ${previousTitleFr.toLocaleLowerCase("fr-FR")}`
          : "Première composition du match : il n’y a rien à comparer."
      }
      action={
        substitutions + moves > 0 ? (
          <Badge variant="accent">{countLabelFr(substitutions, moves)}</Badge>
        ) : null
      }
      className={className}
    >
      <div className="space-y-3">
        {previousTitleFr ? (
          <ChangeLines lines={changes.lines} />
        ) : (
          <p className="text-sm text-ink-muted">
            Les changements apparaîtront sur les compositions suivantes.
          </p>
        )}

        {warningsFr.length > 0 ? (
          <ul className="space-y-1 rounded-xl bg-warning/10 p-3">
            {warningsFr.map((warning) => (
              <li key={warning} className="flex items-start gap-2 text-sm font-medium text-warning">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="mt-0.5 size-4 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-.75-11.5h1.5v6h-1.5v-6Zm0 7.75h1.5v1.5h-1.5v-1.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

/** « 2 changements », « 1 changement · 1 repositionnement ». */
function countLabelFr(substitutions: number, moves: number): string {
  const parts: string[] = [];
  if (substitutions > 0) {
    parts.push(substitutions === 1 ? "1 changement" : `${substitutions} changements`);
  }
  if (moves > 0) {
    parts.push(moves === 1 ? "1 repositionnement" : `${moves} repositionnements`);
  }
  return parts.join(" · ");
}
