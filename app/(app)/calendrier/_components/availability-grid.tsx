/**
 * Who has said what, for the whole squad.
 *
 * Grouped by answer rather than listed alphabetically: the coach's question is never "what did
 * Mehdi say", it is "how many do I have, and who do I still have to chase". Within a group the
 * order is the squad order (`getSquad`: coaches first, then shirt numbers).
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AvailabilityStatus } from "@/db/schema";
import { availabilityCountFr } from "@/lib/calendar/labels";
import type { AvailabilityTally, Responder } from "@/lib/calendar/timeline";

type GroupKey = AvailabilityStatus | "pending";

const GROUPS: readonly {
  key: GroupKey;
  label: string;
  variant: "success" | "warning" | "danger" | "neutral";
}[] = [
  { key: "yes", label: "Dispo", variant: "success" },
  { key: "maybe", label: "Peut-être", variant: "warning" },
  { key: "no", label: "Pas dispo", variant: "danger" },
  { key: "pending", label: "Sans réponse", variant: "neutral" },
];

export type AvailabilityGridProps = {
  tally: AvailabilityTally;
  /** Optional « je finis le boulot à 10h », keyed by membership id. Matches only. */
  notes?: ReadonlyMap<string, string | null>;
  /** Highlights the viewer's own line, so they can see their answer landed. */
  selfMembershipId?: string | null;
  /**
   * The event has kicked off. The list is then a record of what people answered beforehand and not a
   * question anybody can still act on, so it says so — and the match page moves the card below the
   * things that can still be done.
   */
  past?: boolean;
};

export function AvailabilityGrid({
  tally,
  notes,
  selfMembershipId,
  past = false,
}: AvailabilityGridProps) {
  const count = availabilityCountFr(tally.answered, tally.total);
  return (
    <Card
      title="Disponibilités"
      description={past ? `Avant le match · ${count}` : count}
      flush
    >
      <div className="divide-y divide-border/60">
        {GROUPS.map((group) => {
          const players: Responder[] = tally[group.key];
          if (players.length === 0) return null;

          return (
            <section key={group.key} className="px-4 py-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Badge variant={group.variant}>{group.label}</Badge>
                <span className="text-ink-muted tabular-nums">{players.length}</span>
              </h3>
              <ul className="space-y-1">
                {players.map((player) => {
                  const note = notes?.get(player.membershipId) ?? null;
                  const isSelf = player.membershipId === selfMembershipId;
                  return (
                    <li key={player.membershipId} className="text-sm">
                      <Link
                        href={`/joueur/${player.membershipId}`}
                        className="inline-flex min-h-8 items-center rounded font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {player.displayName}
                        {isSelf ? <span className="ml-1 text-ink-subtle">(toi)</span> : null}
                      </Link>
                      {note ? <span className="ml-2 text-ink-subtle">« {note} »</span> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
