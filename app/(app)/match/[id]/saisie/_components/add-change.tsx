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
import { Sheet } from "@/components/ui/sheet";
import {
  availableOptions,
  mergeEvents,
  onPitchOptions,
  playerIndex,
  reduceLive,
} from "@/lib/match/presenter";
import {
  actualPeriodStarts,
  clockMsForMinuteField,
  formatMinuteLabelFr,
  periodsConfig,
} from "@/lib/match/clock";
import { changeArrangement, terrainPayload, type SlotAssignment } from "@/lib/match/terrain";

import { MinuteField } from "./minute-field";
import { changeCandidateIds, stateAtClock } from "@/lib/retro/change";
import {
  OFF_SHEET_HEADING_FR,
  offSheetCandidateIds,
  sheetAdditionFr,
  sheetAdditions,
} from "@/lib/retro/sheet";
import { frameMoveFor } from "@/lib/retro/frame";
import type { RetroView } from "@/lib/retro/queries";

/**
 * The minute is carried as **what he typed** and as the clock it resolves to (decision 215): `30+2`
 * is a minute of this match and not a number, and everything downstream — who was on the pitch, the
 * stamp on the event — needs the clock rather than the text.
 */
type Placed = { minuteText: string; clockMs: number; period: number };

type Step =
  | { step: "minute" }
  | ({ step: "out"; outIds: string[] } & Placed)
  | ({ step: "in"; outIds: string[]; inIds: string[] } & Placed)
  | ({ step: "terrain"; outIds: string[]; inIds: string[]; initial: SlotAssignment[] } & Placed);

/** « 1re période », « 2e période » — said in the whistle-move sentence. */
const periodNameFr = (period: number) => (period === 1 ? "1re période" : `${period}e période`);

/**
 * `live`, with the frame moves a change at `placed` would append already in it (decision 224), so the
 * pitch « at that minute » is read off the log as it will be. Pending ids are local to this screen.
 */
function withMovedFrame(
  live: RetroView["live"],
  periods: ReturnType<typeof periodsConfig>,
  placed: { clockMs: number; period: number },
): RetroView["live"] {
  const move = frameMoveFor({ events: live.events, periods, placed });
  if (move.drafts.length === 0) return live;
  return {
    ...live,
    events: mergeEvents(
      live.events,
      move.drafts.map((draft, index) => ({
        clientEventId: `frame-preview-${index}`,
        type: draft.type,
        period: draft.period,
        minute: draft.minute,
        clockMs: draft.clockMs,
        occurredAt: draft.occurredAt.toISOString(),
        payload: draft.payload,
        voidsEventId: draft.voidsEventId,
      })),
    ),
  };
}

export function AddChange({
  teamId,
  view,
  open,
  onClose,
  action,
}: {
  teamId: string;
  view: RetroView;
  /** The match's regulation minutes. Still passed; unused since decision 224 lifted the ceiling. */
  regulation: number;
  open: boolean;
  onClose: () => void;
  action: (payload: FormData) => void;
}) {
  const [flow, setFlow] = useState<Step>({ step: "minute" });
  const [minuteText, setMinuteText] = useState("");

  const live = view.live;
  const players = useMemo(() => playerIndex(live.players), [live.players]);
  const wholeMatch = useMemo(() => reduceLive(live, [], null), [live]);
  // Where each period really kicked off, so `30+2` lands on the clock it means and the stamp reads
  // back as « 30’+2 » (decision 215).
  const periods = useMemo(() => periodsConfig(view.match), [view.match]);
  const periodStarts = useMemo(
    () => actualPeriodStarts(wholeMatch.playIntervals),
    [wholeMatch.playIntervals],
  );

  const placedClockMs = flow.step === "minute" ? null : flow.clockMs;
  const placedPeriod = flow.step === "minute" ? null : flow.period;
  /*
   * The log as it will be once the change is in (decision 224): a change after a whistle moves that
   * whistle, and after an added-time move the next period's events shift. The lists below have to
   * show the pitch of *that* log — the server reads the same one (`withFrameMove`) — or a change in
   * the first half's added time would offer the second half's players.
   */
  const liveMoved = useMemo(
    () =>
      placedClockMs === null || placedPeriod === null
        ? live
        : withMovedFrame(live, periods, { clockMs: placedClockMs, period: placedPeriod }),
    [live, periods, placedClockMs, placedPeriod],
  );
  const atClock = useMemo(
    () => (placedClockMs === null ? null : stateAtClock(liveMoved, placedClockMs)),
    [liveMoved, placedClockMs],
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
  /*
   * The players the sheet does not have, offered apart (decision 226): bringing one on adds him to
   * the match, and the confirm step says so. The server computes the same list and refuses anyone
   * else.
   */
  const offSheetIds = useMemo(
    () => (atClock ? offSheetCandidateIds(live, atClock, wholeMatch) : []),
    [atClock, live, wholeMatch],
  );
  const comingOffSheet = useMemo(() => {
    if (!atClock) return [];
    const allowed = new Set(offSheetIds);
    return availableOptions(atClock, live.players).filter((option) => allowed.has(option.memberId));
  }, [atClock, live.players, offSheetIds]);
  /** « Rémi sera ajouté à la feuille de match comme remplaçant. », for whoever the pitch brings on. */
  const noticesFor = (assignments: readonly SlotAssignment[]) => {
    const before = new Set(base.map((entry) => entry.memberId));
    const arriving = assignments
      .map((assignment) => assignment.memberId)
      .filter((memberId) => !before.has(memberId));
    return sheetAdditions(live, arriving, "substitute").map(sheetAdditionFr);
  };

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

  const stamp =
    flow.step === "minute"
      ? ""
      : formatMinuteLabelFr(flow.clockMs, flow.period, periods, periodStarts.get(flow.period));
  const toggled = (ids: readonly string[], memberId: string) =>
    ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId];
  const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

  /*
   * `30+2` as well as `20` (decision 215), resolved to the real clock here so the lists below show the
   * pitch as it actually was. **No ceiling any more** (decision 224): a minute after a whistle is a
   * true minute and moves the whistle, so every minute the match has a place for is accepted, and the
   * sheet says what the move will be before anything is posted.
   */
  const placed = useMemo(
    () =>
      minuteText.trim() === ""
        ? null
        : clockMsForMinuteField(minuteText, periods, periodStarts),
    [minuteText, periods, periodStarts],
  );
  const minuteOk = placed !== null && placed.clockMs >= 0;
  const whistleMove = useMemo(() => {
    if (!placed) return null;
    const move = frameMoveFor({ events: live.events, periods, placed });
    if (!move.extended) return null;
    const label = formatMinuteLabelFr(
      move.extended.toMs,
      move.extended.period,
      periods,
      periodStarts.get(move.extended.period),
    );
    return `La fin de la ${periodNameFr(move.extended.period)} sera déplacée à ${label}.`;
  }, [placed, live.events, periods, periodStarts]);

  function submit(assignments: SlotAssignment[]) {
    if (flow.step !== "terrain") return;
    const payload = terrainPayload(assignments, { slots: live.slots, origin: { kind: "pitch" } });
    const form = new FormData();
    form.set("teamId", teamId);
    form.set("matchId", view.match.id);
    form.set("intent", "change");
    form.set("change-minute", flow.minuteText);
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
        description="À quelle minute ? La deuxième case sert au temps additionnel. Les listes suivantes montrent le terrain à cette minute-là."
        footer={
          <Button
            fullWidth
            disabled={!minuteOk}
            onClick={() =>
              minuteOk &&
              placed &&
              setFlow({
                step: "out",
                minuteText: minuteText.trim(),
                clockMs: placed.clockMs,
                period: placed.period,
                outIds: [],
              })
            }
          >
            Suivant
          </Button>
        }
      >
        {/* The same two boxes as the correction sheet (decision 218): the « + » is not typed, it is
            the second box, because a phone's numeric keyboard has no key for it. No `name`, because
            this flow builds its own FormData at the last step. */}
        <MinuteField
          label="Minute du changement"
          value={minuteText}
          onChange={setMinuteText}
          periods={periods}
          invalid={minuteText !== "" && !minuteOk}
        />
        {/* Said before anything is posted (decision 224): a change after the whistle moves it, and
            the coach should read where to before he confirms rather than discover it in the déroulé. */}
        {whistleMove ? (
          <p role="status" className="mt-3 text-sm text-ink-muted">
            {whistleMove}
          </p>
        ) : null}
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
        secondary={{ heading: OFF_SHEET_HEADING_FR, options: comingOffSheet }}
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
      candidates={[...onPitch, ...coming, ...comingOffSheet]}
      offSheet={{ heading: OFF_SHEET_HEADING_FR, memberIds: offSheetIds }}
      noticesFor={noticesFor}
      leftPitchMemberIds={leftPitchMemberIds}
      onConfirm={submit}
    />
  );
}
