"use client";

import { useActionState } from "react";

import { createTeam } from "@/lib/team/actions";
import { Field, FormError, SubmitButton } from "../_components/form";

/**
 * Creating the very first team. Shown on `/rejoindre` to a super admin only — `createTeam` checks
 * the permission again on the server (invariant 4); this form just stops it being unreachable.
 *
 * One field on purpose. The club colours matter — the kit discs on the pitch are drawn in them
 * (decision 011) — but `createTeamSchema` defaults them, and « Réglages de l'équipe » on `/equipe`
 * is where they are chosen, next to a squad whose shirts they will colour. Asking for two hex codes
 * before the team has a single player would be asking too early.
 */
export function CreateTeamForm() {
  const [state, action] = useActionState(createTeam, undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <Field
        label="Nom de l’équipe"
        name="name"
        type="text"
        autoComplete="off"
        placeholder="FC des Deux-Ponts"
        required
        errors={state?.fieldErrors?.name}
      />

      <SubmitButton pending="Création…">Créer l’équipe</SubmitButton>
    </form>
  );
}
