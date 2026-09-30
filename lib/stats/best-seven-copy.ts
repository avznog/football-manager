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
 * shrunken value (`best-seven.ts`, rule 2), on posts nobody has ever been measured at, out of ratings
 * only this reader can see. Four of those are things the screen would otherwise imply away, and this
 * repository's definition of done singles out « a screen stating something untrue » as the defect
 * class no test catches. Hence one function per claim:
 *
 * 1. `DECLARED_POSTS_FR` — the posts are declarations, not measurements.
 * 2. `viewerRelativeRatingsFr` — a ratings seven is one reader's (decisions 007 and 021).
 * 3. `shrinkageSentenceFr` — what the shrinkage did, in the unit it measured (rule 3).
 * 4. `CLEAN_SHEET_READINGS_FR` — which of decision 011's two invincibilités is being read.
 * 5. `squadMeanStandInFr` — a disc whose number is the squad's average and not that man's (rule 2,
 *    and the part of decision 115 that was overstated).
 *
 * And none of them is a `title`: there is no hover on a phone (decision 072), so every one of these
 * is printed under the pitch.
 */

import { positionLabelFr } from "@/db/reference";

import type { BestSevenCriterion, ObservedFigure, ShrinkageReport } from "./best-seven";
import { BEST_SEVEN_CRITERIA } from "./best-seven";
import {
  NO_VALUE_FR,
  formatDecimal,
  formatMinutes,
  formatPercent,
  formatRating,
  matchCount,
  plural,
} from "./format";

/* -------------------------------------------------------------------------- */
/* The query string                                                           */
/* -------------------------------------------------------------------------- */

/** The keys `/stats/equipe-type` reads, spelled once. French, like every other URL in this app. */
export const CRITERION_PARAM = "critere";
export const DIRECTION_PARAM = "sens";
export const FORMATION_PARAM = "formation";

export type BestSevenDirection = "best" | "worst";

/**
 * What `sens` is written as in the URL: a coach's word, not the type's.
 *
 * Exported because the controls are now `<select>`s inside a `method="get"` form: with JavaScript off
 * the browser puts the chosen `<option value>` straight into the query string, so the option values
 * *are* these, and a second spelling of « pire » in the component is a filter that would silently stop
 * working for exactly the reader who has no JavaScript.
 */
export const DIRECTION_VALUES: Readonly<Record<BestSevenDirection, string>> = {
  best: "meilleur",
  worst: "pire",
};

/**
 * The criterion the screen opens on.
 *
 * Not `ratings`, deliberately, even though « l'équipe type » most obviously means the best-rated
 * seven: decision 021 makes a ratings average invisible to a reader who has not voted, so a player
 * who has never opened the notation flow would land on an empty screen and read it as a bug. Goals
 * per hour has a basis from the first final whistle, for everybody.
 */
export const DEFAULT_CRITERION: BestSevenCriterion = "goals";
export const DEFAULT_DIRECTION: BestSevenDirection = "best";

/** `?critere=goals&critere=ratings` is a forged URL, not an error: the first value wins. */
function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A hand-typed or stale query string degrades to the default, never to an error (like `/stats`).
 *
 * **An empty value is one of those**, and it is not hypothetical any more: the controls are a
 * `method="get"` form, so a browser with no JavaScript submits `?critere=&sens=&formation=&competition=`
 * for whatever the reader left at « Toutes » or at the default. `equipeTypeHref` never writes an empty
 * value — it omits the key instead — so all four of these are only ever exercised by the no-JavaScript
 * path, which is precisely why they are pinned in `best-seven-copy.test.ts` rather than trusted.
 */
export function parseCriterion(value: string | string[] | undefined): BestSevenCriterion {
  return BEST_SEVEN_CRITERIA.find((criterion) => criterion === firstOf(value)) ?? DEFAULT_CRITERION;
}

export function parseDirection(value: string | string[] | undefined): BestSevenDirection {
  return firstOf(value) === DIRECTION_VALUES.worst ? "worst" : DEFAULT_DIRECTION;
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
 * The shape the reader chose himself, or null for « la plus jouée » — and **naming the most-played
 * shape is not overriding it.**
 *
 * `formationOverrideFr` ends « Ce n'est pas la forme que l'équipe a le plus jouée », which was once
 * printed about the very shape the control had just labelled « (la plus jouée) »: two entries, identical
 * layout, contradictory captions. The select no longer offers it twice, but a bookmark or a hand-typed
 * `?formation=` can still carry that id, so it is resolved to null here — one place, rather than a
 * special case in the sentence, in the select's `defaultValue` and in `equipeTypeHref` separately. The
 * shape drawn is identical either way: `override ?? usage.mostUsed`.
 *
 * Generic over the usage row so the page keeps the label and the match count it has to print.
 */
export function resolveFormationOverride<T extends { formationId: string; matches: number }>(
  value: string | string[] | undefined,
  formations: readonly T[],
  mostUsedFormationId: string | null,
): T | null {
  const first = firstOf(value);
  return (
    formations.find(
      (formation) =>
        formation.formationId === first &&
        formation.matches > 0 &&
        formation.formationId !== mostUsedFormationId,
    ) ?? null
  );
}

export type BestSevenQuery = {
  /** Shared with `/stats`, by id (decision 107). */
  competitionId: string | null;
  criterion: BestSevenCriterion;
  direction: BestSevenDirection;
  /** `formations.id` when the reader overrode the shape, null for « la plus jouée ». */
  formationId: string | null;
};

/**
 * Builds `/stats/equipe-type?…`, omitting whatever is at its default — the same rule as `statsHref`,
 * so a shared URL is the shortest one that means what the reader saw.
 */
export function equipeTypeHref(query: BestSevenQuery, competitionParam = "competition"): string {
  const params = new URLSearchParams();
  if (query.competitionId !== null) params.set(competitionParam, query.competitionId);
  if (query.criterion !== DEFAULT_CRITERION) params.set(CRITERION_PARAM, query.criterion);
  if (query.direction !== DEFAULT_DIRECTION) {
    params.set(DIRECTION_PARAM, DIRECTION_VALUES[query.direction]);
  }
  if (query.formationId !== null) params.set(FORMATION_PARAM, query.formationId);
  const search = params.toString();
  return search === "" ? "/stats/equipe-type" : `/stats/equipe-type?${search}`;
}

/* -------------------------------------------------------------------------- */
/* Naming the criterion                                                       */
/* -------------------------------------------------------------------------- */

/** The chip label. Short: four of them plus two direction chips share a 390 px row. */
export const CRITERION_CHIP_FR: Readonly<Record<BestSevenCriterion, string>> = {
  goals: "Buts",
  assists: "Passes déc.",
  ratings: "Notes",
  // « sans encaisser » and not « clean sheet »: the app has two spellings of this already and
  // `docs/ROADMAP.md` logs that as an inconsistency, so this screen adds no third one.
  cleanSheet: "Sans encaisser",
};

/**
 * The four controls, named. Nouns rather than instructions: « Critère » over a select is the whole
 * sentence, and a `<label>` reading « Choisis un critère » says the same thing one word at a time.
 *
 * Here rather than in the component for decision 097's reason — a label is a claim about the control
 * under it — and because « Meilleure ou pire » is the one that keeps the direction select honest: the
 * old chip row's own `aria-label` said « Meilleure ou pire équipe », and a select whose options read
 * « La meilleure » / « La pire » needs the same subject stated once above it.
 */
export const SEVEN_CONTROL_LABEL_FR = {
  criterion: "Critère",
  direction: "Meilleure ou pire",
  formation: "Forme de jeu",
  competition: "Compétition",
} as const;

/** The two direction options, as a reader picks them: « La meilleure », « La pire ». */
export const DIRECTION_OPTION_FR: Readonly<Record<BestSevenDirection, string>> = {
  best: "La meilleure",
  worst: "La pire",
};

/** « Toutes » — the competition select's first option, and the same word `/stats`'s chip row uses. */
export const ALL_COMPETITIONS_FR = "Toutes";

/**
 * The formation select's first option: the shape chosen when nothing overrides it.
 *
 * It names the shape *and* says why it is the default, because a bare « 1-3-2-1 » beside another bare
 * « 2-3-1 » gives the reader no way to tell which one the app would have picked for him.
 */
export function mostUsedFormationOptionFr(label: string | null): string {
  return label === null ? "La plus jouée" : `${label} (la plus jouée)`;
}

/**
 * The button only a reader with no JavaScript ever sees: the form is a `method="get"`, so submitting it
 * is what applies the four selects. « Voir ce sept » rather than « Valider » — nothing is saved.
 */
export const SEVEN_CONTROLS_SUBMIT_FR = "Voir ce sept";

/** The criterion as a noun phrase, for a sentence: « … classe les buts par heure de jeu ». */
export const CRITERION_SUBJECT_FR: Readonly<Record<BestSevenCriterion, string>> = {
  goals: "les buts par heure de jeu",
  assists: "les passes décisives par heure de jeu",
  ratings: "la moyenne des notes reçues",
  cleanSheet: "la part des minutes jouées sans encaisser",
};

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
 * One value of the criterion, in its own scale. Goals and assists are rates per hour of football
 * (`MINUTES_PER_RATE_UNIT`), ratings are marks out of ten, invincibility is a share of minutes.
 */
export function formatCriterionValue(
  criterion: BestSevenCriterion,
  value: number | null,
): string {
  if (value === null) return NO_VALUE_FR;
  switch (criterion) {
    case "goals":
    case "assists":
      return `${formatDecimal(value, 2)}/h`;
    case "ratings":
      return formatRating(value);
    case "cleanSheet":
      return formatPercent(value);
  }
}

/**
 * The raw figure with its denominator: « 9,0 sur 1 note », « 3 buts sur 240′ ».
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
      return `${formatRating(observed.rate)} sur ${plural(observed.denominator, "note")}`;
    case "cleanSheet":
      return `${formatMinutes(observed.numerator)} sur ${formatMinutes(observed.denominator)}`;
  }
}

/**
 * The same figure, short enough for a disc.
 *
 * Measured, not guessed: the closest two posts of a built-in formation leave about 104 px of chip, and
 * « 6 passes décisives sur 360′ » needs 120 px at the size a disc caption is set in — so on `assists`,
 * and only there, the noun takes the abbreviation the criterion chip already uses (« Passes déc. »).
 * Every other criterion is identical to `observedFigureFr`, and the wide list under the pitch always
 * prints the unabbreviated one. Two wordings of one figure is a real cost; a caption reading « 0 passe
 * décisi… » is a worse one.
 */
export function observedFigureCompactFr(
  criterion: BestSevenCriterion,
  observed: ObservedFigure,
): string | null {
  if (criterion !== "assists") return observedFigureFr(criterion, observed);
  if (observed.rate === null || observed.denominator <= 0) return null;
  return `${plural(observed.numerator, "passe déc.", "passes déc.")} sur ${formatMinutes(observed.denominator)}`;
}

/* -------------------------------------------------------------------------- */
/* The heading, which is a claim about every disc under it (decision 087)      */
/* -------------------------------------------------------------------------- */

/**
 * The heading over the pitch.
 *
 * `touched` is the whole reason this is a function. « La meilleure équipe » is true of the seven the
 * assignment chose and false of the seven the reader has since edited — decision 087's rule is that a
 * heading is a claim about every row under it, and a pitch still headed « meilleure » after two swaps
 * is that claim gone false. So the heading changes with the first swap, and the optimum's own total
 * stays on screen beside it to compare against.
 */
export function sevenHeadingFr(direction: BestSevenDirection, touched: boolean): string {
  if (touched) return "Ton équipe";
  return direction === "best" ? "La meilleure équipe" : "La pire équipe";
}

/** The optimum's figure, kept beside « Ton équipe » so a swap can be judged rather than guessed. */
export function optimumComparisonFr(
  direction: BestSevenDirection,
  formattedValue: string,
): string {
  const subject = direction === "best" ? "La meilleure équipe" : "La pire équipe";
  return `${subject} : ${formattedValue}`;
}

/** The « revenir à la meilleure » control, worded for the direction it returns to. */
export function resetLabelFr(direction: BestSevenDirection): string {
  return direction === "best" ? "Revenir à la meilleure" : "Revenir à la pire";
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
 * There is **no per-post minute data in this database**: `match_player_stats.gkMinutes` is the only
 * positional figure that exists anywhere, and the reducer's `positionSpells` are in-memory match
 * state the freeze path never writes down. So « meilleur milieu droit » would imply a measurement
 * this app cannot make, and the screen says which of the two it means instead.
 * `docs/ROADMAP.md`'s `minutes_by_position` item is what would change that.
 */
export const DECLARED_POSTS_FR =
  "Les postes viennent de ce que chacun a déclaré sur son profil, pas de ses minutes : l’appli ne " +
  "mesure nulle part le temps passé à chaque poste.";

/**
 * The same sentence, finished by naming which end of the ranking the reader is looking at.
 *
 * The tail has to follow `direction`, because the constant alone used to end « qui est le meilleur sur
 * le critère choisi » and that clause was printed verbatim under « La pire équipe » — a screen saying
 * the opposite of the seven drawn above it, which is exactly the defect class the definition of done
 * singles out. Found by reading the rendered `?sens=pire` screen, not by a test.
 */
export function declaredPostsFr(direction: BestSevenDirection): string {
  const end =
    direction === "best"
      ? "Ce sept dit donc qui est le meilleur sur le critère choisi, parmi ceux qui se disent à ce poste."
      : "Ce sept dit donc qui est le moins en avant sur le critère choisi, parmi ceux qui se disent à ce poste.";
  return `${DECLARED_POSTS_FR} ${end}`;
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

/**
 * Decision 021 applies decision 007's gate to season averages, so **two teammates read two
 * different sevens off the same season**, and neither is wrong. That is not a footnote on this
 * screen: it is what the heading « La meilleure équipe » would otherwise claim to be objective.
 *
 * Only the `ratings` criterion is gated — goals, assists and minutes are the event log, which
 * everybody sees — so this returns null for the other three rather than making the reader read a
 * caveat that does not apply to what is on screen.
 */
export function viewerRelativeRatingsFr(criterion: BestSevenCriterion): string | null {
  if (criterion !== "ratings") return null;
  return (
    "Ce sept est bâti d’après les matchs que tu as notés : un coéquipier qui a noté d’autres " +
    "matchs que toi ne voit pas le même sept, et c’est normal."
  );
}

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
    case "ratings":
      return plural(Math.round(report.priorStrength), "note");
    case "sixtyMinutes": {
      const printed = formatDecimal(report.priorStrength, 1);
      return `${printed} ${pluralFromPrinted(printed, "heure")} de jeu`;
    }
    case "minutes":
      return formatMinutes(Math.round(report.priorStrength));
  }
}

/**
 * « Les notes sont ramenées vers la moyenne de l'équipe, à hauteur de 4 notes. »
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

/** The keepers' own model (rule 4), in the same words. Null when there is no second model. */
export function goalkeeperShrinkageSentenceFr(
  criterion: BestSevenCriterion,
  report: ShrinkageReport | null,
): string | null {
  if (report === null) return null;
  return shrinkageSentenceFr(
    criterion,
    report,
    "Pour le gardien, les minutes sans encaisser dans les buts sont ramenées",
  );
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
    `${count} des sept ${many ? "n’ont" : "n’a"} aucun chiffre cette saison sur ce critère : ` +
    `${many ? "ils sont affichés" : "il est affiché"} à la moyenne de l’équipe, donc ` +
    `${many ? "ni flattés ni punis" : "ni flatté ni puni"} pour ne pas avoir joué — ` +
    `${many ? "ils peuvent" : "il peut"} donc apparaître dans la meilleure comme dans la pire équipe.`
  );
}

/* -------------------------------------------------------------------------- */
/* Honesty sentence 4 — which invincibilité                                   */
/* -------------------------------------------------------------------------- */

/**
 * Decision 011 kept **two** clean-sheet figures on purpose, because « minutes d'invincibilité » was
 * ambiguous and the owner wanted both. Rule 4 of `best-seven.ts` therefore scores the GB slot on the
 * keeper's own pair and the six others on the all-pitch pair, each against its own fitted prior — and
 * a card headed « invincibilité » that silently picked one of them is exactly the claim decision 087
 * forbids. So the screen names both.
 */
export const CLEAN_SHEET_READINGS_FR =
  "Il y a deux façons de compter l’invincibilité, et les deux servent ici : le gardien est jugé sur " +
  "ses minutes passées dans les buts sans encaisser, les six autres sur leurs minutes sur le " +
  "terrain sans encaisser. Chaque lecture a son propre étalonnage — les gardiens ne sont comparés " +
  "qu’entre eux.";

/** Only the one criterion has two readings to disambiguate. */
export function cleanSheetReadingsFr(criterion: BestSevenCriterion): string | null {
  return criterion === "cleanSheet" ? CLEAN_SHEET_READINGS_FR : null;
}

/* -------------------------------------------------------------------------- */
/* The shape, and who was left out of the squad                               */
/* -------------------------------------------------------------------------- */

/**
 * « 1-3-2-1, utilisée dans 7 matchs sur les 8 terminés de cette sélection. »
 *
 * A shape without its count is a tactical opinion dressed as a fact, which is why
 * `formation-usage.ts` never returns one without the other.
 *
 * Two French defects lived in the two branches. The noun was repeated — « dans 6 matchs sur les 7
 * matchs terminés » — where French says the number alone after « sur les ». And the « all of them »
 * branch read « utilisée dans 1 match — tous ceux de cette sélection », a plural about a single match.
 */
export function formationUsageFr(input: {
  label: string;
  matches: number;
  matchesConsidered: number;
}): string {
  if (input.matches >= input.matchesConsidered) {
    const all = input.matches > 1 ? "tous ceux de cette sélection" : "le seul de cette sélection";
    return `${input.label}, utilisée dans ${matchCount(input.matches)} — ${all}.`;
  }
  return `${input.label}, utilisée dans ${matchCount(input.matches)} sur les ${input.matchesConsidered} terminés de cette sélection.`;
}

/** The shape the reader chose himself: no count to quote, and it must not pretend to one. */
export function formationOverrideFr(label: string): string {
  return `${label}, choisie par toi. Ce n’est pas la forme que l’équipe a le plus jouée.`;
}

/**
 * Finished matches with no composition at all — retro-entered, or played before anybody drew one
 * (decision 013). The winning shape is then a majority of what was *recorded*, not of what was
 * played, and the difference is the reader's to judge.
 */
export function matchesWithoutCompositionFr(count: number): string | null {
  if (count <= 0) return null;
  return (
    `${matchCount(count)} terminé${count > 1 ? "s" : ""} ${count > 1 ? "n’ont" : "n’a"} aucune ` +
    "composition enregistrée : la forme retenue est majoritaire parmi les matchs dessinés, pas " +
    "parmi les matchs joués."
  );
}

/**
 * Nobody ever drew a composition: the pitch cannot be drawn, so the screen says why.
 *
 * It used to end « ou choisis une forme toi-même ci-dessus », and that was an instruction to use a
 * control that is never on screen at the same time as this sentence: the formation select only lists
 * shapes the team has played, and `mostUsed` is null exactly when none has, so reaching this state means
 * there is nothing to choose from. Pointing at it « ci-dessous » after the controls moved under the
 * pitch would have kept the defect and only changed the direction it pointed in.
 */
export const NO_FORMATION_FR =
  "Aucune composition n’a encore été enregistrée sur un match terminé, donc l’appli ne sait pas " +
  "quelle forme tu joues — et sept postes inventés seraient un avis déguisé en mesure. Dessine une " +
  "composition sur un match, et ce sept apparaîtra.";

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

/** Not one candidate has any exposure: the seven is posts and tie-breaks, and says so. */
export function noBasisFr(criterion: BestSevenCriterion): string {
  return (
    `Personne n’a encore de chiffre sur ce critère : ${CRITERION_SUBJECT_FR[criterion]} ne peut ` +
    "classer personne, et ce sept n’est qu’un placement par postes déclarés."
  );
}
