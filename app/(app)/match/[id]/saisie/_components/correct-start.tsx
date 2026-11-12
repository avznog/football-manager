"use client";

/**
 * « Corriger la composition de départ » on a finished match (decision 223).
 *
 * Game mode's own TERRAIN sheet, the one « Ajouter un changement » ends on, opened on the starting
 * seven instead of on the pitch at some minute: the coach rearranges it with the gestures he already
 * knows and confirms once. No new pitch.
 *
 * Who may be placed is what « Ajouter un changement » offers at the kick-off: the starters, plus the
 * players the sheet names as starter or substitute or who played at some point (`changeCandidateIds`).
 * Plus, under « Pas sur la feuille de match », the players the sheet does not have and the
 * supporters (decision 226): starting one adds him to the sheet as a starter, and the sheet's footer
 * says so before « Valider ». Never somebody who does not play — the server refuses that anyway.
 *
 * The start only, as the owner chose. Every later change stays as recorded; if the new seven makes a
 * later line impossible, the server says which and the coach corrects that line himself.
 */

import { startTransition, useMemo } from "react";

import { TerrainSheet } from "@/components/action-sheet";
import {
  availableOptions,
  onPitchOptions,
  playerIndex,
  reduceLive,
} from "@/lib/match/presenter";
import { terrainPayload, type SlotAssignment } from "@/lib/match/terrain";
import { changeCandidateIds, stateAtClock } from "@/lib/retro/change";
import {
  OFF_SHEET_HEADING_FR,
  offSheetCandidateIds,
  sheetAdditionFr,
  sheetAdditions,
} from "@/lib/retro/sheet";
import type { RetroView } from "@/lib/retro/queries";

export function CorrectStart({
  teamId,
  view,
  open,
  onClose,
  action,
}: {
  teamId: string;
  view: RetroView;
  open: boolean;
  onClose: () => void;
  action: (payload: FormData) => void;
}) {
  const live = view.live;
  const players = useMemo(() => playerIndex(live.players), [live.players]);
  const wholeMatch = useMemo(() => reduceLive(live, [], null), [live]);

  // The start as the reducer sees it, and the clock it sits at — 0′, or the second after a kick-off
  // tapped too early (decision 150 recognises the start by what it does, not by when).
  const startEntry = useMemo(
    () => wholeMatch.compositions.find((composition) => composition.startingLineup) ?? null,
    [wholeMatch],
  );
  const atStart = useMemo(
    () => (startEntry ? stateAtClock(live, startEntry.clockMs) : null),
    [live, startEntry],
  );

  const base = useMemo<SlotAssignment[]>(
    () =>
      (startEntry?.assignments ?? [])
        .filter((entry): entry is { memberId: string; slotId: string } => entry.slotId !== null)
        .map((entry) => ({ slotId: entry.slotId, memberId: entry.memberId })),
    [startEntry],
  );
  // The players the sheet does not have, and the supporters, offered apart (decision 226).
  const offSheetIds = useMemo(
    () => (atStart ? offSheetCandidateIds(live, atStart, wholeMatch) : []),
    [atStart, live, wholeMatch],
  );
  const candidates = useMemo(() => {
    if (!atStart) return [];
    const allowed = new Set([...changeCandidateIds(live, atStart, wholeMatch), ...offSheetIds]);
    return [
      ...onPitchOptions(atStart, live.slots, players),
      ...availableOptions(atStart, live.players).filter((option) => allowed.has(option.memberId)),
    ];
  }, [atStart, live, players, wholeMatch, offSheetIds]);
  /** « Rémi sera ajouté à la feuille de match comme titulaire. », for whoever now starts. */
  const noticesFor = (assignments: readonly SlotAssignment[]) =>
    sheetAdditions(
      live,
      assignments.map((assignment) => assignment.memberId),
      "starter",
    ).map(sheetAdditionFr);

  const formationId = useMemo(() => {
    for (const entry of base) {
      const slot = live.slots.find((candidate) => candidate.id === entry.slotId);
      if (slot) return slot.formationId;
    }
    return live.defaultFormationId;
  }, [base, live.slots, live.defaultFormationId]);

  if (!open || !startEntry) return null;

  function submit(assignments: SlotAssignment[]) {
    const payload = terrainPayload(assignments, { slots: live.slots, origin: { kind: "pitch" } });
    const form = new FormData();
    form.set("teamId", teamId);
    form.set("matchId", view.match.id);
    form.set("intent", "start");
    for (const slot of payload.slots) form.append("start-slot", `${slot.slotId}:${slot.memberId}`);
    onClose();
    startTransition(() => action(form));
  }

  return (
    <TerrainSheet
      open
      onClose={onClose}
      title="Composition de départ"
      stampLabel={`${startEntry.minuteLabel} · coup d’envoi`}
      kit={live.kit}
      slots={live.slots}
      players={players}
      formationId={formationId}
      base={base}
      initialAssignments={base}
      candidates={candidates}
      offSheet={{ heading: OFF_SHEET_HEADING_FR, memberIds: offSheetIds }}
      noticesFor={noticesFor}
      onConfirm={submit}
    />
  );
}
