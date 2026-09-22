/**
 * The injuries card on a player's profile: the current injury, then the history.
 *
 * A Server Component. Resolving is a plain `<form action={resolveInjury}>` with no client state,
 * so it works with JavaScript disabled — the usual rule for the controls a coach needs on the
 * touchline. Only the declaration form is a Client Component, because it has field errors to show.
 *
 * Every derived value (« blessé depuis 9 jours », « la date est passée ») comes from
 * `lib/player/injury.ts`, which is pure and unit-tested. Nothing is computed here.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resolveInjury } from "@/lib/player/actions";
import {
  type InjuryRecord,
  daysBetween,
  formatDateFr,
  formatDayCountFr,
  injuryStatus,
  injurySummaryFr,
  pastInjuries,
} from "@/lib/player/injury";
import { InjuryDeclareForm } from "./injury-declare-form";

export type InjuriesCardProps = {
  teamId: string;
  memberId: string;
  injuries: InjuryRecord[];
  /** Today in Paris, `YYYY-MM-DD`. */
  today: string;
  /** May declare and resolve: the player themselves, or a coach. */
  canManage: boolean;
  isSelf: boolean;
};

export function InjuriesCard({
  teamId,
  memberId,
  injuries,
  today,
  canManage,
  isSelf,
}: InjuriesCardProps) {
  const status = injuryStatus(injuries, today);
  const past = pastInjuries(injuries);

  return (
    <Card title="Blessures" description={injurySummaryFr(injuries, today)}>
      <div className="space-y-6">
        {status.injured ? (
          <div className="space-y-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="danger" solid>
                blessé
              </Badge>
              <p className="text-sm font-medium text-ink">
                Depuis le {formatDateFr(status.injury.startedOn)} (
                {formatDayCountFr(-status.daysSinceStart)})
              </p>
              {status.overdue ? <Badge variant="warning">retour dépassé</Badge> : null}
            </div>

            <p className="text-sm text-ink-muted">
              {status.injury.expectedReturnOn
                ? `Retour prévu le ${formatDateFr(status.injury.expectedReturnOn)} (${formatDayCountFr(
                    status.daysUntilReturn ?? 0,
                  )}).`
                : "Aucun retour estimé."}
            </p>

            {status.injury.note ? (
              <p className="text-sm text-ink">« {status.injury.note} »</p>
            ) : null}

            {status.injury.declaredByName ? (
              <p className="text-xs text-ink-subtle">
                Déclarée par {status.injury.declaredByName}.
              </p>
            ) : null}

            {canManage ? (
              <form
                action={resolveInjury}
                className="flex flex-wrap items-end gap-3 border-t border-danger/30 pt-3"
              >
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="memberId" value={memberId} />
                <input type="hidden" name="injuryId" value={status.injury.id} />
                <Field
                  htmlFor={`resolvedOn-${status.injury.id}`}
                  label="Guéri le"
                  className="min-w-44"
                >
                  {({ id }) => (
                    <Input
                      id={id}
                      name="resolvedOn"
                      type="date"
                      defaultValue={today}
                      min={status.injury.startedOn}
                      max={today}
                    />
                  )}
                </Field>
                <Button type="submit" variant="secondary">
                  {isSelf ? "Je suis remis" : "Marquer comme guérie"}
                </Button>
              </form>
            ) : null}
          </div>
        ) : canManage ? (
          <InjuryDeclareForm
            teamId={teamId}
            memberId={memberId}
            today={today}
            idPrefix={`profil-${memberId}`}
            isSelf={isSelf}
          />
        ) : (
          <p className="text-sm text-ink-muted">Aucune blessure en cours.</p>
        )}

        {past.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Historique</h3>
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {past.map((injury) => (
                <li key={injury.id} className="py-2">
                  <p className="text-sm text-ink">
                    {formatDateFr(injury.startedOn)} → {formatDateFr(injury.resolvedOn ?? today)}{" "}
                    <span className="text-ink-subtle">
                      ({durationFr(injury.startedOn, injury.resolvedOn ?? today)})
                    </span>
                  </p>
                  {injury.note ? (
                    <p className="text-xs text-ink-subtle">« {injury.note} »</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Card>
  );
}

/** « 1 jour d’arrêt », « 18 jours d’arrêt » — inclusive, so a one-day injury reads as one day. */
function durationFr(startedOn: string, resolvedOn: string): string {
  const days = daysBetween(startedOn, resolvedOn) + 1;
  return `${days} jour${days > 1 ? "s" : ""} d’arrêt`;
}
