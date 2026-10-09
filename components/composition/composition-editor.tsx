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
 * There is one formation (decision 157), so there is nothing to pick and no slot to drag: the seven
 * posts of the `1-2-3-1` are fixed, and the only thing a gesture moves is a player.
 *
 * ## Three ways to do the same thing
 *
 * 1. **Drag** a player from the bench onto a slot. Dropping on an occupied slot swaps the two;
 *    dropping **on the dock**, or off the screen entirely, sends the player back to the bench. The
 *    dock is a real drop target and says so while a finger is over it — see `DOCK_TARGET_CLASS`.
 * 2. **Tap** a player, then tap a slot. Same result, and the only thing that works reliably in a
 *    wool glove in February. It is also the keyboard path: every disc, slot and bench entry is a
 *    real `<button>`, so `Tab` + `Entrée` does the whole job.
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
 *   row) and the tab bar is 56 px — `--tabbar-h`, which is also what the dock is now offset by —
 *   leaving 740 − 56 (app header) − 56 − 196 = 432 px between the header and the dock: the whole
 *   410 px pitch, the whole bench and « Créer la composition », with no scrolling. One sticky element
 *   rather than two also removes the stacking arithmetic that put the old save bar *underneath* the
 *   fixed tab bar at `bottom-3`.
 *
 * The dock's strip scrolls sideways when there are more players than fit, which is the one place a
 * scroll container could eat the gesture. Each disc is `touch-pan-x`, not `touch-none`: the browser
 * may take a horizontal swipe to scroll the strip (we get `pointercancel` and write nothing), and
 * everything else — the vertical lift onto the turf, and the tap — stays with our pointer capture.
 *
 * ## Why the state is what it is
 *
 * `assignments` is the `(slot, player)` pairs, over the formation's fixed seven slots. The bench, the
 * deduced changes and every warning are derived from it, never kept in sync beside it. The only
 * stored state is what a gesture actually changes.
 */

import { useActionState, useId, useMemo, useRef, useState } from "react";

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
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveLineup } from "@/lib/composition/actions";
import {
  assignmentsSignature,
  benchOf,
  memberInSlot,
  placeInSlot,
  removeMember,
  slotOfMember,
  sortAssignments,
  type SlotAssignment,
} from "@/lib/composition/editor";
import {
  MINUTE_MAX,
  benchDropHintFr,
  benchHintFr,
  benchPlayerLabelFr,
  minuteFieldErrorFr,
  minuteFieldHintFr,
  parseMinute,
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
import { nearestSlot, orderShape, shapeFromRows, shapeLabel } from "@/lib/formation/shape";

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
};

/** The one formation (decision 157), with its slots. */
export type EditorFormation = {
  id: string;
  label: string;
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
  /** The formation every composition stands on. */
  formation: EditorFormation;
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
 * What a gesture is carrying: a player being placed, or an empty slot being tapped. `id` is a
 * `team_members.id` for a player and a `formation_slots.id` for a slot.
 */
type Carried = { kind: "player" | "slot"; id: string };

type Selection = { kind: "member"; id: string } | null;

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
 * fixed tab bar and back in the flow from `md`, where the screen is tall enough not to need it.
 *
 * The offset is `--tabbar-h` plus the home indicator, and it is the token rather than a literal
 * because the literal was wrong: it said `4.5rem` — 72 px — where `BottomNav` is 56 px tall, and the
 * inset cancels on both sides, so 16 px of scrolling turf showed through between the dock and the
 * tab bar on every device. Exactly the arithmetic decision 112 had already found and fixed in game
 * mode, in a second copy of the same number. There is one copy now (`app/globals.css`).
 */
const DOCK_CLASS =
  "sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))] z-20 -mx-4 space-y-2 " +
  "border-t border-border/60 bg-canvas/95 px-4 pt-2 pb-2 backdrop-blur " +
  "md:static md:mx-0 md:rounded-2xl md:border md:px-4 md:py-3";

/**
 * What the dock looks like while a player from the pitch is carried over it: the drop target, said
 * on screen.
 *
 * It is not decoration. `Pitch` is `overflow-hidden` — which is what keeps markers on the turf — so
 * the lifted disc is *clipped* the moment the finger crosses the bottom of the pitch, and a gesture
 * whose subject has visibly vanished reads as broken even when it is about to work. The ring is the
 * feedback the clipped disc cannot give, and it is why the overlay is not portalled out of the turf.
 */
const DOCK_TARGET_CLASS = "ring-2 ring-accent";

/* -------------------------------------------------------------------------- */
/* The editor                                                                 */
/* -------------------------------------------------------------------------- */

export function CompositionEditor(props: CompositionEditorProps) {
  const { formation, members, kit } = props;

  const [state, action, pending] = useActionState(saveLineup, undefined);

  const shape = useMemo(() => shapeFromRows(formation.slots), [formation.slots]);
  const [assignments, setAssignments] = useState<SlotAssignment[]>(() => [...props.assignments]);
  /**
   * The minute field holds **the string the coach typed**, not a number, and that is the whole fix
   * for a field that could not be emptied: with a `number` in state, `clampMinute("")` was `NaN` was
   * `0`, so the field snapped back to `0` the instant it was empty and reaching 10 meant typing
   * `010` and deleting from the left. `""` is a legal transient state — and an invalid one to
   * submit, which the error below says rather than silently substituting a minute. Same shape as
   * every other number field in the app (`MinuteInput` in the retro form, and the score fields).
   */
  const [fromMinute, setFromMinute] = useState(() => String(props.fromMinute));
  const [selection, setSelection] = useState<Selection>(null);
  const [announcement, setAnnouncement] = useState("");
  /** True while a player lifted off the turf is held over the dock: the bench is the drop target. */
  const [overDock, setOverDock] = useState(false);

  const pitchRef = useRef<HTMLDivElement | null>(null);
  /**
   * The dock's box, so a drop on the bench can be told from a drop on the turf. It has to be a real
   * hit test on a real element: the dock is `sticky`, its height changes with the errors it shows,
   * and it is drawn *in front of* the bottom of the pitch.
   */
  const dockRef = useRef<HTMLDivElement | null>(null);

  /** The bench strip's description — the count, which the strip itself no longer prints. */
  const benchHintId = useId();

  const byId = useMemo(
    () => new Map(members.map((member) => [member.membershipId, member])),
    [members],
  );
  const nameOf = useMemo(() => nameOfMembers(members), [members]);

  /* --- what the state means ------------------------------------------------ */

  const label = shapeLabel(shape);

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

  /**
   * The two places the minute has to be a number, and the only two: what this composition follows
   * on from, and whether another one already starts there. `null` while the field is empty — which
   * is not a clash and not a zero, it is a coach mid-keystroke.
   *
   * Everything that only *describes* the composition — the card's title, the « à partir de la 30ᵉ »
   * — falls back to the minute the editor was opened on, because an empty field is a keystroke and
   * not a decision to retitle the card « Composition de départ ».
   */
  const minute = parseMinute(fromMinute);
  const minuteError = minuteFieldErrorFr(fromMinute);
  const titleMinute = minute ?? props.fromMinute;

  const previous = planInForceBefore(props.otherPlans, titleMinute, props.lineupId);
  const changes = deduceChanges(previous, { assignments, slots: planSlots }, nameOf);
  const minuteClash =
    minute !== null && props.otherPlans.some((plan) => plan.fromMinute === minute);

  const dirty =
    assignmentsSignature(assignments) !== assignmentsSignature(props.assignments) ||
    fromMinute !== String(props.fromMinute);

  const canSave =
    !pending &&
    blocking.length === 0 &&
    !minuteClash &&
    minuteError === null;

  /* --- the gesture --------------------------------------------------------- */

  const gesture = usePitchDrag<Carried>({
    pitchRef,
    onMove: (carried, _point, client) => {
      // The one containment test, driving the ring on the dock. `onDrop` asks the same question of
      // the same rectangle, so what the coach is shown and what the release does cannot disagree.
      if (carried.kind === "player") setOverDock(isInside(dockRef.current, client));
    },
    // A pointer sequence that went nowhere is a tap.
    onTap: (carried) => (carried.kind === "player" ? tapPlayer(carried.id) : tapSlot(carried.id)),
    onDrop: (carried, point, client) => {
      setOverDock(false);
      if (carried.kind === "player") {
        // **The dock is asked first, before `point`** — and that order is the whole fix. The dock is
        // `sticky z-20` over a pitch at `z-auto`, so it is drawn *in front of* the bottom of the
        // turf: a finger on the bench is still inside the pitch's own rectangle, `pointOf` answers
        // with a perfectly valid point near the goal line, and `nearestSlot` used to put the player
        // in the nearest defender's slot. Dragging somebody onto the bench did nothing, or worse.
        // Asking the dock first is the stacking order the screen already shows, written down.
        if (isInside(dockRef.current, client)) {
          sendToBench(carried.id);
          return;
        }
        const target = point ? nearestSlot(shape, point) : null;
        if (target) {
          place(target.key, carried.id);
        } else {
          // Dropped off the screen: the player comes off too. TERRAIN deliberately does the opposite
          // (decision 045) — here there is no match in progress to lose a player from.
          sendToBench(carried.id);
        }
        setSelection(null);
      }
    },
  });
  const drag = gesture.drag;

  /* --- what a gesture does ------------------------------------------------- */

  /**
   * The player comes off the pitch. Whether he was on it decides the sentence: a disc picked up on
   * the bench and put back on the bench has not moved, and saying « retourne sur le banc » about it
   * would be an account of something that did not happen.
   */
  function sendToBench(memberId: string) {
    const fromPitch = slotOfMember(assignments, memberId) !== null;
    setAssignments((current) => removeMember(current, memberId));
    setSelection(null);
    setAnnouncement(
      fromPitch
        ? `${nameOf(memberId)} retourne sur le banc.`
        : `${nameOf(memberId)} reste sur le banc.`,
    );
  }

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
    if (selection?.kind === "member") {
      place(slotKey, selection.id);
      return;
    }

    const occupant = memberInSlot(assignments, slotKey);
    if (occupant) tapPlayer(occupant);
  }

  function onSlotKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, slotKey: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    tapSlot(slotKey);
  }

  function onPlayerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, memberId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    tapPlayer(memberId);
  }

  /* --- undoing ------------------------------------------------------------ */

  function resetEverything() {
    setAssignments([...props.assignments]);
    setFromMinute(String(props.fromMinute));
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
  /**
   * Whether releasing now would bench the carried player. Gated on `lifted` rather than reset in a
   * `pointercancel` handler: a cancelled gesture clears the drag, so the ring goes out with it.
   */
  const dropOnBench = lifted !== null && overDock;
  /**
   * What the dock says about the release, and `null` when it says nothing — the ring is drawn on the
   * same value, so the sentence and the highlight cannot disagree about what letting go does.
   *
   * `fromPitch` is the distinction `sendToBench` already makes, asked here one render earlier: a disc
   * lifted *from the bench* and released over the bench has not moved, so promising « retourne sur le
   * banc » about it would be the contradiction `benchDropHintFr` documents.
   */
  const benchDropHint =
    dropOnBench && lifted
      ? benchDropHintFr({
          name: nameOf(lifted),
          fromPitch: slotOfMember(assignments, lifted) !== null,
        })
      : null;
  const hoveredSlot =
    drag?.subject.kind === "player" && drag.moved && drag.point && !dropOnBench
      ? (nearestSlot(shape, drag.point)?.key ?? null)
      : null;

  const slots: PitchSlot[] = orderShape(shape).map((slot) => {
    const memberId = memberInSlot(visible, slot.key);
    const member = memberId ? byId.get(memberId) : undefined;
    const isTarget = hoveredSlot === slot.key;
    const isSelected = selection?.kind === "member" && selection.id === memberId;

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

      {/* --- the minute ---
          No formation here any more: there is one (decision 157), and the pitch below is it. */}
      <Card title={planTitleFr({ fromMinute: titleMinute, isInitial: titleMinute === 0 })}>
        {/* Half the card's width, as it was beside the old formation select: a minute needs no more,
            and a 326 px number field reads as a text box. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            {/* The card's own title says « À partir de la 30e minute », and the hint below says what 0
                means, so the field itself only needs its unit. */}
            <Label htmlFor="fromMinute">Minute</Label>
            <Input
              id="fromMinute"
              name="fromMinute"
              type="number"
              inputMode="numeric"
              min={0}
              max={MINUTE_MAX}
              step={1}
              value={fromMinute}
              invalid={minuteClash || minuteError !== null}
              aria-describedby="fromMinute-hint"
              /* Stored exactly as typed. Nothing is coerced here: a field that repairs itself on
                 every keystroke is a field a thumb cannot empty. */
              onChange={(event) => setFromMinute(event.target.value)}
              disabled={pending}
            />
          </div>

          {/* Full width under both fields: a hint squeezed into a 157 px column is five lines tall. */}
          <p id="fromMinute-hint" className="col-span-2 text-xs text-ink-muted">
            {minuteFieldHintFr(props.totalMinutes)}
          </p>
          {/* An empty or impossible minute is shown here rather than substituted for a 0: the
              server's own schema coerces `""` to 0, so a silent repair would create a « composition
              de départ » the coach never asked for. The clash keeps its own sentence. */}
          {minuteClash || minuteError !== null ? (
            <div className="col-span-2">
              <FieldError>
                {minuteError !== null
                  ? minuteError
                  : minute === 0
                    ? "Il y a déjà une composition de départ."
                    : `Une composition démarre déjà à la ${ordinalFr(minute ?? 0)} minute.`}
              </FieldError>
            </div>
          ) : null}
        </div>
      </Card>

      {/* --- the pitch --- */}
      <Card title="Terrain">
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
                  aria-label={slotButtonLabelFr(slot)}
                  onPointerDown={(event) =>
                    gesture.begin(
                      event,
                      // The gesture carries whoever is standing in the slot, and an empty slot carries
                      // the slot so that a tap on it still goes through `tapSlot`.
                      slot.player
                        ? { kind: "player", id: slot.player.id }
                        : { kind: "slot", id: slot.id },
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
      <div ref={dockRef} className={cn(DOCK_CLASS, benchDropHint !== null && DOCK_TARGET_CLASS)}>
        {/* The dock carries the players and the buttons, and nothing else. The two status lines that
            used to sit here — the bench count with the tap instruction, and the save state — were
            permanent text above a strip of discs on the one screen with no vertical room to spare,
            and both of them restate something the reader is already looking at: the discs are the
            bench, the empty postes are on the turf a centimetre up, and a composition with nothing
            recorded is one whose button still says « Créer la composition ». They are kept for a
            screen reader below, where they are the only account of either.

            The one sentence still allowed on screen is the drop hint, and only while a player from
            the pitch is actually over the dock: `Pitch` is `overflow-hidden`, so the lifted disc is
            clipped at the bottom of the turf and the gesture reads as having lost him. The ring says
            *here*; this says what letting go does. `benchDropHint` is `null` for a disc carried
            *from* the bench — nothing was clipped, and releasing it moves nobody — so the line is
            absent for every state of the screen except the one that cannot explain itself. */}
        {benchDropHint !== null ? (
          <p className="text-xs leading-snug font-medium text-accent">{benchDropHint}</p>
        ) : null}

        {/* `editorSaveStateFr`, not a ternary on `dirty`: a composition being created has never been
            saved whether or not it has been touched, and it opens with seven pre-filled discs that
            look exactly like a plan (decision 106). Announced rather than drawn, now — the button is
            what says it on screen. */}
        <p aria-live="polite" className="sr-only">
          {editorSaveStateFr({ isNew: props.lineupId === null, dirty })}
        </p>

        {/* The gesture commentary is `sr-only` now, where it used to be a visible line under the
            pitch. Everything it says — a player placed, two swapped, the turf emptied — is already
            on the turf a centimetre above, so on screen it was a duplicate paying for itself in the
            one currency this layout has none of. For a screen reader it is the only account of what
            the gesture did, so it stays, announced. */}
        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>

        {/* How many are waiting and how many postes are free, announced only. On screen the strip is
            the count and the turf is the free postes; off it, the strip scrolls sideways and about
            five of its discs fit, so the number is the one thing nothing else carries. It describes
            the list rather than living inside it, so a reader moving through the discs is not told
            the total between two of them. */}
        <p id={benchHintId} className="sr-only">
          {benchHintFr({ benchCount: bench.length, freeSlots })}
        </p>

        {/* The bench itself: one strip, titulaires then remplaçants, scrolling sideways when there
            are more than the five that fit. `benchPlayerLabelFr` is what says which is which to a
            screen reader, since the strip carries it by order alone. */}
        {bench.length > 0 ? (
          <ul
            aria-label="Banc : appuie sur un joueur puis sur un poste, ou fais-le glisser sur le terrain."
            aria-describedby={benchHintId}
            className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1"
          >
            {starters.map((member) => (
              <BenchDisc
                key={member.membershipId}
                member={member}
                kit={kit}
                selected={selection?.kind === "member" && selection.id === member.membershipId}
                disabled={pending}
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
                disabled={pending}
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
        {/* `incomplete` is dropped here and nowhere else: « Il reste 3 postes à pourvoir. » counts
            the empty postes on the turf directly above, which are drawn empty, so in the dock it is
            a caption for a picture. It still blocks the save (`canSave`), it is still announced
            below, and it is still printed on the compositions list, where there is no turf to read
            it off. Every other blocking issue stays visible: « Personne n’est dans les buts. » names
            *which* empty poste is the fatal one, and that the turf does not say. */}
        <FieldError>
          {blocking.filter((issue) => issue.code !== "incomplete").map((issue) => issue.messageFr)}
        </FieldError>
        {/* …and the one that no longer prints is announced, so a save refused is never silent. */}
        <p aria-live="polite" className="sr-only">
          {blocking
            .filter((issue) => issue.code === "incomplete")
            .map((issue) => issue.messageFr)
            .join(" ")}
        </p>

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

/**
 * Is the finger over `element`? Its live rectangle, hit-tested against the client point — no margin,
 * unlike the pitch's: the dock has a visible edge with a border on it, and the turf's 12 px of
 * forgiveness exists for a goalkeeper's slot sitting against the goal line.
 *
 * An element that is not laid out yet answers « no » rather than a guessed box. From `md` the dock is
 * `static` and sits below the pitch instead of over it; the same test still answers correctly there,
 * because it asks the rectangle where it is now rather than where the mobile layout puts it.
 */
function isInside(element: HTMLElement | null, client: { x: number; y: number }): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    client.x >= rect.left &&
    client.x <= rect.right &&
    client.y >= rect.top &&
    client.y <= rect.bottom
  );
}

/** French name of a position, lower-cased for the middle of a sentence. */
function positionNameFr(code: string): string {
  return POSITION_NAMES[code] ?? code;
}

function slotButtonLabelFr(slot: PitchSlot): string {
  const position = positionNameFr(slot.positionCode);
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
