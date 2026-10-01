"use client";

/**
 * Declaring an injury: a player for themselves, a coach for anyone (`lib/auth/can.ts` puts
 * `injury:declare` in both sets). The server decides; this form only collects.
 *
 * `useActionState` rather than a bare `<form action>` because there are three things the player
 * can get wrong — a start date in the future, a return before the start, an over-long note — and
 * each deserves to be said next to its field.
 *
 * The `max`/`min` attributes are a courtesy to the native date picker, never the rule:
 * `lib/player/validation.ts` and `declareInjury` re-check both.
 */

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { declareInjury } from "@/lib/player/actions";
import { INJURY_NOTE_MAX } from "@/lib/player/validation";

export type InjuryDeclareFormProps = {
  teamId: string;
  memberId: string;
  /** Today in Paris, `YYYY-MM-DD`. Passed in so the server owns the clock, not the browser. */
  today: string;
  /** Distinct ids per instance: `/moi` and a profile can both render one on the same page. */
  idPrefix?: string;
  isSelf: boolean;
};

export function InjuryDeclareForm({
  teamId,
  memberId,
  today,
  idPrefix = "injury",
  isSelf,
}: InjuryDeclareFormProps) {
  const [state, action, pending] = useActionState(declareInjury, undefined);
  const [startedOn, setStartedOn] = useState(today);

  const startId = `${idPrefix}-startedOn`;
  const returnId = `${idPrefix}-expectedReturnOn`;
  const noteId = `${idPrefix}-note`;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="memberId" value={memberId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor={startId}
          label="Début de la blessure"
          error={state?.fieldErrors?.startedOn}
        >
          {({ id, describedBy, invalid }) => (
            <DateInput
              id={id}
              name="startedOn"
              type="date"
              required
              max={today}
              value={startedOn}
              onChange={(event) => setStartedOn(event.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <Field
          htmlFor={returnId}
          label="Retour prévu"
          optional
          hint="Une estimation suffit."
          error={state?.fieldErrors?.expectedReturnOn}
        >
          {({ id, describedBy, invalid }) => (
            <DateInput
              id={id}
              name="expectedReturnOn"
              type="date"
              min={startedOn || today}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      <Field
        htmlFor={noteId}
        label="Précision"
        optional
        hint={isSelf ? "Ce que tu t’es fait, en une phrase." : "La nature de la blessure."}
        error={state?.fieldErrors?.note}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="note"
            rows={2}
            maxLength={INJURY_NOTE_MAX}
            placeholder="Entorse de la cheville droite."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {state?.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="danger" disabled={pending}>
        {pending
          ? "Enregistrement…"
          : isSelf
            ? "Je me déclare blessé"
            : "Déclarer la blessure"}
      </Button>
    </form>
  );
}
