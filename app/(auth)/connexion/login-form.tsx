"use client";

import { useActionState } from "react";

import { login } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "../_components/form";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError state={state} />

      <Field
        label="Nom d’utilisateur"
        name="username"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        errors={state?.fieldErrors?.username}
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state?.fieldErrors?.password}
      />

      <SubmitButton pending="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}
