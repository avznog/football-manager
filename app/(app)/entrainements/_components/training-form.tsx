"use client";

/**
 * The coach's training form, shared by « nouveau » and « modifier ».
 *
 * Same shape as `MatchForm`: a plain `<form>` on a Server Action, wrapped in `useActionState` so
 * the French validation messages land next to the field that produced them. `startsAt` submits a
 * bare wall clock which the action reads as Europe/Paris.
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTraining, updateTraining } from "@/lib/training/actions";

export type TrainingFormProps = {
  teamId: string;
  /** Present when editing. Absent means creating. */
  trainingId?: string;
  defaults: {
    /** `YYYY-MM-DDTHH:mm`, Paris wall clock. */
    startsAt: string;
    venue: string;
    note: string;
  };
};

export function TrainingForm({ teamId, trainingId, defaults }: TrainingFormProps) {
  const editing = trainingId !== undefined;
  const [state, action, pending] = useActionState(
    editing ? updateTraining : createTraining,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />
      {editing ? <input type="hidden" name="trainingId" value={trainingId} /> : null}

      <Field
        htmlFor="startsAt"
        label="Début"
        hint="Heure française."
        error={state?.fieldErrors?.startsAt}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="startsAt"
            type="datetime-local"
            defaultValue={defaults.startsAt}
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field htmlFor="venue" label="Lieu" optional error={state?.fieldErrors?.venue}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="venue"
            defaultValue={defaults.venue}
            placeholder="Gymnase Jean-Moulin"
            autoComplete="off"
            maxLength={80}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        htmlFor="note"
        label="Au programme"
        optional
        hint="Ce que vous travaillez. Visible par tout le monde."
        error={state?.fieldErrors?.note}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="note"
            rows={3}
            defaultValue={defaults.note}
            placeholder="Travail sur les sorties de balle"
            maxLength={280}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" fullWidth size="lg" pending={pending}>
        {editing ? "Enregistrer" : "Créer l’entraînement"}
      </Button>
    </form>
  );
}
