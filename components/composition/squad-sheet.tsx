"use client";

/**
 * The match sheet: titulaire / remplaçant / supporter, for the whole squad in one save.
 *
 * One submit for thirteen players, deliberately (`docs/PLAN.md`, screen 3). At the side of a pitch
 * on a phone, thirteen round trips are thirteen chances to lose the connection half way through a
 * selection, and the coach thinks « voilà mon groupe », not « Hugo est titulaire, enregistrer ».
 *
 * Built on `SegmentedControl`, so it is native radios: `FormData` carries the answers with no
 * JavaScript of its own, arrow keys work, and a screen reader reads a real radio group. The four
 * segments are abbreviated on screen and spelled out for assistive technology — four full French
 * words do not fit across a 320 px phone, and truncating « Remplaçant » to « Rempl… » in the
 * accessible name would be worse than showing it.
 *
 * A player who is already in a confirmed composition cannot be taken off the sheet: the match has
 * happened. The two segments that would drop him are disabled here and refused again in
 * `setMatchSquad` — the disabled attribute is a courtesy, the action is the rule.
 */

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError } from "@/components/ui/field-error";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented-control";
import type { AvailabilityStatus } from "@/db/schema";
import { AVAILABILITY_LABELS } from "@/lib/calendar/labels";
import { setMatchSquad } from "@/lib/composition/actions";
import { countSquadRoles, squadRoleLabelFr, squadSummaryFr } from "@/lib/composition/plan";
import type { SquadMark } from "@/lib/composition/validation";

/** A squad member as the sheet needs him. A `CompositionMember` fits, plus his availability. */
export type SheetMember = {
  membershipId: string;
  name: string;
  jerseyNumber: number | null;
  squadRole: "starter" | "substitute" | "supporter" | null;
  isInjured: boolean;
  primaryPositionLabelFr: string | null;
  /** What he answered on the availability screen, if anything. */
  availability: AvailabilityStatus | null;
};

export type SquadSheetProps = {
  teamId: string;
  matchId: string;
  members: readonly SheetMember[];
  /** False for a player looking at the sheet: the controls become plain labels. */
  canEdit: boolean;
  /** `team_members.id` of players already fielded in a confirmed composition. */
  lockedMemberIds?: readonly string[];
  /** The match is over — the sheet is frozen, even for a coach. */
  frozen?: boolean;
  /** Set after a save, to say so without a toast. */
  justSaved?: boolean;
};

const MARK_OPTIONS: readonly { value: SquadMark; short: string; full: string; tone: SegmentOption<SquadMark>["tone"] }[] = [
  { value: "starter", short: "Titu.", full: "Titulaire", tone: "success" },
  { value: "substitute", short: "Rempl.", full: "Remplaçant", tone: "accent" },
  { value: "supporter", short: "Supp.", full: "Supporter", tone: "warning" },
  { value: "none", short: "—", full: "Non retenu", tone: "danger" },
];

export function SquadSheet({
  teamId,
  matchId,
  members,
  canEdit,
  lockedMemberIds = [],
  frozen = false,
  justSaved = false,
}: SquadSheetProps) {
  const [state, action, pending] = useActionState(setMatchSquad, undefined);

  const counts = countSquadRoles(members);
  const locked = new Set(lockedMemberIds);
  const editable = canEdit && !frozen;

  if (members.length === 0) {
    return (
      <Card title="Feuille de match">
        <EmptyState
          title="Aucun joueur dans l’effectif"
          description="Invite tes joueurs, puis reviens composer le groupe."
        />
      </Card>
    );
  }

  const summary = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={counts.starters === 7 ? "success" : "warning"}>
        {counts.starters} / 7 titulaires
      </Badge>
      <span className="text-sm text-ink-muted">{squadSummaryFr(counts)}</span>
    </div>
  );

  if (!editable) {
    return (
      <Card
        title="Feuille de match"
        description={frozen ? "Le match est terminé : la feuille ne change plus." : undefined}
      >
        <div className="space-y-3">
          {summary}
          <ul className="divide-y divide-border/60">
            {members.map((member) => (
              <li key={member.membershipId} className="flex items-center justify-between gap-3 py-2">
                <MemberIdentity member={member} />
                <Badge variant={member.squadRole === null ? "neutral" : "accent"}>
                  {squadRoleLabelFr(member.squadRole)}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Feuille de match"
      description="Qui joue, qui est sur le banc, qui vient encourager. Un seul enregistrement."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="matchId" value={matchId} />

        {summary}

        <ul className="space-y-3">
          {members.map((member) => {
            const isLocked = locked.has(member.membershipId);
            return (
              <li key={member.membershipId} className="space-y-1.5 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <MemberIdentity member={member} />
                  {isLocked ? <Badge variant="accent">déjà entré en jeu</Badge> : null}
                </div>
                <SegmentedControl<SquadMark>
                  name={`role:${member.membershipId}`}
                  legend={`Rôle de ${member.name} sur la feuille de match`}
                  defaultValue={member.squadRole ?? "none"}
                  disabled={pending}
                  options={MARK_OPTIONS.map((option) => ({
                    value: option.value,
                    tone: option.tone,
                    // A locked player may be moved between the pitch and the bench, never off.
                    disabled:
                      isLocked && option.value !== "starter" && option.value !== "substitute",
                    label: (
                      <>
                        <span aria-hidden="true">{option.short}</span>
                        <span className="sr-only">{option.full}</span>
                      </>
                    ),
                  }))}
                />
              </li>
            );
          })}
        </ul>

        {state?.error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        <FieldError>{state?.fieldErrors?.marks}</FieldError>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" pending={pending}>
            Enregistrer la feuille
          </Button>
          <p aria-live="polite" className="text-sm text-ink-muted">
            {justSaved ? "Feuille enregistrée." : "Tout est enregistré d’un coup."}
          </p>
        </div>
      </form>
    </Card>
  );
}

function MemberIdentity({ member }: { member: SheetMember }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-7 shrink-0 text-right font-mono text-sm font-semibold text-ink-muted tabular-nums">
        {member.jerseyNumber ?? "—"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{member.name}</span>
        <span className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
          {member.primaryPositionLabelFr ? <span>{member.primaryPositionLabelFr}</span> : null}
          {member.availability ? (
            <Badge variant={availabilityVariant(member.availability)}>
              {AVAILABILITY_LABELS[member.availability]}
            </Badge>
          ) : (
            <Badge variant="neutral">Sans réponse</Badge>
          )}
          {member.isInjured ? <Badge variant="danger">Blessé</Badge> : null}
        </span>
      </span>
    </div>
  );
}

function availabilityVariant(status: AvailabilityStatus): "success" | "danger" | "warning" {
  if (status === "yes") return "success";
  if (status === "no") return "danger";
  return "warning";
}
