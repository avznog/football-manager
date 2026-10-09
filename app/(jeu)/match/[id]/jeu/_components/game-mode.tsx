"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ACTION_ICONS,
  ActionMenu,
  ConfirmSheet,
  LineupComposer,
  OptionRow,
  PlayerPicker,
  REMARK_ICONS,
  TerrainSheet,
  type ActionChoice,
  type ComposerFormation,
} from "@/components/action-sheet";
import { PitchLayout } from "@/components/pitch/PitchLayout";
import { Badge, Button, ButtonLink, Card, EmptyState } from "@/components/ui";
import { entryModeBadgeFr, matchNameFr } from "@/lib/calendar/labels";
import {
  REMARK_KINDS,
  remarkLabelFr,
  type MatchEventType,
  type RemarkKind,
} from "@/lib/match/events";
import { createOutbox, toWireEvent, type OutboxRecord, type OutboxState } from "@/lib/match/outbox";
import {
  availableOptions,
  clockActionFr,
  enterableCardFr,
  eventLabel,
  finalWhistleEvents,
  minuteLabelFr,
  nextEventStamp,
  onPitchOptions,
  pendingCountLabelFr,
  pendingLineupView,
  periodsOf,
  phaseLabelFr,
  pitchView,
  playerIndex,
  proposedPitchView,
  reduceLive,
  emptyPitchFr,
  timelineLines,
  type LiveMatch,
  type PendingEvent,
  type PlayerOption,
  type TimelineLine,
} from "@/lib/match/presenter";
import { terrainPayload, type SlotAssignment, type TerrainOrigin } from "@/lib/match/terrain";
import { CommentSheet } from "./comment-sheet";
import { EventTimeline } from "./event-timeline";
import { LineupPrompt } from "./lineup-prompt";
import { MatchBar } from "./match-bar";
import { RemarkSheet } from "./remark-sheet";
import { useNowMs } from "./use-now";

/* -------------------------------------------------------------------------- */
/* The flows                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every action is a short chain of full-screen questions, never a form. One tap opens ACTION, one
 * tap says what happened, one or two taps say who — and each of those taps is a 56 px row.
 */
type Flow =
  | { step: "menu" }
  /** The second menu, behind « Autre… »: the rarer facts, and the two tiles that open a sheet. */
  | { step: "more" }
  /** The one step with a keyboard, so the one step that is a form (`comment-sheet.tsx`). */
  | { step: "comment" }
  /**
   * « Remarque »: the sheet of six, then the one question a remark cannot skip — about whom.
   *
   * One shape and not two, with `kind` unset while the grid of six is open and set once one is
   * tapped, because it is one flow stamped at one minute: the second screen is this step one tap
   * further, exactly as « Autre… » is the menu one tap further. Closing either closes the flow.
   */
  | { step: "remark"; kind?: RemarkKind }
  | { step: "goal-scorer" }
  | { step: "goal-assist"; scorerId: string }
  | { step: "actor"; type: "OWN_GOAL" | "PENALTY_SCORED" | "PENALTY_MISSED" | "FOUL" | "INJURY" }
  | { step: "sub-out"; inId?: string }
  | { step: "sub-in"; outId: string }
  /**
   * TERRAIN: several changes arranged on the pitch, one confirmation. `origin` says what the
   * arrangement started from — the pitch, or a planned composition the coach chose to adjust — and
   * therefore which `lineupId` the resulting event carries.
   */
  | {
      step: "terrain";
      origin: TerrainOrigin;
      initial: readonly SlotAssignment[];
      /** The shape to draw: the plan's own formation, or the one being played. */
      formationId: string | null;
    }
  /** `initial` is set when TERRAIN hands its arrangement over to the list. */
  | { step: "composer"; initial?: readonly SlotAssignment[] }
  | { step: "whistle" }
  | { step: "void"; line: TimelineLine };

/** What « Autre… » is keyed as. It records nothing; it opens the second menu. */
const MORE = "MORE";
type MenuKey = MatchEventType | typeof MORE;

/**
 * The ACTION menu: what a Sunday match actually produces, and one door to everything else.
 *
 * But · But encaissé on the first row, because they are what the thumb is looking for nine times in
 * ten and each carries a glyph it learns before the word. « Changement » spans the row under them:
 * it is the other thing that happens every match, and with « Autre… » underneath it the menu reads
 * as two facts, then two longer questions. « Autre… » spans its row because a tile that opens another
 * menu must not be mistakable for a tile that records something (decision 114).
 *
 * The cahier des charges asked for exactly these four (decision 151). « Commentaire » and
 * « Remarque » moved behind « Autre… »; « Changement de poste » left the menu altogether.
 */
const CHOICES: readonly ActionChoice<MenuKey>[] = [
  {
    type: "GOAL_FOR",
    label: "But",
    hint: "buteur, passeur",
    tone: "accent",
    icon: ACTION_ICONS.GOAL_FOR,
  },
  {
    type: "GOAL_AGAINST",
    label: "But encaissé",
    hint: "enregistré aussitôt",
    tone: "danger",
    icon: ACTION_ICONS.GOAL_AGAINST,
  },
  {
    type: "SUBSTITUTION",
    label: "Changement",
    hint: "qui sort, qui entre",
    icon: ACTION_ICONS.SUBSTITUTION,
    wide: true,
  },
  {
    type: MORE,
    label: "Autre…",
    hint: "CSC, penalty, blessure, remarque, commentaire",
    icon: ACTION_ICONS.MORE,
    wide: true,
  },
];

/**
 * The second menu, « Autre action »: the cahier's « Autre (comprendra ce qu'il y a dans remarque,
 * autre, et commentaire) ». The four facts are square; « Remarque » and « Commentaire » span a row
 * each, because neither records anything on its own tap — one opens the grid of six remarks, the
 * other the one sheet in game mode with a keyboard.
 *
 * « Faute » is deliberately not here: it was recorded once in the app's life and nothing reads it,
 * so it stops being offered. It is *not* removed from the vocabulary — `FOUL` stays in
 * `MATCH_EVENT_TYPES` and in the retro-entry screen, because `match_events` is append-only
 * (invariant 1) and the fouls already in a log must still render and still be voidable
 * (decision 114). « Changement de poste » left on the same terms (decision 151): a log's
 * `POSITION_CHANGE` events still reduce, render and can be annulled, and moving a player is done on
 * the pitch (TERRAIN). Nothing on the server refuses either type: these absences are a menu, not a
 * gate.
 */
const MORE_CHOICES: readonly ActionChoice[] = [
  {
    type: "OWN_GOAL",
    label: "CSC",
    hint: "notre joueur",
    tone: "danger",
    icon: ACTION_ICONS.OWN_GOAL,
  },
  {
    type: "PENALTY_SCORED",
    label: "Penalty marqué",
    hint: "tireur",
    icon: ACTION_ICONS.PENALTY_SCORED,
  },
  {
    type: "PENALTY_MISSED",
    label: "Penalty manqué",
    hint: "tireur",
    tone: "danger",
    icon: ACTION_ICONS.PENALTY_MISSED,
  },
  {
    type: "INJURY",
    label: "Blessure",
    hint: "notre joueur",
    tone: "danger",
    icon: ACTION_ICONS.INJURY,
  },
  {
    type: "REMARK",
    label: "Remarque",
    hint: "bon retour, perte de balle…",
    icon: ACTION_ICONS.REMARK,
    wide: true,
  },
  {
    type: "COMMENT",
    label: "Commentaire",
    hint: "une note libre",
    icon: ACTION_ICONS.COMMENT,
    wide: true,
  },
];

/**
 * The six remarks, behind « Remarque ».
 *
 * Built from `REMARK_KINDS` rather than written out, so the day a seventh remark is added to
 * `lib/match/events.ts` it appears here with its French and its glyph and nothing else to do. No
 * hint on any of them: all six lead to the same question — about whom — and six copies of the same
 * sentence under six tiles is noise on the one screen that is read at arm's length.
 *
 * `tone` is the only thing that is not derived: what a coach wants to find without reading is whether
 * the tile he is about to tap is the praise or the reproach.
 */
const REMARK_TONES: Record<RemarkKind, "accent" | "danger"> = {
  GOOD_TRACK_BACK: "accent",
  GOOD_EFFORT: "accent",
  BAD_PASS: "danger",
  GOOD_POSITIONING: "accent",
  LOST_BALL: "danger",
  NICE_SKILL: "accent",
};

const REMARK_CHOICES: readonly ActionChoice<RemarkKind>[] = REMARK_KINDS.map((kind) => ({
  type: kind,
  label: remarkLabelFr(kind),
  icon: REMARK_ICONS[kind],
  tone: REMARK_TONES[kind],
}));

const EMPTY_QUEUE: OutboxState = {
  pending: [],
  rejected: [],
  sending: false,
  lastError: null,
  online: true,
};

export type GameModeProps = {
  live: LiveMatch;
  /** `can(actor, "match:operate", …)` on the server. False renders the same screen, read-only. */
  canOperate: boolean;
};

/**
 * Game mode.
 *
 * The screen is a projection and nothing else: every number on it comes from `reduceMatch` over the
 * log (invariant 2), and the only thing this component owns is *when* an action was tapped. Taps go
 * into the IndexedDB outbox, which is what makes the screen work on a pitch with no signal — the
 * goal appears instantly because the queued action is merged into the log locally, and the server
 * catches up when it can.
 *
 * `nowMs` starts as `null` and is set after mount. That is deliberate: the server render and the
 * first client render then agree (both compute the state as of the last event), so the clock cannot
 * cause a hydration mismatch, and it starts ticking a frame later.
 */
export function GameMode({ live, canOperate }: GameModeProps) {
  const router = useRouter();
  const matchId = live.match.id;

  const nowMs = useNowMs();
  /**
   * Actions this device has produced, kept until the server's own snapshot carries them. The outbox
   * drops a record the moment it is confirmed, so without this the goal would vanish from the screen
   * for as long as the refresh takes.
   */
  const [local, setLocal] = useState<PendingEvent[]>([]);
  const [queue, setQueue] = useState<OutboxState>(EMPTY_QUEUE);
  const [flow, setFlow] = useState<Flow | null>(null);
  /** Lineups the coach answered « plus tard » to, for this visit only. Nothing is written. */
  const [postponed, setPostponed] = useState<readonly string[]>([]);
  /**
   * Wall clock of the tap that opened the flow. The action is stamped with *this*, not with the time
   * the last question was answered: « but » belongs to the minute the ball crossed the line, not to
   * the minute the coach finished scrolling for the scorer's name.
   */
  const [tappedAtMs, setTappedAtMs] = useState<number | null>(null);

  // One queue per match, created once. `useState` and not `useMemo`: this is an instance with a
  // subscription and an IndexedDB handle, not a cached computation React may throw away.
  const [outbox] = useState(() => createOutbox({ matchId }));

  /* ---------------------------------------------------------------------- */
  /* Wiring                                                                 */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    /**
     * True once a flush has failed on the network, until the queue is empty again. It is what tells
     * the screen it owes the server a read: a tap only refreshes when it reached the server, so a
     * queue that catches up on its own three-second timer — nobody tapping anything, the coach just
     * walking back into coverage — would otherwise leave the page showing a snapshot from before the
     * signal died until the next action.
     */
    let owedARefresh = false;

    const unsubscribe = outbox.subscribe((next) => {
      setQueue(next);
      if (!next.online) {
        owedARefresh = true;
        return;
      }
      if (owedARefresh && next.pending.length === 0) {
        owedARefresh = false;
        router.refresh();
      }
    });
    // Pick the queue back up after a reload, then attach the browser's triggers: `online`,
    // `visibilitychange` and a slow retry tick.
    void outbox.hydrate();
    outbox.start();
    return () => {
      outbox.stop();
      unsubscribe();
    };
  }, [outbox, router]);

  /* ---------------------------------------------------------------------- */
  /* The state, derived                                                     */
  /* ---------------------------------------------------------------------- */

  const state = useMemo(() => reduceLive(live, local, nowMs), [live, local, nowMs]);
  const players = useMemo(() => playerIndex(live.players), [live.players]);
  const periods = useMemo(() => periodsOf(live.match), [live.match]);

  const queuedIds = useMemo(
    () => queue.pending.map((record) => record.clientEventId),
    [queue.pending],
  );

  const onPitch = useMemo(
    () => onPitchOptions(state, live.slots, players),
    [state, live.slots, players],
  );
  const available = useMemo(() => availableOptions(state, live.players), [state, live.players]);

  /** The pitch as slot→member pairs: the « from » side of any composition diff. */
  const onPitchAssignments = useMemo<SlotAssignment[]>(
    () =>
      state.onPitch
        .filter((entry) => entry.slotId)
        .map((entry) => ({ slotId: entry.slotId as string, memberId: entry.memberId })),
    [state.onPitch],
  );

  /** Who has already come off: TERRAIN warns before sending one of them back on. */
  const leftPitchMemberIds = useMemo(
    () =>
      state.players
        .filter((player) => !player.onPitch && player.playedMs > 0)
        .map((player) => player.memberId),
    [state.players],
  );

  const currentFormationId = useMemo(() => {
    for (const entry of state.onPitch) {
      const slot = entry.slotId ? live.slots.find((item) => item.id === entry.slotId) : null;
      if (slot) return slot.formationId;
    }
    return live.defaultFormationId;
  }, [state.onPitch, live.slots, live.defaultFormationId]);

  const pitch = useMemo(
    () =>
      pitchView(state, live.slots, players, {
        // With nobody on the pitch there is no formation to infer, so draw the default one empty.
        formationId: state.onPitch.length === 0 ? currentFormationId : undefined,
      }),
    [state, live.slots, players, currentFormationId],
  );

  const timeline = useMemo(
    () => timelineLines(state, players, { pendingClientEventIds: queuedIds }),
    [state, players, queuedIds],
  );

  const prompt = useMemo(() => {
    const view = pendingLineupView(state.pendingLineup, live.lineups, players);
    if (!view || postponed.includes(view.lineupId)) return null;
    return view;
  }, [state.pendingLineup, live.lineups, players, postponed]);

  const promptSlots = useMemo(() => {
    if (!prompt) return [];
    return proposedPitchView(prompt.slots, live.slots, players, {
      onPitchMemberIds: state.onPitch.map((entry) => entry.memberId),
      flags: prompt.flags,
    });
  }, [prompt, live.slots, players, state.onPitch]);

  /** The one formation the composer lists (decision 157). */
  const composerFormation = useMemo<ComposerFormation | null>(() => {
    const formation = live.formations[0];
    if (!formation) return null;
    return {
      id: formation.id,
      label: formation.label,
      slots: formation.slots.map((slot) => ({
        id: slot.id,
        positionCode: slot.positionCode,
        sort: slot.sort,
      })),
    };
  }, [live.formations]);

  const clockAction = clockActionFr(state);
  // `FOUL` stands in for "an action that takes the clock as it reads" — every type but `KICKOFF`
  // is stamped the same way, and this is only here to print the minute on the sheets.
  const stamp = nextEventStamp(state, "FOUL", tappedAtMs ?? nowMs ?? 0);
  const stampLabel = `${minuteLabelFr(stamp.clockMs, stamp.period, periods)} · ${phaseLabelFr(state)}`;

  const canAct = canOperate && state.started && !state.finished;
  // Who the list of players off the pitch is written for: the operator taps it, everybody else reads
  // it, and before the kick-off nobody can tap it at all (decision 087).
  const enterable = enterableCardFr({ available, players: live.players, canAct });

  // An empty pitch is not the same fact as an empty `lineups`, and the copy used to say the second
  // on the strength of the first — under a card showing the very composition it said did not exist.
  const emptyPitch = emptyPitchFr({
    hasLineups: live.lineups.length > 0,
    isProposed: prompt !== null,
    canOperate,
  });

  /* ---------------------------------------------------------------------- */
  /* Emitting                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Queue the actions of one tap — almost always one; two for the final whistle (decision 151) —
   * stamped from the same state at the same instant, stored and sent together, in this order.
   */
  const emitAll = useCallback(
    async (
      actions: readonly { type: MatchEventType; payload?: unknown; voidsEventId?: string }[],
      options: { atMs?: number } = {},
    ) => {
      const atMs = options.atMs ?? Date.now();
      const records = await outbox.enqueueAll(
        actions.map(({ type, payload, voidsEventId }) => ({
          type,
          stamp: nextEventStamp(state, type, atMs),
          payload,
          voidsEventId: voidsEventId ?? null,
          occurredAtMs: atMs,
        })),
      );
      // Optimistic: the reducer sees it immediately, so the score moves on the tap. The local copy
      // of anything the server has meanwhile confirmed is dropped in the same pass, so this list
      // never grows beyond what is actually in flight.
      const confirmed = new Set(live.events.map((event) => event.clientEventId));
      setLocal((current) => [
        ...current.filter((event) => !confirmed.has(event.clientEventId)),
        ...records.map(toWireEvent),
      ]);
      await outbox.flush();
      // Only when the action actually reached the server. A refresh is a network read: with no
      // network it has nothing to fetch, and it does not fail quietly — Next answers a failed RSC
      // request by **falling back to a full browser navigation**, which offline lands on the
      // browser's error page. Game mode would go blank on the first tap of a match played on a
      // pitch with no signal, taking the optimistic score with it, and the coach could not even
      // reload his way back in. The queue keeps the action either way; the catch-up is wired to the
      // queue draining instead (see « Wiring » above).
      if (outbox.state().online) router.refresh();
    },
    [outbox, state, router, live.events],
  );

  const emit = useCallback(
    (
      type: MatchEventType,
      payload?: unknown,
      options: { voidsEventId?: string; atMs?: number } = {},
    ) => emitAll([{ type, payload, voidsEventId: options.voidsEventId }], { atMs: options.atMs }),
    [emitAll],
  );

  /** Close the sheets and record an action stamped at the tap that opened the flow. */
  const finish = useCallback(
    (type: MatchEventType, payload?: unknown, voidsEventId?: string) => {
      const atMs = tappedAtMs ?? Date.now();
      closeFlow();
      void emit(type, payload, { atMs, voidsEventId });
    },
    [emit, tappedAtMs],
  );

  function openFlow(next: Flow) {
    setTappedAtMs(Date.now());
    setFlow(next);
  }

  function closeFlow() {
    setFlow(null);
    setTappedAtMs(null);
  }

  function pickAction(type: MenuKey) {
    switch (type) {
      case MORE:
        return setFlow({ step: "more" });
      case "COMMENT":
        return setFlow({ step: "comment" });
      case "REMARK":
        return setFlow({ step: "remark" });
      case "GOAL_FOR":
        return setFlow({ step: "goal-scorer" });
      case "GOAL_AGAINST":
        return finish("GOAL_AGAINST", {});
      case "SUBSTITUTION":
        return setFlow({ step: "sub-out" });
      case "OWN_GOAL":
      case "PENALTY_SCORED":
      case "PENALTY_MISSED":
      case "FOUL":
      case "INJURY":
        return setFlow({ step: "actor", type });
      default:
        return setFlow(null);
    }
  }

  function pressClockAction() {
    if (!clockAction.event) return;
    if (clockAction.event === "FINAL_WHISTLE") return openFlow({ step: "whistle" });
    void emit(clockAction.event, {}, { atMs: Date.now() });
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  /** On the pitch first, then the bench. A blessure and a comment can both be about either. */
  const everyone: PlayerOption[] = [...onPitch, ...available];

  /**
   * Who a remark can be about: everybody on the match sheet, and nobody else.
   *
   * Not just the seven on the pitch — a remark about the lad who came off two minutes ago is the
   * normal case, since the coach taps it when he gets a free second and not the instant it happened,
   * and « bon placement » about a substitute warming up is a thing a coach says. But not everybody
   * `available` either: that list carries members « hors feuille » so the operator can send on
   * somebody who turned up late (decision 087), and a remark about a man who was never in this match
   * is a mis-tap, not a remark. The pitch is kept whole and only the bench is filtered, so a player
   * who is somehow on the pitch without a role on the sheet is never silently unremarkable.
   */
  const onSheetMemberIds = new Set(
    live.players.filter((player) => player.squadRole !== null).map((player) => player.memberId),
  );
  const remarkable: PlayerOption[] = [
    ...onPitch,
    ...available.filter((option) => onSheetMemberIds.has(option.memberId)),
  ];

  /**
   * The one button that earns a place beside the score, because it is the only one that changes what
   * the pitch *is*. It used to be the `action` slot of a « Sur le terrain » card header; that header
   * cost 68 px of the pitch's height to print a heading nobody needs above a drawing of a pitch.
   */
  const pitchAction =
    canOperate && !state.finished ? (
      // With nobody on the pitch there is nothing to rearrange: the fastest way in is the list of
      // seven dropdowns. Once a team is playing, the same button opens TERRAIN, where several
      // changes are arranged at once and confirmed together (`docs/PLAN.md`, screen 5).
      state.onPitch.length === 0 ? (
        <Button variant="secondary" size="sm" onClick={() => openFlow({ step: "composer" })}>
          Composition
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            openFlow({
              step: "terrain",
              origin: { kind: "pitch" },
              initial: onPitchAssignments,
              formationId: currentFormationId,
            })
          }
        >
          TERRAIN
        </Button>
      )
    ) : null;

  return (
    <>
      <MatchBar
        reading={state.reading}
        goalsFor={state.goalsFor}
        goalsAgainst={state.goalsAgainst}
        matchHref={`/match/${matchId}`}
        opponentName={live.match.opponentName}
        pendingLabel={queue.pending.length > 0 ? pendingCountLabelFr(queue.pending.length) : null}
        entryBadge={entryModeBadgeFr(live.match.entryMode, { recorded: live.events.length > 0 })}
        action={pitchAction}
      />

      {/* `space-y-3` and `py-2`, not the app's `space-y-4` and `py-4`: every gap above the pitch is
          a gap taken out of it, and the pitch is drawn to a fixed aspect ratio. */}
      <div className="space-y-3 py-2">
        {!canOperate ? (
          <p className="rounded-xl border border-border/60 bg-surface-2 px-3 py-2 text-sm text-ink-muted">
            Tu suis le match en direct. Seul l’opérateur du match peut enregistrer les actions.
          </p>
        ) : null}

        {queue.rejected.length > 0 ? (
          <RejectedActions
            records={queue.rejected}
            onRetry={(id) => void outbox.retry(id)}
            onDismiss={(id) => void outbox.dismiss(id)}
          />
        ) : null}

        {prompt ? (
          <LineupPrompt
            view={prompt}
            slots={promptSlots}
            kit={live.kit}
            // Same condition as « Ajuster » below, which was the only one of the two that had it: a
            // member who may not operate the match must not be handed the button that applies a
            // composition, because the route handler answers 403 and the tap becomes a rejected
            // action.
            onApply={
              canOperate && !state.finished
                ? () =>
                    void emit(
                      "LINEUP_APPLIED",
                      { lineupId: prompt.lineupId, slots: prompt.slots },
                      { atMs: Date.now() },
                    )
                : null
            }
            onAdjust={
              canOperate && !state.finished
                ? () =>
                    openFlow({
                      step: "terrain",
                      origin: { kind: "plan", lineupId: prompt.lineupId, title: prompt.title },
                      initial: prompt.slots,
                      formationId:
                        live.lineups.find((lineup) => lineup.id === prompt.lineupId)?.formationId ??
                        currentFormationId,
                    })
                : null
            }
            onLater={() => setPostponed((current) => [...current, prompt.lineupId])}
          />
        ) : null}

        {state.finished ? (
          <Card title="Match terminé" description="Les statistiques du match sont figées.">
            <ButtonLink href={`/match/${matchId}`} variant="secondary" fullWidth>
              Revenir au match
            </ButtonLink>
          </Card>
        ) : null}

        {/* The pitch, unwrapped. A card around a drawing of a pitch spent 68 px on a heading saying
            « Sur le terrain » above a picture of the terrain, and 8 px of padding on each side of the
            only thing on this screen that has to be looked at from arm's length. The heading's one
            real job — TERRAIN — moved into the top bar; its player count is on the pitch, countable.
            The empty state still needs a card, because then there is no drawing to speak for itself. */}
        {state.onPitch.length === 0 ? (
          <Card title="Sur le terrain">
            <EmptyState {...emptyPitch} />
          </Card>
        ) : (
          <PitchLayout slots={pitch} kit={live.kit} pitchLabel="Joueurs sur le terrain" />
        )}

        {/* Not « Remplaçants »: ten of the thirteen rows under that heading were not (decision 087). */}
        <Card title={enterable.titleFr} description={enterable.hintFr ?? undefined} flush>
          {available.length === 0 ? (
            <div className="p-4">
              <EmptyState title={enterable.emptyFr} />
            </div>
          ) : (
            <ul className="space-y-2 p-3">
              {available.map((option) => (
                <li key={option.memberId}>
                  <OptionRow
                    label={option.name}
                    subtitle={option.subtitle}
                    warn={option.warn}
                    leading={option.jerseyNumber ?? undefined}
                    disabled={!canAct}
                    onClick={() => openFlow({ step: "sub-out", inId: option.memberId })}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <EventTimeline
          lines={timeline}
          onVoid={canOperate && !state.finished ? (line) => openFlow({ step: "void", line }) : null}
        />
      </div>

      {canOperate && !state.finished ? (
        <ActionBar
          actionDisabled={!canAct}
          clockLabel={clockAction.shortLabel}
          clockName={clockAction.name}
          clockDisabled={clockAction.event === null}
          clockTone={clockAction.event === "FINAL_WHISTLE" ? "danger" : "secondary"}
          onClock={pressClockAction}
          onAction={() => openFlow({ step: "menu" })}
          onPause={state.phase === "running" ? () => void emit("PAUSE", {}) : null}
        />
      ) : null}

      {/* -------------------------------------------------------------- */}
      {/* Sheets                                                         */}
      {/* -------------------------------------------------------------- */}

      {flow?.step === "menu" ? (
        <ActionMenu
          open
          onClose={closeFlow}
          stampLabel={stampLabel}
          choices={CHOICES}
          onPick={pickAction}
        />
      ) : null}

      {/* `setFlow`, not `openFlow`, everywhere inside a flow: the action keeps the minute of the tap
          that opened ACTION (decision 031), and « Autre… » is one more tap inside the same flow. */}
      {flow?.step === "more" ? (
        <ActionMenu
          open
          onClose={closeFlow}
          title="Autre action"
          stampLabel={stampLabel}
          choices={MORE_CHOICES}
          onPick={pickAction}
        />
      ) : null}

      {flow?.step === "comment" ? (
        <CommentSheet
          open
          onClose={closeFlow}
          stampLabel={stampLabel}
          options={everyone}
          onConfirm={(note, memberId) =>
            finish("COMMENT", memberId ? { note, memberId } : { note })
          }
        />
      ) : null}

      {/* The grid of six, then who. `setFlow` again: the remark keeps the minute of the tap that
          opened ACTION (decision 031), and both screens are the same flow. */}
      {flow?.step === "remark" && flow.kind === undefined ? (
        <ActionMenu
          open
          onClose={closeFlow}
          title="Remarque"
          stampLabel={stampLabel}
          choices={REMARK_CHOICES}
          onPick={(kind) => setFlow({ step: "remark", kind })}
        />
      ) : null}

      {flow?.step === "remark" && flow.kind !== undefined ? (
        <RemarkSheet
          open
          // One instance per remark, so a sheet never opens holding the player a previous one chose.
          key={flow.kind}
          onClose={closeFlow}
          kind={flow.kind}
          stampLabel={stampLabel}
          options={remarkable}
          onConfirm={(memberId) => finish("REMARK", { kind: flow.kind, memberId })}
        />
      ) : null}

      {flow?.step === "goal-scorer" ? (
        <PlayerPicker
          open
          onClose={closeFlow}
          title="Qui a marqué ?"
          description={stampLabel}
          options={onPitch}
          onPick={(memberId) => setFlow({ step: "goal-assist", scorerId: memberId })}
          skip={{ label: "Buteur inconnu", onPick: () => finish("GOAL_FOR", {}) }}
        />
      ) : null}

      {flow?.step === "goal-assist" ? (
        <PlayerPicker
          open
          onClose={closeFlow}
          title="Passe décisive ?"
          description={`But de ${players.nameOf(flow.scorerId)} · ${stampLabel}`}
          options={onPitch.filter((option) => option.memberId !== flow.scorerId)}
          onPick={(memberId) => finish("GOAL_FOR", { scorerId: flow.scorerId, assistId: memberId })}
          skip={{
            label: "Aucune passe décisive",
            onPick: () => finish("GOAL_FOR", { scorerId: flow.scorerId }),
          }}
        />
      ) : null}

      {flow?.step === "actor" ? (
        <PlayerPicker
          open
          onClose={closeFlow}
          title={ACTOR_QUESTIONS[flow.type]}
          description={`${eventLabel(flow.type)} · ${stampLabel}`}
          options={flow.type === "INJURY" ? everyone : onPitch}
          onPick={(memberId) =>
            finish(
              flow.type,
              flow.type === "FOUL" || flow.type === "INJURY"
                ? { memberId }
                : { scorerId: memberId },
            )
          }
        />
      ) : null}

      {flow?.step === "sub-out" ? (
        <PlayerPicker
          open
          onClose={closeFlow}
          title="Qui sort ?"
          description={
            flow.inId ? `${players.nameOf(flow.inId)} entre · ${stampLabel}` : stampLabel
          }
          options={onPitch}
          onPick={(memberId) =>
            flow.inId
              ? finish("SUBSTITUTION", { outId: memberId, inId: flow.inId })
              : setFlow({ step: "sub-in", outId: memberId })
          }
        />
      ) : null}

      {flow?.step === "sub-in" ? (
        <PlayerPicker
          open
          onClose={closeFlow}
          title="Qui entre ?"
          description={`${players.nameOf(flow.outId)} sort · ${stampLabel}`}
          options={available}
          onPick={(memberId) => finish("SUBSTITUTION", { outId: flow.outId, inId: memberId })}
          emptyLabel="Personne sur le banc."
        />
      ) : null}

      {flow?.step === "terrain" ? (
        <TerrainSheet
          open
          onClose={closeFlow}
          title={flow.origin.kind === "plan" ? flow.origin.title : "Terrain"}
          stampLabel={stampLabel}
          kit={live.kit}
          slots={live.slots}
          players={players}
          formationId={flow.formationId}
          base={onPitchAssignments}
          initialAssignments={flow.initial}
          candidates={[...onPitch, ...available]}
          leftPitchMemberIds={leftPitchMemberIds}
          onConfirm={(assignments) =>
            finish(
              "LINEUP_APPLIED",
              terrainPayload(assignments, { slots: live.slots, origin: flow.origin }),
            )
          }
          // The list is one tap away for a coach who cannot drag reliably — gloves, rain, a shaky
          // hand. `setFlow`, not `openFlow`: the action keeps the minute of the tap that opened
          // TERRAIN (decision 031).
          onUseList={(assignments) => setFlow({ step: "composer", initial: assignments })}
        />
      ) : null}

      {flow?.step === "composer" ? (
        <LineupComposer
          open
          onClose={closeFlow}
          title={state.started ? "Composition" : "Composition de départ"}
          description="Elle remplace ce qu’il y a sur le terrain à cette minute."
          formation={composerFormation}
          options={[...onPitch, ...available]}
          initialAssignments={flow.initial ?? onPitchAssignments}
          confirmLabel="Valider"
          onConfirm={(assignments) =>
            finish("LINEUP_APPLIED", { lineupId: null, slots: assignments })
          }
        />
      ) : null}

      {flow?.step === "whistle" ? (
        <ConfirmSheet
          open
          onClose={closeFlow}
          title="Coup de sifflet final"
          description="Le score et les minutes de chacun sont figés."
          confirmLabel="Terminer le match"
          tone="danger"
          // The period's end and the whistle, in one batch (decision 151): the coach's one tap on
          // « Sifflet » is what used to be « Fin » then « Sifflet ». Stamped at the tap that opened
          // this sheet, like every other flow (decision 031).
          onConfirm={() => {
            const atMs = tappedAtMs ?? Date.now();
            const types = finalWhistleEvents(state);
            closeFlow();
            void emitAll(
              types.map((type) => ({ type, payload: {} })),
              { atMs },
            );
          }}
        >
          <p className="text-sm text-ink">
            Score final {state.scoreLabel} {matchNameFr(live.match.opponentName, live.match.isHome)}
            .
          </p>
        </ConfirmSheet>
      ) : null}

      {flow?.step === "void" ? (
        <ConfirmSheet
          open
          onClose={closeFlow}
          title={`Annuler « ${flow.line.title} » ?`}
          description={`${flow.line.minuteLabel}${flow.line.detail ? ` · ${flow.line.detail}` : ""}`}
          confirmLabel="Annuler l’action"
          cancelLabel="Garder"
          tone="danger"
          onConfirm={() => finish("VOID", {}, flow.line.eventId)}
        >
          <p className="text-sm text-ink-muted">
            L’action reste dans le déroulé, barrée : le journal du match n’est jamais réécrit.
          </p>
        </ConfirmSheet>
      ) : null}
    </>
  );
}

const ACTOR_QUESTIONS = {
  OWN_GOAL: "Qui a marqué contre son camp ?",
  PENALTY_SCORED: "Qui a transformé ?",
  PENALTY_MISSED: "Qui a manqué ?",
  FOUL: "Qui a fait la faute ?",
  INJURY: "Qui est blessé ?",
} as const;

/* -------------------------------------------------------------------------- */
/* The bar                                                                    */
/* -------------------------------------------------------------------------- */

type ActionBarProps = {
  actionDisabled: boolean;
  clockLabel: string;
  /** `clockActionFr().name`, which is what a screen reader hears. */
  clockName: string;
  clockDisabled: boolean;
  clockTone: "secondary" | "danger";
  onClock: () => void;
  onAction: () => void;
  /** Null unless the ball is in play: a stopped clock is resumed from the clock button. */
  onPause: (() => void) | null;
};

/**
 * The bar the whole screen is built around: one row, ACTION on half of it.
 *
 * It used to be two rows, and it used to be pinned at
 * `bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]` to clear the app's tab bar. That is where
 * the gap the owner saw came from, and it was arithmetic rather than a rendering glitch: 4.5rem is
 * 72 px, `BottomNav` is `min-h-14` — 56 — so 16 px of scrolling page showed through between the two
 * bars at every inset. Game mode has no tab bar any more, so the bar sits at `bottom-0` and the gap
 * has nowhere to be (decision 112).
 *
 * ACTION keeps half the width and its 64 px, because it is the one thing the coach reaches for
 * without looking; the clock button and « Pause » share the other half.
 *
 * The clock button is the one place in the app where what is written and what is announced differ, and
 * on purpose: `clockLabel` is `clockActionFr().shortLabel`, because « Coup de sifflet final » does not
 * fit a quarter of 393 px, while `clockName` is `clockActionFr().name`, because « Fin » on its own does
 * not say which period it ends. Both come from the same function's return so they cannot drift, and
 * every visible form is contained in the name it announces — « Début » in « Début : coup d’envoi 2e
 * période », « Fin » in « Fin de la 1re période », « Sifflet » in « Coup de sifflet final » — which is
 * what WCAG 2.5.3 asks of a visible label inside an accessible name, so a voice-control user saying
 * what they can read still hits the button.
 *
 * Grid, not flex: `Button` is `shrink-0`, so a `fullWidth` button beside another one pushes it off
 * the right edge of a 390 px screen rather than sharing the row.
 */
function ActionBar({
  actionDisabled,
  clockLabel,
  clockName,
  clockDisabled,
  clockTone,
  onClock,
  onAction,
  onPause,
}: ActionBarProps) {
  return (
    // `safe-pb-2 pt-2` rather than `safe-pb py-2`: `py-2` set `padding-block`, so its bottom
    // half competed with `safe-pb`'s `padding-bottom`, and `.safe-pb` is emitted after `.py-2`,
    // so the 8 px was dropped on every device whose bottom inset is 0. See the utility's own
    // comment in `globals.css`.
    <div className="safe-pb-2 sticky bottom-0 z-30 -mx-3 mt-3 border-t border-border/60 bg-canvas/95 px-3 pt-2 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:px-4 md:py-3">
      <div
        className={
          onPause ? "grid grid-cols-[2fr_1fr_1fr] gap-2" : "grid grid-cols-[2fr_1fr] gap-2"
        }
      >
        <Button
          size="lg"
          fullWidth
          disabled={actionDisabled}
          onClick={onAction}
          className="text-lg font-bold tracking-wide"
        >
          ACTION
        </Button>
        {onPause ? (
          <Button variant="secondary" size="lg" fullWidth onClick={onPause}>
            Pause
          </Button>
        ) : null}
        <Button
          variant={clockTone}
          size="lg"
          fullWidth
          disabled={clockDisabled}
          onClick={onClock}
          aria-label={clockName}
        >
          {clockLabel}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Refused actions                                                            */
/* -------------------------------------------------------------------------- */

function RejectedActions({
  records,
  onRetry,
  onDismiss,
}: {
  records: readonly OutboxRecord[];
  onRetry: (clientEventId: string) => void;
  onDismiss: (clientEventId: string) => void;
}) {
  return (
    <Card
      title="Actions refusées"
      // Decision 074: the French tutoies, always. This line vouvoyait.
      description="Le serveur n’a pas accepté ces actions. Rien n’est perdu : réessaie ou ignore-les."
      className="border-danger/50"
    >
      <ul className="space-y-3">
        {records.map((record) => (
          <li key={record.clientEventId} className="space-y-2">
            <p className="text-sm font-semibold text-ink">
              {eventLabel(record.type)} <Badge variant="danger">{record.minute}’</Badge>
            </p>
            <p className="text-sm text-danger">{record.rejectedReason}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onRetry(record.clientEventId)}>
                Réessayer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDismiss(record.clientEventId)}>
                Ignorer
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
