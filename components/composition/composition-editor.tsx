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
 * ## Why the bench is docked, and the pitch capped
 *
 * A drag whose source and target cannot be on screen together is not a cramped layout, it is a
 * broken feature — and that is what this screen shipped as: at 390 px the pitch is `w-full` with a
 * 1080:1580 aspect ratio, so 326 px of card interior became 477 px of turf and the bench rows landed
 * below the fold, out of reach of the finger that was supposed to drag them.
 *
 * Two changes fix it, and the arithmetic is the design:
 *
 * - **The pitch box is capped at 280 px wide** (`PITCH_MAX_WIDTH`), so 280 × 1580 / 1080 = 410 px
 *   tall. The cap has a floor as well as a ceiling: the playing area is `1000 / 1080` of the box, so
 *   one pitch unit is `0.926 × 280 / 1000` px and a 48 px disc spans `48 × 1000 / (0.926 × 280)`
 *   = 185 units — under the 195-unit `MIN_MARKER_DISTANCE` two slots are guaranteed to be apart, so
 *   the discs still do not touch. Any narrower than 266 px and they would. The discs stay `md`
 *   (48 px, above the 44 px minimum): compactness is never bought out of the drop target.
 * - **The bench, the errors and the confirm button are one sticky dock**, pinned above the tab bar.
 *   At 390 × 740 the dock is at most ~196 px tall (a two-line hint, a 76 px strip, a 48 px button
 *   row) and the tab bar is 72 px, which leaves 740 − 56 (app header) − 72 − 196 = 416 px between
 *   the header and the dock: the whole 410 px pitch, the whole bench and « Créer la composition »,
 *   with no scrolling. One sticky element rather than two also removes the stacking arithmetic that
 *   put the old save bar *underneath* the fixed tab bar at `bottom-3`.
 *
 * The dock's strip scrolls sideways when there are more players than fit, which is the one place a
 * scroll container could eat the gesture. Each disc is `touch-pan-x`, not `touch-none`: the browser
 * may take a horizontal swipe to scroll the strip (we get `pointercancel` and write nothing), and
 * everything else — the vertical lift onto the turf, and the tap — stays with our pointer capture.
 *
 * ## Why the state is what it is
 *
 * `shape` is the seven slots being edited and `assignments` the `(slot, player)` pairs. "The coach
 * drew their own formation" is *derived* (`sameShape` against the formation picked in the select),
 * not a flag to keep in sync; likewise the bench, the label, the deduced changes and every warning.
 * The only stored state is what a gesture actually changes.
 */

import { useActionState, useMemo, useRef, useState } from "react";

import { POSITION_CODES, atPositionFr, positionLabelFr } from "@/db/reference";
import type { SquadRole } from "@/db/schema";
import {
  PitchLayout,
  PitchPoint,
  PlayerDisc,
  usePitchDrag,
  type KitColors,
  type PitchDragHandle,
  type PitchSlot,
} from "@/components/pitch";
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
  slotOfMember,
  sortAssignments,
  type SlotAssignment,
} from "@/lib/composition/editor";
import {
  benchHintFr,
  benchPlayerLabelFr,
  minuteFieldHintFr,
} from "@/lib/composition/hints";
import {
  deduceChanges,
  editorSaveStateFr,
  findPlanIssues,
  nameOfMembers,
  ordinalFr,
  planInForceBefore,
  planTitleFr,
  type PlannedLineup,
} from "@/lib/composition/plan";
import { abbreviateName } from "@/lib/pitch/names";
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
  /**
   * What the pitch opens with, keyed on `formation_slots.id`: the saved assignments when modifying,
   * and — for a new composition — the team in force at that minute, copied by
   * `lib/composition/prefill.ts` so the coach only moves what changes.
   */
  assignments: readonly SlotAssignment[];
  /**
   * Why the pitch is not empty, when it was pre-filled: where the seven come from, and that nothing
   * is saved yet. Derived by `prefillNoticeFr`, never written here (decision 097). Empty otherwise.
   */
  prefillNoticeFr?: readonly string[];
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

/**
 * What a gesture is carrying: a player being placed, or — in `postes` mode — one of the seven slots
 * being moved around the pitch. `id` is a `team_members.id` for a player and a shape key for a slot.
 */
type Carried = { kind: "player" | "slot"; id: string };

type Selection =
  | { kind: "member"; id: string }
  | { kind: "slot"; key: string }
  | null;

/** Pitch units one arrow key moves a slot. Shift multiplies it. */
const NUDGE = 20;
const NUDGE_FAST = 100;

/**
 * Widest the pitch box may be — see the header comment for the two arithmetics it satisfies. It caps
 * the *height* in practice: the aspect ratio is fixed, so width is the only handle, and 280 px of
 * width is 410 px of turf, which fits above the docked bench on a phone.
 *
 * From `sm` the dock is back in the flow and the screen is taller, so the turf grows to 384 px wide
 * (562 px tall) rather than staying phone-sized on a laptop.
 */
const PITCH_MAX_WIDTH = "max-w-[280px] sm:max-w-sm";

/**
 * The sticky dock: the bench, the blocking errors and the confirm button, pinned just above the
 * fixed tab bar (`4.5rem` + the home indicator, the offset game mode already uses) and back in the
 * flow from `md`, where the screen is tall enough not to need it.
 */
const DOCK_CLASS =
  "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-20 -mx-4 space-y-2 " +
  "border-t border-border/60 bg-canvas/95 px-4 pt-2 pb-2 backdrop-blur " +
  "md:static md:mx-0 md:rounded-2xl md:border md:px-4 md:py-3";

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
  const freeSlots = shape.filter((slot) => memberInSlot(assignments, slot.key) === null).length;

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

  const gesture = usePitchDrag<Carried>({
    pitchRef,
    // A slot follows the finger as it goes, so the label and the position code update live: the
    // coach sees « 1-2-3-1 » appear the moment the defender he is dragging crosses the halfway line.
    onMove: (carried, point) => {
      if (carried.kind === "slot" && mode === "shape") {
        setShape((current) => moveShapeSlot(current, carried.id, point));
      }
    },
    // A pointer sequence that went nowhere is a tap.
    onTap: (carried) => (carried.kind === "player" ? tapPlayer(carried.id) : tapSlot(carried.id)),
    onDrop: (carried, point) => {
      if (carried.kind === "player") {
        const target = point ? nearestSlot(shape, point) : null;
        if (target) {
          place(target.key, carried.id);
        } else {
          // Dropped on the bench, or off the screen: the player comes off. TERRAIN deliberately does
          // the opposite (decision 045) — here there is no match in progress to lose a player from.
          setAssignments((current) => removeMember(current, carried.id));
          setAnnouncement(`${nameOf(carried.id)} retourne sur le banc.`);
        }
        setSelection(null);
        return;
      }
      if (mode !== "shape") return;
      // The slot has already followed the finger; this only says where it ended up.
      const moved = shape.find((slot) => slot.key === carried.id);
      if (moved) {
        setAnnouncement(
          `Poste déplacé : ${positionNameFr(moved.positionCode)}. Formation ${shapeLabel(shape)}.`,
        );
      }
    },
  });
  const drag = gesture.drag;

  /* --- what a gesture does ------------------------------------------------- */

  function place(slotKey: string, memberId: string) {
    const occupant = memberInSlot(assignments, slotKey);
    const slot = shape.find((candidate) => candidate.key === slotKey);
    // Where he comes *from* decides the sentence: two players on the turf trade posts, while a player
    // off the bench replaces the one standing there, who goes back to it. `placeInSlot` has always
    // done both; only the announcement used to call them the same thing.
    const fromPitch = slotOfMember(assignments, memberId) !== null;
    setAssignments((current) => placeInSlot(current, slotKey, memberId));
    setSelection(null);
    setAnnouncement(
      occupant && occupant !== memberId
        ? fromPitch
          ? `${nameOf(memberId)} et ${nameOf(occupant)} échangent leurs postes.`
          : `${nameOf(memberId)} remplace ${nameOf(occupant)}.`
        : `${nameOf(memberId)} est placé ${slot ? atPositionFr(slot.positionCode) : "sur le terrain"}.`,
    );
  }

  /**
   * Tapping a player picks him up, puts him down if he was already picked up — or, if someone else
   * is already picked up and this one is standing on the turf, **replaces him**.
   *
   * That last branch is the gesture the pre-filled editor exists for (decision 106). Dropping a disc
   * onto an occupied post has always swapped the two (`placeInSlot`), but the *tap* path — the one
   * the screen leads with, and the one that works when the bench is a scrolling strip — only ever
   * changed the selection: tapping the outgoing player put the incoming one down again, so a coach
   * planning one substitution had to empty the post first and find the free slot. Now the two taps
   * read as one sentence: this one comes on, for that one.
   */
  function tapPlayer(memberId: string) {
    if (selection?.kind === "member" && selection.id === memberId) {
      setSelection(null);
      setAnnouncement(`${nameOf(memberId)} n’est plus sélectionné.`);
      return;
    }

    if (selection?.kind === "member") {
      const occupied = slotOfMember(assignments, memberId);
      if (occupied !== null) {
        place(occupied, selection.id);
        return;
      }
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

  const lifted = drag?.subject.kind === "player" && drag.moved ? drag.subject.id : null;
  const visible = lifted ? removeMember(assignments, lifted) : assignments;
  const hoveredSlot =
    drag?.subject.kind === "player" && drag.moved && drag.point
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

  const draggedMember =
    drag?.subject.kind === "player" && drag.moved ? byId.get(drag.subject.id) : undefined;

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

      {/* --- why the pitch is not empty ---
          Only while the pre-fill is untouched: once the coach has moved somebody, « déplace seulement
          ce qui change » is advice about a state that has passed, and « Changements déduits » below
          says what he has done instead. */}
      {!dirty && (props.prefillNoticeFr ?? []).length > 0 ? (
        <div className="space-y-1 rounded-2xl bg-surface-2 p-3">
          {(props.prefillNoticeFr ?? []).map((line) => (
            <p key={line} className="text-sm text-ink-muted">
              {line}
            </p>
          ))}
        </div>
      ) : null}

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
        {/* Two columns from 390 px, not from `sm`: stacked, these two fields plus their hint were
            220 px of screen above a pitch that has none to spare. At 390 px the card interior is
            326 px, so each column is (326 − 12) / 2 = 157 px — room for « 1-3-2-1 » and for a
            two-digit minute. */}
        <div className="grid grid-cols-2 gap-3">
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
            {/* « À partir de la minute » wrapped onto three lines in a 157 px column and pushed the
                select out of line with it. The card's own title says « À partir de la 30e minute »,
                and the hint below says what 0 means, so the field itself only needs its unit. */}
            <Label htmlFor="fromMinute">Minute</Label>
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
          </div>

          {/* Full width under both fields: a hint squeezed into a 157 px column is five lines tall. */}
          <p id="fromMinute-hint" className="col-span-2 text-xs text-ink-muted">
            {minuteFieldHintFr(props.totalMinutes)}
          </p>
          {minuteClash ? (
            <div className="col-span-2">
              <FieldError>
                {fromMinute === 0
                  ? "Il y a déjà une composition de départ."
                  : `Une composition démarre déjà à la ${ordinalFr(fromMinute)} minute.`}
              </FieldError>
            </div>
          ) : null}
        </div>
      </Card>

      {/* --- the pitch --- */}
      <Card
        title="Terrain"
        /* The mode switch lives in the header rather than on a row of its own: the control is 54 px
           tall with its track, and next to the title it costs nothing. Its legend goes back to
           `sr-only`, which is what the two visible labels already say. */
        action={
          <SegmentedControl
            name="editor-mode"
            legend="Que veux-tu déplacer ?"
            /* 160 px: the track's padding and border take 10, leaving 75 per segment for « Joueurs »
               at 14 px — and 154 px of the 326 px header for the title, which needs 60. */
            className="w-[10rem]"
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
        }
      >
        <div className="space-y-2">
          {/* The wrapper has the pitch's exact box (`Pitch` is `w-full` with a fixed aspect ratio),
              which is what `fromClientPoint` needs to convert a finger into a point — so the cap
              goes *here*, on the measured element, and the pitch stays `w-full` inside it. A
              `max-w` on a centred box keeps those two rectangles identical; capping the height
              instead would leave the ref box wider than the turf and every drop would land left of
              where the finger was. */}
          <div ref={pitchRef} className={cn("relative mx-auto w-full", PITCH_MAX_WIDTH)}>
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
                    gesture.begin(
                      event,
                      // In `postes` mode the slot itself is what moves. Otherwise the gesture carries
                      // whoever is standing in it, and an empty slot carries the slot so that a tap
                      // on it still goes through `tapSlot`.
                      mode === "shape" || !slot.player
                        ? { kind: "slot", id: slot.id }
                        : { kind: "player", id: slot.player.id },
                    )
                  }
                  {...gesture.handlers}
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

          {shapeProblems.length > 0 ? <FieldError>{shapeProblems}</FieldError> : null}

          {/* The two undo-shaped actions, next to what they undo rather than in the dock, where they
              would push the confirm button onto a second row. */}
          {assignments.length > 0 || dirty ? (
            <div className="flex flex-wrap justify-end gap-2">
              {assignments.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearPitch}
                  disabled={pending}
                >
                  Tout vider
                </Button>
              ) : null}
              {dirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetEverything}
                  disabled={pending}
                >
                  Rétablir
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      {/* --- the changes this composition implies --- */}
      <PlanChanges
        changes={changes}
        previousTitleFr={previous ? planTitleFr(previous) : null}
        warningsFr={warnings.map((issue) => issue.messageFr)}
      />

      {/* --- the dock: the bench and the confirm button, both always on screen --- */}
      <div className={DOCK_CLASS}>
        {/* One line for the two things that are true of the whole screen: what a thumb can do next,
            and whether anything is unsaved. They were two blocks of their own before — 60 px between
            the pitch and the bench for two short sentences. */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs leading-snug text-ink-muted">
            {benchHintFr({ mode, benchCount: bench.length, freeSlots })}
          </p>
          {/* `editorSaveStateFr`, not a ternary on `dirty`: a composition being created has never
              been saved whether or not it has been touched, and it now opens with seven pre-filled
              discs that look exactly like a plan (decision 106). Allowed to wrap — the sentence is
              longer than « À jour. » and the dock has a couple of lines to give. */}
          <p
            aria-live="polite"
            className="max-w-[9rem] shrink-0 text-right text-xs font-medium text-ink-subtle"
          >
            {editorSaveStateFr({ isNew: props.lineupId === null, dirty })}
          </p>
        </div>

        {/* The gesture commentary is `sr-only` now, where it used to be a visible line under the
            pitch. Everything it says — a player placed, two swapped, the turf emptied — is already
            on the turf a centimetre above, so on screen it was a duplicate paying for itself in the
            one currency this layout has none of. For a screen reader it is the only account of what
            the gesture did, so it stays, announced. */}
        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>

        {/* The bench itself: one strip, titulaires then remplaçants, scrolling sideways when there
            are more than the five that fit. `benchPlayerLabelFr` is what says which is which to a
            screen reader, since the strip carries it by order alone. */}
        {bench.length > 0 ? (
          <ul
            aria-label="Banc : appuie sur un joueur puis sur un poste, ou fais-le glisser sur le terrain."
            className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1"
          >
            {starters.map((member) => (
              <BenchDisc
                key={member.membershipId}
                member={member}
                kit={kit}
                selected={selection?.kind === "member" && selection.id === member.membershipId}
                disabled={pending || mode === "shape"}
                gesture={gesture}
                onKeyDown={onPlayerKeyDown}
              />
            ))}
            {starters.length > 0 && substitutes.length > 0 ? (
              <li aria-hidden className="my-1 w-px shrink-0 self-stretch bg-border/70" />
            ) : null}
            {substitutes.map((member) => (
              <BenchDisc
                key={member.membershipId}
                member={member}
                kit={kit}
                selected={selection?.kind === "member" && selection.id === member.membershipId}
                disabled={pending || mode === "shape"}
                gesture={gesture}
                onKeyDown={onPlayerKeyDown}
              />
            ))}
          </ul>
        ) : null}

        {state?.error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {state.error}
          </p>
        ) : null}
        <FieldError>{blocking.map((issue) => issue.messageFr)}</FieldError>

        {/* Grid, not a flex row: `Button` is `shrink-0`, and the flex version of this row is how a
            confirm button ended up 8 px off a 390 px screen once already. */}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button type="submit" pending={pending} disabled={!canSave} fullWidth>
            {props.lineupId ? "Enregistrer" : "Créer la composition"}
          </Button>
          <ButtonLink href={props.cancelHref} variant="secondary">
            Annuler
          </ButtonLink>
        </div>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* The bench                                                                  */
/* -------------------------------------------------------------------------- */

type BenchDiscProps = {
  member: EditorMember;
  kit: KitColors;
  selected: boolean;
  disabled: boolean;
  gesture: PitchDragHandle<Carried>;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, memberId: string) => void;
};

/**
 * One player waiting to come on, as a 64 px cell of the bench strip.
 *
 * ## Why it is a cell and not a row
 *
 * The bench used to be two headed sections of wrapping rows, on the argument that a player hidden
 * off the edge of the screen is a player the coach forgets. True — but thirteen discs in four rows
 * is 300 px of screen, which pushed the whole bench *below the fold*, and a player nobody can even
 * scroll to while holding a drag is worse than one he has to swipe to. So: one row, five cells
 * visible at 390 px (5 × 64 + 4 × 8 = 352 of the 358 available), the rest a swipe away, and the
 * count of who is left is stated in words above the strip.
 *
 * `showName={false}` plus our own 10 px name is not decoration: `PlayerDisc`'s own chip is 88 px
 * wide by inline style, which would bleed 12 px over the neighbouring cell on each side.
 *
 * `touch-pan-x`, not `touch-none`: the browser needs to be allowed to scroll the strip, and nothing
 * else. A sideways swipe pans and we get a `pointercancel` (writing nothing, which is right — the
 * coach was scrolling); a lift towards the turf, or a tap, stays with our pointer capture.
 */
function BenchDisc({ member, kit, selected, disabled, gesture, onKeyDown }: BenchDiscProps) {
  return (
    <li className="shrink-0 snap-start">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={benchPlayerLabelFr(member)}
        disabled={disabled}
        className={cn(
          "flex w-16 touch-pan-x flex-col items-center gap-1 rounded-xl border p-1",
          selected ? "border-accent bg-accent/10" : "border-transparent bg-surface-2",
          "disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
        onPointerDown={(event) =>
          gesture.begin(event, { kind: "player", id: member.membershipId })
        }
        {...gesture.handlers}
        onKeyDown={(event) => onKeyDown(event, member.membershipId)}
      >
        <PlayerDisc
          name={member.name}
          jerseyNumber={member.jerseyNumber}
          primaryColor={kit.primaryColor}
          secondaryColor={kit.secondaryColor}
          variant={member.isInjured ? "unavailable" : selected ? "selected" : "normal"}
          statusLabel={statusLabelOf(member)}
          positionCode={member.primaryPositionCode ?? undefined}
          size="md"
          showName={false}
        />
        <span
          aria-hidden
          className="max-w-full truncate text-[0.625rem] leading-tight font-medium text-ink"
        >
          {abbreviateName(member.name, 9)}
        </span>
      </button>
    </li>
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
