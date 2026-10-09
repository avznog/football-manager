"use client";

/**
 * The preferred-positions card on a player's profile.
 *
 * `PositionPicker` is controlled and knows nothing about the database
 * (`components/pitch/README.md`), so this component owns the selection and persists it through
 * `updatePlayerPositions`. The tap cycle itself stays in `lib/pitch/preferences.ts` — nothing
 * here re-implements the « at most one primary » rule.
 *
 * The selection is posted as an ordinary set of hidden fields (`primary`, then one `secondary`
 * per position), not a JSON body, so the Server Action reads a plain `FormData`.
 *
 * The positions are **the coach's to set** (decision 163): the editable card is a coach's view of
 * any player, and everybody else — the player himself included — gets the read-only one. They are
 * indicative, and read by the équipe type; compositions and game mode no longer show them.
 *
 * Read-only mode renders the very same picker with `readOnly`: the identical shapes and legend, just
 * no save button. Worth the client bundle — a second, static rendering of the pitch would be one
 * more thing to keep visually in sync. It has to say who sets them: a dead pitch with no explanation
 * reads as a bug, and a player looking at his own card needs to know whom to ask.
 */

import { useActionState, useState } from "react";

import { PositionPicker } from "@/components/pitch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorsUnder } from "@/lib/auth/validation";
import {
  type PositionSelection,
  primaryPosition,
  selectedPositions,
} from "@/lib/pitch/preferences";
import { updatePlayerPositions } from "@/lib/player/actions";
import {
  type PreferredPosition,
  positionsSummaryFr,
  selectionsEqual,
  toSelection,
} from "@/lib/player/positions";

export type PositionsEditorProps = {
  teamId: string;
  /** `team_members.id` of the player being looked at. */
  memberId: string;
  /** What is stored today. The parent keys this component on it, so a save resets the state. */
  positions: PreferredPosition[];
  canEdit: boolean;
};

export function PositionsEditor({
  teamId,
  memberId,
  positions,
  canEdit,
}: PositionsEditorProps) {
  // Computed once per mount: the parent remounts us with `key={positionsSignature(...)}` when the
  // server value changes, which is cheaper to reason about than syncing state in an effect.
  const [saved] = useState<PositionSelection>(() => toSelection(positions));
  const [selection, setSelection] = useState<PositionSelection>(saved);
  const [state, action, pending] = useActionState(updatePlayerPositions, undefined);

  const dirty = !selectionsEqual(selection, saved);
  const primary = primaryPosition(selection);
  const secondary = selectedPositions(selection).filter((code) => code !== primary);

  if (!canEdit) {
    return (
      <Card
        title="Postes préférés"
        description={positionsSummaryFr(positions)}
      >
        {/* `readOnly`, not `disabled`: these positions are not this reader's to change, which is a
            different fact from « a save is in flight » and is what the picker's copy follows. */}
        <PositionPicker value={saved} onChange={() => {}} readOnly />
        {/* Why the pitch is dead, said once, under it — to the player looking at his own card as much
            as to a teammate: the coach sets them, so that is whom to ask. Same styling as the
            editor's own status line. */}
        <p className="mt-3 text-sm text-ink-muted">Ce sont les coachs qui indiquent les postes.</p>
      </Card>
    );
  }

  return (
    <Card
      title="Postes préférés"
      description="Appuie sur un poste : secondaire, puis principal, puis retiré."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="primary" value={primary ?? ""} />
        {secondary.map((code) => (
          <input key={code} type="hidden" name="secondary" value={code} />
        ))}

        <PositionPicker value={selection} onChange={setSelection} disabled={pending} />

        {state?.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <FieldError>{fieldErrorsUnder(state?.fieldErrors, "primary", "secondary")}</FieldError>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!dirty || pending}>
            {pending ? "Enregistrement…" : "Enregistrer les postes"}
          </Button>
          {dirty && !pending ? (
            <Button type="button" variant="ghost" onClick={() => setSelection(saved)}>
              Annuler
            </Button>
          ) : null}
          <p aria-live="polite" className="text-sm text-ink-muted">
            {dirty ? "Modifications non enregistrées." : "À jour."}
          </p>
        </div>
      </form>
    </Card>
  );
}
