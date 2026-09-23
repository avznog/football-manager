/**
 * « Homme du match » — derived from the ratings, never stored (decision 007, `docs/DATA_MODEL.md`).
 *
 * The second half of the one celebratory moment: an accent-tinted card with a trophy and the name.
 * A tie shows **both** names rather than inventing a winner, and when nobody has enough notes the
 * card says so instead of crowning whoever one teammate happened to like.
 */

import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { pluralize } from "@/lib/calendar/labels";
import type { ManOfTheMatchView } from "@/lib/rating/queries";

function Trophy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
      <path d="M7 6H4.5A2.5 2.5 0 0 0 7 9M17 6h2.5A2.5 2.5 0 0 1 17 9" strokeLinecap="round" />
      <path d="M12 14v3m-3 3h6" strokeLinecap="round" />
    </svg>
  );
}

export function ManOfTheMatchCard({
  manOfTheMatch,
  minRatings,
}: {
  manOfTheMatch: ManOfTheMatchView | null;
  minRatings: number;
}) {
  if (!manOfTheMatch) {
    return (
      <Card title="Homme du match" as="h2">
        <p className="text-sm text-ink-muted">
          Pas encore assez de notes : il en faut au moins {minRatings} sur un même joueur pour
          désigner un homme du match.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title={manOfTheMatch.tied ? "Hommes du match" : "Homme du match"}
      as="h2"
      className="border-accent/40 bg-accent/10"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent [&>svg]:size-6"
        >
          <Trophy />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          {manOfTheMatch.members.map((member) => (
            <p key={member.memberId} className="flex items-center gap-2">
              <Avatar name={member.displayName} size="sm" />
              <span className="truncate text-base font-semibold text-ink">
                {member.displayName}
              </span>
            </p>
          ))}
          <p className="text-sm text-ink-muted">
            <span className="font-mono font-semibold text-ink tabular-nums">
              {manOfTheMatch.averageLabel}
            </span>{" "}
            de moyenne sur {pluralize(manOfTheMatch.count, "note")}
            {manOfTheMatch.tied ? " — ex æquo" : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}
