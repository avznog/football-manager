/**
 * Validation for a player's own data: preferred positions and injuries.
 *
 * Pure, with French messages — they are shown to the player (`CLAUDE.md`). Kept out of
 * `actions.ts` so the rules can be unit-tested without a database.
 */

import { z } from "zod";

import { POSITION_CODES } from "@/db/reference";
import { isIsoDate } from "./injury";
import { SHIRT_NAME_MAX_CHARS } from "./shirt";

/**
 * All eleven codes, deliberately — **not** the eight the picker offers. The form posts back the
 * codes already stored for the player, so a record still holding one of the three the picker no
 * longer shows posts it too; narrowing this enum would make Zod reject that player's whole
 * submission and leave them unable to save anything ever again. Dropping a stored code is the
 * picker's job, not the schema's.
 */
export const positionCodeSchema = z.enum(POSITION_CODES, { message: "Poste inconnu." });
export const positionPreferenceSchema = z.enum(["primary", "secondary"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cheap guard before a query. `team_members.id` is a `uuid` column, so handing Postgres
 * `/joueur/nimportequoi` would raise a driver error instead of a clean 404.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** A calendar day from an `<input type="date">`. */
export const isoDateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, "Cette date n’est pas valide.");

/** An optional date field: the browser posts an empty string when it is left blank. */
const optionalIsoDateSchema = z
  .union([z.literal(""), isoDateSchema])
  .transform((value) => (value === "" ? null : value));

/**
 * The identifiers only ever come from hidden fields the app itself rendered, so a failure here is a
 * stale or forged form rather than anything the player tapped: the message asks for the one thing
 * that helps and blames nobody. Same reasoning as `lib/rating/validation.ts`.
 */
const identifierSchema = z.uuid("Ce formulaire est invalide, recharge la page.");

/**
 * The picker posts one `primary` field and one `secondary` field per wanted position — an
 * ordinary form, no JSON body. An empty `primary` means « aucun poste principal ».
 */
export const updatePositionsSchema = z.object({
  teamId: identifierSchema,
  memberId: identifierSchema,
  primary: z
    .union([z.literal(""), positionCodeSchema], { message: "Poste inconnu." })
    .transform((value) => (value === "" ? null : value)),
  secondary: z
    .array(positionCodeSchema)
    .max(POSITION_CODES.length, "Trop de postes dans ce formulaire."),
});

/**
 * The flocage, as typed. Trimmed and length-checked against the shirt back, and **not** uppercased:
 * that happens in `shirtNameDisplay` so the player's own « El Professor » survives in the column
 * (`lib/player/shirt.ts`).
 */
export const shirtNameSchema = z
  .string()
  .trim()
  .max(
    SHIRT_NAME_MAX_CHARS,
    `Ce flocage est trop long (${SHIRT_NAME_MAX_CHARS} caractères maximum).`,
  );

/**
 * The « Nom sur le maillot » form: one field, and an empty one means « enlève-le ».
 *
 * A blank field and a field holding two spaces both become `null` rather than a one-character
 * flocage, so « no flocage » has a single representation everywhere — the same thing the
 * `team_members_shirt_name_length` check enforces from the other side.
 */
export const updateShirtNameSchema = z.object({
  teamId: z.uuid(),
  memberId: z.uuid(),
  shirtName: shirtNameSchema.transform((value) => (value === "" ? null : value)),
});

/** Long enough for « Entorse de la cheville, 3 semaines d’arrêt », short enough to stay a note. */
export const INJURY_NOTE_MAX = 280;

export const injuryNoteSchema = z
  .string()
  .trim()
  .max(INJURY_NOTE_MAX, `Cette note est trop longue (${INJURY_NOTE_MAX} caractères maximum).`)
  .transform((value) => (value === "" ? null : value));

export const declareInjurySchema = z
  .object({
    teamId: z.uuid(),
    memberId: z.uuid(),
    startedOn: isoDateSchema,
    expectedReturnOn: optionalIsoDateSchema,
    note: injuryNoteSchema,
  })
  .refine(
    (value) => value.expectedReturnOn === null || value.expectedReturnOn >= value.startedOn,
    {
      path: ["expectedReturnOn"],
      message: "Le retour prévu ne peut pas précéder le début de la blessure.",
    },
  );

export const resolveInjurySchema = z.object({
  teamId: z.uuid(),
  memberId: z.uuid(),
  injuryId: z.uuid(),
  /** Blank means « aujourd’hui » — the button on the profile posts nothing else. */
  resolvedOn: optionalIsoDateSchema,
});
