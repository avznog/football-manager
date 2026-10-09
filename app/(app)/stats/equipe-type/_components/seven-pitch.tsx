"use client";

/**
 * The pitch, the seven discs, and the one thing on this screen that is state rather than a URL: the
 * reader's own swaps.
 *
 * ## Why this holds the whole table instead of asking the server
 *
 * It is fed `cells` — every candidate's adjusted figure in every slot, from `evaluateSquad` — so a
 * swap is a lookup and `aggregateSeven` over seven numbers, and **the shrinkage is never
 * reimplemented here**. That is the entire reason `best-seven.ts` publishes the per-slot adjusted
 * value and exports the aggregation: a second implementation in the browser is a second chance for
 * the two to disagree about what « 7,4 » means, on a screen whose whole job is explaining where 7,4
 * came from.
 *
 * ## `PitchLayout`, not `LineupPitch`
 *
 * `LineupPitch` hard-codes composition semantics — ghost discs for a plan game mode has not
 * confirmed (decision 006), « absent de la feuille » — and not one of them is true here: there is no
 * match, no sheet and nothing to confirm. So this draws on `PitchLayout` directly and wraps each
 * marker through `renderItem`.
 *
 * The gesture is `usePitchDrag`'s `onTap`, the existing « tap a player on the pitch » of the editor
 * and of TERRAIN (decision 045). Its `onDrop` is deliberately a no-op, exactly as TERRAIN's is:
 * dragging means nothing on this screen, and a slip must not silently rearrange a seven.
 */

import { useMemo, useRef, useState } from "react";

import { PitchLayout, type KitColors, type PitchSlot } from "@/components/pitch/PitchLayout";
import { usePitchDrag } from "@/components/pitch/usePitchDrag";
import { Badge, Button, Sheet, cn } from "@/components/ui";
import { OptionRow } from "@/components/action-sheet";
import { positionLabelFr } from "@/db/reference";
import type { SlotFit } from "@/lib/stats/best-seven";
import { aggregateSeven, hasOwnExposure } from "@/lib/stats/best-seven";
import {
  KEEPER_REFUSED_BADGE_FR,
  OUT_OF_POSITION_BADGE_FR,
  aggregationLabelFr,
  formatSevenFigure,
  optimumComparisonFr,
  resetLabelFr,
  sevenHeadingFr,
  sevenObservedFr,
  squadMeanStandInShortFr,
  swapAnnouncementFr,
} from "@/lib/stats/best-seven-copy";
import type { SevenFigure, SevenKind, SevenObserved } from "@/lib/stats/sevens";
import { adjustedBesideRawFr, formatMinutes } from "@/lib/stats/format";

/* -------------------------------------------------------------------------- */
/* What the server sends                                                      */
/* -------------------------------------------------------------------------- */

export type SevenSlotView = {
  /** `formation_slots.id`. **Never the post code**: 1-2-3-1 has two `DC` and two `AIL`. */
  slotId: string;
  positionCode: string;
  x: number;
  y: number;
};

export type SevenCandidateView = {
  id: string;
  displayName: string;
  jerseyNumber: number | null;
  /** Printed in the picker's subtitle: the one figure that is the same on every criterion. */
  minutes: number;
};

/** One cell of `SquadEvaluation`, narrowed to what a disc prints. */
export type SevenCell = {
  fit: SlotFit;
  /**
   * Null when the model behind this slot has no squad mean at all: there is then no basis for a figure
   * here, and every place that prints it prints « — » (`NO_VALUE_FR`). Never `0` — on a 0–10 scale a
   * zero is the worst mark there is, printed under seven names nobody measured.
   */
  adjusted: number | null;
  observed: SevenObserved;
  /** What the figure is — each slot of a seven may read a different one (decision 171). */
  figure: SevenFigure;
  /** False for a man this seven refuses in this slot: the goal, to one who never kept it (decision 172). */
  allowed: boolean;
};

export type SevenPitchProps = {
  seven: SevenKind;
  /**
   * How the team figure is built, or **null when there is none**. Only the notes seven has one (a mean
   * of marks out of ten); the three others mix figures slot by slot — goals per hour up front, minutes
   * per goal conceded in goal — and a total of those would be a number in no unit (decision 171).
   */
  aggregation: "sum" | "mean" | null;
  slots: readonly SevenSlotView[];
  candidates: readonly SevenCandidateView[];
  /** `cells[candidateIndex][slotIndex]`, the order `evaluateSquad` returns. */
  cells: readonly (readonly SevenCell[])[];
  /** The assignment `bestSeven` chose, by slot id. Null where there were too few candidates. */
  optimumBySlot: Readonly<Record<string, string | null>>;
  /** `bestSeven().aggregate` — the figure « Ton équipe » is compared against after a swap. */
  optimumAggregate: number | null;
  kit: KitColors;
};

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export function SevenPitch({
  seven,
  aggregation,
  slots,
  candidates,
  cells,
  optimumBySlot,
  optimumAggregate,
  kit,
}: SevenPitchProps) {
  const [assignment, setAssignment] = useState<Record<string, string | null>>(
    () => ({ ...optimumBySlot }),
  );
  /** Which slot the picker is open on, or null. */
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  /** What the last tap did, announced rather than left to be worked out from two moved discs. */
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const candidateIndex = useMemo(
    () => new Map(candidates.map((candidate, index) => [candidate.id, index])),
    [candidates],
  );
  const candidateById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );
  const slotIndex = useMemo(
    () => new Map(slots.map((slot, index) => [slot.slotId, index])),
    [slots],
  );

  const cellFor = (slotId: string, candidateId: string): SevenCell | null => {
    const row = candidateIndex.get(candidateId);
    const column = slotIndex.get(slotId);
    if (row === undefined || column === undefined) return null;
    return cells[row]?.[column] ?? null;
  };

  /**
   * The reader has edited the seven, so the heading is no longer a claim anybody can check
   * (decision 087). Compared slot by slot rather than by a dirty flag, so putting a man back where
   * the optimum had him really does restore the heading.
   */
  const touched = slots.some((slot) => assignment[slot.slotId] !== optimumBySlot[slot.slotId]);

  /**
   * The figures of the **filled** slots, in slot order, nulls kept.
   *
   * An empty slot contributes nothing at all — there is no man in it, so there is nothing to total.
   * A filled slot whose figure is null is the opposite: a disc under a name, with no basis for a
   * number. Keeping that null is what lets `aggregateSeven` refuse to total the others (rule 1b), so
   * the team figure reads « — » instead of a sum over five discs presented as a sum over seven.
   */
  const values = slots
    .filter((slot) => assignment[slot.slotId] != null)
    .map((slot) => cellFor(slot.slotId, assignment[slot.slotId] as string)?.adjusted ?? null);

  // No second gate here on purpose: `adjusted` is null exactly when the model behind that slot has no
  // squad mean, so the nulls already carry `hasBasis` — per model, which is more than a single flag
  // could say now that `cleanSheet` reads two of them (decision 011).
  // `aggregateSeven` only needs to know sum or mean, and only the notes seven has a team figure.
  const aggregate = aggregation === null ? null : aggregateSeven(values, "ratings");

  // The turf's live rectangle is what turns a finger into a pitch point, so the hook takes the
  // caller's ref rather than owning one (see its header).
  const pitchRef = useRef<HTMLDivElement | null>(null);
  /**
   * The slot `onTap` recognised, waiting for the `click` that follows the same pointerup.
   *
   * The picker is **not** opened from `onTap`, and that is not a style preference: measured on a real
   * touch tap at 390 px, a `<dialog>` opened during `pointerup` was still under the finger when the
   * browser synthesised the `click` a moment later, and the sheet's first row swallowed it — one tap on
   * a disc silently swapped two players and closed again. Opening on the click instead means the whole
   * gesture is over before the sheet exists.
   */
  const pendingSlotId = useRef<string | null>(null);
  const gesture = usePitchDrag<string>({
    pitchRef,
    onTap: (slotId) => {
      pendingSlotId.current = slotId;
    },
    // Decision 045: dragging writes nothing here, and a drop on grass is an answer — « nothing » —
    // rather than a failure. TERRAIN made the same call for the same reason. It also clears the
    // pending slot, so a drag that still ends in a `click` opens nothing.
    onDrop: () => {
      pendingSlotId.current = null;
    },
  });

  const pick = (slotId: string, candidateId: string) => {
    const incoming = candidateById.get(candidateId);
    if (!incoming) return;
    const outgoingId = assignment[slotId] ?? null;
    // Where he already stood, if anywhere: a man chosen for a second slot is **swapped** with
    // whoever was in the tapped one, never cloned into both.
    const fromSlot = slots.find(
      (slot) => slot.slotId !== slotId && assignment[slot.slotId] === candidateId,
    );

    setAssignment((current) => {
      const next = { ...current, [slotId]: candidateId };
      if (fromSlot) next[fromSlot.slotId] = outgoingId;
      return next;
    });

    const tapped = slots.find((slot) => slot.slotId === slotId);
    setAnnouncement(
      swapAnnouncementFr({
        incoming: incoming.displayName,
        outgoing: outgoingId ? (candidateById.get(outgoingId)?.displayName ?? null) : null,
        positionCode: tapped?.positionCode ?? "",
        fromPositionCode: fromSlot?.positionCode ?? null,
      }),
    );
    setOpenSlotId(null);
  };

  const reset = () => {
    setAssignment({ ...optimumBySlot });
    setAnnouncement(null);
  };

  const pitchSlots: PitchSlot[] = slots.map((slot) => {
    const chosenId = assignment[slot.slotId];
    const chosen = chosenId ? candidateById.get(chosenId) : undefined;
    return {
      id: slot.slotId,
      x: slot.x,
      y: slot.y,
      positionCode: slot.positionCode,
      player: chosen
        ? {
            id: chosen.id,
            name: chosen.displayName,
            jerseyNumber: chosen.jerseyNumber,
          }
        : null,
    };
  });

  const openSlot = slots.find((slot) => slot.slotId === openSlotId) ?? null;

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold tracking-tight text-ink">
          {sevenHeadingFr(seven, touched)}
        </h2>
        {aggregation !== null ? (
          <p className="text-sm text-ink-muted">
            {/* `values.length`, not seven: a squad short of men fills fewer slots, and « Total des
                sept » over five discs is a claim about a team that never took the field. */}
            {aggregationLabelFr(aggregation, values.length)} ·{" "}
            <span className="font-semibold text-ink tabular-nums">
              {formatSevenFigure("ratings", aggregate)}
            </span>
          </p>
        ) : null}
      </header>

      {/* The optimum's own figure, kept on screen the moment the heading stops claiming to be it. */}
      {touched ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-xs text-ink-muted tabular-nums">
            {aggregation !== null
              ? optimumComparisonFr(seven, formatSevenFigure("ratings", optimumAggregate))
              : "Tu as modifié le sept proposé."}
          </p>
          <Button variant="secondary" size="sm" onClick={reset}>
            {resetLabelFr()}
          </Button>
        </div>
      ) : null}

      <div ref={pitchRef}>
        <PitchLayout
          slots={pitchSlots}
          kit={kit}
          pitchLabel={`${sevenHeadingFr(seven, touched)} sur la pelouse`}
          renderItem={(slot, content) => {
            const chosenId = assignment[slot.id] ?? null;
            const cell = chosenId ? cellFor(slot.id, chosenId) : null;
            /**
             * The goal is 6 % from the bottom of the pitch box, and `Pitch` is `overflow-hidden`:
             * measured at 390 px, the keeper's disc and his name already end 2 px short of the edge,
             * so two lines of figures under them were clipped by 14 px. Stacking them above the disc
             * instead only moved the problem — measured, that caption then overlapped the centre
             * back's by 18 px, because GB and DC share the 500‰ column and their centres are 100 px
             * apart while each stack is 95 px tall. So the keeper's figures go *beside* his disc: the
             * bottom of the pitch is one disc wide and 200 px of grass either side of it are empty,
             * which is the only direction here with room to spare. 156 px wide, 61 px tall, measured.
             */
            const low = slot.y <= 150;
            return (
              <button
                type="button"
                onPointerDown={(event) => gesture.begin(event, slot.id)}
                {...gesture.handlers}
                onClick={(event) => {
                  // `detail === 0` is a click with no pointer behind it: Enter or Space on the focused
                  // disc, which produces no `pointerup` and therefore no `onTap` to have set this. It
                  // must also **discard** whatever a pointer left behind, because a `pointerup` whose
                  // `click` the browser never synthesised — a tap the page turned into a scroll —
                  // leaves the ref pointing at another slot, and a keyboard activation here would then
                  // open that one's picker instead of this one's.
                  const target = event.detail === 0 ? slot.id : pendingSlotId.current;
                  pendingSlotId.current = null;
                  if (target !== null) setOpenSlotId(target);
                }}
                /**
                 * **No `aria-label` here.** One replaced the whole button's contents, so a screen
                 * reader heard « Milieu central — changer de joueur » twice on a 1-3-2-1 and never
                 * heard who was in the slot or what his figure was — on a screen whose only subject is
                 * who is in the slot and what his figure is. The name is therefore computed from the
                 * contents: the disc's own « Karim, numéro 8, milieu central », then the figures, then
                 * the action. That also satisfies WCAG 2.5.3 by construction — every visible word on
                 * the control is in its accessible name, because the name *is* the visible words.
                 */
                className={cn(
                  "flex touch-none flex-col items-center gap-0.5 rounded-lg",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  low && "flex-row gap-1",
                )}
              >
                {content}
                {cell ? <DiscFigures cell={cell} /> : null}
                {/* Said last, because it is the only part that is not a fact about the slot. An empty
                    slot has nobody to change, so it is worded for what the tap will do there. */}
                <span className="sr-only">
                  {slot.player === null ? "choisir un joueur" : "changer de joueur"}
                </span>
              </button>
            );
          }}
        />
      </div>

      {/* The tap is announced, and to everybody: a swap moves two discs at once. */}
      <p aria-live="polite" className="min-h-4 text-xs text-ink-muted">
        {announcement}
      </p>

      <SlotList
        slots={slots}
        assignment={assignment}
        candidateById={candidateById}
        cellFor={cellFor}
      />

      {openSlot ? (
        <Sheet
          open
          onClose={() => setOpenSlotId(null)}
          title={`Qui joue ${positionLabelFr(openSlot.positionCode).toLocaleLowerCase("fr-FR")} ?`}
          description={
            // Only the notes seven has a team figure to recalculate (decision 171).
            aggregation !== null
              ? "Choisis un joueur : le total sous la pelouse se recalcule."
              : "Choisis un joueur : son chiffre à ce poste est affiché sous son nom."
          }
        >
          <ul className="space-y-2">
            {candidates.map((candidate) => {
              const cell = cellFor(openSlot.slotId, candidate.id);
              const raw = cell ? sevenObservedFr(cell.figure, cell.observed) : null;
              const onPitch = slots.some(
                (slot) => slot.slotId !== openSlot.slotId && assignment[slot.slotId] === candidate.id,
              );
              return (
                <li key={candidate.id}>
                  <OptionRow
                    label={candidate.displayName}
                    leading={candidate.jerseyNumber ?? undefined}
                    selected={assignment[openSlot.slotId] === candidate.id}
                    subtitle={[
                      cell
                        ? adjustedBesideRawFr(formatSevenFigure(cell.figure, cell.adjusted), raw)
                        : null,
                      formatMinutes(candidate.minutes),
                      cell?.fit === "none" ? OUT_OF_POSITION_BADGE_FR : null,
                      // Said before the tap: the proposed seven never puts him here, and why.
                      cell?.allowed === false ? KEEPER_REFUSED_BADGE_FR : null,
                      // Said before the tap, not after: choosing him swaps two discs.
                      onPitch ? "déjà sur la pelouse" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => pick(openSlot.slotId, candidate.id)}
                  />
                </li>
              );
            })}
          </ul>
        </Sheet>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The two numbers on a disc                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The ranked figure and the raw one, under the disc, always both — and when the ranked figure is not
 * his, the disc says so rather than leaving it to the paragraph under the pitch.
 *
 * This is the answer to the obvious objection — « 7,0 is not his average » — and it cannot be a
 * tooltip, because there is no hover on a phone (decision 072). The chip is capped at 104 px, which is
 * measured rather than chosen: the closest two posts of the formation are 340‰ apart, which
 * came out at 109 px between disc centres on a 390 px screen, so anything wider would have two
 * captions printing over each other.
 *
 * The raw line is set at 9 px, which is the size at which the longest string any criterion produces —
 * « 6 passes déc. sur 360′ » — fits in 104 px without an ellipsis; at 10 px it needed 110 px. The
 * adjusted value, which is the figure the seven was actually ranked on, is 11 px and bold. Measured
 * contrast on the turf: 16,2:1 and 5,8:1 in light, 12,9:1 and 6,5:1 in dark. The same pair is printed
 * at 12 px, unabbreviated, in the list under the pitch — nothing here is the only statement of
 * anything.
 */
function DiscFigures({ cell }: { cell: SevenCell }) {
  const raw = sevenObservedFr(cell.figure, cell.observed, true);
  /**
   * He has no exposure of his own, so the figure above is the **squad's**, printed under his name
   * (rule 2 of `best-seven.ts`: `n = 0` lands him exactly on the mean).
   *
   * That has to be on the disc, not only in a paragraph below the pitch: rule 2 of `aggregate.ts` is
   * that no figure is printed without its denominator, and this one has none at all — the raw line is
   * absent for exactly these discs. Measured on the demo season, two of the seven « 0,30/h » discs of
   * `?critere=goals` in the championship were this, contributing 24 % of the total out of nothing,
   * and the only way to find out was to open the picker sheet.
   *
   * `adjusted === null` is the other case and not this one: then there is no figure at all, his or
   * anybody's, and « moyenne de l'équipe » would name an average that does not exist.
   */
  const standsInForSquadMean = cell.adjusted !== null && !hasOwnExposure(cell.observed);
  return (
    <span className="flex max-w-26 flex-col items-center leading-tight">
      <span className="rounded-full bg-surface/90 px-1.5 text-[0.6875rem] font-bold text-ink tabular-nums">
        {formatSevenFigure(cell.figure, cell.adjusted)}
      </span>
      {raw !== null ? (
        <span className="max-w-full truncate rounded-full bg-surface/80 px-1 text-[0.5625rem] font-medium text-ink-muted tabular-nums">
          {raw}
        </span>
      ) : null}
      {standsInForSquadMean ? (
        /* Two lines rather than one, measured at the 9 px the raw line is set in: « aucun chiffre :
           moyenne de l'équipe » needs 154 px on one line and the caption budget is 104 px — the
           width at which two neighbouring captions start printing over each other. Split, the wider
           line is « moyenne de l'équipe » at 94 px. Same `text-ink-muted` as the raw line it replaces,
           so the contrast stays the pair already measured on the turf rather than a new token. The
           colon is what makes the two lines read as one sentence aloud. */
        <span className="flex max-w-full flex-col items-center rounded-full bg-surface/80 px-1 text-[0.5625rem] font-medium text-ink-muted">
          <span className="max-w-full truncate">aucun chiffre :</span>
          <span className="max-w-full truncate">{squadMeanStandInShortFr(cell.figure)}</span>
        </span>
      ) : null}
      {cell.fit === "none" ? (
        <span className="max-w-full truncate rounded-full bg-surface/90 px-1 text-[0.5625rem] font-semibold text-danger">
          {OUT_OF_POSITION_BADGE_FR}
        </span>
      ) : null}
      {!cell.allowed ? (
        <span className="max-w-full truncate rounded-full bg-surface/90 px-1 text-[0.5625rem] font-semibold text-danger">
          {KEEPER_REFUSED_BADGE_FR}
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The same seven as a list                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The seven again, in full width.
 *
 * Not a duplicate for its own sake: a disc has about 96 px for two numbers and a badge, and « 3 buts
 * sur 240′ » truncates on the narrowest phone. This is where the pair is never abbreviated, and where
 * a slot nobody could be found for says so in words rather than as an empty target on grass.
 */
function SlotList({
  slots,
  assignment,
  candidateById,
  cellFor,
}: {
  slots: readonly SevenSlotView[];
  assignment: Readonly<Record<string, string | null>>;
  candidateById: Map<string, SevenCandidateView>;
  cellFor: (slotId: string, candidateId: string) => SevenCell | null;
}) {
  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-surface">
      {slots.map((slot) => {
        const chosenId = assignment[slot.slotId] ?? null;
        const chosen = chosenId ? candidateById.get(chosenId) : undefined;
        const cell = chosenId ? cellFor(slot.slotId, chosenId) : null;
        const raw = cell ? sevenObservedFr(cell.figure, cell.observed) : null;
        return (
          <li key={slot.slotId} className="flex items-center gap-3 px-3 py-2">
            <span className="w-11 shrink-0 text-xs font-semibold text-ink-subtle uppercase">
              {slot.positionCode}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-ink">
                  {chosen?.displayName ?? "Poste vide"}
                </span>
                {cell?.fit === "none" ? (
                  <Badge variant="danger" className="shrink-0">
                    {OUT_OF_POSITION_BADGE_FR}
                  </Badge>
                ) : null}
              </span>
              <span className="block text-xs text-ink-muted">
                {positionLabelFr(slot.positionCode)}
              </span>
            </span>
            <span className="max-w-28 shrink-0 text-right text-xs text-ink-muted">
              {cell ? (
                <>
                  <span className="block text-sm font-semibold text-ink tabular-nums">
                    {formatSevenFigure(cell.figure, cell.adjusted)}
                  </span>
                  {raw !== null ? <span className="block tabular-nums">{raw}</span> : null}
                  {/* The same fact as the disc's two-line caption, in full: this is the row that never
                      abbreviates. `tabular-nums` deliberately not inherited here — it is a sentence,
                      not a figure. */}
                  {cell.adjusted !== null && !hasOwnExposure(cell.observed) ? (
                    <span className="block">aucun chiffre : {squadMeanStandInShortFr(cell.figure)}</span>
                  ) : null}
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
