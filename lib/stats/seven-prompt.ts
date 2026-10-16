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
import { positionGroupLabelFr, positionGroupOf } from "./positions";
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

/** What each figure of a cell is, in the one word the model needs to read the column. */
const FIGURE_LABEL_FR: Readonly<Record<SevenCell["figure"], string>> = {
  goals: "buts/60",
  keeperConceded: "encaissés/60 au goal",
  outfieldConceded: "encaissés/60 sur le terrain",
  impact: "différence de buts/60 au poste",
  ratings: "note moyenne",
};

/** The secondary of the raw record, when the cell carries one. */
const SECONDARY_LABEL_FR: Readonly<Partial<Record<SevenCell["figure"], string>>> = {
  goals: "passes D",
  impact: "encaissés",
};

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
    `  notes : ${candidate.ratingAverage === null ? "aucune" : `${round(candidate.ratingAverage, 2)} sur ${candidate.ratingCount} match${candidate.ratingCount > 1 ? "s" : ""} noté${candidate.ratingCount > 1 ? "s" : ""}`}`,
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
  const figureOf = shape
    .map((entry) => `${entry.code} : ${FIGURE_LABEL_FR[cells[0]?.[entry.slotIndex]?.figure ?? "ratings"]}`)
    .join(" · ");

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
    "Les deux DC sont interchangeables, les deux AIL aussi : réponds par des ensembles, pas par un",
    "gauche et un droit.",
    "",
    "Les champs `reasons` et `summary` que tu renvoies sont affichés tels quels à l’écran : écris-les",
    "en français, en tutoyant le lecteur, et sans jargon. Une phrase courte par joueur, qui cite le",
    "chiffre qui l’a fait entrer.",
  ].join("\n");

  const user = [
    `Question : compose le sept « ${kind} ».`,
    `Règle de ce sept : ${SEVEN_RULE_FR[kind]}`,
    "",
    `Forme demandée : ${sevenShapeFr(slots)} — sept places en tout.`,
    "Les places de même poste sont interchangeables.",
    "",
    `Chiffre de référence par poste : ${figureOf}`,
    "Chaque poste donne un chiffre « lissé » (corrigé du peu de minutes jouées) et le « brut » qui est",
    "derrière lui. Le lissé classe, le brut dit sur quoi il repose.",
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
