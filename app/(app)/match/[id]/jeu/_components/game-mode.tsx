"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActionMenu,
  ConfirmSheet,
  LineupComposer,
  OptionRow,
  PlayerPicker,
  SlotPicker,
  type ActionChoice,
  type ComposerFormation,
  type SlotChoice,
} from "@/components/action-sheet";
import { PitchLayout } from "@/components/pitch/PitchLayout";
import { Badge, Button, ButtonLink, Card, EmptyState } from "@/components/ui";
import { positionLabelFr } from "@/db/reference";
import type { MatchEventType } from "@/lib/match/events";
import { createOutbox, toWireEvent, type OutboxRecord, type OutboxState } from "@/lib/match/outbox";
import {
  availableOptions,
  clockActionFr,
  eventLabel,
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
  timelineLines,
  type LiveMatch,
  type PendingEvent,
  type PlayerOption,
  type TimelineLine,
} from "@/lib/match/presenter";
import { EventTimeline } from "./event-timeline";
import { LineupPrompt } from "./lineup-prompt";
import { Scoreboard } from "./scoreboard";
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
  | { step: "goal-scorer" }
  | { step: "goal-assist"; scorerId: string }
  | { step: "actor"; type: "OWN_GOAL" | "PENALTY_SCORED" | "PENALTY_MISSED" | "FOUL" | "INJURY" }
  | { step: "sub-out"; inId?: string }
  | { step: "sub-in"; outId: string }
  | { step: "move-player" }
  | { step: "move-slot"; memberId: string }
  | { step: "composer" }
  | { step: "whistle" }
  | { step: "void"; line: TimelineLine };

/** The ACTION menu, in the order a thumb learns: what happens most is at the top. */
const CHOICES: readonly ActionChoice[] = [
  { type: "GOAL_FOR", label: "But", hint: "buteur, passeur", tone: "accent" },
  { type: "GOAL_AGAINST", label: "But encaissé", hint: "enregistré aussitôt", tone: "danger" },
  { type: "SUBSTITUTION", label: "Changement", hint: "qui sort, qui entre" },
  { type: "POSITION_CHANGE", label: "Changement de poste", hint: "qui, vers quel poste" },
  { type: "OWN_GOAL", label: "CSC", hint: "notre joueur", tone: "danger" },
  { type: "PENALTY_SCORED", label: "Penalty marqué", hint: "tireur" },
  { type: "PENALTY_MISSED", label: "Penalty manqué", hint: "tireur", tone: "danger" },
  { type: "FOUL", label: "Faute", hint: "notre joueur" },
  { type: "INJURY", label: "Blessure", hint: "notre joueur", tone: "danger" },
];

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
    const unsubscribe = outbox.subscribe(setQueue);
    // Pick the queue back up after a reload, then attach the browser's triggers: `online`,
    // `visibilitychange` and a slow retry tick.
    void outbox.hydrate();
    outbox.start();
    return () => {
      outbox.stop();
      unsubscribe();
    };
  }, [outbox]);

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

  const formations = useMemo<ComposerFormation[]>(
    () =>
      live.formations.map((formation) => ({
        id: formation.id,
        label: formation.label,
        slots: formation.slots.map((slot) => ({
          id: slot.id,
          positionCode: slot.positionCode,
          sort: slot.sort,
        })),
      })),
    [live.formations],
  );

  const slotChoices = useMemo<SlotChoice[]>(() => {
    const occupant = new Map(
      state.onPitch
        .filter((entry) => entry.slotId)
        .map((entry) => [entry.slotId as string, players.nameOf(entry.memberId)]),
    );
    return live.slots
      .filter((slot) => slot.formationId === currentFormationId)
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((slot) => ({
        slotId: slot.id,
        positionCode: slot.positionCode,
        label: positionLabelFr(slot.positionCode),
        occupantName: occupant.get(slot.id) ?? null,
      }));
  }, [live.slots, currentFormationId, state.onPitch, players]);

  const clockAction = clockActionFr(state);
  // `FOUL` stands in for "an action that takes the clock as it reads" — every type but `KICKOFF`
  // is stamped the same way, and this is only here to print the minute on the sheets.
  const stamp = nextEventStamp(state, "FOUL", tappedAtMs ?? nowMs ?? 0);
  const stampLabel = `${minuteLabelFr(stamp.clockMs, stamp.period, periods)} · ${phaseLabelFr(state)}`;

  const canAct = canOperate && state.started && !state.finished;

  /* ---------------------------------------------------------------------- */
  /* Emitting                                                               */
  /* ---------------------------------------------------------------------- */

  const emit = useCallback(
    async (
      type: MatchEventType,
      payload?: unknown,
      options: { voidsEventId?: string; atMs?: number } = {},
    ) => {
      const atMs = options.atMs ?? Date.now();
      const record = await outbox.enqueue({
        type,
        stamp: nextEventStamp(state, type, atMs),
        payload,
        voidsEventId: options.voidsEventId ?? null,
        occurredAtMs: atMs,
      });
      // Optimistic: the reducer sees it immediately, so the score moves on the tap. The local copy
      // of anything the server has meanwhile confirmed is dropped in the same pass, so this list
      // never grows beyond what is actually in flight.
      const confirmed = new Set(live.events.map((event) => event.clientEventId));
      setLocal((current) => [
        ...current.filter((event) => !confirmed.has(event.clientEventId)),
        toWireEvent(record),
      ]);
      await outbox.flush();
      router.refresh();
    },
    [outbox, state, router, live.events],
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

  function pickAction(type: MatchEventType) {
    switch (type) {
      case "GOAL_FOR":
        return setFlow({ step: "goal-scorer" });
      case "GOAL_AGAINST":
        return finish("GOAL_AGAINST", {});
      case "SUBSTITUTION":
        return setFlow({ step: "sub-out" });
      case "POSITION_CHANGE":
        return setFlow({ step: "move-player" });
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

  const injuryOptions: PlayerOption[] = [...onPitch, ...available];

  return (
    <div className="space-y-4">
      <Scoreboard
        reading={state.reading}
        phaseLabel={phaseLabelFr(state)}
        goalsFor={state.goalsFor}
        goalsAgainst={state.goalsAgainst}
        opponentName={live.match.opponentName}
        isHome={live.match.isHome}
        pendingLabel={queue.pending.length > 0 ? pendingCountLabelFr(queue.pending.length) : null}
      />

      {!canOperate ? (
        <p className="rounded-xl border border-border/60 bg-surface-2 px-3 py-2 text-sm text-ink-muted">
          Vous suivez le match en direct. Seul l’opérateur du match peut enregistrer les actions.
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
          onApply={() =>
            void emit(
              "LINEUP_APPLIED",
              { lineupId: prompt.lineupId, slots: prompt.slots },
              { atMs: Date.now() },
            )
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

      <Card
        title="Sur le terrain"
        description={`${state.onPitch.length} joueur${state.onPitch.length > 1 ? "s" : ""} en jeu`}
        action={
          canOperate && !state.finished ? (
            <Button variant="secondary" size="sm" onClick={() => openFlow({ step: "composer" })}>
              Composition
            </Button>
          ) : null
        }
      >
        {state.onPitch.length === 0 ? (
          <EmptyState
            title="Aucune composition enregistrée."
            description="Sans composition, personne n’accumule de minutes. Renseignez-la avant le coup d’envoi."
          />
        ) : (
          <PitchLayout slots={pitch} kit={live.kit} pitchLabel="Joueurs sur le terrain" />
        )}
      </Card>

      <Card
        title="Remplaçants"
        description={canAct ? "Touchez un joueur pour le faire entrer." : undefined}
        flush
      >
        {available.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Personne sur le banc." />
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
        onVoid={
          canOperate && !state.finished
            ? (line) => openFlow({ step: "void", line })
            : null
        }
      />

      {canOperate && !state.finished ? (
        <ActionBar
          actionDisabled={!canAct}
          clockLabel={clockAction.label}
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
          onPick={(memberId) =>
            finish("GOAL_FOR", { scorerId: flow.scorerId, assistId: memberId })
          }
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
          options={flow.type === "INJURY" ? injuryOptions : onPitch}
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

      {flow?.step === "move-player" ? (
        <PlayerPicker
          open
          onClose={closeFlow}
          title="Qui change de poste ?"
          description={stampLabel}
          options={onPitch}
          onPick={(memberId) => setFlow({ step: "move-slot", memberId })}
        />
      ) : null}

      {flow?.step === "move-slot" ? (
        <SlotPicker
          open
          onClose={closeFlow}
          title={`${players.nameOf(flow.memberId)} passe à…`}
          description={stampLabel}
          choices={slotChoices.filter(
            (choice) =>
              choice.slotId !==
              state.onPitch.find((entry) => entry.memberId === flow.memberId)?.slotId,
          )}
          onPick={(slotId) =>
            finish("POSITION_CHANGE", {
              memberId: flow.memberId,
              fromSlotId:
                state.onPitch.find((entry) => entry.memberId === flow.memberId)?.slotId ??
                undefined,
              toSlotId: slotId,
            })
          }
        />
      ) : null}

      {flow?.step === "composer" ? (
        <LineupComposer
          open
          onClose={closeFlow}
          title={state.started ? "Composition" : "Composition de départ"}
          description="Elle remplace ce qu’il y a sur le terrain à cette minute."
          formations={formations}
          initialFormationId={currentFormationId}
          options={[...onPitch, ...available]}
          initialAssignments={state.onPitch
            .filter((entry) => entry.slotId)
            .map((entry) => ({ slotId: entry.slotId as string, memberId: entry.memberId }))}
          confirmLabel="Valider"
          onConfirm={(assignments) => finish("LINEUP_APPLIED", { lineupId: null, slots: assignments })}
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
          onConfirm={() => finish("FINAL_WHISTLE", {})}
        >
          <p className="text-sm text-ink">
            Score final {state.scoreLabel} contre {live.match.opponentName}.
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
    </div>
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
  clockDisabled: boolean;
  clockTone: "secondary" | "danger";
  onClock: () => void;
  onAction: () => void;
  /** Null unless the ball is in play: a stopped clock is resumed from the clock button. */
  onPause: (() => void) | null;
};

/**
 * The bar the whole screen is built around.
 *
 * ACTION is at the bottom, full width, 64 px tall, because it is the one thing the coach reaches for
 * without looking. The clock button sits above it: it is used four or five times in a match, so it
 * must be obvious but must not be where the thumb lands by accident. `bottom-[4.5rem]` clears the
 * app's fixed tab bar and its safe-area inset.
 */
function ActionBar({
  actionDisabled,
  clockLabel,
  clockDisabled,
  clockTone,
  onClock,
  onAction,
  onPause,
}: ActionBarProps) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-30 -mx-4 space-y-2 border-t border-border/60 bg-canvas/95 px-4 pt-2 pb-2 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:px-4 md:py-3">
      <div className="flex gap-2">
        <Button
          variant={clockTone}
          size="lg"
          fullWidth
          disabled={clockDisabled}
          onClick={onClock}
        >
          {clockLabel}
        </Button>
        {onPause ? (
          <Button variant="secondary" size="lg" onClick={onPause} className="shrink-0">
            Pause
          </Button>
        ) : null}
      </div>

      <Button
        size="lg"
        fullWidth
        disabled={actionDisabled}
        onClick={onAction}
        className="min-h-16 text-lg font-bold tracking-wide"
      >
        ACTION
      </Button>
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
      description="Le serveur n’a pas accepté ces actions. Rien n’est perdu : réessayez ou ignorez-les."
      className="border-danger/50"
    >
      <ul className="space-y-3">
        {records.map((record) => (
          <li key={record.clientEventId} className="space-y-2">
            <p className="text-sm font-semibold text-ink">
              {eventLabel(record.type)}{" "}
              <Badge variant="danger">{record.minute}’</Badge>
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
