/**
 * Validation for the match forms. Pure — no server imports — so it is unit tested directly
 * (`validation.test.ts`) and could be reused for inline validation on the client.
 *
 * Every message is French: they are shown to the coach (decision 012).
 */

import { z } from "zod";

import { fromLocalInput } from "@/lib/calendar/time";

export const opponentNameSchema = z
  .string()
  .trim()
  .min(2, "Indique le nom de l’adversaire (2 caractères minimum).")
  .max(60, "Ce nom est trop long.");

/**
 * What `<input type="datetime-local">` submits: a bare wall clock with no zone.
 *
 * It is read as **Europe/Paris**, never as the server's zone (`lib/calendar/time.ts`). A coach
 * entering "10:30" gets 10:30 at the pitch, whether the build runs in UTC on Vercel or on a
 * laptop in another country.
 */
export const kickoffSchema = z
  .string()
  .trim()
  .min(1, "Indique la date et l’heure du coup d’envoi.")
  .refine((value) => fromLocalInput(value) !== null, "Cette date n’est pas valide.")
  .transform((value) => fromLocalInput(value) as Date);

/**
 * The home/away control submits words rather than a checkbox: a checkbox that is simply absent
 * when unticked cannot tell "extérieur" from "the field never rendered".
 */
export const matchSideSchema = z
  .enum(["home", "away"], { message: "Précise si le match est à domicile ou à l’extérieur." })
  .transform((value) => value === "home");

export const competitionSchema = z.enum(["league", "cup", "friendly", "tournament"], {
  message: "Choisis un type de compétition.",
});

/** An empty text field means "not filled in", which is a `null` column, not an empty string. */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const venueSchema = optionalText(80, "Ce lieu est trop long.");

/** 2×30 by default (decision 009); the ceilings are just sanity, not rules of the game. */
export const periodsCountSchema = z.coerce
  .number()
  .int("Le nombre de périodes doit être un nombre entier.")
  .min(1, "Il faut au moins une période.")
  .max(4, "Quatre périodes au maximum.");

export const periodMinutesSchema = z.coerce
  .number()
  .int("La durée d’une période doit être un nombre entier de minutes.")
  .min(5, "Une période fait au moins 5 minutes.")
  .max(60, "Une période fait 60 minutes au maximum.");

const matchFields = {
  opponentName: opponentNameSchema,
  kickoffAt: kickoffSchema,
  isHome: matchSideSchema,
  venue: venueSchema,
  competition: competitionSchema,
  // 2×30 unless the form says otherwise (decision 009), so the fields can be left out entirely.
  periodsCount: periodsCountSchema.default(2),
  periodMinutes: periodMinutesSchema.default(30),
};

export const createMatchSchema = z.object({ teamId: z.uuid(), ...matchFields });

export const updateMatchSchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  ...matchFields,
});

export const matchTargetSchema = z.object({ teamId: z.uuid(), matchId: z.uuid() });

export const availabilityStatusSchema = z.enum(["yes", "no", "maybe"], {
  message: "Choisis dispo, pas dispo ou peut-être.",
});

/** A note is how a player says « je finis le boulot à 10h » without a phone call. */
export const availabilityNoteSchema = optionalText(140, "Ce commentaire est trop long.");

export const matchAvailabilitySchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  status: availabilityStatusSchema,
  note: availabilityNoteSchema,
});

export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;
