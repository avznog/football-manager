/**
 * `bestSeven` — the best (or the worst) seven the season's figures can justify, on one criterion,
 * with the positions respected.
 *
 * This file has **no imports**, on purpose. Like `lib/match/reducer.ts` it is pure arithmetic: no
 * database, no `Date.now()`, no randomness, and not even a type from `db/`. The caller adapts its own
 * rows into the narrow inputs below. That is what lets every claim in this header be pinned by a test
 * in `best-seven.test.ts` — and decision 097 is the reminder that a tested function is only half the
 * job: the screen still has to print what comes out of here, which is why the output carries the raw
 * figures and the measured prior strength rather than only the ranking.
 *
 * ## The rules that neither the plan nor the notes settled
 *
 * 1. **Every criterion is a rate, never a total.** Goals per 60 minutes, assists per 60 minutes, the
 *    average rating received, the share of minutes played with the sheet unbroken. « Meilleur buteur »
 *    already exists — it is the `/stats` leaderboard, and it is a table of totals. A best *seven* is a
 *    claim about who to put on a pitch next Sunday, and a man who played half the season must be able
 *    to win it. The corollary is that this file divides, and therefore that it has to answer for the
 *    thin denominators that division exposes — rules 2 and 3.
 *
 * 1b. **A figure the models cannot produce is `null`, never `0`.** Everything below divides by a squad
 *    mean, and there are real selections where no squad mean exists at all — a competition filter
 *    whose matches are all still waiting on their notes, a `cleanSheet` seven on matches run in game mode
 *    without a confirmed composition, so that not one minute was ever attributed to the goal. In those
 *    cases the adjusted figure is `null` (rule 1 of `aggregate.ts`: « a number nobody has yet is
 *    `null`, never `0` »), and `aggregateSeven` refuses to total a partial seven. A `0` here is not a
 *    cautious answer: on a 0–10 rating scale it is the worst mark the app can print, and it was
 *    printed on seven discs at once.
 *
 * 2. **A thin figure is shrunk towards the squad, never gated.** `/stats` protects its rating
 *    leaderboard with a hard threshold (`MIN_RATED_MATCHES = 3`), which is the right answer for a table
 *    whose rows are independent. It is the wrong answer here: the owner asked for the figures to be
 *    weighted by how much a player has played, and explicitly refused a threshold, because a
 *    threshold makes a player appear and vanish as a Sunday passes. So every figure is an
 *    empirical-Bayes posterior mean,
 *
 *        adjusted = (n × observed + m × squadMean) / (n + m)
 *
 *    with `n` the player's exposure and `m` a prior strength in the same unit. Three properties then
 *    fall out of the arithmetic instead of out of special cases, and each has a test:
 *      - a player with **no data lands exactly on the squad mean** (`n = 0` leaves `m × mean / m`), so
 *        he *heads* neither the best nor the worst seven. That is the rule `comparePlayers` states in
 *        `aggregate.ts` — « unknown is not "worst" — but it cannot head a ranking either » — obtained
 *        here by division rather than by a `null` branch. It is worth being exact about what that does
 *        **not** say, because decision 115 overstates it: he is routinely *in* both sevens. A slot with
 *        two candidates gives it to him whenever the squad mean beats the other man's real figure, and
 *        in the worst seven whenever it falls below it. So the screen owes a sentence saying the figure
 *        under his disc is the squad's and not his — `squadMeanStandInFr` in `best-seven-copy.ts`, and
 *        `hasOwnExposure` below is how the screen knows which discs it is about;
 *      - the **worst** seven is protected by the same line: twenty minutes and three conceded is
 *        pulled most of the way back to the mean, so it does not crown a worst defender;
 *      - it is **continuous**: nothing appears or disappears as an exposure crosses a value.
 *
 * 3. **`m` is measured, not chosen.** A hardcoded prior strength would be this file inventing how
 *    sceptical to be. Instead it is the method-of-moments ratio of the noise *within* one player's
 *    figures to the real spread *between* players: a uniform squad measures a large `m` and a
 *    sceptical screen, a squad with genuine gulfs measures a small one and lets them show. It is
 *    clamped, because a three-match season measures a between-player variance of almost nothing and
 *    would otherwise produce an absurd number; the clamps are justified one by one at
 *    `PRIOR_STRENGTH_CLAMP`. And it is **returned**, so the screen can write « les notes sont ramenées
 *    vers la moyenne de l'équipe, à hauteur de 4 matchs notés ». A number the screen cannot explain
 *    is a number the screen must not use.
 *
 * 4. **For the goalkeeper's slot, `cleanSheet` scores the keeper's own pair.** Decision 011 kept two
 *    clean-sheet figures because « minutes d'invincibilité » was ambiguous and the owner wanted both:
 *    `cleanMinutes / minutes` for anybody on the pitch, `gkCleanMinutes / gkMinutes` for time actually
 *    spent in goal. A card headed « invincibilité » that silently picked one of them would be exactly
 *    the sort of claim decision 087 forbids, so the GB slot is scored on the keeper pair, against the
 *    keepers' own squad mean and their own measured `m` — they are a different population and pooling
 *    them with ten outfielders would flatter or punish them for nothing — and every slot says which
 *    pair it used, in `figureSource`, next to the numbers it used.
 *
 * 5. **The seven is an exact assignment, and positions come first.** Filling the slots greediest-first
 *    is wrong the moment two slots want the same man, so the seven is chosen by a bitmask DP over the
 *    slots: exact, a few thousand operations, and testable against a greedy pass (it is). The
 *    objective is **lexicographic** — first how many slots are filled by somebody who *declared* that
 *    post, then how many of those are his *primary* post, only then the criterion total. That is the
 *    honest reading of « il faut faire attention aux postes »: it will not put the best scorer in goal
 *    to win a goals total, and it will not refuse to fill a post nobody declared either. It fills it
 *    and marks the man `fit: "none"` so the screen can badge the disc « pas son poste ». A "position"
 *    in this codebase is only ever what a player **declared** (`player_positions`, decision 005):
 *    there is no per-post minute data anywhere, so there is nothing else it could mean.
 *
 * 6. **The worst seven is the best seven of the negated criterion**, not a second algorithm with its
 *    own comparisons to get wrong. `direction: "worst"` negates the value the DP maximises and changes
 *    nothing else: the positional objective and the tie-breaks are unchanged, because the worst seven
 *    is still a team of people who play where they say they play.
 */

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** The four criteria a seven can be built on. Rule 1: all four are rates. */
export const BEST_SEVEN_CRITERIA = ["goals", "assists", "ratings", "cleanSheet"] as const;

export type BestSevenCriterion = (typeof BEST_SEVEN_CRITERIA)[number];

/**
 * What a player declared about a post. Mirrors `position_preference` in `db/schema.ts` and
 * `PositionPreference` in `lib/pitch/preferences.ts`, restated here so this file imports nothing.
 */
export type PositionDeclaration = "primary" | "secondary";

/** How a player fits the slot he was given. `"none"` is the « pas son poste » badge (rule 5). */
export type SlotFit = PositionDeclaration | "none";

/**
 * One slot of a formation. Deliberately not `FormationSlotTemplate`: this file needs an identity, the
 * post code to match declarations against, and to know which slot is the goalkeeper's — and it is
 * told, rather than comparing a string to `"GB"`, so rule 4 does not depend on a magic code.
 */
export type BestSevenSlot = {
  /** Stable within one call; echoed back in the result so the caller can join on it. */
  id: string;
  /** Matched for equality against the candidates' declarations. Never interpreted. */
  positionCode: string;
  /** Rule 4: this is the slot that scores `cleanSheet` on the keeper pair. */
  isGoalkeeper: boolean;
};

/**
 * One candidate's season, in the only figures this file needs. A narrow shape on purpose: the caller
 * adapts `PlayerSeasonStats` (or anything else) into it, so a change to the season aggregate cannot
 * silently change a ranking, and a test can write a squad in six lines.
 */
export type BestSevenCandidate = {
  id: string;
  displayName: string;
  /** Last tie-break (`BEST_SEVEN_TIE_BREAKS`). Null sorts behind every number. */
  jerseyNumber: number | null;
  /** Minutes on the pitch, all posts. The denominator of goals, assists and field invincibility. */
  minutes: number;
  goals: number;
  assists: number;
  /** Minutes played with the sheet still unbroken, every player (decision 011). */
  cleanMinutes: number;
  /** Minutes spent in the GB slot. */
  gkMinutes: number;
  /** Of those, the ones with the sheet unbroken (decision 011). */
  gkCleanMinutes: number;
  /** 0–10, un-rounded. Null when nobody rated him — not `0` (`aggregate.ts` rule 1). */
  ratingAverage: number | null;
  ratingCount: number;
  /**
   * Population variance of the same per-match means. Null below two rated matches — one figure has no
   * spread, and a `0` there would claim a metronome where there is simply no second Sunday. This is
   * the within-player noise of rule 3's numerator; `PlayerRating.variance` in `aggregate.ts` exists to
   * supply it, so this file never re-reads a note and never re-derives the publication rule.
   *
   * Decision 137 changed what it measures without changing its role: match-to-match variation, where
   * it used to be rater-to-rater disagreement. The better quantity of the two for shrinking a thin
   * average — form that swings is what makes three matches a poor forecast of the fourth.
   */
  ratingVariance: number | null;
  /** What he declared, `player_positions` flattened. A missing code means "not wanted". */
  declarations: Readonly<Record<string, PositionDeclaration>>;
};

export type BestSevenInput = {
  criterion: BestSevenCriterion;
  /** `"worst"` is `"best"` of the negated criterion, and nothing else (rule 6). */
  direction: "best" | "worst";
  /** Seven of them in practice; any length works and the DP cost is `2^length`. */
  slots: readonly BestSevenSlot[];
  candidates: readonly BestSevenCandidate[];
};

/* -------------------------------------------------------------------------- */
/* Constants that are judgements, not magic                                   */
/* -------------------------------------------------------------------------- */

/**
 * How the team figure is built from the seven. A sum for the two counting rates — seven players'
 * goals per 60 is a team's goals per 60 — and a mean for the two that are already per-player scales:
 * summing seven marks out of ten would print 49, and summing seven proportions 4.7.
 */
export const BEST_SEVEN_AGGREGATION: Readonly<Record<BestSevenCriterion, "sum" | "mean">> = {
  goals: "sum",
  assists: "sum",
  ratings: "mean",
  cleanSheet: "mean",
};

/** The unit `n` and `m` are counted in, so the screen can write the noun after the number. */
export const BEST_SEVEN_EXPOSURE_UNIT: Readonly<
  Record<BestSevenCriterion, "ratedMatches" | "sixtyMinutes" | "minutes">
> = {
  goals: "sixtyMinutes",
  assists: "sixtyMinutes",
  ratings: "ratedMatches",
  cleanSheet: "minutes",
};

/**
 * The bounds the measured prior strength is clamped into, in each criterion's own unit. Every one of
 * these six numbers is a claim about the smallest and the largest amount of scepticism that is ever
 * reasonable, and a measurement outside them says more about a short season than about the squad.
 *
 * - **ratings, `[2, 10]`, in rated matches.** The unit changed with decision 137 — a season's input is
 *   one mean per match, not one note per teammate — and the two bounds happen to survive it, for
 *   reasons that have to be re-argued in the new unit rather than inherited. The floor is two matches:
 *   below that the shrinkage would be weaker than `/stats`'s own `MIN_RATED_MATCHES = 3` gate is
 *   strict, and one 9,0 afternoon would top the seven, which is the thing rule 2 exists to prevent.
 *   The ceiling is ten matches, most of an amateur season: past that every average collapses onto the
 *   team's and the card stops saying anything.
 * - **goals and assists, `[1, 6]`**, in 60-minute blocks — so between one match and six. A floor of
 *   one match means a hat-trick in a cameo is halved before it is believed; a ceiling of six matches
 *   is most of an amateur season, and more would bury a genuine goalscorer.
 * - **cleanSheet, `[60, 300]`** minutes — one match to five. Same reasoning in the unit the
 *   proportion is measured in: 7-a-side halves are 30 minutes, so 60 is one full match of play.
 */
export const PRIOR_STRENGTH_CLAMP: Readonly<
  Record<BestSevenCriterion, readonly [number, number]>
> = {
  ratings: [2, 10],
  goals: [1, 6],
  assists: [1, 6],
  cleanSheet: [60, 300],
};

/**
 * How a dead heat is broken, in order, after the positional objective and the criterion total.
 *
 * Minutes first: between two men the figures cannot separate, the one who has actually turned up is
 * the safer claim. Jersey number second, **ascending** — it is arbitrary, and that is the point: it
 * is arbitrary *and stable*, so the same squad never produces two different sevens between two
 * renders. What this list exists to forbid is the alternative, resolving a tie by position in the
 * candidates array, which is a tie broken by whatever a query happened to sort on.
 */
export const BEST_SEVEN_TIE_BREAKS = ["minutesPlayed", "jerseyNumber"] as const;

/**
 * Where an unnumbered player sorts on the jersey tie-break. Jersey numbers are two digits in this
 * sport, so 100 is behind every real one without being `Infinity`, which would poison the sums the
 * comparator adds up.
 */
export const UNNUMBERED_JERSEY_RANK = 100;

/** Rule 5: a declared post beats an undeclared one, and a primary post beats a secondary one. */
const FIT_IS_PRIMARY: Readonly<Record<SlotFit, number>> = { primary: 1, secondary: 0, none: 0 };
const FIT_IS_DECLARED: Readonly<Record<SlotFit, number>> = { primary: 1, secondary: 1, none: 0 };

/**
 * Two sums of the same seven floats can differ in their last bits depending on the order the DP
 * happened to add them in. Comparing them exactly would let that decide a seven, so scores within
 * this much are a tie and fall through to the tie-breaks. Criterion values are marks out of ten,
 * proportions and goals per hour: 1e-9 is far below anything that means something.
 */
const SCORE_EPSILON = 1e-9;

/** One 60-minute block. Goals and assists are rated per hour of football, not per match, because a
 * 7-a-side match is 2×30 and « par match » would have to know the periods of every fixture. */
const MINUTES_PER_RATE_UNIT = 60;

/* -------------------------------------------------------------------------- */
/* Outputs                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What actually happened, alongside what the ranking believes. Both travel to the screen because
 * decision 072 leaves nothing on hover: « 7,0 » and « 9,0 sur 1 match noté » are printed side by side,
 * so
 * the shrinkage is visible rather than a silent correction.
 */
export type ObservedFigure = {
  /** The raw rate — goals per 60, the average mark, the share of minutes. Null when nothing yet. */
  rate: number | null;
  /** Its numerator in natural units: goals, assists, clean minutes, or the sum of the match means. */
  numerator: number;
  /** Its denominator, the figure the screen says out loud: minutes, or a number of rated matches. */
  denominator: number;
  /** What that denominator counts: « sur 1 match noté », or « sur 240 minutes ». */
  denominatorUnit: "minutes" | "ratedMatches";
  /** The same denominator in the shrinkage's unit — 60-minute blocks for goals and assists. */
  exposure: number;
};

/** Which of decision 011's two clean-sheet pairs a figure came from (rule 4). */
export type FigureSource = "allPitch" | "goalkeeper";

/** What the shrinkage did, in full, so the screen can state it (rule 3). */
export type ShrinkageReport = {
  /**
   * The squad's pooled rate, exposure-weighted: total numerator over total exposure, not the mean of
   * the per-player rates. A player with no data lands exactly here (rule 2). Null when nobody in the
   * squad has any exposure at all, in which case the criterion cannot rank anyone.
   */
  squadMean: number | null;
  /** `m`, after clamping. The number the sentence « à hauteur de 4 matchs notés » prints. */
  priorStrength: number;
  /** What it measured before the clamp, or null when the squad was too thin to measure it. */
  measured: number | null;
  /**
   * **Why** it could not be measured, `null` exactly when `measured` is a number. Four causes, and
   * the screen has to tell them apart: the sentence it used to print — « les écarts entre les joueurs
   * sont trop petits, ou la saison trop courte » — is true of `noSpread` only, and was a fabricated
   * reason under `onePlayer` (there is one player, so there are no écarts at all) and under `noData`
   * (where the truth is that nobody has a figure). Distinguishing them here rather than at the copy
   * boundary is the point: this function already knows, and threw it away.
   *
   * - `noData` — not one candidate has any exposure, so there is no squad mean either.
   * - `onePlayer` — exactly one candidate has exposure: a mean, but nothing to compare it to.
   * - `noSpread` — several candidates, and what separates them is entirely explained by how little
   *   they have played (τ² ≤ 0).
   * - `noRepeat` — ratings only, and the fourth was the one worth separating: there are several rated
   *   players and real écarts between them, but **nobody has been rated twice**, so the *within*-player
   *   half of the ratio has no estimate at all. Saying « les écarts sont trop petits » there is false
   *   twice over — the écarts may be large, and what is missing is the other moment entirely.
   */
  unmeasurable: "noData" | "onePlayer" | "noSpread" | "noRepeat" | null;
  /** The bounds it was clamped into — `PRIOR_STRENGTH_CLAMP` for this criterion. */
  clamp: readonly [number, number];
  /** The unit `priorStrength` is counted in. */
  unit: "ratedMatches" | "sixtyMinutes" | "minutes";
  /** The two moments behind `measured`, for a debug screen and for the tests. */
  withinPlayerVariance: number | null;
  betweenPlayerVariance: number | null;
  /** Which pair this model was fitted on. Only ever `"goalkeeper"` for `cleanSheet`'s GB model. */
  source: FigureSource;
};

export type BestSevenPick = {
  slotId: string;
  positionCode: string;
  /** Null only when there were fewer candidates than slots. */
  player: { id: string; displayName: string; jerseyNumber: number | null } | null;
  /** `"none"` is the « pas son poste » badge (rule 5). */
  fit: SlotFit;
  /**
   * The shrunken figure the seven was ranked on. **Null when the model behind this slot has no squad
   * mean at all** — there is then no basis for a figure here, and rule 1b says so with a `null` the
   * screen prints as « — », not with a `0` that reads as the worst mark on the scale.
   */
  adjusted: number | null;
  /** The same figure un-shrunk, with its denominator, for printing next to it. */
  observed: ObservedFigure;
  /** Which of decision 011's pairs `observed` and `adjusted` used (rule 4). */
  figureSource: FigureSource;
};

export type BestSevenResult = {
  criterion: BestSevenCriterion;
  direction: "best" | "worst";
  /** In the order the slots came in. */
  picks: BestSevenPick[];
  /**
   * The seven adjusted values, slot order, filled slots only. Exported so the client can call
   * `aggregateSeven(values, criterion)` after a swap instead of reimplementing the shrinkage — the
   * whole point of publishing the adjusted figure per slot.
   */
  values: (number | null)[];
  /**
   * `aggregateSeven(values, criterion)`. Null when no slot could be filled, and null as soon as **one**
   * filled slot has no figure: a total over five of seven discs, printed as though it were seven, is a
   * number about a team that never existed.
   */
  aggregate: number | null;
  /** `"sum"` or `"mean"`, so the screen can label the team figure honestly. */
  aggregation: "sum" | "mean";
  /** The model the field slots were scored against (rule 3). */
  shrinkage: ShrinkageReport;
  /**
   * The keepers' own model, fitted on `gkCleanMinutes / gkMinutes`. Non-null only for `cleanSheet`,
   * because that is the only criterion decision 011 gives two readings of (rule 4).
   */
  goalkeeperShrinkage: ShrinkageReport | null;
  /** How many slots went to somebody who never declared them — the badge count. */
  outOfPositionCount: number;
  /**
   * False when not one candidate has any exposure **on the all-pitch model**: the six field slots are
   * then positions and tie-breaks. Deliberately *not* an OR across the two models — it used to be, and
   * a `cleanSheet` seven with real field minutes and no `gkMinutes` anywhere passed the gate on the
   * field model's mean while the GB disc printed a fabricated `0 %` and averaged it in with six real
   * figures. That is reachable on real data: `gkMinutes` is only written when a confirmed composition
   * tells the reducer which slot is the goal, so a match run in game mode without one leaves every
   * `gkMinutes` at 0 while `minutes` and `cleanMinutes` are real.
   */
  hasBasis: boolean;
  /**
   * The same question for the keepers' own model (rule 4), and `null` for the three criteria that have
   * no second model — `null` here means « not applicable », never « false ».
   */
  goalkeeperHasBasis: boolean | null;
  candidatesConsidered: number;
};

/* -------------------------------------------------------------------------- */
/* The shrinkage                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `(n × observed + m × mean) / (n + m)`, with the two branches that matter:
 *
 * - **no squad mean, no figure.** There is nothing to shrink towards, so the answer is `null` and not
 *   a number (rule 1b). This branch used to return `0`, and on a competition filter where nobody the
 *   reader may see has a rating, seven discs printed « 0,0 » out of ten — the worst possible mark, for
 *   the whole squad, while the team figure beside them correctly said « — ».
 * - **no exposure, the squad mean exactly**, by arithmetic rather than by a special case: `n = 0`
 *   reduces the fraction to `m × mean / m` (rule 2). The caller must therefore not read the returned
 *   number as this player's own — `hasOwnExposure` is how it tells the two apart.
 */
export function shrink(
  observed: number | null,
  exposure: number,
  prior: ShrinkageModel,
): number | null {
  if (prior.squadMean === null) return null;
  if (exposure <= 0 || observed === null) return prior.squadMean;
  return (
    (exposure * observed + prior.priorStrength * prior.squadMean) / (exposure + prior.priorStrength)
  );
}

/** Just enough of a `ShrinkageReport` to shrink with. */
export type ShrinkageModel = { squadMean: number | null; priorStrength: number };

/**
 * Whether this figure is the player's **own**, rather than the squad's standing in for it.
 *
 * `shrink` returns the squad mean exactly for a man with no exposure (rule 2), which is the right
 * arithmetic and an unreadable disc: the number under his name is a real number, and it is not about
 * him. `observed.rate` is null there, so the distinction exists in the output — but a screen reading
 * `rate === null` is re-deriving a rule this file owns, and decision 072 gives it nowhere to hide the
 * answer anyway. So the predicate is published, and the copy that goes with it is
 * `squadMeanStandInFr`.
 *
 * Takes the `ObservedFigure` rather than a whole pick so it serves `SquadCell.observed` too — the swap
 * sheet needs the same badge on candidates who are not on the pitch yet.
 */
export function hasOwnExposure(observed: ObservedFigure): boolean {
  return observed.exposure > 0 && observed.rate !== null;
}

/** One player's raw contribution to a model, in the criterion's own units. */
type Sample = {
  /** Exposure: rated matches, 60-minute blocks, or minutes. */
  exposure: number;
  /** Numerator in natural units: goals, clean minutes, the sum of the match means. */
  numerator: number;
  /** `numerator / exposure`, or null with no exposure. */
  rate: number | null;
  /** The denominator the screen prints, and what it counts. */
  denominator: number;
  denominatorUnit: "minutes" | "ratedMatches";
  /** Within-player variance of this player's own figures, when the criterion measures it directly. */
  withinVariance: number | null;
};

function sampleOf(
  candidate: BestSevenCandidate,
  criterion: BestSevenCriterion,
  source: FigureSource,
): Sample {
  switch (criterion) {
    case "ratings": {
      const count = candidate.ratingCount;
      const rate = count > 0 ? candidate.ratingAverage : null;
      return {
        exposure: count,
        numerator: (rate ?? 0) * count,
        rate,
        denominator: count,
        denominatorUnit: "ratedMatches",
        withinVariance: count >= 2 ? candidate.ratingVariance : null,
      };
    }
    case "goals":
    case "assists": {
      const minutes = candidate.minutes;
      const exposure = minutes / MINUTES_PER_RATE_UNIT;
      const numerator = criterion === "goals" ? candidate.goals : candidate.assists;
      return {
        exposure,
        numerator,
        rate: exposure > 0 ? numerator / exposure : null,
        denominator: minutes,
        denominatorUnit: "minutes",
        withinVariance: null, // Poisson: the noise is the mean, and comes from the model itself.
      };
    }
    case "cleanSheet": {
      const minutes = source === "goalkeeper" ? candidate.gkMinutes : candidate.minutes;
      const clean = source === "goalkeeper" ? candidate.gkCleanMinutes : candidate.cleanMinutes;
      return {
        exposure: minutes,
        numerator: clean,
        rate: minutes > 0 ? clean / minutes : null,
        denominator: minutes,
        denominatorUnit: "minutes",
        withinVariance: null, // Binomial: the noise is p(1−p), and comes from the model itself.
      };
    }
  }
}

function clamp(value: number, [low, high]: readonly [number, number]): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Fits the criterion's model by the method of moments (rule 3). One idea in three shapes:
 *
 * | criterion       | model          | exposure `n`    | `m`                       |
 * |-----------------|----------------|-----------------|---------------------------|
 * | ratings         | Normal–Normal  | rated matches   | σ²within / τ²             |
 * | goals, assists  | Gamma–Poisson  | 60-min blocks   | μ / τ²                    |
 * | cleanSheet      | Beta–Binomial  | minutes         | μ(1−μ) / τ² − 1           |
 *
 * τ² is the *real* spread between players, which is not the spread of the observed rates: those also
 * contain each player's own sampling noise. So τ² is that observed spread **minus** the noise the
 * model predicts a denominator of size `n` would produce — the whole reason the ratio can be measured
 * at all, and the reason a squad where everyone is genuinely alike measures τ² ≈ 0 and comes out
 * maximally sceptical instead of dividing by nothing.
 *
 * Everything is weighted by exposure, so a man with eleven rated matches counts eleven times in the
 * measurement of the spread he is part of; a man with none weighs nothing and cannot move it.
 */
export function fitShrinkage(
  candidates: readonly BestSevenCandidate[],
  criterion: BestSevenCriterion,
  source: FigureSource,
): ShrinkageReport {
  const clampBounds = PRIOR_STRENGTH_CLAMP[criterion];
  const report = (
    squadMean: number | null,
    measured: number | null,
    within: number | null,
    between: number | null,
    unmeasurable: ShrinkageReport["unmeasurable"] = null,
  ): ShrinkageReport => ({
    squadMean,
    // Nothing measurable means maximum scepticism, which is the top of the clamp: with two Sundays
    // played, believing the squad is the only defensible position.
    priorStrength: measured === null ? clampBounds[1] : clamp(measured, clampBounds),
    measured,
    // The two travel together by construction: a cause without a failure, or a failure without its
    // cause, would be the copy boundary guessing again. Pinned by a test over every branch.
    unmeasurable: measured === null ? unmeasurable : null,
    clamp: clampBounds,
    unit: BEST_SEVEN_EXPOSURE_UNIT[criterion],
    withinPlayerVariance: within,
    betweenPlayerVariance: between,
    source,
  });

  const samples = candidates
    .map((candidate) => sampleOf(candidate, criterion, source))
    .filter((sample) => sample.exposure > 0 && sample.rate !== null);

  const totalExposure = samples.reduce((total, sample) => total + sample.exposure, 0);
  if (totalExposure <= 0) return report(null, null, null, null, "noData");

  // The pooled rate, not the mean of the rates: one man's 1-in-10 and another's 3-in-90 make a squad
  // that scores 4 in 100, and that is the number a player with no data should be credited with.
  const squadMean = samples.reduce((total, sample) => total + sample.numerator, 0) / totalExposure;

  // Fewer than two players with exposure: there is no "between players" to measure. Not the same thing
  // as a spread too small to see, which is why the screen is told which of the two happened — one
  // keeper in the whole season used to be reported as « les écarts entre les joueurs sont trop petits ».
  if (samples.length < 2) return report(squadMean, null, null, null, "onePlayer");

  const weightOf = (sample: Sample) => sample.exposure / totalExposure;

  const observedVariance = samples.reduce(
    (total, sample) => total + weightOf(sample) * ((sample.rate as number) - squadMean) ** 2,
    0,
  );

  // The noise the model says a denominator of that size carries, averaged over the same weights.
  let withinVariance: number | null;
  let expectedNoise: number;
  switch (criterion) {
    case "ratings": {
      // Measured, not modelled: the input carries each player's own variance. Pooled over everyone
      // with at least two rated matches — one match has no spread, and calling it 0 would claim a
      // metronome out of a man who has played once.
      const withSpread = samples.filter((sample) => sample.withinVariance !== null);
      const spreadExposure = withSpread.reduce((total, sample) => total + sample.exposure, 0);
      // Means exist, but not one player has the two matches a variance needs: the within-player noise
      // is unknown, so the ratio cannot be formed. Its own cause, not `noSpread` — the écarts between
      // these players may be wide, and it is the other moment that is missing.
      if (spreadExposure <= 0) return report(squadMean, null, null, null, "noRepeat");
      withinVariance =
        withSpread.reduce(
          (total, sample) => total + sample.exposure * (sample.withinVariance as number),
          0,
        ) / spreadExposure;
      expectedNoise = samples.reduce(
        (total, sample) => total + (weightOf(sample) * (withinVariance as number)) / sample.exposure,
        0,
      );
      break;
    }
    case "goals":
    case "assists":
      // Poisson: a count with mean μn over n blocks estimates a rate with variance μ/n.
      withinVariance = squadMean;
      expectedNoise = samples.reduce(
        (total, sample) => total + (weightOf(sample) * squadMean) / sample.exposure,
        0,
      );
      break;
    case "cleanSheet":
      // Binomial: a proportion over n minutes has variance p(1−p)/n.
      withinVariance = squadMean * (1 - squadMean);
      expectedNoise = samples.reduce(
        (total, sample) => total + (weightOf(sample) * (withinVariance as number)) / sample.exposure,
        0,
      );
      break;
  }

  const betweenVariance = observedVariance - expectedNoise;
  if (!(betweenVariance > 0) || !Number.isFinite(betweenVariance)) {
    // The squad's differences are entirely explained by how little it has played. Believe the squad.
    return report(squadMean, null, withinVariance, betweenVariance, "noSpread");
  }

  let measured: number;
  switch (criterion) {
    case "ratings":
      measured = (withinVariance as number) / betweenVariance;
      break;
    case "goals":
    case "assists":
      // Gamma(α, β) with mean μ and variance τ² has β = μ/τ², and β is the prior's exposure.
      measured = squadMean / betweenVariance;
      break;
    case "cleanSheet":
      // Beta(a, b) with mean μ and variance τ² has a + b = μ(1−μ)/τ² − 1, its pseudo-minutes.
      measured = (squadMean * (1 - squadMean)) / betweenVariance - 1;
      break;
  }

  if (!Number.isFinite(measured) || measured <= 0) {
    return report(squadMean, null, withinVariance, betweenVariance, "noSpread");
  }
  return report(squadMean, measured, withinVariance, betweenVariance);
}

/* -------------------------------------------------------------------------- */
/* The per-candidate, per-slot figures                                        */
/* -------------------------------------------------------------------------- */

/** One cell of the assignment problem: what putting this candidate in this slot is worth. */
export type SquadCell = {
  fit: SlotFit;
  /** Null when the model this slot is scored against has no squad mean (rule 1b). */
  adjusted: number | null;
  observed: ObservedFigure;
  figureSource: FigureSource;
};

export type SquadEvaluation = {
  criterion: BestSevenCriterion;
  candidates: readonly BestSevenCandidate[];
  /** `cells[candidateIndex][slotIndex]`. */
  cells: SquadCell[][];
  shrinkage: ShrinkageReport;
  goalkeeperShrinkage: ShrinkageReport | null;
  /** The all-pitch model's gate, and only that one. See `BestSevenResult.hasBasis`. */
  hasBasis: boolean;
  /** The keepers' model's gate; null when there is no second model to gate. */
  goalkeeperHasBasis: boolean | null;
};

/**
 * Every candidate's adjusted figure in every slot, plus the models behind them. Exported because it
 * is the honest seam for a test: rule 6's equivalence is asserted by handing `solveAssignment` this
 * table and then its negation, which is only possible if the table is a value somebody can hold.
 *
 * The figure depends on the slot for exactly one reason — rule 4's goalkeeper pair. Every other
 * criterion gives the same cell in all seven slots, and only `fit` changes.
 */
export function evaluateSquad(
  candidates: readonly BestSevenCandidate[],
  slots: readonly BestSevenSlot[],
  criterion: BestSevenCriterion,
): SquadEvaluation {
  const fieldModel = fitShrinkage(candidates, criterion, "allPitch");
  // Rule 4: the keepers are their own population, fitted on their own pair, and only `cleanSheet`
  // has a second reading to fit at all.
  const keeperModel =
    criterion === "cleanSheet" ? fitShrinkage(candidates, criterion, "goalkeeper") : null;

  const cellFor = (candidate: BestSevenCandidate, slot: BestSevenSlot): SquadCell => {
    const useKeeper = keeperModel !== null && slot.isGoalkeeper;
    const source: FigureSource = useKeeper ? "goalkeeper" : "allPitch";
    const model = useKeeper ? keeperModel : fieldModel;
    const sample = sampleOf(candidate, criterion, source);
    return {
      fit: candidate.declarations[slot.positionCode] ?? "none",
      adjusted: shrink(sample.rate, sample.exposure, model),
      observed: {
        rate: sample.rate,
        numerator: sample.numerator,
        denominator: sample.denominator,
        denominatorUnit: sample.denominatorUnit,
        exposure: sample.exposure,
      },
      figureSource: source,
    };
  };

  return {
    criterion,
    candidates,
    cells: candidates.map((candidate) => slots.map((slot) => cellFor(candidate, slot))),
    shrinkage: fieldModel,
    goalkeeperShrinkage: keeperModel,
    // One gate per model. An OR would let the field model's mean vouch for a GB disc the keepers' model
    // cannot produce a figure for at all — see `BestSevenResult.hasBasis`.
    hasBasis: fieldModel.squadMean !== null,
    goalkeeperHasBasis: keeperModel === null ? null : keeperModel.squadMean !== null,
  };
}

/* -------------------------------------------------------------------------- */
/* The assignment                                                             */
/* -------------------------------------------------------------------------- */

/** What the DP maximises, compared field by field, in this order (rules 5 and 6). */
type Objective = {
  /** Slots filled at all. Dominates everything: an empty slot is worse than a bad one. */
  filled: number;
  /** Slots filled by somebody who declared the post. */
  declared: number;
  /** Of those, the ones on his primary post. */
  primary: number;
  /** The criterion total, already negated when the caller wants the worst seven. */
  score: number;
  /** `BEST_SEVEN_TIE_BREAKS[0]`: total minutes, more is better. */
  minutes: number;
  /** `BEST_SEVEN_TIE_BREAKS[1]`: total jersey rank, **less** is better. */
  jerseyRank: number;
};

const EMPTY_OBJECTIVE: Objective = {
  filled: 0,
  declared: 0,
  primary: 0,
  score: 0,
  minutes: 0,
  jerseyRank: 0,
};

/**
 * Positive when `a` is the better team. Lexicographic, in the order `Objective` declares.
 *
 * The ε on `score` is there for float noise and nothing else: two sums of the same seven values added
 * in two different orders can differ in their last bits, and letting that pick a seven would make the
 * answer depend on the DP's traversal. The honest cost of it is that ε-equality is **not transitive**,
 * so this is not a total order in the strict sense — a, b within ε and b, c within ε with a, c further
 * apart would make the winner depend on the comparison order. At `SCORE_EPSILON = 1e-9`, against marks
 * out of ten, proportions and goals per hour, nothing real reaches it: a chain would need two adjusted
 * figures a billionth of a goal apart, and the shrinkage divides by exposures that never produce them.
 * Restructuring the comparator to be provably total would mean ranking on integers scaled by 1e9, which
 * buys nothing and hides the arithmetic. So the limit is stated rather than papered over.
 */
function compareObjectives(a: Objective, b: Objective): number {
  if (a.filled !== b.filled) return a.filled - b.filled;
  if (a.declared !== b.declared) return a.declared - b.declared;
  if (a.primary !== b.primary) return a.primary - b.primary;
  if (Math.abs(a.score - b.score) > SCORE_EPSILON) return a.score - b.score;
  if (a.minutes !== b.minutes) return a.minutes - b.minutes;
  return b.jerseyRank - a.jerseyRank;
}

type DpState = { objective: Objective; assignment: Int32Array };

export type Assignment = {
  /** `slotIndex -> candidateIndex`, or `-1` when there were not enough candidates to fill it. */
  slotToCandidate: number[];
  objective: Objective;
};

/**
 * The exact solution, by a bitmask DP over the slots.
 *
 * `dp[mask]` is the best way to fill exactly the slots in `mask` out of the candidates seen so far;
 * each candidate is offered every free slot once, reading only from the previous candidate's table,
 * which is what keeps a man from being cloned into two slots. Complexity is
 * `O(candidates × 2^slots × slots)` — 25 × 128 × 7 ≈ 22 000 comparisons for a real squad, which is
 * why there is no Hungarian implementation in this repository to maintain and to be wrong.
 *
 * Greedy would be cheaper and is wrong whenever two slots want the same man: `best-seven.test.ts`
 * builds that case and asserts the greedy answer is the worse team, rather than asserting a number.
 *
 * Candidates are expected in a deterministic order (`bestSeven` sorts them); after the tie-breaks
 * there is nothing left to separate two teams but that order, and it must not be a query's accident.
 */
export function solveAssignment(
  cells: readonly (readonly SquadCell[])[],
  candidates: readonly BestSevenCandidate[],
  slotCount: number,
  direction: "best" | "worst" = "best",
): Assignment {
  const sign = direction === "worst" ? -1 : 1;
  const stateCount = 1 << slotCount;

  let dp: (DpState | null)[] = new Array(stateCount).fill(null);
  dp[0] = { objective: EMPTY_OBJECTIVE, assignment: new Int32Array(slotCount).fill(-1) };

  for (let candidate = 0; candidate < candidates.length; candidate += 1) {
    const next: (DpState | null)[] = dp.slice();
    const person = candidates[candidate];
    const minutes = person.minutes;
    const jerseyRank = person.jerseyNumber ?? UNNUMBERED_JERSEY_RANK;

    for (let mask = 0; mask < stateCount; mask += 1) {
      const from = dp[mask];
      if (from === null) continue;
      for (let slot = 0; slot < slotCount; slot += 1) {
        const bit = 1 << slot;
        if ((mask & bit) !== 0) continue;
        const cell = cells[candidate][slot];
        const objective: Objective = {
          filled: from.objective.filled + 1,
          declared: from.objective.declared + FIT_IS_DECLARED[cell.fit],
          primary: from.objective.primary + FIT_IS_PRIMARY[cell.fit],
          // A null figure contributes nothing rather than blocking the slot: nullity is a property of
          // the *model* behind the slot, never of the player (rule 1b), so when one cell is null every
          // candidate's cell in that slot is null and they all add the same 0. The slot is then decided
          // by the positional objective and the tie-breaks, which is what `hasBasis` promises.
          score: from.objective.score + sign * (cell.adjusted ?? 0),
          minutes: from.objective.minutes + minutes,
          jerseyRank: from.objective.jerseyRank + jerseyRank,
        };
        const target = mask | bit;
        const incumbent = next[target];
        if (incumbent === null || compareObjectives(objective, incumbent.objective) > 0) {
          const assignment = Int32Array.from(from.assignment);
          assignment[slot] = candidate;
          next[target] = { objective, assignment };
        }
      }
    }
    dp = next;
  }

  let best = dp[0] as DpState;
  for (let mask = 1; mask < stateCount; mask += 1) {
    const state = dp[mask];
    if (state !== null && compareObjectives(state.objective, best.objective) > 0) best = state;
  }

  return { slotToCandidate: [...best.assignment], objective: best.objective };
}

/* -------------------------------------------------------------------------- */
/* The team figure                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The team figure from the seven adjusted values — a sum or a mean, per `BEST_SEVEN_AGGREGATION`.
 *
 * Exported and deliberately trivial, because the client calls it: when the coach swaps a player the
 * screen replaces one number in `values` and calls this, instead of shipping the shrinkage to the
 * browser and giving the same claim two implementations to disagree in. Null on an empty list, the
 * house rule that a figure nobody has is not a zero (`aggregate.ts` rule 1).
 *
 * **One `null` among the values makes the whole figure null**, and that is not a workaround for the
 * nulls rule 1b introduced — it is the defect being fixed. Skipping them would print the total of five
 * discs under a pitch of seven, labelled « Total des sept »; averaging them as zeros would print a
 * number nobody's football produced. A team figure is a claim about the team that is drawn, so either
 * every filled slot has a figure or the team has none. `aggregationLabelFr` names the count it did
 * average, for the legitimate case of a squad too small to fill the shape.
 */
export function aggregateSeven(
  values: readonly (number | null)[],
  criterion: BestSevenCriterion,
): number | null {
  if (values.length === 0) return null;
  const figures = values.filter((value): value is number => value !== null);
  if (figures.length !== values.length) return null;
  const total = figures.reduce((sum, value) => sum + value, 0);
  return BEST_SEVEN_AGGREGATION[criterion] === "mean" ? total / figures.length : total;
}

/* -------------------------------------------------------------------------- */
/* The entry point                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Order the candidates go into the DP in: the tie-breaks first, then the name, so that the residual
 * freedom the objective leaves is settled by something a reader can predict rather than by the order
 * a query returned rows in (`BEST_SEVEN_TIE_BREAKS`).
 */
function candidateOrder(a: BestSevenCandidate, b: BestSevenCandidate): number {
  if (a.minutes !== b.minutes) return b.minutes - a.minutes;
  const left = a.jerseyNumber ?? UNNUMBERED_JERSEY_RANK;
  const right = b.jerseyNumber ?? UNNUMBERED_JERSEY_RANK;
  if (left !== right) return left - right;
  return a.displayName.localeCompare(b.displayName, "fr");
}

/** The best — or the worst — seven, and everything the screen needs to say so honestly. */
export function bestSeven(input: BestSevenInput): BestSevenResult {
  const candidates = [...input.candidates].sort(candidateOrder);
  const evaluation = evaluateSquad(candidates, input.slots, input.criterion);
  const assignment = solveAssignment(
    evaluation.cells,
    candidates,
    input.slots.length,
    input.direction,
  );

  const picks: BestSevenPick[] = input.slots.map((slot, slotIndex) => {
    const candidateIndex = assignment.slotToCandidate[slotIndex];
    if (candidateIndex < 0) {
      // Fewer candidates than slots. The slot is reported empty rather than filled with a fiction.
      const empty = sampleOf(
        {
          id: "",
          displayName: "",
          jerseyNumber: null,
          minutes: 0,
          goals: 0,
          assists: 0,
          cleanMinutes: 0,
          gkMinutes: 0,
          gkCleanMinutes: 0,
          ratingAverage: null,
          ratingCount: 0,
          ratingVariance: null,
          declarations: {},
        },
        input.criterion,
        "allPitch",
      );
      return {
        slotId: slot.id,
        positionCode: slot.positionCode,
        player: null,
        fit: "none",
        // No player, no figure. It is left out of `values` anyway, but a `0` sitting in a pick is a `0`
        // some future caller will average in.
        adjusted: null,
        observed: {
          rate: null,
          numerator: empty.numerator,
          denominator: 0,
          denominatorUnit: empty.denominatorUnit,
          exposure: 0,
        },
        figureSource: "allPitch",
      };
    }
    const candidate = candidates[candidateIndex];
    const cell = evaluation.cells[candidateIndex][slotIndex];
    return {
      slotId: slot.id,
      positionCode: slot.positionCode,
      player: {
        id: candidate.id,
        displayName: candidate.displayName,
        jerseyNumber: candidate.jerseyNumber,
      },
      fit: cell.fit,
      adjusted: cell.adjusted,
      observed: cell.observed,
      figureSource: cell.figureSource,
    };
  });

  const values = picks.filter((pick) => pick.player !== null).map((pick) => pick.adjusted);

  return {
    criterion: input.criterion,
    direction: input.direction,
    picks,
    values,
    // No `hasBasis` gate in front of it any more: with no basis every value is null and `aggregateSeven`
    // already answers null, per model and per slot rather than per screen.
    aggregate: aggregateSeven(values, input.criterion),
    aggregation: BEST_SEVEN_AGGREGATION[input.criterion],
    shrinkage: evaluation.shrinkage,
    goalkeeperShrinkage: evaluation.goalkeeperShrinkage,
    outOfPositionCount: picks.filter((pick) => pick.player !== null && pick.fit === "none").length,
    hasBasis: evaluation.hasBasis,
    goalkeeperHasBasis: evaluation.goalkeeperHasBasis,
    candidatesConsidered: candidates.length,
  };
}
