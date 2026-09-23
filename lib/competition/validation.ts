/**
 * Validation for the competition forms on `/equipe`. Pure, French messages (decision 012).
 */

import { z } from "zod";

/**
 * The name the coach types. Free text on purpose — « Coupe du Crédit Mutuel », « Championnat D3 »,
 * « Tournoi de la Pentecôte » — with only the two limits a `<select>` on a 390 px screen imposes.
 */
export const competitionLabelSchema = z
  .string()
  .trim()
  .min(2, "Donne un nom d’au moins 2 caractères.")
  .max(40, "Ce nom est trop long : 40 caractères au maximum.");

export const createCompetitionSchema = z.object({
  teamId: z.uuid(),
  labelFr: competitionLabelSchema,
});

export const renameCompetitionSchema = z.object({
  teamId: z.uuid(),
  competitionId: z.uuid(),
  labelFr: competitionLabelSchema,
});

export const competitionTargetSchema = z.object({
  teamId: z.uuid(),
  competitionId: z.uuid(),
});

export const archiveCompetitionSchema = competitionTargetSchema.extend({
  /** True archives, false brings it back. Submitted as a word, never as a bare checkbox. */
  archived: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;
export type RenameCompetitionInput = z.infer<typeof renameCompetitionSchema>;
