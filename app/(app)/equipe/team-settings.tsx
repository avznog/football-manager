"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateTeam } from "@/lib/team/actions";

/**
 * Renaming the team and setting its two kit colours. Coach only; `updateTeam` re-checks that
 * (invariant 4) and takes the `teamId` from this form rather than from the active-team cookie.
 *
 * The colours are not decoration: the discs on the pitch are drawn in them, and the team header
 * carries the primary (decision 011). Until this card existed they could only be set at the moment
 * the team was created, which meant in practice never.
 */
export function TeamSettings({
  teamId,
  name,
  primaryColor,
  secondaryColor,
}: {
  teamId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  const [state, action] = useActionState(updateTeam, undefined);

  return (
    <Card
      title="Réglages de l’équipe"
      description="Le nom et les couleurs du maillot, celles des joueurs sur le terrain."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="teamId" value={teamId} />

        {state?.error ? (
          <p
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {state.error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Nom de l’équipe
          <input
            name="name"
            type="text"
            defaultValue={name}
            required
            maxLength={60}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          {state?.fieldErrors?.name ? (
            <span className="text-sm font-normal text-danger">{state.fieldErrors.name[0]}</span>
          ) : null}
        </label>

        <div className="flex flex-wrap gap-4">
          <ColorField
            label="Couleur principale"
            name="primaryColor"
            value={primaryColor}
            error={state?.fieldErrors?.primaryColor?.[0]}
          />
          <ColorField
            label="Couleur secondaire"
            name="secondaryColor"
            value={secondaryColor}
            error={state?.fieldErrors?.secondaryColor?.[0]}
          />
        </div>

        <SaveButton />
      </form>
    </Card>
  );
}

/**
 * `<input type="color">` ignores padding and sizing rules in several mobile browsers, so it gets a
 * fixed square of its own rather than the full-width treatment the text inputs use.
 */
function ColorField({
  label,
  name,
  value,
  error,
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      <input
        name={name}
        type="color"
        defaultValue={value}
        className="h-11 w-20 cursor-pointer rounded-lg border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      {error ? <span className="text-sm font-normal text-danger">{error}</span> : null}
    </label>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} fullWidth>
      {pending ? "Enregistrement…" : "Enregistrer"}
    </Button>
  );
}
