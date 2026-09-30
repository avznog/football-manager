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
import type { BestSevenCriterion, ObservedFigure, SlotFit } from "@/lib/stats/best-seven";
import { aggregateSeven } from "@/lib/stats/best-seven";
import {
  OUT_OF_POSITION_BADGE_FR,
  aggregationLabelFr,
  formatCriterionValue,
  observedFigureCompactFr,
  observedFigureFr,
  optimumComparisonFr,
  resetLabelFr,
  sevenHeadingFr,
  swapAnnouncementFr,
  type BestSevenDirection,
} from "@/lib/stats/best-seven-copy";
import { adjustedBesideRawFr, formatMinutes } from "@/lib/stats/format";

/* -------------------------------------------------------------------------- */
/* What the server sends                                                      */
/* -------------------------------------------------------------------------- */

export type SevenSlotView = {
  /** `formation_slots.id`. **Never the post code**: 1-3-2-1 has two `MC`. */
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
  adjusted: number;
  observed: ObservedFigure;
};

export type SevenPitchProps = {
  criterion: BestSevenCriterion;
  direction: BestSevenDirection;
  aggregation: "sum" | "mean";
  slots: readonly SevenSlotView[];
  candidates: readonly SevenCandidateView[];
  /** `cells[candidateIndex][slotIndex]`, the order `evaluateSquad` returns. */
  cells: readonly (readonly SevenCell[])[];
  /** The assignment `bestSeven` chose, by slot id. Null where there were too few candidates. */
  optimumBySlot: Readonly<Record<string, string | null>>;
  /** `bestSeven().aggregate` — the figure « Ton équipe » is compared against after a swap. */
  optimumAggregate: number | null;
  /** False when nobody has any exposure: the figures are all the squad mean, and the page says so. */
  hasBasis: boolean;
  kit: KitColors;
};

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export function SevenPitch({
  criterion,
  direction,
  aggregation,
  slots,
  candidates,
  cells,
  optimumBySlot,
  optimumAggregate,
  hasBasis,
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

  const values = slots
    .map((slot) => {
      const chosen = assignment[slot.slotId];
      return chosen ? (cellFor(slot.slotId, chosen)?.adjusted ?? null) : null;
    })
    .filter((value): value is number => value !== null);

  // Null rather than 0 when there is no basis at all: a figure nobody has is not a zero
  // (`aggregate.ts`, rule 1), and `bestSeven` applies the same gate to its own aggregate.
  const aggregate = hasBasis ? aggregateSeven(values, criterion) : null;

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
          {sevenHeadingFr(direction, touched)}
        </h2>
        <p className="text-sm text-ink-muted">
          {aggregationLabelFr(aggregation)} ·{" "}
          <span className="font-semibold text-ink tabular-nums">
            {formatCriterionValue(criterion, aggregate)}
          </span>
        </p>
      </header>

      {/* The optimum's own figure, kept on screen the moment the heading stops claiming to be it. */}
      {touched ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-xs text-ink-muted tabular-nums">
            {optimumComparisonFr(direction, formatCriterionValue(criterion, optimumAggregate))}
          </p>
          <Button variant="secondary" size="sm" onClick={reset}>
            {resetLabelFr(direction)}
          </Button>
        </div>
      ) : null}

      <div ref={pitchRef}>
        <PitchLayout
          slots={pitchSlots}
          kit={kit}
          pitchLabel={`${sevenHeadingFr(direction, touched)} sur la pelouse`}
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
                  // disc, which produces no `pointerup` and therefore no `onTap` to have set this.
                  const target = pendingSlotId.current ?? (event.detail === 0 ? slot.id : null);
                  pendingSlotId.current = null;
                  if (target !== null) setOpenSlotId(target);
                }}
                aria-label={`${positionLabelFr(slot.positionCode)} — changer de joueur`}
                className={cn(
                  "flex touch-none flex-col items-center gap-0.5 rounded-lg",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  low && "flex-row gap-1",
                )}
              >
                {content}
                {cell ? <DiscFigures criterion={criterion} cell={cell} /> : null}
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
        criterion={criterion}
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
          description="Choisis un joueur : le total sous la pelouse se recalcule."
        >
          <ul className="space-y-2">
            {candidates.map((candidate) => {
              const cell = cellFor(openSlot.slotId, candidate.id);
              const raw = cell ? observedFigureFr(criterion, cell.observed) : null;
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
                        ? adjustedBesideRawFr(formatCriterionValue(criterion, cell.adjusted), raw)
                        : null,
                      formatMinutes(candidate.minutes),
                      cell?.fit === "none" ? OUT_OF_POSITION_BADGE_FR : null,
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
 * The ranked figure and the raw one, under the disc, always both.
 *
 * This is the answer to the obvious objection — « 7,0 is not his average » — and it cannot be a
 * tooltip, because there is no hover on a phone (decision 072). The chip is capped at 104 px, which is
 * measured rather than chosen: the closest two posts in any built-in formation are 330‰ apart, which
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
function DiscFigures({
  criterion,
  cell,
}: {
  criterion: BestSevenCriterion;
  cell: SevenCell;
}) {
  const raw = observedFigureCompactFr(criterion, cell.observed);
  return (
    <span className="flex max-w-26 flex-col items-center leading-tight">
      <span className="rounded-full bg-surface/90 px-1.5 text-[0.6875rem] font-bold text-ink tabular-nums">
        {formatCriterionValue(criterion, cell.adjusted)}
      </span>
      {raw !== null ? (
        <span className="max-w-full truncate rounded-full bg-surface/80 px-1 text-[0.5625rem] font-medium text-ink-muted tabular-nums">
          {raw}
        </span>
      ) : null}
      {cell.fit === "none" ? (
        <span className="max-w-full truncate rounded-full bg-surface/90 px-1 text-[0.5625rem] font-semibold text-danger">
          {OUT_OF_POSITION_BADGE_FR}
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
  criterion,
  slots,
  assignment,
  candidateById,
  cellFor,
}: {
  criterion: BestSevenCriterion;
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
        const raw = cell ? observedFigureFr(criterion, cell.observed) : null;
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
            <span className="shrink-0 text-right text-xs text-ink-muted tabular-nums">
              {cell ? (
                <>
                  <span className="block text-sm font-semibold text-ink">
                    {formatCriterionValue(criterion, cell.adjusted)}
                  </span>
                  {raw !== null ? <span className="block">{raw}</span> : null}
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
