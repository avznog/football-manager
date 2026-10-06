"use client";

/**
 * The flocage — the name printed on the shirt — on a member's profile.
 *
 * A separate form from `JerseyForm`, because it is a separate permission: the number is handed out by
 * the coach (`member:update`, and it has to be unique in the squad) while the name on the back is the
 * player's own (`profile:editShirtName`). One form posting both would have to be shown to whoever may
 * change the more restricted of the two, which is how a player ends up unable to touch his own
 * nickname.
 *
 * `updateShirtName` writes that one column and nothing else, so unlike `JerseyForm` there is no
 * hidden `isPlayer` to carry: there is no neighbouring column to clobber.
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateShirtName } from "@/lib/player/actions";
import { shirtNameHintFr } from "@/lib/player/shirt";

export type ShirtNameFormProps = {
  teamId: string;
  memberId: string;
  shirtName: string | null;
  isPlayer: boolean;
  /** The reader is this member: the hint says « ton dos » rather than « son dos ». */
  isSelf: boolean;
};

export function ShirtNameForm({
  teamId,
  memberId,
  shirtName,
  isPlayer,
  isSelf,
}: ShirtNameFormProps) {
  const [state, action, pending] = useActionState(updateShirtName, undefined);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="memberId" value={memberId} />

      <Field
        htmlFor="shirtName"
        label="Nom sur le maillot"
        optional
        hint={shirtNameHintFr(isPlayer, isSelf)}
        error={state?.fieldErrors?.shirtName}
        /* `min-w-40` like the jersey field, not wider: at 390 px the card has ~358 px inside it, and
           a wider floor would make the button wrap the moment it says « Enregistrement… » — a layout
           that moves under the thumb that just tapped it. `flex-1` still gives the input the rest. */
        className="min-w-40 flex-1"
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="shirtName"
            type="text"
            /* No `maxLength`: the flocage has no ceiling any more (owner's instruction, 2026-10-06),
               and an attribute capping it here would silently swallow the keystrokes past the limit
               with nothing to explain why. */
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            /* What was typed, not the uppercased display: the field is for editing the stored
               value, and re-showing it in capitals would rewrite it on the next save. */
            defaultValue={shirtName ?? ""}
            placeholder="MOMO"
            aria-describedby={describedBy}
            invalid={invalid}
            className="uppercase"
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
