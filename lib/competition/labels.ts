/**
 * What `/equipe` says about a team's competitions, and what the match form says when it has none.
 *
 * Pure functions rather than strings in the `.tsx`, for the reason decision 097 gives: every
 * sentence here is *derived* from rows — how many matches a competition holds, whether it is
 * archived — and a derived sentence written inline is a claim nothing can test. Vitest collects
 * `lib/**` and nothing under `app/`.
 *
 * The delete wording follows decisions 098 and 099: a destructive control names what it takes with
 * it, **counted**, from the data it is about to touch. Here the count is what makes the control
 * refuse — a competition seven matches point at cannot be deleted without those seven matches losing
 * which competition they were played in, so the card says so in numbers and offers archiving.
 */

import { pluralize } from "@/lib/calendar/labels";

/** The card on `/equipe`. « tes compétitions » — the French tutoies (decision 074). */
export function competitionsCardFr(): { titleFr: string; descriptionFr: string } {
  return {
    titleFr: "Compétitions",
    descriptionFr:
      "C’est toi qui décides du championnat, des coupes et des tournois où joue l’équipe. " +
      "Ces noms sont ceux que le formulaire de match propose.",
  };
}

/** « aucun match » · « 1 match » · « 7 matchs ». */
export function competitionMatchCountFr(matchCount: number): string {
  return matchCount === 0 ? "aucun match" : pluralize(matchCount, "match", "matchs");
}

/**
 * The line under a competition's name: what it holds, and whether it is still proposed.
 *
 * « archivée » is not a detail: an archived competition is absent from the match form, and a coach
 * looking for it there deserves to have been told where it went.
 */
export function competitionStateFr(state: { matchCount: number; archived: boolean }): string {
  const count = competitionMatchCountFr(state.matchCount);
  return state.archived ? `${count} · archivée, plus proposée à la création` : count;
}

export type CompetitionDeletion = {
  /** False as soon as a single match points at it: the season would lose that fact. */
  allowed: boolean;
  warningFr: string;
};

/**
 * Whether « Supprimer » may be pressed on one competition, and the sentence next to it.
 *
 * The rule is the foreign key's: `matches.competition_id` is `on delete restrict`, so the database
 * refuses too. This exists so the screen refuses *first*, and for a reason the coach can read —
 * counted, and with the thing to do instead.
 */
export function competitionDeletionFr(labelFr: string, matchCount: number): CompetitionDeletion {
  if (matchCount === 0) {
    return {
      allowed: true,
      warningFr: `Aucun match n’est rattaché à « ${labelFr} » : la supprimer n’efface rien d’autre.`,
    };
  }

  const count = competitionMatchCountFr(matchCount);
  return {
    allowed: false,
    warningFr:
      `${count} ${matchCount === 1 ? "est rattaché" : "sont rattachés"} à « ${labelFr} » : ` +
      `la supprimer effacerait la compétition de ${matchCount === 1 ? "ce match" : `ces ${matchCount} matchs`}. ` +
      "Archive-la plutôt — elle quitte le formulaire de match, et la saison garde ce qui a été joué.",
  };
}

/** The refusal `deleteCompetition` returns when it is asked anyway — same numbers, same reason. */
export function competitionDeleteRefusedFr(labelFr: string, matchCount: number): string {
  return competitionDeletionFr(labelFr, matchCount).warningFr;
}

/** « Archiver » / « Réactiver », and what each one does. */
export function competitionArchiveActionFr(archived: boolean): { labelFr: string; hintFr: string } {
  return archived
    ? {
        labelFr: "Réactiver",
        hintFr: "Elle revient dans le formulaire de match.",
      }
    : {
        labelFr: "Archiver",
        hintFr: "Elle quitte le formulaire de match, sans toucher aux matchs déjà joués.",
      };
}

/**
 * What the match form says instead of an empty `<select>`.
 *
 * Reachable: a coach may delete every competition he has, as long as no match points at one. An
 * empty dropdown over a « Créer le match » button that would be refused is exactly the kind of
 * screen this repository hunts.
 */
export function noCompetitionFr(): string {
  return "Aucune compétition pour l’instant : crée-en une sur la page Équipe, puis reviens programmer ce match.";
}

/** The empty state of the card itself, which is the same hole seen from the other side. */
export function noCompetitionYetFr(): string {
  return "Aucune compétition. Ajoute-en une ci-dessous : sans elle, aucun match ne peut être programmé.";
}
