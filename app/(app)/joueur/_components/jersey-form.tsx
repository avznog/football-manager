"use client";

/**
 * The jersey number, on a player's profile.
 *
 * Posts to `updateJerseyNumber`, which delegates to the M0 `updateMember`: the clash check
 * (« déjà porté par un coéquipier ») lives there and is not duplicated here. `isPlayer` travels
 * as a hidden field because `updateMember` writes that column too — dropping it would quietly
 * turn a player into staff.
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateJerseyNumber } from "@/lib/player/actions";
import { jerseyHintFr } from "@/lib/player/labels";

export type JerseyFormProps = {
  teamId: string;
  memberId: string;
  jerseyNumber: number | null;
  isPlayer: boolean;
};

export function JerseyForm({ teamId, memberId, jerseyNumber, isPlayer }: JerseyFormProps) {
  const [state, action, pending] = useActionState(updateJerseyNumber, undefined);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="isPlayer" value={isPlayer ? "true" : "false"} />

      <Field
        htmlFor="jerseyNumber"
        label="Numéro de maillot"
        optional
        hint={jerseyHintFr(isPlayer)}
        error={state?.fieldErrors?.jerseyNumber}
        className="min-w-40"
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="jerseyNumber"
            type="number"
            min={1}
            max={99}
            step={1}
            inputMode="numeric"
            defaultValue={jerseyNumber ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
            className="w-28 tabular-nums"
          />
        )}
      </Field>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>

      {state?.error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
