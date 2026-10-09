"use client";

/**
 * « Ajouter un changement » on a finished match (decision 169).
 *
 * The minute first, because everything else depends on it: who was on the pitch **then**. Then game
 * mode's own two questions and game mode's own pitch — `MultiPlayerPicker` for « Qui sort ? » and
 * « Qui entre ? », `TerrainSheet` pre-arranged by `changeArrangement` — so a change typed up on Monday
 * is entered with the same gestures, and read by the same rules, as one recorded on the touchline.
 *
 * Realism is what the lists are made of: « Qui sort ? » lists the players on the pitch at that
 * minute, « Qui entre ? » those off it who were on the sheet or played. Lucas, on at 23’, is simply
 * not offered as coming on at 23’. The server asks both questions again (`changeProblemFr`) and then
 * the reducer, so what the screen did not show cannot be posted either.
 *
 * Confirming posts one form through `submitAmendment` with `intent=change`; nothing is written before.
 */

import { startTransition, useMemo, useState } from "react";

import { MultiPlayerPicker, TerrainSheet } from "@/components/action-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import {
  availableOptions,
  onPitchOptions,
  playerIndex,
  reduceLive,
} from "@/lib/match/presenter";
import { MS_PER_MINUTE } from "@/lib/match/clock";
import { changeArrangement, terrainPayload, type SlotAssignment } from "@/lib/match/terrain";
import { changeCandidateIds, stateAtClock } from "@/lib/retro/change";
import type { RetroView } from "@/lib/retro/queries";

type Step =
  | { step: "minute" }
  | { step: "out"; minute: number; outIds: string[] }
  | { step: "in"; minute: number; outIds: string[]; inIds: string[] }
  | { step: "terrain"; minute: number; outIds: string[]; inIds: string[]; initial: SlotAssignment[] };

/** The last minute a change can be stamped at: strictly before the final whistle. */
export function lastChangeMinute(finalWhistleMs: number, regulation: number): number {
  if (finalWhistleMs <= 0) return regulation;
  return Math.max(0, Math.floor((finalWhistleMs - 1) / MS_PER_MINUTE));
}

export function AddChange({
  teamId,
  view,
  regulation,
  open,
  onClose,
  action,
}: {
  teamId: string;
  view: RetroView;
  regulation: number;
  open: boolean;
  onClose: () => void;
  action: (payload: FormData) => void;
}) {
  const [flow, setFlow] = useState<Step>({ step: "minute" });
  const [minuteText, setMinuteText] = useState("");

  const live = view.live;
  const maxMinute = lastChangeMinute(view.finalWhistleMs, regulation);
  const players = useMemo(() => playerIndex(live.players), [live.players]);
  const wholeMatch = useMemo(() => reduceLive(live, [], null), [live]);

  const minute = flow.step === "minute" ? null : flow.minute;
  const atClock = useMemo(
    () => (minute === null ? null : stateAtClock(live, minute * MS_PER_MINUTE)),
    [live, minute],
  );

  const base = useMemo<SlotAssignment[]>(
    () =>
      (atClock?.onPitch ?? [])
        .filter((entry) => entry.slotId)
        .map((entry) => ({ slotId: entry.slotId as string, memberId: entry.memberId })),
    [atClock],
  );
  const onPitch = useMemo(
    () => (atClock ? onPitchOptions(atClock, live.slots, players) : []),
    [atClock, live.slots, players],
  );
  const coming = useMemo(() => {
    if (!atClock) return [];
    const allowed = new Set(changeCandidateIds(live, atClock, wholeMatch));
    return availableOptions(atClock, live.players).filter((option) => allowed.has(option.memberId));
  }, [atClock, live, wholeMatch]);

  /** The formation the pitch stood in at that minute: the one its players' slots belong to. */
  const formationId = useMemo(() => {
    for (const entry of base) {
      const slot = live.slots.find((candidate) => candidate.id === entry.slotId);
      if (slot) return slot.formationId;
    }
    return live.defaultFormationId;
  }, [base, live.slots, live.defaultFormationId]);

  const leftPitchMemberIds = useMemo(
    () =>
      (atClock?.players ?? [])
        .filter((player) => !player.onPitch && player.playedMs > 0)
        .map((player) => player.memberId),
    [atClock],
  );

  const close = () => {
    setFlow({ step: "minute" });
    setMinuteText("");
    onClose();
  };

  const stamp = minute === null ? "" : `${minute}’`;
  const toggled = (ids: readonly string[], memberId: string) =>
    ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId];
  const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

  const parsedMinute = minuteText.trim() === "" ? null : Number(minuteText);
  const minuteOk =
    parsedMinute !== null && Number.isInteger(parsedMinute) && parsedMinute >= 0 && parsedMinute <= maxMinute;

  function submit(assignments: SlotAssignment[]) {
    if (flow.step !== "terrain") return;
    const payload = terrainPayload(assignments, { slots: live.slots, origin: { kind: "pitch" } });
    const form = new FormData();
    form.set("teamId", teamId);
    form.set("matchId", view.match.id);
    form.set("intent", "change");
    form.set("change-minute", String(flow.minute));
    // Who went out and who came in, read off the pitch he confirmed rather than off his two answers:
    // the sheet lets him bench an arrival or bring on one more, and the server checks the lists
    // against the slots, so they must describe the same change.
    const before = new Set(base.map((entry) => entry.memberId));
    const after = new Set(payload.slots.map((slot) => slot.memberId));
    for (const id of before) if (!after.has(id)) form.append("change-out", id);
    for (const id of after) if (!before.has(id)) form.append("change-in", id);
    for (const slot of payload.slots) form.append("change-slot", `${slot.slotId}:${slot.memberId}`);
    close();
    startTransition(() => action(form));
  }

  if (!open) return null;

  if (flow.step === "minute") {
    return (
      <Sheet
        open
        onClose={close}
        title="Ajouter un changement"
        description={`À quelle minute ? Entre 0 et ${maxMinute} : les listes suivantes montrent le terrain à cette minute-là.`}
        footer={
          <Button
            fullWidth
            disabled={!minuteOk}
            onClick={() => minuteOk && setFlow({ step: "out", minute: parsedMinute, outIds: [] })}
          >
            Suivant
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <Input
            aria-label="Minute du changement"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxMinute}
            step={1}
            value={minuteText}
            invalid={minuteText !== "" && !minuteOk}
            onChange={(event) => setMinuteText(event.target.value)}
            className="w-24 min-h-11 text-center"
          />
          <span className="text-sm text-ink-muted">ᵉ minute</span>
        </div>
      </Sheet>
    );
  }

  if (flow.step === "out") {
    return (
      <MultiPlayerPicker
        open
        onClose={close}
        title="Qui sort ?"
        description={`${count(flow.outIds.length, "sort", "sortent")} · ${stamp}`}
        options={onPitch}
        selected={flow.outIds}
        onToggle={(memberId) => setFlow({ ...flow, outIds: toggled(flow.outIds, memberId) })}
        confirmLabel="Suivant"
        onConfirm={() => setFlow({ ...flow, step: "in", inIds: [] })}
        emptyLabel="Personne sur le terrain à cette minute."
      />
    );
  }

  if (flow.step === "in") {
    return (
      <MultiPlayerPicker
        open
        onClose={close}
        title="Qui entre ?"
        description={`${count(flow.outIds.length, "sort", "sortent")}, ${count(flow.inIds.length, "entre", "entrent")} · ${stamp}`}
        options={coming}
        selected={flow.inIds}
        onToggle={(memberId) => setFlow({ ...flow, inIds: toggled(flow.inIds, memberId) })}
        confirmLabel="Placer sur le terrain"
        onConfirm={() =>
          setFlow({
            ...flow,
            step: "terrain",
            initial: changeArrangement(
              base,
              flow.outIds,
              flow.inIds,
              live.slots.filter((slot) => slot.formationId === formationId),
            ).assignments,
          })
        }
        emptyLabel="Personne d’autre sur la feuille de match."
      />
    );
  }

  return (
    <TerrainSheet
      open
      onClose={close}
      title="Changement"
      stampLabel={stamp}
      kit={live.kit}
      slots={live.slots}
      players={players}
      formationId={formationId}
      base={base}
      initialAssignments={flow.initial}
      candidates={[...onPitch, ...coming]}
      leftPitchMemberIds={leftPitchMemberIds}
      onConfirm={submit}
    />
  );
}
