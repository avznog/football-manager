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
  concededRecordFr,
  formatDecimal,
  formatMinutes,
  formatSignedDecimal,
  impactRecordFr,
  formatRating,
  plural,
} from "./format";
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
    "La meilleure attaque : à chaque poste de champ, le plus de buts par heure, puis de passes " +
    "décisives ; au goal, celui qui y a joué et y encaisse le moins.",
  defensive:
    "La meilleure défense : à chaque poste de champ, le moins de buts encaissés par heure sur le " +
    "terrain ; au goal, celui qui y a joué et y encaisse le moins.",
  legende:
    "Le meilleur à chaque poste, de l’attaque vers la défense, jugé sur la différence de buts quand " +
    "il y joue ; au goal, jamais quelqu’un en dessous de la moyenne des gardiens.",
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

/** Why a « pas son poste » badge exists at all: a seven has to be complete. */
export function outOfPositionNoteFr(count: number): string | null {
  if (count <= 0) return null;
  return (
    `${plural(count, "poste")} ${count > 1 ? "sont tenus" : "est tenu"} par quelqu’un qui ne l’a ` +
    `pas déclaré, et ${count > 1 ? "leurs disques le disent" : "son disque le dit"} : un sept doit ` +
    "être complet, donc le poste est rempli plutôt que laissé vide."
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
 */
export function squadMeanStandInFr(count: number): string | null {
  if (count <= 0) return null;
  const many = count > 1;
  return (
    `${count} des sept ${many ? "n’ont" : "n’a"} aucun chiffre cette saison à ce poste : ` +
    `${many ? "ils sont affichés" : "il est affiché"} à la moyenne de l’équipe, donc ` +
    `${many ? "ni flattés ni punis" : "ni flatté ni puni"} pour ne pas avoir joué.`
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
}): string | null {
  const parts: string[] = [];
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

/** Fewer men in the squad than posts on the pitch: some slots are honestly empty. */
export function emptySlotsFr(count: number): string | null {
  if (count <= 0) return null;
  return (
    `${plural(count, "poste")} ${count > 1 ? "restent vides" : "reste vide"} : l’effectif ne compte ` +
    "pas encore assez de joueurs pour remplir la forme."
  );
}


/* -------------------------------------------------------------------------- */
/* The four sevens' figures (decisions 171–172)                               */
/* -------------------------------------------------------------------------- */

/**
 * The ranked figure of one cell, in its own scale. Each slot of a seven can be scored by a different
 * figure now (decision 171), so the screen formats by the cell's `figure`, never by the seven:
 *
 * - goals: shrunk goals per hour, « 0,45/h », the scale the old `goals` criterion printed;
 * - conceded (in goal or outfield): the shrunk rate turned into « 1 but/24′ », S12's reading of it;
 * - impact: the shrunk goal difference per hour, signed, « +1,2/h »;
 * - ratings: a mark out of ten.
 */
export function formatSevenFigure(figure: SevenFigure, value: number | null): string {
  if (value === null) return NO_VALUE_FR;
  switch (figure) {
    case "goals":
      return `${formatDecimal(value, 2)}/h`;
    case "keeperConceded":
    case "outfieldConceded":
      return value <= 0 ? "aucun but" : `1 but/${Math.max(1, Math.round(60 / value))}′`;
    case "impact":
      return `${formatSignedDecimal(value)}/h`;
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

/** What the smoothing does to the new sevens, and the one rule of each that a reader would not guess. */
export function sevenSmoothingFr(seven: SevenKind): string | null {
  const base =
    "Chaque chiffre est lissé vers la moyenne de l’équipe : quelques minutes ne suffisent pas pour " +
    "passer devant une saison entière. Sous chaque joueur, ce qu’il a vraiment fait.";
  switch (seven) {
    case "offensive":
      return `${base} Deux joueurs dont les buts par heure s’affichent pareil sont départagés par leurs passes décisives.`;
    case "defensive":
      return `${base} Le temps passé au goal n’est pas compté pour un joueur de champ : il a son propre chiffre.`;
    case "legende":
      return (
        `${base} La différence de buts est celle de l’équipe pendant qu’il occupait ce poste ; un joueur ` +
        "qui n’y a jamais joué y est compté à la moyenne du poste."
      );
    case "notes":
      return null;
  }
}

/** The badge on a man the seven refuses in goal (decision 172): never kept it, or below average. */
export const KEEPER_REFUSED_BADGE_FR = "écarté du goal";

/**
 * Whose average a disc with no figure of its own is wearing: the team's, or — in the légende, which is
 * judged per position — the post's (`impactAt` in `impact.ts`).
 */
export function squadMeanStandInShortFr(figure: SevenFigure): string {
  return figure === "impact" ? "moyenne du poste" : "moyenne de l’équipe";
}
