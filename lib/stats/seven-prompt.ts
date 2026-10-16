/**
 * The prompt behind the LLM-picked équipes types (decision 204).
 *
 * Pure, and deliberately so: no fetch, no clock, no database. The thing that decides what a model is
 * told is the thing most likely to go quietly wrong — a figure labelled as smoothed when it is raw, a
 * player named twice, a peer's individual mark leaking onto the wire — so it is a function of its
 * arguments and it has unit tests like the reducer does.
 *
 * ## Handles are shirt numbers, never names and never ids
 *
 * The model answers with handles, and the answer is joined back onto candidates by that handle. A name
 * cannot be the handle: « Léo C » and « Léo M » are two different men, and a collision would silently
 * attribute one's season to the other. A UUID cannot be it either — it costs a dozen tokens a man and
 * invites the model to invent one. So the handle is the shirt number, and a man with **no** shirt gets
 * a **synthetic negative handle** (`-1`, `-2`, …, in candidate order), which can never collide with a
 * real shirt because a real shirt is never negative. The prompt says as much in one line, so the model
 * is not surprised to be asked for « #-2 ».
 *
 * ## Why a table rather than JSON
 *
 * One line per man, fixed field order, no repeated keys. The whole 15-man squad lands around 1 600
 * tokens; the same data as JSON is several times that and reads no better to a model.
 */

import type { BestSevenSlot } from "./best-seven";
import { SEVEN_RULE_FR } from "./best-seven-copy";
import { positionGroupLabelFr, positionGroupOf, type PositionGroup } from "./positions";
import type { SevenCandidate, SevenCell, SevenKind } from "./sevens";

export type SevenPromptMessages = { system: string; user: string };

/**
 * The handle of each candidate, in the candidates' own order (the DP's order, which is the order
 * `cells` is indexed on). Non-negative is his shirt; negative is synthetic, for a man with none.
 */
export function sevenHandles(candidates: readonly SevenCandidate[]): number[] {
  let synthetic = 0;
  return candidates.map((candidate) => {
    if (candidate.jerseyNumber !== null) return candidate.jerseyNumber;
    synthetic += 1;
    return -synthetic;
  });
}

/**
 * What each figure of a cell is, in the few words the model needs to read the column, **and in which
 * direction it is good**. A rate it cannot tell the polarity of is a rate it will rank backwards.
 */
const FIGURE_LABEL_FR: Readonly<Record<SevenCell["figure"], string>> = {
  goals: "ses buts à lui /60 de jeu de champ (plus = mieux)",
  teamGoalsFor: "buts de l’équipe /60 quand il est là (plus = mieux)",
  keeperConceded: "encaissés/60 au goal (moins = mieux)",
  outfieldConceded: "encaissés/60 (moins = mieux)",
  impact: "différence de buts/60 au poste (plus = mieux)",
  // Unreachable: the `notes` seven is not asked of a model, and `RATINGS_WITHHELD_FR` is what this
  // prompt says instead. Present because the record is exhaustive over `SevenFigure`.
  ratings: "non communiqué",
};

/** The secondary of the raw record, when the cell carries one. */
const SECONDARY_LABEL_FR: Readonly<Partial<Record<SevenCell["figure"], string>>> = {
  teamGoalsFor: "de lui",
  impact: "encaissés",
};

/**
 * No rating ever leaves this function, for any seven.
 *
 * The owner's instruction is literal — « le modèle ne doit pas prendre en compte les notes » — and the
 * notes seven answers it by **not asking a model at all**: it keeps the algorithm, which is a mean of
 * marks and needs no judgement. So there is no kind of question for which a rating belongs on the wire,
 * and this prompt holds none: not the squad's marks, not a mean, not a count of rated matches. A peer's
 * mark is also the one figure in this app a player gave in confidence (decision 074's register), and it
 * is the kind of thing that leaks once and forever.
 */
const RATINGS_WITHHELD_FR =
  "Les notes des joueurs ne te sont pas transmises, volontairement : tu ne juges jamais sur elles.";

function round(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** The distinct position codes the formation asks for, in slot order, with how many of each. */
function shapeOf(slots: readonly BestSevenSlot[]): { code: string; count: number; slotIndex: number }[] {
  const shape: { code: string; count: number; slotIndex: number }[] = [];
  slots.forEach((slot, slotIndex) => {
    const seen = shape.find((entry) => entry.code === slot.positionCode);
    if (seen) seen.count += 1;
    else shape.push({ code: slot.positionCode, count: 1, slotIndex });
  });
  return shape;
}

/**
 * The légende's criterion per post, spelled out (decision superseding 171/172/197/198).
 *
 * Its five posts are judged on five different things, and the cell's `figure` alone does not say so: a
 * `DC` cell and the défensive seven's cells are both `outfieldConceded`, but one is measured at DC and
 * the other over all his outfield minutes. « Il faut que le modèle puisse juger de tout ça » — so the
 * question names the stretch of play each figure is over, post by post.
 */
const LEGEND_FIGURE_LABEL_FR: Readonly<Record<PositionGroup, string>> = {
  GB: "buts encaissés /60 quand il est dans les buts, lissé (moins = mieux)",
  DC: "buts encaissés par l’équipe /60 pendant qu’il joue DC, lissé (moins = mieux)",
  MC: "différence de buts /60 pendant qu’il joue MC, brut (plus = mieux)",
  AIL: "buts de l’équipe /60 pendant qu’il joue AIL, lissé (plus = mieux)",
  AT: "ses buts à lui /60 de jeu de champ, lissé — les buts ne sont rattachés à aucun poste dans cette app, donc c’est toute sa saison de champ et pas seulement son temps en AT (plus = mieux)",
};

/** « GB×1, DC×2, AIL×2, MC×1, AT×1 » — the shape, as the question asks for it. */
export function sevenShapeFr(slots: readonly BestSevenSlot[]): string {
  return shapeOf(slots)
    .map((entry) => `${entry.code}×${entry.count}`)
    .join(", ");
}

/** One man's block: identity, declared posts, minutes, minutes per post, then a cell per post. */
function candidateLines(
  candidate: SevenCandidate,
  handle: number,
  cellRow: readonly SevenCell[],
  shape: { code: string; count: number; slotIndex: number }[],
): string[] {
  const declared = Object.entries(candidate.declarations)
    .map(([code, declaration]) => `${code}=${declaration}`)
    .join(" ");
  const perPost = candidate.positions
    .filter((position) => position.minutes > 0)
    .map((position) => `${position.group} ${position.minutes}′`)
    .join(" ");

  const figures = shape.map((entry) => {
    const cell = cellRow[entry.slotIndex];
    const observed = cell.observed;
    // A ratings cell carries a mark, and no mark goes on the wire (`RATINGS_WITHHELD_FR`).
    if (cell.figure === "ratings") return `${entry.code} non communiqué`;
    const unit = observed.denominatorUnit === "minutes" ? "′" : " matchs notés";
    const secondaryLabel = SECONDARY_LABEL_FR[cell.figure];
    const secondary =
      secondaryLabel !== undefined && observed.secondary !== undefined
        ? `, ${observed.secondary} ${secondaryLabel}`
        : "";
    const raw = `brut ${round(observed.rate)} = ${round(observed.numerator)} sur ${observed.denominator}${unit}${secondary}`;
    const refused = cell.allowed ? "" : " [interdit à ce poste]";
    return `${entry.code} lissé ${round(cell.adjusted)} (${raw})${refused}`;
  });

  return [
    `#${handle} — postes déclarés : ${declared || "aucun"}`,
    `  minutes ${candidate.minutes}′ (terrain ${candidate.outfieldMinutes}′, goal ${candidate.gkMinutes}′)` +
      ` · a déjà gardé : ${candidate.gkMinutes > 0 ? "oui" : "non"}` +
      ` · minutes par poste : ${perPost || "aucune"}`,
    `  ${figures.join(" · ")}`,
  ];
}

/**
 * The two messages. `context` is the owner's own typed note: it goes **last**, verbatim, fenced, and
 * the section disappears entirely when he typed nothing — an empty « contexte » heading reads as a
 * thing he was asked for and refused.
 */
export function buildSevenPrompt(
  kind: SevenKind,
  candidates: readonly SevenCandidate[],
  cells: readonly SevenCell[][],
  slots: readonly BestSevenSlot[],
  context: string,
): SevenPromptMessages {
  const handles = sevenHandles(candidates);
  const shape = shapeOf(slots);
  const labelOf = (entry: { code: string; slotIndex: number }) => {
    const group = positionGroupOf(entry.code);
    if (kind === "legende" && group !== null) return LEGEND_FIGURE_LABEL_FR[group];
    return FIGURE_LABEL_FR[cells[0]?.[entry.slotIndex]?.figure ?? "ratings"];
  };
  // One line per post rather than one joined line: the légende's five criteria are a list, and a model
  // reading five clauses separated by « · » loses which one belongs to which post.
  const figureOf = shape.map((entry) => `- ${entry.code} : ${labelOf(entry)}`);

  const system = [
    "Tu es l’analyste d’une équipe de football à 7. On te donne la saison d’un effectif, chiffre par",
    "chiffre, et tu choisis une équipe type de sept joueurs.",
    "",
    "Règles dures, sans exception :",
    "- exactement sept joueurs, tous différents ;",
    "- uniquement des numéros de maillot pris dans la liste fournie, jamais un autre ;",
    "- le gardien doit être quelqu’un qui a déjà gardé (minutes au goal > 0) ;",
    "- respecte le nombre de places par poste qu’on te demande.",
    "",
    "Un joueur ne tient qu’une place : il ne peut pas être à la fois gardien et attaquant. Si le",
    "meilleur gardien est aussi le meilleur attaquant, mets-le là où il fait gagner le plus de places à",
    "l’équipe et prends le deuxième meilleur gardien pour l’autre — jamais un sept incomplet, jamais un",
    "joueur deux fois.",
    "",
    "Les deux DC sont interchangeables, les deux AIL aussi : réponds par des ensembles, pas par un",
    "gauche et un droit.",
    "",
    RATINGS_WITHHELD_FR,
    "",
    "Les champs `reasons` et `summary` que tu renvoies sont affichés tels quels à l’écran : écris-les",
    "en français, en tutoyant le lecteur, et sans jargon. Une phrase courte par joueur, qui cite le",
    "chiffre qui l’a fait entrer.",
  ].join("\n");

  const user = [
    `Question : compose le sept « ${kind} ».`,
    // The notes seven's rule is « la meilleure moyenne des notes », and no mark is on this wire — so
    // the question would be unanswerable rather than merely hard. It is answered by the algorithm, not
    // by a model; this line is what the prompt says if it is ever asked anyway.
    kind === "notes"
      ? `Règle de ce sept : ${RATINGS_WITHHELD_FR} Ce sept se calcule sans modèle.`
      : `Règle de ce sept : ${SEVEN_RULE_FR[kind]}`,
    "",
    `Forme demandée : ${sevenShapeFr(slots)} — sept places en tout.`,
    "Les places de même poste sont interchangeables.",
    "",
    "Chiffre de référence par poste :",
    ...figureOf,
    "",
    "Chaque poste donne un chiffre « lissé » et le « brut » qui est derrière lui. Le lissé est déjà",
    "ramené vers la moyenne de l’équipe en fonction du temps joué, mais il ne corrige pas tout : un",
    "record très court garde assez de poids pour passer devant une saison entière. Huit buts sur cinq",
    "minutes restent donc en tête du lissé, et ce n’est pas représentatif.",
    "",
    "C’est à toi de t’en méfier : lis toujours le brut, et écarte un joueur dont le chiffre ne repose",
    "que sur quelques minutes à ce poste, même s’il est premier. Classe sur le lissé quand les deux",
    "joueurs ont un temps de jeu comparable ; sinon, préfère celui dont le record est le plus solide.",
    "",
    "Les joueurs sont désignés par leur numéro de maillot. Un numéro négatif est un numéro de",
    "remplacement, pour un joueur qui n’a pas de maillot attribué : il désigne un vrai joueur.",
    "",
    "Effectif :",
    ...candidates.flatMap((candidate, index) =>
      candidateLines(candidate, handles[index], cells[index], shape),
    ),
  ];

  const trimmed = context.trim();
  if (trimmed !== "") {
    user.push(
      "",
      "Contexte donné par le coach. C’est la seule chose que les chiffres ci-dessus ne peuvent pas te",
      "dire ; il passe avant une petite différence de chiffre, jamais avant les règles dures.",
      "```",
      trimmed,
      "```",
    );
  }

  return { system, user: user.join("\n") };
}

/** The French label of a position code, for a caller that wants to name a slot. */
export function sevenPositionLabelFr(code: string): string {
  const group = positionGroupOf(code);
  return group === null ? code : positionGroupLabelFr(group);
}
