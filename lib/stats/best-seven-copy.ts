/**
 * Every French sentence `/stats/equipe-type` says, and the reading of its query string.
 *
 * Pure, and under `lib/` where Vitest collects it, for the reason decision 097 names: a sentence
 * derived and tested somewhere Vitest can see it is still not the sentence on screen — only the call
 * is — but a sentence typed inline in a route is not even testable. So the screen owns no wording of
 * its own, and `best-seven-copy.test.ts` pins these.
 *
 * ## Why there are so many of them
 *
 * This screen prints a number that is *not* any player's own figure: the seven is ranked on a
 * shrunken value (`best-seven.ts`, rule 2), on posts nobody has ever been measured at, out of matches
 * whose notes may not all be in. Three of those are things the screen would otherwise imply away, and
 * this repository's definition of done singles out « a screen stating something untrue » as the defect
 * class no test catches. Hence one function per claim:
 *
 * 1. `DECLARED_POSTS_FR` — the posts are the coach's, primary first (decision 171).
 * 2. `SEVEN_RULE_FR` — what each of the four sevens ranks on, in one line.
 * 3. `keeperRuleFr` — who may keep goal, and who the légende refused (decision 172, Q8).
 * 4. `sevenSmoothingFr` / `shrinkageSentenceFr` — what the smoothing did.
 * 5. `squadMeanStandInFr` — a disc whose number is the squad's (or the post's) average and not that
 *    man's (rule 2 of `best-seven.ts`).
 *
 * The old screen's « invincibilité » sentence and its « la pire équipe » wording went with the
 * criteria and the direction they explained (decision 171).
 *
 * There used to be a fifth, `viewerRelativeRatingsFr`: « ce sept est bâti d'après les matchs que tu as
 * notés ». Decision 137 makes it false — every reader now reads the same seven — and the sentence that
 * replaces it is about the team's calendar rather than the reader (`pendingRatingMatchesNoteFr` in
 * `format.ts`).
 *
 * And none of them is a `title`: there is no hover on a phone (decision 072), so every one of these
 * is printed under the pitch.
 */

import { positionLabelFr } from "@/db/reference";

import type { BestSevenCriterion, ObservedFigure, ShrinkageReport } from "./best-seven";
import {
  NO_VALUE_FR,
  everyFr,
  concededRecordFr,
  formatDecimal,
  formatMinutes,
  formatSignedDecimal,
  impactRecordFr,
  formatRating,
  plural,
} from "./format";
import { minutesPerCount } from "./impact";
import { SEVEN_KINDS, type SevenFigure, type SevenKind, type SevenObserved } from "./sevens";

/* -------------------------------------------------------------------------- */
/* The query string                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The key `/stats/equipe-type` reads, spelled once. French, like every other URL in this app. Still
 * `critere`, so a bookmark from before decision 171 lands on this screen rather than on an error —
 * and on the default seven, since none of its old values (`goals`, `ratings`…) names one.
 *
 * `sens` (« la pire équipe ») is gone with decision 171: the cahier asks for four best sevens, and a
 * `?sens=pire` bookmark is simply ignored.
 */
export const CRITERION_PARAM = "critere";

/**
 * The seven the screen opens on: the offensive one, which has a basis from the first final whistle —
 * goals, assists and minutes in goal are all in the log. Not `notes`, which waits on the coach showing
 * a match's means (decision 139) and reads as a pitch of squad averages until he does.
 */
export const DEFAULT_SEVEN: SevenKind = "offensive";

/** `?critere=offensive&critere=notes` is a forged URL, not an error: the first value wins. */
function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A hand-typed, stale or empty query string degrades to the default, never to an error (like `/stats`).
 *
 * **An empty value is one of those**: the controls are a `method="get"` form, so a browser with no
 * JavaScript submits `?critere=&competition=` for whatever the reader left alone. And so is every value
 * of the old criterion select (`goals`, `assists`, `ratings`, `cleanSheet`): they are not sevens.
 */
export function parseSeven(value: string | string[] | undefined): SevenKind {
  return SEVEN_KINDS.find((kind) => kind === firstOf(value)) ?? DEFAULT_SEVEN;
}

/**
 * The competition the seven is read through, by id and never by label (decision 107). A stale, forged
 * or empty id degrades to « toutes », which is the same rule `/stats` applies to the same parameter.
 */
export function parseCompetitionId(
  value: string | string[] | undefined,
  competitions: readonly { id: string }[],
): string | null {
  const first = firstOf(value);
  return competitions.find((competition) => competition.id === first)?.id ?? null;
}

/**
 * Whether the competition select belongs on screen.
 *
 * More than one competition is the obvious reason — with a single one there is nothing to choose
 * between, and a select holding « Toutes » and « Championnat » about the same set of matches is a
 * control that cannot change anything.
 *
 * **A filter already applied is the other reason, and it is the one that was missing.** A team with
 * exactly one competition still has `?competition=<id>` as a legal, bookmarkable URL — `/stats`'s own
 * filter writes it, and `parseCompetitionId` keeps it because the id is real. The screen then read
 * « Aucun match terminé en championnat … Choisis « Toutes » pour voir la saison entière » with no
 * select anywhere under it: an instruction to use a control the reader does not have, which is exactly
 * the failure the old « choisis une forme toi-même ci-dessus » sentence was removed for. A reader who
 * arrived filtered must be able to get back out, however he arrived.
 */
export function showsCompetitionSelect({
  competitionCount,
  competitionId,
}: {
  competitionCount: number;
  competitionId: string | null;
}): boolean {
  return competitionCount > 1 || competitionId !== null;
}

export type BestSevenQuery = {
  /** Shared with `/stats`, by id (decision 107). */
  competitionId: string | null;
  seven: SevenKind;
};

/**
 * Builds `/stats/equipe-type?…`, omitting whatever is at its default — the same rule as `statsHref`,
 * so a shared URL is the shortest one that means what the reader saw.
 */
export function equipeTypeHref(query: BestSevenQuery, competitionParam = "competition"): string {
  const params = new URLSearchParams();
  if (query.competitionId !== null) params.set(competitionParam, query.competitionId);
  if (query.seven !== DEFAULT_SEVEN) params.set(CRITERION_PARAM, query.seven);
  const search = params.toString();
  return search === "" ? "/stats/equipe-type" : `/stats/equipe-type?${search}`;
}

/**
 * The identity of the **question** the pitch is answering: change any of these and a different seven is
 * the right one, so the component that draws it has to be a different component.
 *
 * It is a React `key` for `<SevenPitch>` and not a `useEffect` syncing state to props, and the
 * difference is the whole point. The pitch holds the reader's own swaps in `useState` — hand-editing the
 * seven is a feature, which is why there is a « Revenir à la meilleure » button — so an effect that
 * pushed the server's optimum back into that state would fight his taps every time the page re-rendered.
 * A `key` fights nothing: it throws the old question's answer away, initialiser included, and keeps his
 * edits for exactly as long as the question they were an edit *to*. `_components/controls.tsx` argues the
 * same trade for its own selects, under « `defaultValue` with a `key`, and not `value` ».
 *
 * Without it, a soft navigation reused the instance and `useState(() => ({ ...optimumBySlot }))` never
 * re-ran: choosing « La pire » relabelled the pitch « Ton équipe » over the *best* seven, as though the
 * reader had picked it himself.
 */
export function sevenQuestionKey(query: BestSevenQuery): string {
  return [query.competitionId ?? "all", query.seven].join("|");
}

/* -------------------------------------------------------------------------- */
/* Naming the criterion                                                       */
/* -------------------------------------------------------------------------- */

/** The select's options: the four sevens of the cahier (decision 171). */
export const SEVEN_OPTION_FR: Readonly<Record<SevenKind, string>> = {
  offensive: "Offensive",
  defensive: "Défensive",
  legende: "7 de légende",
  notes: "Notes",
};

/**
 * The rule of each seven in one line, printed under the title — the cahier's own sentence, shortened.
 * A seven is a claim, and the reader is owed what it is a claim *about* before he reads the names.
 */
export const SEVEN_RULE_FR: Readonly<Record<SevenKind, string>> = {
  offensive:
    "La meilleure attaque : à chaque poste de champ, celui qui attend le moins de minutes entre deux " +
    "buts, puis celui qui donne le plus de passes décisives ; au goal, celui qui y a joué et y " +
    "encaisse le moins souvent.",
  defensive:
    "La meilleure défense : à chaque poste de champ, celui qui encaisse le moins souvent quand il est " +
    "sur le terrain ; au goal, celui qui y a joué et y encaisse le moins souvent.",
  legende:
    "Le meilleur à chaque poste, de l’attaque vers la défense, jugé sur la différence de buts brute " +
    "quand il y joue ; au goal, jamais quelqu’un en dessous de la moyenne des gardiens.",
  notes: "La meilleure moyenne des notes reçues, à chaque poste.",
};

/** The heading over the pitch, per seven — and « Ton équipe » once the reader has swapped anybody. */
export const SEVEN_HEADING_FR: Readonly<Record<SevenKind, string>> = {
  offensive: "La meilleure attaque",
  defensive: "La meilleure défense",
  legende: "Le 7 de légende",
  notes: "Le meilleur sept aux notes",
};

/**
 * The controls, named. Nouns rather than instructions: « Équipe type » over a select is the whole
 * sentence. Here rather than in the component for decision 097's reason — a label is a claim about the
 * control under it.
 */
export const SEVEN_CONTROL_LABEL_FR = {
  seven: "Équipe type",
  competition: "Compétition",
} as const;

/** « Toutes » — the competition select's first option, and the same word `/stats`'s chip row uses. */
export const ALL_COMPETITIONS_FR = "Toutes";

/**
 * The button only a reader with no JavaScript ever sees: the form is a `method="get"`, so submitting it
 * is what applies the selects. « Voir ce sept » rather than « Valider » — nothing is saved.
 */
export const SEVEN_CONTROLS_SUBMIT_FR = "Voir ce sept";

/**
 * What the team figure under the pitch is, so the label never lies about a sum or a mean — **nor about
 * how many figures went into it**. It used to say « des sept » whatever was on the pitch, so a squad of
 * five labelled a mean of five as a mean of seven. `filledCount` is how many slots the figure actually
 * averaged or totalled; only seven of them earns the word « sept ».
 */
export function aggregationLabelFr(aggregation: "sum" | "mean", filledCount: number): string {
  const verb = aggregation === "sum" ? "Total" : "Moyenne";
  return filledCount === 7 ? `${verb} des sept` : `${verb} sur ${plural(filledCount, "poste")}`;
}

/**
 * The raw figure with its denominator: « 9,0 sur 1 match noté », « 3 buts sur 240′ ».
 *
 * Null when the denominator is empty, and then `adjustedBesideRawFr` prints the shrunken value
 * alone: « 0,00/h sur 0′ » is arithmetic about nothing (rule 1 of `aggregate.ts`).
 */
export function observedFigureFr(
  criterion: BestSevenCriterion,
  observed: ObservedFigure,
): string | null {
  if (observed.rate === null || observed.denominator <= 0) return null;
  switch (criterion) {
    case "goals":
      return `${plural(observed.numerator, "but")} sur ${formatMinutes(observed.denominator)}`;
    case "assists":
      return `${plural(observed.numerator, "passe décisive", "passes décisives")} sur ${formatMinutes(observed.denominator)}`;
    case "ratings":
      return `${formatRating(observed.rate)} sur ${plural(observed.denominator, "match noté", "matchs notés")}`;
    case "cleanSheet":
      return `${formatMinutes(observed.numerator)} sur ${formatMinutes(observed.denominator)}`;
  }
}

/* -------------------------------------------------------------------------- */
/* The heading, which is a claim about every disc under it (decision 087)      */
/* -------------------------------------------------------------------------- */

/**
 * The heading over the pitch.
 *
 * `touched` is the whole reason this is a function. « La meilleure attaque » is true of the seven the
 * assignment chose and false of the seven the reader has since edited — decision 087's rule is that a
 * heading is a claim about every row under it. So the heading changes with the first swap.
 */
export function sevenHeadingFr(seven: SevenKind, touched: boolean): string {
  return touched ? "Ton équipe" : SEVEN_HEADING_FR[seven];
}

/** The optimum's figure, kept beside « Ton équipe » so a swap can be judged rather than guessed. */
export function optimumComparisonFr(seven: SevenKind, formattedValue: string): string {
  return `${SEVEN_HEADING_FR[seven]} : ${formattedValue}`;
}

/** The control that puts the proposed seven back. */
export function resetLabelFr(): string {
  return "Revenir au sept proposé";
}

/**
 * What a tap just did, said out loud.
 *
 * A man already on the pitch chosen for another slot is **swapped** with whoever was there, rather
 * than appearing twice; a screen that silently rearranged two discs would leave the reader to work
 * out which of them moved. The three shapes are the three things that can happen.
 */
export function swapAnnouncementFr(input: {
  /** Who was put in the tapped slot. */
  incoming: string;
  /** Who was in it, if anybody. */
  outgoing: string | null;
  /** The post the tapped slot is. */
  positionCode: string;
  /** The post the incoming player came from, when he was already on the pitch. */
  fromPositionCode: string | null;
}): string {
  const post = positionLabelFr(input.positionCode).toLocaleLowerCase("fr-FR");
  if (input.fromPositionCode !== null && input.outgoing !== null) {
    const from = positionLabelFr(input.fromPositionCode).toLocaleLowerCase("fr-FR");
    return `${input.incoming} et ${input.outgoing} ont échangé : ${input.incoming} passe ${post}, ${input.outgoing} passe ${from}.`;
  }
  if (input.outgoing !== null) {
    return `${input.incoming} remplace ${input.outgoing} au poste de ${post}.`;
  }
  return `${input.incoming} prend le poste de ${post}.`;
}

/* -------------------------------------------------------------------------- */
/* Honesty sentence 1 — the posts are declarations, not measurements           */
/* -------------------------------------------------------------------------- */

/**
 * Where the posts come from, which changed twice since this sentence was first written: the coach
 * sets each player's posts now (S5), and the app does measure the time spent at each one (decision
 * 160) — the légende is judged on it. What the seven respects is the coach's list.
 */
export const DECLARED_POSTS_FR =
  "Les postes sont ceux que le coach a indiqués pour chaque joueur : chacun n’est placé qu’à un de " +
  "ses postes, son poste principal d’abord, tant que l’effectif le permet.";

export function declaredPostsFr(): string {
  return DECLARED_POSTS_FR;
}

/** The badge under a disc whose man never declared that post (`fit === "none"`). */
export const OUT_OF_POSITION_BADGE_FR = "pas son poste";

/**
 * Why a « pas son poste » badge exists at all: the post goes to somebody who has played rather than
 * staying empty.
 *
 * It used to end « un sept doit être complet, donc le poste est rempli plutôt que laissé vide », and
 * decision 187 makes the first half untrue: a post *is* left vide when nobody in the squad has played
 * enough to be a candidate at all (`emptySlotsFr`). What survives is the comparison the reader is owed
 * — among the men who have played, one at the wrong post beats an empty one.
 */
export function outOfPositionNoteFr(count: number): string | null {
  if (count <= 0) return null;
  return (
    `${plural(count, "poste")} ${count > 1 ? "sont tenus" : "est tenu"} par quelqu’un qui ne l’a ` +
    `pas déclaré, et ${count > 1 ? "leurs disques le disent" : "son disque le dit"} : parmi les ` +
    "joueurs qui ont du temps de jeu, mieux vaut en placer un hors de ses postes que laisser le " +
    "poste vide."
  );
}

/* -------------------------------------------------------------------------- */
/* Honesty sentence 2 — a ratings seven belongs to one reader                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Honesty sentence 3 — what the shrinkage did, in the unit it measured        */
/* -------------------------------------------------------------------------- */

/** The subject of the shrinkage sentence, per criterion. */
const SHRUNK_SUBJECT_FR: Readonly<Record<BestSevenCriterion, string>> = {
  goals: "Les buts par heure sont ramenés",
  assists: "Les passes décisives par heure sont ramenées",
  ratings: "Les notes sont ramenées",
  cleanSheet: "Les minutes sans encaisser sont ramenées",
};

/**
 * `priorStrength` with its noun: « 4 notes », « 3,0 heures de jeu », « 120′ ».
 *
 * The plural is decided on the **printed** decimal, not on the raw float, and at 2 rather than above 1.
 * French pluralises from two: « 1,6 heure », « 1,9 heure », « 2,0 heures ». The old rule was
 * `priorStrength > 1`, which printed « 1,6 heures » on the clamp's own floor and « 1,0 heures » at
 * exactly one — and reading the raw value would print « 2,0 heure » for 1,96, which rounds up on screen.
 */
function pluralFromPrinted(printed: string, singular: string, many = `${singular}s`): string {
  return Number(printed.replace(",", ".")) >= 2 ? many : singular;
}

function priorStrengthFr(report: ShrinkageReport): string {
  switch (report.unit) {
    case "ratedMatches":
      return plural(Math.round(report.priorStrength), "match noté", "matchs notés");
    case "sixtyMinutes": {
      const printed = formatDecimal(report.priorStrength, 1);
      return `${printed} ${pluralFromPrinted(printed, "heure")} de jeu`;
    }
    case "minutes":
      return formatMinutes(Math.round(report.priorStrength));
  }
}

/**
 * « Les notes sont ramenées vers la moyenne de l'équipe, à hauteur de 4 matchs notés. »
 *
 * The number is `shrinkage.priorStrength`, which rule 3 of `best-seven.ts` **measures** rather than
 * chooses — and when it could not be measured (`measured === null`), the sentence says that instead
 * of printing the clamp's ceiling as though it were a measurement. That distinction is the whole
 * point of the module returning `measured` separately: a number the screen cannot explain is a
 * number the screen must not use.
 *
 * `subject` overrides the criterion's own, so the goalkeeper's model can be stated in the same words
 * without a second copy of this sentence (decision 011 fits two of them, one per pair).
 *
 * **When it could not be measured, the sentence says which of the four reasons it was.** It used to
 * give one reason — « les écarts entre les joueurs sont trop petits, ou la saison trop courte » — for
 * all of them, which made it a sentence the screen invented: it was printed with a single keeper in the
 * squad, where there are no écarts at all, and with nobody rated at all, where the truth is that
 * nobody has a figure. `ShrinkageReport.unmeasurable` carries the distinction `fitShrinkage` already
 * knew, and the four branches below are the four truths.
 */
export function shrinkageSentenceFr(
  criterion: BestSevenCriterion,
  report: ShrinkageReport,
  subject?: string,
): string {
  const who = subject ?? SHRUNK_SUBJECT_FR[criterion];
  // Whose mean it is. The keepers are their own population (rule 4 of `best-seven.ts`), so « la
  // moyenne de l’équipe » would name the wrong twelve people under the goalkeeper's own model.
  const keepers = report.source === "goalkeeper";
  const towards = keepers ? "vers la moyenne des gardiens" : "vers la moyenne de l’équipe";

  switch (report.unmeasurable) {
    case "noData":
      return (
        `${who} ${towards} — sauf qu’il n’y a pas de moyenne : ` +
        (keepers
          ? "personne n’a de minutes comptées dans les buts, et l’appli ne les compte que si une " +
            "composition confirmée dit qui gardait."
          : "personne n’a encore le moindre chiffre sur ce critère dans cette sélection.")
      );
    case "onePlayer":
      return (
        `${who} ${towards} le plus fort possible : ` +
        (keepers
          ? "un seul joueur a gardé les buts, donc il n’y a aucun écart entre gardiens à mesurer."
          : "un seul joueur a un chiffre sur ce critère, donc il n’y a aucun écart entre joueurs à " +
            "mesurer.")
      );
    case "noRepeat":
      // Ratings only, and deliberately not folded into `noSpread`: what is missing here is not the
      // spread between players — it may be wide — but the spread *within* one player, which needs him
      // to have been rated twice. Naming the wrong missing thing is the same defect as inventing one.
      return (
        `${who} ${towards} le plus fort possible : personne n’a encore été noté deux fois, donc ` +
        "l’appli ne peut pas mesurer de combien la note d’un joueur bouge d’un match à l’autre — et " +
        "c’est ce qu’il lui faudrait pour savoir combien de poids donner à une note isolée."
      );
    case "noSpread":
      return (
        `${who} ${towards} le plus fort possible : les écarts entre les joueurs sont trop petits, ou ` +
        "la saison trop courte, pour les distinguer vraiment. L’écran est donc volontairement prudent, " +
        "et ne peut pas te dire de combien."
      );
    case null:
      return (
        `${who} ${towards}, à hauteur de ${priorStrengthFr(report)} : un chiffre bâti sur presque ` +
        "rien pèse donc moins qu’un chiffre bâti sur une saison."
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Honesty sentence 3b — a figure that is the squad's, under one man's name     */
/* -------------------------------------------------------------------------- */

/**
 * « 2 des sept n’ont aucun chiffre cette saison… »
 *
 * A player with no exposure lands **exactly** on the squad mean — `n = 0` in rule 2's formula — which is
 * the right arithmetic and, unannounced, a lie by omission: his disc prints a real number that is not
 * about him, and `observed.rate` beside it is a dash. Decision 115 says such a player « heads neither
 * the best seven nor the worst », which is true and not enough: he is regularly *in* one of them, and a
 * slot with two candidates goes to him whenever the squad's average beats the other man's real figure —
 * or, in the worst seven, falls below it. So the count is printed, never hidden (rule 2 of
 * `aggregate.ts`: no figure without its denominator), and `hasOwnExposure` in `best-seven.ts` is what
 * the screen counts with.
 *
 * Null when every pick has a figure of his own, in which case there is nothing to warn about.
 *
 * **Decision 187 narrowed what reaches this sentence, and decision 198 narrowed it again.** A man with
 * no minute at all is no longer a candidate, and the impact no longer has a mean to stand in for him —
 * it is raw, so no figure at that post means no figure, full stop. What is left is a man nobody has
 * rated, and a man with minutes but none outside the goal on a défensive seven. Hence « dans cette
 * sélection » rather than the « à ce poste » the légende used to need.
 */
export function squadMeanStandInFr(count: number): string | null {
  if (count <= 0) return null;
  const many = count > 1;
  return (
    `${count} des sept ${many ? "n’ont" : "n’a"} aucun chiffre ${many ? "à eux" : "à lui"} sur ce critère dans cette ` +
    `sélection : ${many ? "ils sont affichés" : "il est affiché"} à la moyenne de l’équipe, donc ` +
    `${many ? "ni flattés ni punis" : "ni flatté ni puni"} pour ne pas en avoir encore.`
  );
}

/* -------------------------------------------------------------------------- */
/* Who was left out of the squad                                             */
/* -------------------------------------------------------------------------- */

/**
 * Who the seven could not be chosen from, and why. Both halves are exclusions the reader would
 * otherwise have to infer from an absence.
 */
export function excludedFromSquadFr(input: {
  departedWithData: number;
  nonPlayers: number;
  /** Decision 187: squad players with no minute in this selection. */
  withoutMinutes: number;
}): string | null {
  const parts: string[] = [];
  if (input.withoutMinutes > 0) {
    // First, because it is the only one of the three about men the reader *expected* to see: a name in
    // the squad list, absent from both the pitch and the picker. The rule is stated with the count, so
    // the sentence is an answer and not a tally — and it says « temps de jeu … dans cette sélection »,
    // because the filter is per competition and a man left out here may be in the seven for « toutes ».
    const many = input.withoutMinutes > 1;
    parts.push(
      `${plural(input.withoutMinutes, "joueur")} de l’effectif ${many ? "n’ont" : "n’a"} aucune ` +
        `minute de jeu dans cette sélection : le sept ne prend que ceux qui ont joué, donc ` +
        `${many ? "ils en restent" : "il en reste"} dehors`,
    );
  }
  if (input.departedWithData > 0) {
    const many = input.departedWithData > 1;
    parts.push(
      `${plural(input.departedWithData, "joueur")} parti${many ? "s" : ""} ${many ? "ont" : "a"} ` +
        `joué dans cette sélection, mais tu ne peux plus ${many ? "les" : "l’"}aligner : ` +
        `${many ? "ils n’entrent" : "il n’entre"} pas dans le sept, et ${many ? "leurs postes déclarés ont disparu" : "son poste déclaré a disparu"} avec ${many ? "leur" : "son"} départ`,
    );
  }
  if (input.nonPlayers > 0) {
    parts.push(
      `${plural(input.nonPlayers, "membre")} de l’encadrement ${input.nonPlayers > 1 ? "ne sont pas joueurs" : "n’est pas joueur"} et ${input.nonPlayers > 1 ? "restent" : "reste"} en dehors du sept`,
    );
  }
  if (parts.length === 0) return null;
  return `${parts.join(" · ")}.`;
}

/**
 * Posts nobody could be found for, and **why** — which since decision 187 is two different facts.
 *
 * It used to be one sentence: « l'effectif ne compte pas encore assez de joueurs pour remplir la
 * forme », true of a squad of five. Excluding the men with no game time makes a second cause reachable,
 * and the old sentence false under it: a squad of twelve of whom four have played leaves three posts
 * empty with a perfectly large effectif. So the sentence names the cause the reader can act on, and
 * quotes the count it rests on — `eligible` is how many men the seven could choose from at all.
 *
 * The posts stay **empty**, drawn as « Poste vide » rather than filled: this screen may not put a man
 * on a pitch to make a shape look complete, which is the same rule `outOfPositionNoteFr` obeys from the
 * other side (it fills an undeclared post, with somebody who has played, and badges the disc).
 */
export function emptySlotsFr(input: {
  count: number;
  /** Candidates the seven had to choose from: squad players with a minute in this selection. */
  eligible: number;
  /** Squad players left out for having none (decision 187). */
  withoutMinutes: number;
}): string | null {
  if (input.count <= 0) return null;
  const posts =
    `${plural(input.count, "poste")} ${input.count > 1 ? "restent vides" : "reste vide"}`;
  if (input.withoutMinutes <= 0) {
    return `${posts} : l’effectif ne compte pas encore assez de joueurs pour remplir la forme.`;
  }
  if (input.eligible === 0) {
    return (
      `${posts} : personne n’a encore de temps de jeu dans cette sélection, et le sept ne prend que ` +
      "les joueurs qui ont joué."
    );
  }
  const many = input.eligible > 1;
  return (
    `${posts} : ${plural(input.eligible, "joueur")} seulement ${many ? "ont" : "a"} du temps de jeu ` +
    "dans cette sélection, et le sept ne prend que ceux-là."
  );
}


/* -------------------------------------------------------------------------- */
/* The four sevens' figures (decisions 171–172)                               */
/* -------------------------------------------------------------------------- */

/**
 * The window every rate on this screen is « per »: sixty minutes of play.
 *
 * It is what makes `everyFr` usable here. That function turns a **count over a stretch of minutes**
 * into « toutes les 24′ », and a seven's cell holds neither — it holds a shrunk rate, a float. Sixty
 * minutes and the rate *are* such a pair (« this many per sixty »), so the same sentence comes out of
 * the same function rather than out of a second copy of the division.
 */
const MINUTES_PER_HOUR = 60;

/**
 * The ranked figure of one cell, in its own scale. Each slot of a seven can be scored by a different
 * figure now (decision 171), so the screen formats by the cell's `figure`, never by the seven:
 *
 * - goals: « 1 but/133′ », the shrunk rate read as a waiting time (decision 199);
 * - conceded (in goal or outfield): the same reading, « 1 but/24′ », as it has been since S12;
 * - impact: the raw goal difference, signed, with the stretch it is over: « +6,0 pour 60′ »;
 * - ratings: a mark out of ten.
 *
 * **No bare `/h` anywhere, which is decision 199.** « 0,49/h » was on screen for the goals and the
 * impact, and the owner wrote twice in one backlog that he could not tell what it meant. A rate of
 * countable events is printed as the waiting time between two — his own « X but every X minutes » —
 * and the impact, which is a *difference* and has no waiting time (it can be zero, or negative),
 * names the stretch of play it is divided over instead.
 *
 * **The sentence is `format.ts`'s own `everyFr`**, handed the rate as « so many per 60 », so this
 * screen cannot come to word a rate differently from `/stats`: one function turns a count over a
 * stretch of minutes into « toutes les 24′ », and both screens call it. `compact` is the disc caption,
 * 104 px wide, where « 1 but toutes les 133′ » does not fit — that one form is built here from
 * `minutesPerCount`, which is the number `everyFr` prints the sentence of (same rounding, floor of one
 * minute), because a caption cannot hold a sentence and the DP's key cannot be one.
 */
export function formatSevenFigure(
  figure: SevenFigure,
  value: number | null,
  compact = false,
): string {
  if (value === null) return NO_VALUE_FR;
  // A shrunk rate of zero means the whole squad's is zero — nobody scored, or nobody conceded, in this
  // selection — and « 1 but toutes les ∞ » is not a figure. The polarity of the noun reads off the
  // seven's own rule sentence above the pitch, for the goals as for the conceded cells.
  const every = (rate: number) =>
    rate <= 0
      ? "aucun but"
      : compact
        ? `1 but/${minutesPerCount(rate)}′`
        : `1 but ${everyFr(MINUTES_PER_HOUR, rate)}`;
  switch (figure) {
    case "goals":
    case "keeperConceded":
    case "outfieldConceded":
      return every(value);
    case "impact":
      // Not abbreviated on the disc: « +6,0 » alone is the figure the owner could not read, and
      // « +1,8 pour 60′ » measures 82 px on the turf at the caption's 11 px — inside the 104 px
      // budget two neighbouring captions leave each other.
      return `${formatSignedDecimal(value)} pour 60′`;
    case "ratings":
      return formatRating(value);
  }
}

/**
 * The raw record the ranked figure was smoothed from, printed beside it (decision 072: nothing on
 * hover). Null when there is no record at all — « 0 but sur 0′ » is arithmetic about nothing.
 *
 * `compact` is the disc caption, about 104 px wide: the same facts with shorter nouns.
 */
export function sevenObservedFr(
  figure: SevenFigure,
  observed: SevenObserved,
  compact = false,
): string | null {
  if (figure === "ratings") return observedFigureFr("ratings", observed);
  if (observed.denominator <= 0) return null;
  const minutes = observed.denominator;
  switch (figure) {
    case "goals": {
      const assists = observed.secondary ?? 0;
      return compact
        ? `${plural(observed.numerator, "but")} · ${assists} p.d. · ${formatMinutes(minutes)}`
        : `${plural(observed.numerator, "but")}, ${plural(assists, "passe décisive", "passes décisives")} sur ${formatMinutes(minutes)}`;
    }
    case "keeperConceded":
    case "outfieldConceded":
      if (!compact) return concededRecordFr(observed.numerator, minutes);
      return observed.numerator === 0
        ? `aucun en ${formatMinutes(minutes)}`
        : `${observed.numerator} pris en ${formatMinutes(minutes)}`;
    case "impact":
      return impactRecordFr(observed.numerator, observed.secondary ?? 0, minutes);
  }
}

/**
 * Who may keep goal, and — in the légende — who was refused (Q8). Printed under every new seven,
 * because « parmi ceux qui ont joué au goal » leaves a coach-declared keeper off the pitch when he
 * has never actually played there, and the reader is owed why.
 */
export function keeperRuleFr(input: {
  seven: SevenKind;
  considered: number;
  refused: number;
  /** The keepers' pooled conceded rate per 60, for the « moyenne des gardiens » figure. */
  average: number | null;
}): string | null {
  if (input.seven === "notes") return null;
  if (input.considered === 0) {
    return (
      "Personne n’a encore de minutes dans les buts sur cette sélection : le poste de gardien est " +
      "donc rempli comme les autres, d’après les postes indiqués."
    );
  }
  const many = input.considered > 1;
  const base =
    `${plural(input.considered, "joueur")} ${many ? "ont" : "a"} joué au goal sur cette sélection, et ` +
    `seul${many ? "s" : ""} ${many ? "eux peuvent" : "lui peut"} y être placé${many ? "s" : ""} — ` +
    "gardien indiqué par le coach ou joueur de champ qui a dépanné.";
  if (input.seven !== "legende" || input.refused === 0 || input.average === null) return base;
  const refusedMany = input.refused > 1;
  return (
    `${base} ${input.refused} ${refusedMany ? "sont écartés" : "est écarté"} du 7 de légende : ` +
    `${refusedMany ? "ils encaissent" : "il encaisse"} plus que la moyenne des gardiens, ` +
    `${formatSevenFigure("keeperConceded", input.average)}.`
  );
}

/**
 * What the figure under each name **is**, and what was done to it before it was ranked.
 *
 * Two claims, and since decision 199 the first one comes first: the unit. « 0,49/h » was on screen and
 * the owner wrote twice that he did not understand it, so the sentence now reads the figure out loud —
 * « 1 but toutes les 133′ » is a goal every 133 minutes of his play — before it explains the smoothing.
 * And the légende says the opposite of the other three, because decision 198 took the smoothing out of
 * the impact: there the figure is the plain division, and a reader can check it against the counts
 * printed under the name.
 */
export function sevenSmoothingFr(seven: SevenKind): string | null {
  const smoothed =
    "Il est lissé vers la moyenne de l’équipe : quelques minutes ne suffisent pas pour passer devant " +
    "une saison entière. Sous chaque joueur, ce qu’il a vraiment fait.";
  switch (seven) {
    case "offensive":
      // Both polarities are on this pitch — six men are read on the goals they score, the gardien on
      // the ones he takes — so the sentence names them separately rather than leaving the reader to
      // work out which of the two « 1 but toutes les X′ » he is looking at.
      return (
        "Le gros chiffre se lit « 1 but toutes les X minutes de jeu » : pour un joueur de champ c’est " +
        "un but qu’il marque, et plus l’attente est courte, mieux c’est ; pour le gardien c’est un " +
        `but qu’il encaisse, et c’est l’inverse. ${smoothed} Deux joueurs dont l’attente s’affiche ` +
        "pareil sont départagés par leurs passes décisives."
      );
    case "defensive":
      return (
        "Le gros chiffre se lit « 1 but encaissé toutes les X minutes de jeu », pour le gardien comme " +
        `pour les joueurs de champ : plus l’attente est longue, mieux c’est. ${smoothed} Le temps ` +
        "passé au goal n’est pas compté pour un joueur de champ : il a son propre chiffre."
      );
    case "legende":
      return (
        "Le gros chiffre est la différence de buts de l’équipe pendant qu’il tenait ce poste, ramenée " +
        "à 60 minutes de jeu : +1 et 0 encaissé en 10′ donne « +6,0 pour 60′ ». Rien n’est lissé, et " +
        "le calcul se refait à la main avec les chiffres écrits dessous. Le chiffre du gardien, lui, " +
        "est l’attente entre deux buts encaissés, lissée vers la moyenne des gardiens. Un joueur qui " +
        "n’a jamais tenu le poste n’y a aucun chiffre, et le sept place d’abord ceux qui y ont joué."
      );
    case "notes":
      return null;
  }
}

/** The badge on a man the seven refuses in goal (decision 172): never kept it, or below average. */
export const KEEPER_REFUSED_BADGE_FR = "écarté du goal";

/**
 * Whose average a disc with no figure of its own is wearing.
 *
 * It used to answer « moyenne du poste » for the impact, and decision 198 makes that unreachable rather
 * than wrong: the impact is raw now, so a man with no minute at the post has **no** figure at all
 * (`adjusted === null`) and this caption is not drawn for him. The keepers are named separately because
 * they are their own population (rule 4 of `best-seven.ts`): « moyenne de l’équipe » under a goal disc
 * would name the wrong twelve people.
 */
export function squadMeanStandInShortFr(figure: SevenFigure): string {
  return figure === "keeperConceded" ? "moyenne des gardiens" : "moyenne de l’équipe";
}

/* -------------------------------------------------------------------------- */
/* Where the seven came from, and the context it was asked with (decision 204) */
/* -------------------------------------------------------------------------- */

/** `?contexte=` — the free text the owner types under the pitch. */
export const CONTEXT_PARAM = "contexte";

/**
 * Long enough for « sans Karim ni Momo, on joue le premier du championnat et Théo revient de blessure »
 * and short enough that a forged URL cannot stuff a prompt. A longer value is **cut, not refused**:
 * the reader's sentence is not an error, and losing the tail of it is better than losing the screen.
 */
export const CONTEXT_MAX_LENGTH = 500;

/** Same tolerance as every other parser here: missing, repeated, empty or oversized all degrade. */
export function parseSevenContext(value: string | string[] | undefined): string {
  const raw = firstOf(value);
  if (typeof raw !== "string") return "";
  return raw.slice(0, CONTEXT_MAX_LENGTH).replace(/\s+/gu, " ").trim();
}

export const SEVEN_CONTEXT_LABEL_FR = "Ce que les chiffres ne savent pas";
export const SEVEN_CONTEXT_PLACEHOLDER_FR =
  "L’adversaire, qui est absent, qui revient de blessure…";
export const SEVEN_CONTEXT_HINT_FR =
  "Écris-le et le sept est redemandé en en tenant compte ; laissé vide, il ne juge que les chiffres de la saison.";
export const SEVEN_CONTEXT_SUBMIT_FR = "Redemander le sept";

/**
 * While the model is out. Said once, in words, and never as a progress bar: the wait is not measurable
 * from here and a bar that cannot progress is a lie.
 */
export const SEVEN_PENDING_FR = "Le modèle compose le sept…";

/** The heading over the model's few sentences on the seven as a whole. */
export const SEVEN_SUMMARY_HEADING_FR = "Ce que le modèle en dit";

/** Which of the three paths produced the seven on screen. */
export type SevenSource =
  | { path: "model"; model: string }
  | { path: "cache"; model: string; computedAt: string }
  | {
      path: "algorithm";
      failure: "rateLimited" | "httpError" | "timedOut" | "invalidAnswer" | "noKey";
    };

/**
 * One sentence saying where the seven came from — printed, never hovered (decision 072).
 *
 * The failures are not edge cases: a model is a network call to somebody else's machine, so a refusal,
 * a hang and a nonsense answer all happen. Each one therefore reads as a fact about the model plus the
 * reassurance that the pitch above is still a real seven. None of them is ever a status code, a stack
 * or the word « erreur » on its own — and none of them promises a delay it cannot know: the model is
 * paid for by the call, so a 429 is a busy minute and **not** a daily ceiling that lifts tomorrow.
 *
 * `when` is already formatted — `lib/calendar/time.ts` pins Europe/Paris, and this module is pure.
 */
export function sevenSourceFr(source: SevenSource, when: string | null = null): string {
  switch (source.path) {
    case "model":
      return `Ce sept est celui du modèle ${source.model}, demandé à l’instant.`;
    case "cache":
      return (
        `Ce sept est celui du modèle ${source.model}, calculé ${when ?? "plus tôt"}. ` +
        "Même effectif, mêmes chiffres, même contexte : il n’est pas redemandé."
      );
    case "algorithm":
      switch (source.failure) {
        case "rateLimited":
          return (
            "Le modèle refuse les questions pour le moment : il en reçoit trop. Ce sept est celui de " +
            "l’algorithme, sur les mêmes chiffres — redemande son avis dans quelques minutes."
          );
        case "timedOut":
          return (
            "Le modèle a mis trop de temps à répondre. Ce sept est celui de l’algorithme, sur les " +
            "mêmes chiffres — redemande son avis si tu veux réessayer."
          );
        case "httpError":
          return (
            "Le modèle n’a pas répondu. Ce sept est celui de l’algorithme, sur les mêmes chiffres — " +
            "réessaie plus tard si tu veux son avis."
          );
        case "invalidAnswer":
          return (
            "Le modèle a répondu deux fois à côté de la question. Ce sept est celui de l’algorithme, " +
            "sur les mêmes chiffres."
          );
        case "noKey":
          return (
            "Aucun modèle n’est branché sur cette installation : ce sept est celui de l’algorithme, " +
            "qui est celui du reste de l’écran."
          );
      }
  }
}
