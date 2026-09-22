"use client";

import { useActionState } from "react";

import { joinWithExistingAccount, joinWithNewAccount } from "@/lib/auth/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";
import { Field, FormError, SubmitButton } from "../_components/form";

/** Codes are typed from WhatsApp; the schema uppercases and strips spaces, so be permissive. */
const CODE_FIELD = {
  label: "Code d’invitation",
  name: "code",
  type: "text" as const,
  autoComplete: "off" as const,
  autoCapitalize: "characters" as const,
  autoCorrect: "off" as const,
  spellCheck: false,
  placeholder: "ABCD-1234",
  required: true,
};

export function JoinWithNewAccountForm({ prefilledCode }: { prefilledCode: string }) {
  const [state, action] = useActionState(joinWithNewAccount, undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <Field
        {...CODE_FIELD}
        defaultValue={prefilledCode}
        errors={state?.fieldErrors?.code}
      />
      <Field
        label="Ton prénom"
        name="displayName"
        type="text"
        autoComplete="given-name"
        placeholder="Karim"
        required
        errors={state?.fieldErrors?.displayName}
      />
      <Field
        label="Nom d’utilisateur"
        name="username"
        hint="En minuscules, sans espaces. C’est ce que tu taperas pour te connecter."
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="karim"
        required
        errors={state?.fieldErrors?.username}
      />
      <Field
        label="Mot de passe"
        name="password"
        hint={`${PASSWORD_MIN_LENGTH} caractères minimum.`}
        type="password"
        autoComplete="new-password"
        required
        errors={state?.fieldErrors?.password}
      />

      <SubmitButton pending="Création…">Créer mon compte</SubmitButton>
    </form>
  );
}

export function JoinWithExistingAccountForm({ prefilledCode }: { prefilledCode: string }) {
  const [state, action] = useActionState(joinWithExistingAccount, undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />
      <Field {...CODE_FIELD} defaultValue={prefilledCode} errors={state?.fieldErrors?.code} />
      <SubmitButton pending="Vérification…">Rejoindre</SubmitButton>
    </form>
  );
}
