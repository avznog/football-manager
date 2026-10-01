"use client";

import { useMemo, useRef, useState } from "react";

import { atPositionFr, positionLabelFr } from "@/db/reference";
import {
  PitchLayout,
  PitchPoint,
  PlayerDisc,
  usePitchDrag,
  type KitColors,
  type PitchSlot,
} from "@/components/pitch";
import { Badge, Button, Sheet, cn } from "@/components/ui";
import { assignmentsSignature } from "@/lib/composition/editor";
import type { LiveSlot, PlayerIndex, PlayerOption } from "@/lib/match/presenter";
import {
  nearestTerrainTarget,
  terrainBench,
  terrainFlagFr,
  terrainPitchSlots,
  terrainPlace,
  terrainRemove,
  terrainReview,
  terrainTargets,
  type SlotAssignment,
} from "@/lib/match/terrain";

/* -------------------------------------------------------------------------- */
/* Gesture state                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What a gesture here is carrying. Only players are dragged: the shape is fixed during a match, since
 * moving a slot is a planning act. `fromSlotId` is null for a player picked up from the bench.
 */
type Carried = { memberId: string; fromSlotId: string | null };

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

export type TerrainSheetProps = {
  open: boolean;
  /** Closing writes nothing: the arrangement is thrown away. */
  onClose: () => void;
  /** « Terrain », or the title of the planned composition being adjusted. */
  title: string;
  /** « 58’ · 2e période » — the minute the change will be stamped with (decision 031). */
  stampLabel: string;
  kit: KitColors;
  /** Every slot the match could refer to, so a player in another formation's slot is still drawn. */
  slots: readonly LiveSlot[];
  players: PlayerIndex;
  /** The formation to draw. TERRAIN does not change shape — that is a planning act. */
  formationId: string | null;
  /** Who is on the pitch right now: the « from » side of the diff. */
  base: readonly SlotAssignment[];
  /** What the sheet opens on: the pitch itself, or a planned composition being adjusted. */
  initialAssignments: readonly SlotAssignment[];
  /** Everyone who may be placed, in the order the pickers recommend them. */
  candidates: readonly PlayerOption[];
  /** Players who have already come off in this match, for the warnings. */
  leftPitchMemberIds?: readonly string[];
  /** One confirmation, one `LINEUP_APPLIED`. */
  onConfirm: (assignments: SlotAssignment[]) => void;
  /** Hands the arrangement to the list composer, for a coach who cannot drag reliably. */
  onUseList?: (assignments: SlotAssignment[]) => void;
};

/* -------------------------------------------------------------------------- */
/* The sheet                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * TERRAIN: rearrange the whole pitch, confirm once.
 *
 * `docs/PLAN.md`, screen 5. Game mode's other flows do one thing at a time, which is right for the
 * 78ᵉ-minute substitution and wrong for the water break at 70′, where a coach makes two changes and
 * moves a third player and would otherwise answer six questions about a decision he has already
 * taken.
 *
 * Decision 032 rules out drag-and-drop in game mode; this screen is the exception it names, and the
 * amendment turns on one property: **the gesture writes nothing.** Dragging only rearranges local
 * state. What becomes an event is the French list of changes under the pitch and the « Valider »
 * button beneath it, once. Three things keep that safe at 70′:
 *
 * - a drop on empty grass changes nothing — it does not bench a player, which is what the composition
 *   editor does and what would make a slipped thumb cost a player;
 * - taking a player off is a labelled button, never a gesture;
 * - every gesture has a tap-then-tap equivalent (and a keyboard one), so a coach in gloves, in the
 *   rain, or with shaky hands never has to drag; the list composer is one button away too.
 *
 * The arrangement is thrown away on close. Nothing here is automatic: invariant 3 holds whether the
 * sheet was opened on the pitch or pre-filled from a planned composition.
 */
export function TerrainSheet({
  open,
  onClose,
  title,
  stampLabel,
  kit,
  slots,
  players,
  formationId,
  base,
  initialAssignments,
  candidates,
  leftPitchMemberIds,
  onConfirm,
  onUseList,
}: TerrainSheetProps) {
  const [arranged, setArranged] = useState<SlotAssignment[]>(() => [...initialAssignments]);
  const [selected, setSelected] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const pitchRef = useRef<HTMLDivElement | null>(null);

  /* --- what the arrangement means ----------------------------------------- */

  const occupiedSlotIds = useMemo(
    () => [...base, ...arranged].map((assignment) => assignment.slotId),
    [base, arranged],
  );

  const targets = useMemo(
    () => terrainTargets(slots, { formationId, occupiedSlotIds }),
    [slots, formationId, occupiedSlotIds],
  );

  const pitchSlots = useMemo<PitchSlot[]>(
    () =>
      terrainPitchSlots(arranged, slots, players, {
        base,
        formationId,
        selectedMemberId: selected,
      }),
    [arranged, slots, players, base, formationId, selected],
  );

  const bench = useMemo(
    () => terrainBench(arranged, { candidates, base }),
    [arranged, candidates, base],
  );

  const review = useMemo(
    () => terrainReview(base, arranged, { slots, players, leftPitchMemberIds }),
    [base, arranged, slots, players, leftPitchMemberIds],
  );

  const selectedIsPlaced =
    selected !== null && arranged.some((assignment) => assignment.memberId === selected);

  /** Has the coach touched anything? Drives « Réinitialiser » and the « Abandonner » wording. */
  const dirty =
    assignmentsSignature(arranged) !== assignmentsSignature(initialAssignments);

  /* --- the gesture -------------------------------------------------------- */

  const gesture = usePitchDrag<Carried>({
    pitchRef,
    // A pointer sequence that went nowhere is a tap. On the pitch it goes through `tapSlot`, so that
    // tapping an occupied slot while somebody is selected *swaps them* rather than changing the
    // selection: the tap path has to be able to do everything the drag can.
    onTap: (carried) =>
      carried.fromSlotId ? tapSlot(carried.fromSlotId) : tapPlayer(carried.memberId),
    onDrop: (carried, point) => {
      const target = point ? nearestTerrainTarget(targets, point) : null;
      if (target) {
        place(target.id, carried.memberId);
        return;
      }
      // The safety rule, said out loud. The composition editor benches a player dropped outside a
      // slot; at 70′ that is how a slipped thumb costs you a player, so here it is a no-op.
      setAnnouncement(
        `${players.nameOf(carried.memberId)} n’a pas bougé : relâche-le sur un poste, ou utilise « Faire sortir ».`,
      );
      setSelected(null);
    },
  });
  const drag = gesture.drag;

  /* --- what a gesture does ------------------------------------------------- */

  function place(slotId: string, memberId: string) {
    const occupant = arranged.find((assignment) => assignment.slotId === slotId)?.memberId ?? null;
    const slot = slots.find((candidate) => candidate.id === slotId);
    setArranged((current) => terrainPlace(current, slotId, memberId));
    setSelected(null);
    setAnnouncement(
      occupant && occupant !== memberId
        ? `${players.nameOf(memberId)} et ${players.nameOf(occupant)} échangent leurs postes.`
        : `${players.nameOf(memberId)} est placé ${slot ? atPositionFr(slot.positionCode) : "sur le terrain"}.`,
    );
  }

  /** Tapping a player picks him up, or puts him down if he was already picked up. */
  function tapPlayer(memberId: string) {
    if (selected === memberId) {
      setSelected(null);
      setAnnouncement(`${players.nameOf(memberId)} n’est plus sélectionné.`);
      return;
    }
    setSelected(memberId);
    setAnnouncement(
      `${players.nameOf(memberId)} sélectionné. Appuie sur un poste pour le placer.`,
    );
  }

  /** Tapping a slot fills it with the selection, or picks up whoever is standing there. */
  function tapSlot(slotId: string) {
    const occupant = arranged.find((assignment) => assignment.slotId === slotId)?.memberId ?? null;
    if (selected !== null && selected !== occupant) {
      place(slotId, selected);
      return;
    }
    if (occupant) tapPlayer(occupant);
  }

  function removeSelected() {
    if (selected === null) return;
    const name = players.nameOf(selected);
    setArranged((current) => terrainRemove(current, selected));
    setSelected(null);
    setAnnouncement(`${name} sort du terrain.`);
  }

  function resetArrangement() {
    setArranged([...initialAssignments]);
    setSelected(null);
    setAnnouncement("Arrangement réinitialisé.");
  }

  function onSlotKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, slotId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    tapSlot(slotId);
  }

  function onPlayerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, memberId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    tapPlayer(memberId);
  }

  const dragged = drag?.moved && drag.point ? players.get(drag.subject.memberId) : undefined;

  /* --- render -------------------------------------------------------------- */

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={`${stampLabel} · un seul enregistrement pour tous les changements`}
      // Decision 032: a flow with something to lose is not dismissed by a scrim tap or an Escape.
      dismissible={false}
      className="md:max-w-xl"
      footer={
        <div className="space-y-2">
          {review.problems.length > 0 ? (
            <ul className="space-y-1">
              {review.problems.map((problem) => (
                <li key={problem.code} className="text-sm font-semibold text-danger">
                  {problem.message}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-xs text-ink-muted">
            {review.isEmpty
              ? "Rien n’est enregistré tant que tu ne valides pas."
              : `${review.summary} · une seule action enregistrée.`}
          </p>

          {/*
            A grid, not a flex row: `Button` is `shrink-0`, so two `w-full` buttons side by side in a
            flex container overflow a 390 px viewport and « Valider » ends up off-screen. Grid tracks
            give each button half the width whatever the button says about its own shrinking.
          */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" fullWidth onClick={onClose}>
              {dirty ? "Abandonner" : "Fermer"}
            </Button>
            <Button
              fullWidth
              disabled={!review.canConfirm}
              onClick={() => onConfirm(arranged)}
            >
              {review.count > 0 ? `Valider (${review.count})` : "Valider"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* --- the pitch --- */}
        <section className="space-y-2">
          <p className="text-sm text-ink-muted">
            Fais glisser un joueur sur un poste, ou appuie sur un joueur puis sur un poste. Sur un
            poste occupé, les deux joueurs échangent.
          </p>

          {/* The wrapper has the pitch's exact box (`Pitch` is `w-full` with a fixed aspect
              ratio), which is what `fromClientPoint` needs to turn a finger into a point. */}
          <div ref={pitchRef} className="relative mx-auto max-w-xs">
            <PitchLayout
              slots={pitchSlots}
              kit={kit}
              size="md"
              pitchLabel="Terrain à réorganiser"
              renderItem={(slot, content) => (
                <button
                  type="button"
                  // `touch-none`: the sheet must not scroll away under a drag.
                  className="touch-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label={slotButtonLabelFr(slot)}
                  onPointerDown={(event) => {
                    if (slot.player)
                      gesture.begin(event, { memberId: slot.player.id, fromSlotId: slot.id });
                  }}
                  onPointerMove={gesture.handlers.onPointerMove}
                  onPointerUp={(event) => {
                    if (slot.player) gesture.handlers.onPointerUp(event);
                    // An empty slot starts no drag, so its own pointer-up is the tap that fills it.
                    else if (isPrimary(event)) tapSlot(slot.id);
                  }}
                  onPointerCancel={gesture.handlers.onPointerCancel}
                  onKeyDown={(event) => onSlotKeyDown(event, slot.id)}
                >
                  {content}
                </button>
              )}
              overlay={
                dragged && drag?.point ? (
                  <PitchPoint x={drag.point.x} y={drag.point.y} className="pointer-events-none">
                    <PlayerDisc
                      name={dragged.displayName}
                      jerseyNumber={dragged.jerseyNumber}
                      primaryColor={kit.primaryColor}
                      secondaryColor={kit.secondaryColor}
                      variant="selected"
                      size="md"
                      className="scale-110 drop-shadow-lg"
                    />
                  </PitchPoint>
                ) : null
              }
            />
          </div>

          <p aria-live="polite" role="status" className="min-h-5 text-sm text-ink-muted">
            {announcement}
          </p>

          {selectedIsPlaced ? (
            <Button variant="secondary" size="sm" fullWidth onClick={removeSelected}>
              Faire sortir {players.nameOf(selected)}
            </Button>
          ) : null}
        </section>

        {/* --- the bench --- */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Sur le banc</h3>
            <Badge variant="neutral">{bench.length}</Badge>
          </div>

          {bench.length === 0 ? (
            <p className="text-sm text-ink-muted">Tout le monde est sur le terrain.</p>
          ) : (
            // Wraps rather than scrolls sideways: a player hidden off the edge of a 320 px screen is
            // a player the coach forgets.
            <ul className="flex flex-wrap gap-2">
              {bench.map((entry) => {
                const isSelected = selected === entry.memberId;
                const flag = terrainFlagFr(entry.memberId, players);
                return (
                  <li key={entry.memberId}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={benchButtonLabelFr(entry.name, entry.comingOff, flag)}
                      className={cn(
                        "flex min-h-11 min-w-11 touch-none flex-col items-center gap-1 rounded-xl border p-1.5",
                        isSelected ? "border-accent bg-accent/10" : "border-transparent bg-surface-2",
                        entry.comingOff ? "border-warning/60 bg-warning/10" : null,
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      )}
                      onPointerDown={(event) =>
                        gesture.begin(event, { memberId: entry.memberId, fromSlotId: null })
                      }
                      {...gesture.handlers}
                      onKeyDown={(event) => onPlayerKeyDown(event, entry.memberId)}
                    >
                      <PlayerDisc
                        name={entry.name}
                        jerseyNumber={entry.jerseyNumber}
                        primaryColor={kit.primaryColor}
                        secondaryColor={kit.secondaryColor}
                        variant={flag ? "unavailable" : isSelected ? "selected" : "normal"}
                        statusLabel={entry.comingOff ? "sort" : (flag ?? undefined)}
                        size="md"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* --- what one confirmation will do --- */}
        <section className="space-y-2 rounded-xl border border-border/60 bg-surface-2 p-3">
          <h3 className="text-sm font-semibold text-ink">Changements</h3>

          {review.changes.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Le terrain est identique à ce qu’il y a en jeu : rien à enregistrer.
            </p>
          ) : (
            <ol className="space-y-1">
              {review.changes.map((change) => (
                <li key={change} className="text-sm text-ink">
                  {change}
                </li>
              ))}
            </ol>
          )}

          {review.warnings.length > 0 ? (
            <ul className="space-y-1">
              {review.warnings.map((warning) => (
                <li key={warning} className="text-sm font-medium text-danger">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={resetArrangement} disabled={!dirty}>
              Réinitialiser
            </Button>
            {onUseList ? (
              <Button variant="ghost" size="sm" onClick={() => onUseList(arranged)}>
                Composer par liste
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/** Mouse: left button only. Touch and pen have no buttons to speak of. */
function isPrimary(event: React.PointerEvent<HTMLElement>): boolean {
  return event.pointerType !== "mouse" || event.button === 0;
}

function positionNameFr(code: string): string {
  return positionLabelFr(code).toLocaleLowerCase("fr-FR");
}

function slotButtonLabelFr(slot: PitchSlot): string {
  const position = positionNameFr(slot.positionCode);
  if (slot.player) return `${slot.player.name}, ${position}`;
  return `Poste libre : ${position}`;
}

function benchButtonLabelFr(name: string, comingOff: boolean, flag: string | null): string {
  const parts = [name, comingOff ? "sort du terrain" : "sur le banc", flag].filter(Boolean);
  return parts.join(", ");
}
