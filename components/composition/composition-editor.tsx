"use client";

/**
 * The composition editor: seven players dragged onto the turf with a thumb.
 *
 * ## Why the gesture is hand-written
 *
 * Pointer events only, no drag-and-drop library (`docs/PLAN.md`, screen 4). HTML5 drag-and-drop
 * does not fire on touch, and a library would ship kilobytes to solve a problem this screen does
 * not have: there is exactly one draggable kind, one drop surface, and the drop target is decided
 * by `nearestSlot` in pitch coordinates rather than by hit-testing DOM nodes. `setPointerCapture`
 * then makes the rest fall out — the finger keeps talking to the disc it picked up even when it
 * slides over another marker, which is precisely when a swap happens.
 *
 * Everything the gesture does is one call into `lib/composition/editor.ts` or
 * `lib/formation/shape.ts`, both pure and unit-tested. This file owns pixels and React state; it
 * decides nothing about football.
 *
 * ## Three ways to do the same thing
 *
 * 1. **Drag** a player from the bench onto a slot. Dropping on an occupied slot swaps the two;
 *    dropping off the pitch sends the player back to the bench.
 * 2. **Tap** a player, then tap a slot. Same result, and the only thing that works reliably in a
 *    wool glove in February. It is also the keyboard path: every disc, slot and bench entry is a
 *    real `<button>`, so `Tab` + `Entrée` does the whole job, and in `postes` mode the arrow keys
 *    nudge a slot around the pitch.
 * 3. **Nothing** — the whole state also travels in hidden fields, so a submit works even if the
 *    JavaScript that handles gestures has failed.
 *
 * ## Why the state is what it is
 *
 * `shape` is the seven slots being edited and `assignments` the `(slot, player)` pairs. "The coach
 * drew their own formation" is *derived* (`sameShape` against the formation picked in the select),
 * not a flag to keep in sync; likewise the bench, the label, the deduced changes and every warning.
 * The only stored state is what a gesture actually changes.
 */

import { useActionState, useMemo, useRef, useState } from "react";

import { POSITION_CODES, positionLabelFr } from "@/db/reference";
import type { SquadRole } from "@/db/schema";
import { PitchLayout, PitchPoint, PlayerDisc, type KitColors, type PitchSlot } from "@/components/pitch";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { saveLineup } from "@/lib/composition/actions";
import {
  assignmentsSignature,
  benchOf,
  memberInSlot,
  placeInSlot,
  remapToShape,
  removeMember,
  sortAssignments,
  type SlotAssignment,
} from "@/lib/composition/editor";
import {
  deduceChanges,
  findPlanIssues,
  nameOfMembers,
  ordinalFr,
  planInForceBefore,
  planTitleFr,
  type PlannedLineup,
} from "@/lib/composition/plan";
import {
  customFormationNameFr,
  moveShapeSlot,
  nearestSlot,
  orderShape,
  sameShape,
  shapeFromRows,
  shapeLabel,
  shapeProblemsFr,
  type ShapeSlot,
} from "@/lib/formation/shape";
import { fromClientPoint, type Box, type PitchPoint as PitchCoordinates } from "@/lib/pitch/geometry";

import { PlanChanges } from "./plan-changes";

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

/** A player the editor may place. A `CompositionMember` from `lib/composition/queries.ts` fits. */
export type EditorMember = {
  membershipId: string;
  name: string;
  jerseyNumber: number | null;
  /** `null` = not on the match sheet. Such a player is never offered, only flagged. */
  squadRole: SquadRole | null;
  isInjured: boolean;
  primaryPositionCode: string | null;
};

/** A formation the coach can pick, with its slots. */
export type EditorFormation = {
  id: string;
  name: string;
  label: string;
  isBuiltin: boolean;
  slots: readonly { id: string; positionCode: string; x: number; y: number; sort: number }[];
};

export type CompositionEditorProps = {
  teamId: string;
  matchId: string;
  /** `null` when creating a composition, a `lineups.id` when editing one. */
  lineupId: string | null;
  /** The team's colours, for the discs. */
  kit: KitColors;
  /** Everyone who could play, in squad order. */
  members: readonly EditorMember[];
  /** Built-in formations first, then the team's own. */
  formations: readonly EditorFormation[];
  /** Which formation to start from. */
  formationId: string;
  /** The saved assignments, keyed on `formation_slots.id`. Empty for a new composition. */
  assignments: readonly SlotAssignment[];
  fromMinute: number;
  /**
   * Every *other* composition of the match. Used to deduce the changes this one implies and to
   * refuse a minute that is already taken — both live, as the minute field changes.
   */
  otherPlans: readonly PlannedLineup[];
  /** Length of the match, for the minute field's ceiling. */
  totalMinutes: number;
  /** Where « Annuler » goes back to. */
  cancelHref: string;
};

/* -------------------------------------------------------------------------- */
/* Gesture state                                                              */
/* -------------------------------------------------------------------------- */

type Drag = {
  pointerId: number;
  /** A player being carried, or a slot being repositioned. */
  kind: "player" | "slot";
  /** `team_members.id` for a player drag, the shape key for a slot drag. */
  subject: string;
  /** Where the finger went down, in screen coordinates — used to tell a tap from a drag. */
  origin: { x: number; y: number };
  /** Where the finger is now, in pitch coordinates. `null` once it has left the pitch. */
  point: PitchCoordinates | null;
  /** True once the finger has travelled further than `TAP_SLOP`. */
  moved: boolean;
};

type Selection =
  | { kind: "member"; id: string }
  | { kind: "slot"; key: string }
  | null;

/** Pixels of travel below which a pointer sequence is a tap, not a drag. */
const TAP_SLOP = 8;

/** How far outside the pitch box a drop still counts as a drop on the pitch. */
const PITCH_MARGIN_PX = 12;

/** Pitch units one arrow key moves a slot. Shift multiplies it. */
const NUDGE = 20;
const NUDGE_FAST = 100;

/* -------------------------------------------------------------------------- */
/* The editor                                                                 */
/* -------------------------------------------------------------------------- */

export function CompositionEditor(props: CompositionEditorProps) {
  const { formations, members, kit } = props;

  const [state, action, pending] = useActionState(saveLineup, undefined);

  const [formationId, setFormationId] = useState(props.formationId);
  const [shape, setShape] = useState<ShapeSlot[]>(() => shapeOfFormation(formations, props.formationId));
  const [assignments, setAssignments] = useState<SlotAssignment[]>(() => [...props.assignments]);
  const [fromMinute, setFromMinute] = useState(props.fromMinute);
  const [mode, setMode] = useState<"players" | "shape">("players");
  const [selection, setSelection] = useState<Selection>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const pitchRef = useRef<HTMLDivElement | null>(null);

  const byId = useMemo(
    () => new Map(members.map((member) => [member.membershipId, member])),
    [members],
  );
  const nameOf = useMemo(() => nameOfMembers(members), [members]);

  /* --- what the state means ------------------------------------------------ */

  const source = formations.find((formation) => formation.id === formationId);
  const isCustom = source ? !sameShape(shape, shapeFromRows(source.slots)) : true;
  const label = shapeLabel(shape);
  const shapeProblems = isCustom ? shapeProblemsFr(shape) : [];

  const planSlots = useMemo(
    () =>
      orderShape(shape).map((slot, index) => ({
        id: slot.key,
        positionCode: slot.positionCode,
        sort: index + 1,
      })),
    [shape],
  );

  /** Only players on the sheet are offered. Someone already placed stays visible, flagged. */
  const selectable = useMemo(
    () =>
      members.filter(
        (member) => member.squadRole === "starter" || member.squadRole === "substitute",
      ),
    [members],
  );
  const bench = benchOf(selectable, assignments);
  const starters = bench.filter((member) => member.squadRole === "starter");
  const substitutes = bench.filter((member) => member.squadRole === "substitute");

  const issues = findPlanIssues({ assignments, slots: planSlots, members });
  const blocking = issues.filter((issue) => issue.blocking);
  const warnings = issues.filter((issue) => !issue.blocking);

  const previous = planInForceBefore(props.otherPlans, fromMinute, props.lineupId);
  const changes = deduceChanges(previous, { assignments, slots: planSlots }, nameOf);
  const minuteClash = props.otherPlans.some((plan) => plan.fromMinute === fromMinute);

  const dirty =
    assignmentsSignature(assignments) !== assignmentsSignature(props.assignments) ||
    fromMinute !== props.fromMinute ||
    formationId !== props.formationId ||
    isCustom;

  const canSave =
    !pending && blocking.length === 0 && shapeProblems.length === 0 && !minuteClash;

  /* --- the gesture --------------------------------------------------------- */

  function boxOfPitch(): Box | null {
    const element = pitchRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  /** Screen point → pitch point, plus whether the finger is still over the turf. */
  function locate(clientX: number, clientY: number): { point: PitchCoordinates; inside: boolean } | null {
    const box = boxOfPitch();
    if (!box) return null;
    const inside =
      clientX >= box.left - PITCH_MARGIN_PX &&
      clientX <= box.left + box.width + PITCH_MARGIN_PX &&
      clientY >= box.top - PITCH_MARGIN_PX &&
      clientY <= box.top + box.height + PITCH_MARGIN_PX;
    return { point: fromClientPoint({ x: clientX, y: clientY }, box), inside };
  }

  function beginDrag(event: React.PointerEvent<HTMLElement>, kind: Drag["kind"], subject: string) {
    // Mouse: left button only. Touch and pen have no buttons to speak of.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const located = locate(event.clientX, event.clientY);
    setDrag({
      pointerId: event.pointerId,
      kind,
      subject,
      origin: { x: event.clientX, y: event.clientY },
      point: located?.inside ? located.point : null,
      moved: false,
    });
  }

  function continueDrag(event: React.PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const travelled =
      Math.abs(event.clientX - drag.origin.x) + Math.abs(event.clientY - drag.origin.y);
    const moved = drag.moved || travelled > TAP_SLOP;
    const located = locate(event.clientX, event.clientY);
    const point = located?.inside ? located.point : null;

    // A slot follows the finger as it goes, so the label and the position code update live: the
    // coach sees « 1-2-3-1 » appear the moment the defender he is dragging crosses the halfway line.
    if (moved && drag.kind === "slot" && mode === "shape" && point) {
      setShape((current) => moveShapeSlot(current, drag.subject, point));
    }

    setDrag({ ...drag, moved, point });
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const located = locate(event.clientX, event.clientY);

    if (!drag.moved) {
      // A pointer sequence that went nowhere is a tap.
      if (drag.kind === "player") tapPlayer(drag.subject);
      else tapSlot(drag.subject);
    } else if (drag.kind === "player") {
      const target = located?.inside ? nearestSlot(shape, located.point) : null;
      if (target) {
        place(target.key, drag.subject);
      } else {
        // Dropped on the bench, or off the screen: the player comes off.
        setAssignments((current) => removeMember(current, drag.subject));
        setAnnouncement(`${nameOf(drag.subject)} retourne sur le banc.`);
      }
      setSelection(null);
    } else if (mode === "shape") {
      const moved = shape.find((slot) => slot.key === drag.subject);
      if (moved) {
        setAnnouncement(
          `Poste déplacé : ${positionNameFr(moved.positionCode)}. Formation ${shapeLabel(shape)}.`,
        );
      }
    }

    setDrag(null);
  }

  function cancelDrag() {
    setDrag(null);
  }

  /* --- what a gesture does ------------------------------------------------- */

  function place(slotKey: string, memberId: string) {
    const occupant = memberInSlot(assignments, slotKey);
    const slot = shape.find((candidate) => candidate.key === slotKey);
    setAssignments((current) => placeInSlot(current, slotKey, memberId));
    setSelection(null);
    setAnnouncement(
      occupant && occupant !== memberId
        ? `${nameOf(memberId)} et ${nameOf(occupant)} échangent leurs postes.`
        : `${nameOf(memberId)} est placé ${slot ? `au poste de ${positionNameFr(slot.positionCode)}` : "sur le terrain"}.`,
    );
  }

  /** Tapping a player picks him up, or puts him down if he was already picked up. */
  function tapPlayer(memberId: string) {
    if (selection?.kind === "member" && selection.id === memberId) {
      setSelection(null);
      setAnnouncement(`${nameOf(memberId)} n’est plus sélectionné.`);
      return;
    }
    setSelection({ kind: "member", id: memberId });
    setAnnouncement(`${nameOf(memberId)} sélectionné. Appuie sur un poste pour le placer.`);
  }

  /** Tapping a slot fills it with the selection, or picks up whoever is standing there. */
  function tapSlot(slotKey: string) {
    if (mode === "shape") {
      setSelection({ kind: "slot", key: slotKey });
      const slot = shape.find((candidate) => candidate.key === slotKey);
      setAnnouncement(
        slot
          ? `Poste ${positionNameFr(slot.positionCode)} sélectionné. Utilise les flèches pour le déplacer.`
          : "",
      );
      return;
    }

    if (selection?.kind === "member") {
      place(slotKey, selection.id);
      return;
    }

    const occupant = memberInSlot(assignments, slotKey);
    if (occupant) tapPlayer(occupant);
  }

  /** Arrow keys in `postes` mode: the keyboard equivalent of dragging a slot. */
  function nudge(slotKey: string, dx: number, dy: number) {
    const slot = shape.find((candidate) => candidate.key === slotKey);
    if (!slot) return;
    const next = moveShapeSlot(shape, slotKey, { x: slot.x + dx, y: slot.y + dy });
    setShape(next);
    const moved = next.find((candidate) => candidate.key === slotKey);
    setAnnouncement(
      moved ? `${positionNameFr(moved.positionCode)}. Formation ${shapeLabel(next)}.` : "",
    );
  }

  function onSlotKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, slotKey: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      tapSlot(slotKey);
      return;
    }
    if (mode !== "shape") return;
    const step = event.shiftKey ? NUDGE_FAST : NUDGE;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      // Pitch y grows towards the opponent's goal, which is *up* the screen.
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    nudge(slotKey, move[0], move[1]);
  }

  function onPlayerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, memberId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    tapPlayer(memberId);
  }

  /* --- changing formation -------------------------------------------------- */

  function chooseFormation(nextId: string) {
    const next = formations.find((formation) => formation.id === nextId);
    if (!next) return;
    const nextShape = shapeFromRows(next.slots);
    // The work already done is carried over slot by slot rather than thrown away.
    setAssignments((current) => remapToShape(current, shape, nextShape));
    setShape(nextShape);
    setFormationId(nextId);
    setSelection(null);
    setAnnouncement(`Formation ${next.label}.`);
  }

  function resetEverything() {
    setFormationId(props.formationId);
    setShape(shapeOfFormation(formations, props.formationId));
    setAssignments([...props.assignments]);
    setFromMinute(props.fromMinute);
    setSelection(null);
    setAnnouncement("Modifications annulées.");
  }

  function clearPitch() {
    setAssignments([]);
    setSelection(null);
    setAnnouncement("Terrain vidé.");
  }

  /* --- rendering ----------------------------------------------------------- */

  const lifted = drag?.kind === "player" && drag.moved ? drag.subject : null;
  const visible = lifted ? removeMember(assignments, lifted) : assignments;
  const hoveredSlot =
    drag?.kind === "player" && drag.moved && drag.point
      ? (nearestSlot(shape, drag.point)?.key ?? null)
      : null;

  const slots: PitchSlot[] = orderShape(shape).map((slot) => {
    const memberId = memberInSlot(visible, slot.key);
    const member = memberId ? byId.get(memberId) : undefined;
    const isTarget = hoveredSlot === slot.key;
    const isSelected =
      (selection?.kind === "member" && selection.id === memberId) ||
      (selection?.kind === "slot" && selection.key === slot.key);

    return {
      id: slot.key,
      x: slot.x,
      y: slot.y,
      positionCode: slot.positionCode,
      state: isTarget ? "hovered" : "idle",
      player:
        memberId === null
          ? null
          : {
              id: memberId,
              name: member?.name ?? "Joueur inconnu",
              jerseyNumber: member?.jerseyNumber ?? null,
              variant: offSheet(member) ? "unavailable" : isSelected || isTarget ? "selected" : "normal",
              statusLabel: statusLabelOf(member),
            },
    };
  });

  const draggedMember = drag?.kind === "player" && drag.moved ? byId.get(drag.subject) : undefined;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teamId" value={props.teamId} />
      <input type="hidden" name="matchId" value={props.matchId} />
      {props.lineupId ? <input type="hidden" name="lineupId" value={props.lineupId} /> : null}
      <input type="hidden" name="formationId" value={formationId} />
      <input type="hidden" name="shapeMode" value={isCustom ? "custom" : "existing"} />
      {isCustom
        ? orderShape(shape).map((slot) => (
            <input
              key={slot.key}
              type="hidden"
              name="shape"
              value={`${slot.key}|${slot.positionCode}|${slot.x}|${slot.y}`}
            />
          ))
        : null}
      {sortAssignments(assignments, shape).map((assignment) => (
        <input
          key={assignment.slotId}
          type="hidden"
          name="slot"
          value={`${assignment.slotId}:${assignment.memberId}`}
        />
      ))}

      {/* --- formation and minute --- */}
      <Card
        title={planTitleFr({ fromMinute, isInitial: fromMinute === 0 })}
        description={
          isCustom
            ? `Formation dessinée : ${customFormationNameFr(label)}`
            : `${source?.name ?? label}`
        }
        action={
          <Badge variant={isCustom ? "warning" : "neutral"}>{label}</Badge>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="formation">Formation</Label>
            <Select
              id="formation"
              value={formationId}
              onChange={(event) => chooseFormation(event.target.value)}
              disabled={pending}
            >
              <optgroup label="Formations types">
                {formations
                  .filter((formation) => formation.isBuiltin)
                  .map((formation) => (
                    <option key={formation.id} value={formation.id}>
                      {formation.name}
                    </option>
                  ))}
              </optgroup>
              {formations.some((formation) => !formation.isBuiltin) ? (
                <optgroup label="Formations de l’équipe">
                  {formations
                    .filter((formation) => !formation.isBuiltin)
                    .map((formation) => (
                      <option key={formation.id} value={formation.id}>
                        {formation.name}
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fromMinute">À partir de la minute</Label>
            <Input
              id="fromMinute"
              name="fromMinute"
              type="number"
              inputMode="numeric"
              min={0}
              max={200}
              step={1}
              value={fromMinute}
              invalid={minuteClash}
              aria-describedby="fromMinute-hint"
              onChange={(event) => setFromMinute(clampMinute(event.target.value))}
              disabled={pending}
            />
            <p id="fromMinute-hint" className="text-sm text-ink-muted">
              0 pour la composition de départ. Le match dure {props.totalMinutes} minutes et les
              minutes sont continues.
            </p>
            {minuteClash ? (
              <FieldError>
                {fromMinute === 0
                  ? "Il y a déjà une composition de départ."
                  : `Une composition démarre déjà à la ${ordinalFr(fromMinute)} minute.`}
              </FieldError>
            ) : null}
          </div>
        </div>
      </Card>

      {/* --- the pitch --- */}
      <Card
        title="Terrain"
        description={
          mode === "players"
            ? "Fais glisser un joueur sur un poste. Sur un poste occupé, les deux joueurs échangent."
            : "Fais glisser un poste pour dessiner ta formation. Chaque poste prend le rôle de l’endroit où il arrive."
        }
      >
        <div className="space-y-3">
          <SegmentedControl
            name="editor-mode"
            legend="Que veux-tu déplacer ?"
            hideLegend={false}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setSelection(null);
            }}
            options={[
              { value: "players", label: "Joueurs" },
              { value: "shape", label: "Postes" },
            ]}
            disabled={pending}
          />

          {/* The wrapper has the pitch's exact box (`Pitch` is `w-full` with a fixed aspect
              ratio), which is what `fromClientPoint` needs to convert a finger into a point. */}
          <div ref={pitchRef} className="relative">
            <PitchLayout
              slots={slots}
              kit={kit}
              size="md"
              pitchLabel={`Composition ${label}`}
              renderItem={(slot, content) => (
                <button
                  type="button"
                  // `touch-none`: the pitch must not scroll away under a drag.
                  className="touch-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label={slotButtonLabelFr(slot, mode)}
                  onPointerDown={(event) =>
                    beginDrag(
                      event,
                      mode === "shape" ? "slot" : slot.player ? "player" : "slot",
                      mode === "shape" || !slot.player ? slot.id : slot.player.id,
                    )
                  }
                  onPointerMove={continueDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onKeyDown={(event) => onSlotKeyDown(event, slot.id)}
                  disabled={pending}
                >
                  {content}
                </button>
              )}
              overlay={
                draggedMember && drag?.point ? (
                  <PitchPoint x={drag.point.x} y={drag.point.y} className="pointer-events-none">
                    <PlayerDisc
                      name={draggedMember.name}
                      jerseyNumber={draggedMember.jerseyNumber}
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

          {shapeProblems.length > 0 ? <FieldError>{shapeProblems}</FieldError> : null}
        </div>
      </Card>

      {/* --- the bench --- */}
      <Card
        title="Banc"
        description={
          mode === "shape"
            ? "Repasse en « Joueurs » pour placer quelqu’un."
            : "Appuie sur un joueur puis sur un poste, ou fais-le glisser."
        }
        action={<Badge variant="neutral">{bench.length} en attente</Badge>}
      >
        <div className="space-y-4">
          <BenchGroup
            title="Titulaires à placer"
            members={starters}
            emptyFr="Tous les titulaires sont sur le terrain."
            kit={kit}
            selection={selection}
            disabled={pending || mode === "shape"}
            onPointerDown={(event, memberId) => beginDrag(event, "player", memberId)}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onKeyDown={onPlayerKeyDown}
          />
          <BenchGroup
            title="Remplaçants"
            members={substitutes}
            emptyFr="Aucun remplaçant sur la feuille."
            kit={kit}
            selection={selection}
            disabled={pending || mode === "shape"}
            onPointerDown={(event, memberId) => beginDrag(event, "player", memberId)}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onKeyDown={onPlayerKeyDown}
          />
        </div>
      </Card>

      {/* --- the changes this composition implies --- */}
      <PlanChanges
        changes={changes}
        previousTitleFr={previous ? planTitleFr(previous) : null}
        warningsFr={warnings.map((issue) => issue.messageFr)}
      />

      {/* --- save --- */}
      <div className="sticky bottom-3 z-10 space-y-2 rounded-2xl border border-border/60 bg-surface/95 p-3 shadow-lg backdrop-blur">
        {state?.error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        <FieldError>{blocking.map((issue) => issue.messageFr)}</FieldError>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" pending={pending} disabled={!canSave}>
            {props.lineupId ? "Enregistrer" : "Créer la composition"}
          </Button>
          <ButtonLink href={props.cancelHref} variant="ghost">
            Annuler
          </ButtonLink>
          {assignments.length > 0 ? (
            <Button type="button" variant="ghost" onClick={clearPitch} disabled={pending}>
              Tout vider
            </Button>
          ) : null}
          {dirty ? (
            <Button type="button" variant="ghost" onClick={resetEverything} disabled={pending}>
              Rétablir
            </Button>
          ) : null}
          <p aria-live="polite" className="text-sm text-ink-muted">
            {dirty ? "Modifications non enregistrées." : "À jour."}
          </p>
        </div>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* The bench                                                                  */
/* -------------------------------------------------------------------------- */

type BenchGroupProps = {
  title: string;
  members: readonly EditorMember[];
  emptyFr: string;
  kit: KitColors;
  selection: Selection;
  disabled: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, memberId: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, memberId: string) => void;
};

/**
 * A row of players waiting to come on. It **wraps** rather than scrolls sideways: a player hidden
 * off the edge of a 320 px screen is a player the coach forgets, and thirteen discs fit in four
 * rows.
 */
function BenchGroup({
  title,
  members,
  emptyFr,
  kit,
  selection,
  disabled,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: BenchGroupProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {members.length === 0 ? (
        <p className="text-sm text-ink-muted">{emptyFr}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {members.map((member) => {
            const isSelected = selection?.kind === "member" && selection.id === member.membershipId;
            return (
              <li key={member.membershipId}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={disabled}
                  className={cn(
                    "flex min-h-11 min-w-11 touch-none flex-col items-center gap-1 rounded-xl border p-1.5",
                    isSelected ? "border-accent bg-accent/10" : "border-transparent bg-surface-2",
                    "disabled:opacity-50",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  )}
                  onPointerDown={(event) => onPointerDown(event, member.membershipId)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onKeyDown={(event) => onKeyDown(event, member.membershipId)}
                >
                  <PlayerDisc
                    name={member.name}
                    jerseyNumber={member.jerseyNumber}
                    primaryColor={kit.primaryColor}
                    secondaryColor={kit.secondaryColor}
                    variant={member.isInjured ? "unavailable" : isSelected ? "selected" : "normal"}
                    statusLabel={statusLabelOf(member)}
                    positionCode={member.primaryPositionCode ?? undefined}
                    size="md"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function shapeOfFormation(
  formations: readonly EditorFormation[],
  formationId: string,
): ShapeSlot[] {
  const formation = formations.find((candidate) => candidate.id === formationId) ?? formations[0];
  return formation ? shapeFromRows(formation.slots) : [];
}

function offSheet(member: EditorMember | undefined): boolean {
  return member === undefined || member.squadRole === null || member.squadRole === "supporter";
}

function statusLabelOf(member: EditorMember | undefined): string | undefined {
  if (member === undefined) return "hors effectif";
  if (member.squadRole === null) return "hors feuille de match";
  if (member.squadRole === "supporter") return "supporter";
  if (member.isInjured) return "blessé";
  return undefined;
}

function clampMinute(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return 0;
  return Math.min(200, Math.max(0, value));
}

/** French name of a position, lower-cased for the middle of a sentence. */
function positionNameFr(code: string): string {
  return POSITION_NAMES[code] ?? code;
}

function slotButtonLabelFr(slot: PitchSlot, mode: "players" | "shape"): string {
  const position = positionNameFr(slot.positionCode);
  if (mode === "shape") return `Déplacer le poste de ${position}`;
  if (slot.player) return `${slot.player.name}, ${position}`;
  return `Poste libre : ${position}`;
}

/**
 * Position names in the accusative-friendly lower case the announcements need. Built once from
 * `db/reference.ts` so there is no second list of French position names in the app.
 */
const POSITION_NAMES: Record<string, string> = Object.fromEntries(
  POSITION_CODES.map((code) => [code, positionLabelFr(code).toLocaleLowerCase("fr-FR")]),
);
