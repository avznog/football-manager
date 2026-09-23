/**
 * Validation for team administration. Pure, French messages (`CLAUDE.md`).
 */

import { z } from "zod";

import { CREST_DATA_URL_PATTERN, CREST_MAX_CHARS, CREST_KEEP, CREST_REMOVE } from "./crest";

export const teamNameSchema = z
  .string()
  .trim()
  .min(2, "Le nom de l’équipe doit faire au moins 2 caractères.")
  .max(60, "Ce nom est trop long.");

/** `#rrggbb`, lowercased. Kit discs and the team header read it as a raw CSS colour. */
export const hexColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, "Choisis une couleur au format #rrggbb.");

export const jerseyNumberSchema = z
  .number()
  .int("Le numéro doit être un nombre entier.")
  .min(1, "Le numéro doit être entre 1 et 99.")
  .max(99, "Le numéro doit être entre 1 et 99.");

export const teamRoleSchema = z.enum(["coach", "player"]);

export const createTeamSchema = z.object({
  name: teamNameSchema,
  primaryColor: hexColorSchema.default("#1f6feb"),
  secondaryColor: hexColorSchema.default("#ffffff"),
});

/**
 * A crest the browser has already re-encoded (`lib/team/crest.ts`, decision 054).
 *
 * The pattern is not politeness about file formats: the value goes straight into the `src` of an
 * `<img>`, so anything but the two raster types the canvas produces is refused here. An SVG `data:`
 * URL is the one shape of this string that can carry markup, and it never has to be considered
 * downstream because it cannot get past this line.
 */
export const crestDataUrlSchema = z
  .string()
  .trim()
  .max(CREST_MAX_CHARS, "Ce blason est trop lourd : choisis une image plus simple.")
  .regex(CREST_DATA_URL_PATTERN, "Ce fichier n’est pas une image utilisable comme blason.");

/**
 * The crest field of the settings form, as three states rather than two.
 *
 * `undefined` after parsing means **leave the column alone**: the card also renames the team and sets
 * the kit colours, and a coach fixing a typo in the name must not lose the crest because the file
 * input was empty. `null` is the explicit « Retirer le blason ».
 */
export const crestFieldSchema = z
  .union([z.literal(CREST_KEEP), z.literal(CREST_REMOVE), crestDataUrlSchema])
  .transform((value) =>
    value === CREST_KEEP ? undefined : value === CREST_REMOVE ? null : value,
  );

export const updateTeamSchema = z.object({
  teamId: z.uuid(),
  name: teamNameSchema,
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  crest: crestFieldSchema,
});

export const createInviteSchema = z.object({
  teamId: z.uuid(),
  role: teamRoleSchema.default("player"),
  /** One code for the whole WhatsApp group is the common case, hence the generous ceiling. */
  maxUses: z.coerce.number().int().min(1).max(50).default(1),
});

export const memberTargetSchema = z.object({
  teamId: z.uuid(),
  memberId: z.uuid(),
});

export const updateMemberSchema = z.object({
  teamId: z.uuid(),
  memberId: z.uuid(),
  /** An empty field clears the number, which is why this accepts "". */
  jerseyNumber: z
    .union([z.literal(""), z.coerce.number().pipe(jerseyNumberSchema)])
    .transform((value) => (value === "" ? null : value)),
  isPlayer: z.coerce.boolean(),
});

/**
 * A slug from a team name: accents folded, everything else collapsed to single hyphens.
 * "L'Étoile du Dimanche" → "l-etoile-du-dimanche".
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
