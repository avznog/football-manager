/**
 * Shared validation for the auth forms. Pure — no server imports — so it can be unit tested
 * and reused on the client if we ever want inline validation.
 *
 * All messages are in French: they are shown to the user (`CLAUDE.md`).
 */

import { z } from "zod";

/**
 * Lives here rather than next to the hashing code: `password.ts` is `server-only`, and the
 * join form needs to tell the player the rule before they type.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Le nom d'utilisateur doit faire au moins 3 caractères.")
  .max(20, "Le nom d'utilisateur ne peut pas dépasser 20 caractères.")
  .regex(
    /^[a-z0-9._-]+$/,
    "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, points, tirets et tirets bas.",
  );

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`)
  .max(200, "Le mot de passe est trop long.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Indique ton prénom (2 caractères minimum).")
  .max(40, "Ce nom est trop long.");

/** Invite codes are typed by hand from WhatsApp, so accept any case and ignore spaces. */
export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .min(4, "Ce code d'invitation est trop court.")
      .max(24, "Ce code d'invitation est trop long."),
  );

export const loginSchema = z.object({
  username: usernameSchema,
  // Deliberately not `passwordSchema`: an existing password must not be rejected by a rule
  // introduced after it was set. Wrong credentials are reported uniformly instead.
  password: z.string().min(1, "Entre ton mot de passe."),
});

export const joinWithNewAccountSchema = z.object({
  code: inviteCodeSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const joinWithExistingAccountSchema = z.object({
  code: inviteCodeSchema,
});

export type FormState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined;

/** Turns a ZodError into the shape the forms render. */
export function toFormState(error: z.ZodError): NonNullable<FormState> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { fieldErrors };
}
