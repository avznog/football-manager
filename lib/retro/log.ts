/**
 * Retro-entry: turning what a coach remembers into a normal match event log.
 *
 * Screen 8 of `docs/PLAN.md` — « saisie rétroactive » — exists for two situations: a match played
 * before anybody opened the app, and a match whose operator's phone died at 12′. Decision 013
 * settles how it works: **the screen synthesises the same events game mode would have written**, so
 * the reducer, `match_player_stats`, `/stats`, the recap and the ratings all read one kind of log
 * and none of them has a branch for "this one was typed in afterwards".
 *
 * Pure: no database, no clock, no randomness — the caller supplies the kick-off instant and the
 * idempotency seed. That is what lets `log.test.ts` assert, from hand-written fixtures, that a log
 * built here reduces to exactly the score and the minutes the coach entered.
 *
 * ## What the coach is asked for, and what is derived
 *
 * He is asked for the starting seven, the substitutions (« X sort, Y entre, à la M′ ») and the
 * facts of the match (goals, penalties, own goals, fouls, injuries). He is **not** asked how many
 * minutes anybody played: minutes, the score, who was in goal and the clean sheets are all derived
 * by `reduceMatch` from the log this module writes (invariant 2). A coach remembers "Momo came on
 * for Ali at half-time" far better than "Momo played 22 minutes", and only one of those two is
 * something the app can check.
 *
 * ## The minute nobody remembers
 *
 * Two weeks later, most minutes are gone. Every stamp here is therefore optional, and an absent one
 * is resolved to **the midpoint of the window in which the event could have happened**: the middle
 * of regulation for something with no player attached, the middle of the scorer's longest stint on
 * the pitch when there is one (and of the overlap with the assister's, when they overlap). See
 * `resolveFactClockMs`. Several guessed events legitimately land on the same minute; `seq` then
 * preserves the order the coach typed them in, so the score progression stays monotone.
 *
 * The alternatives were worse. Stamping at 0′ zeroes the clean minutes of every backfilled match
 * and risks the `goal-before-kickoff` anomaly; stamping at the final whistle makes a 0-5 defeat
 * look entirely clean; spreading the events evenly across the match invents an ordering and a
 * precision nobody has. The midpoint of the plausible window invents the least, and — crucially —
 * it cannot put a goal at a minute its scorer was not on the pitch, which would be a reducer
 * anomaly on a log the app wrote itself.
 */

import {
  MS_PER_MINUTE,
  type PeriodsConfig,
  clockMsToMinute,
  minuteToClockMs,
  periodEndMs,
  periodOfClockMs,
  periodStartMs,
  periodsConfig,
  regulationMs,
} from "@/lib/match/clock";
import type { MatchEventInput, MatchEventType } from "@/lib/match/events";
import { deterministicUuid } from "@/lib/match/ids";
import type { MatchEventRecord } from "@/lib/match/reducer";

/* -------------------------------------------------------------------------- */
/* What the screen collects                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **The correctable set**, and that is the question it answers: *which events may be amended on a
 * finished match?*
 *
 * It is also the event types the retro screen can produce as "facts of the match" — deliberately
 * excluding the clock events, which are the synthesiser's own job, and `SUBSTITUTION` and
 * `LINEUP_APPLIED`, which are deduced from the starting seven and the substitution rows.
 *
 * **Adding a type here silently makes it correctable.** `isAmendableEventType` (`amend.ts`) is
 * `isRetroFactType(type) || type === "SUBSTITUTION"`, so a new member of this list immediately gets
 * a « Corriger » button and a `VOID` that the action will accept on a frozen match. Decision 049
 * says only football facts may be corrected — the frame of the match (`KICKOFF`, `PERIOD_END`,
 * `FINAL_WHISTLE`, `LINEUP_APPLIED`) may not, because annulling one of those does not fix a mistake,
 * it changes what every minute in the log means. `amend.test.ts` pins
 * `isAmendableEventType("POSITION_CHANGE") === false` — game mode writes position changes and none of
 * them may be corrected; that is this list's boundary, not a detail of that file.
 *
 * So this is **not** « what the entry form offers » — see `RETRO_ACTION_TYPES` below — and the two
 * must not be merged.
 *
 * `FOUL` stays here deliberately. Decision 114 stopped offering the « Faute » tile in game mode's
 * menu and explicitly kept the type in `MATCH_EVENT_TYPES` and in this list: `match_events` is
 * append-only (invariant 1), so the fouls already in a log must still render, still count and still
 * be voidable — and retro entry still asks for them, because a coach writing up a match two weeks
 * later is doing data entry and not watching football. Which means « the same actions as live mode »
 * is **additive only, and can never be literally symmetric in either direction**: retro offers
 * `FOUL`, which the live menu does not, and the live menu offers `COMMENT` (decision 114), which
 * this form does not.
 */
export const RETRO_FACT_TYPES = [
  "GOAL_FOR",
  "PENALTY_SCORED",
  "PENALTY_MISSED",
  "OWN_GOAL",
  "GOAL_AGAINST",
  "FOUL",
  "INJURY",
] as const satisfies readonly MatchEventType[];

export type RetroFactType = (typeof RETRO_FACT_TYPES)[number];

export function isRetroFactType(value: string): value is RetroFactType {
  return (RETRO_FACT_TYPES as readonly string[]).includes(value);
}

/**
 * **The enterable set**, and that is the question it answers: *what can the retro entry form put
 * into a log?* Used by the entry form only.
 *
 * The facts above plus `SUBSTITUTION`, the one row the form reads as « X sort, Y entre » and whose
 * slot it deduces rather than asks for. It deliberately stops short of the frame — `KICKOFF`,
 * `PERIOD_END`, `FINAL_WHISTLE`, `LINEUP_APPLIED` — which `buildRetroLog` writes itself from the
 * periods and the starting seven.
 *
 * **`POSITION_CHANGE` is not here, and that is a decision and not an omission** (decision 134). Game
 * mode records a shirt that moved without anybody leaving the pitch; the retro sheet does not, because
 * a position change typed up from memory a week later is the action least likely to be remembered, its
 * slot labels are not even unique within a formation, and an undated one would be a label floating in
 * the middle of a spell. So game mode keeps one action this form does not — and, with `FOUL` going the
 * other way (see above), « the same actions as live mode » is symmetric in neither direction. Do not
 * add it back to make the two lists match.
 *
 * **Kept apart from `RETRO_FACT_TYPES` even though it is now that list plus one**, because the two
 * answer different questions and only one of them is a permission: being enterable on a sheet the coach
 * is still filling in says nothing about being correctable on a match that is already frozen
 * (decision 049). `isAmendableEventType` reads the *fact* list, so merging the two would silently hand
 * a « Corriger » button to whatever is only enterable — today `SUBSTITUTION`, whose amendability is
 * granted explicitly and separately, and tomorrow anything a session adds here.
 */
export const RETRO_ACTION_TYPES = [
  ...RETRO_FACT_TYPES,
  "SUBSTITUTION",
] as const satisfies readonly MatchEventType[];

export type RetroActionType = (typeof RETRO_ACTION_TYPES)[number];

export function isRetroActionType(value: string): value is RetroActionType {
  return (RETRO_ACTION_TYPES as readonly string[]).includes(value);
}

/** Types whose payload requires a player: the reducer refuses them without one. */
export function retroFactNeedsMember(type: RetroFactType): boolean {
  return type !== "GOAL_FOR" && type !== "GOAL_AGAINST";
}

/** Only a goal can carry an assist. */
export function retroFactTakesAssist(type: RetroFactType): boolean {
  return type === "GOAL_FOR";
}

/** Types that credit nobody, ever: we track no opponent players (decision 010). */
export function retroFactTakesMember(type: RetroFactType): boolean {
  return type !== "GOAL_AGAINST";
}

/** One slot of the starting seven. `slotId` is a `formation_slots.id`. */
export type RetroStarter = {
  slotId: string;
  memberId: string;
};

/**
 * **One row of the sheet**, whatever kind of row it is. A substitution is just another action the
 * coach types up, which is what the screen says too.
 *
 * A **discriminated union**, not one widened record, and that is the point. A goal does not carry an
 * empty `outId`/`inId` pair it can never mean, and `memberId` means « the scorer » in every arm it
 * appears in rather than « the outgoing player » on one row and « the scorer » on the next. The price
 * is a `switch (action.type)` wherever the two shapes diverge — the payload builder, the stamp
 * resolver, the idempotency seed and `findRetroIssues` — and the price is what buys the guarantee:
 * adding an arm is a compile error at exactly those places and nowhere else.
 *
 * `minute` is null for « je ne sais plus » on either arm, but **where an undated row lands is not one
 * rule**: decision 048 gives a substitution the break and a fact the middle of its player's own spell.
 * See `breakClockMs` and `resolveFactClockMs`, which stay two functions on purpose.
 */
export type RetroAction =
  | {
      /** Row identity, stable for the lifetime of the form. Never stored. */
      key: string;
      type: RetroFactType;
      /** Scorer, fouler, injured player. Null when unknown or when the type takes nobody. */
      memberId: string | null;
      assistId: string | null;
      minute: number | null;
    }
  | {
      key: string;
      type: "SUBSTITUTION";
      outId: string;
      inId: string;
      minute: number | null;
    };

/**
 * One substitution as the coach types it — the `SUBSTITUTION` arm of `RetroAction` under its own
 * name, never a parallel declaration, so the two cannot drift apart.
 *
 * The name stays because a whole module is built on it: `retroPitch` replays substitutions and
 * nothing else, `RetroResolvedChange`, `outWasOn` and `inAlreadyOn` are about them, and three of
 * `findRetroIssues`' rules only ever ask about this arm.
 */
export type RetroChange = Extract<RetroAction, { type: "SUBSTITUTION" }>;

/**
 * One football fact of the match — the other arm, likewise named rather than redeclared.
 *
 * `retroFactPayload` and `buildAmendment` take this and not `RetroAction`: a correction may only ever
 * be a fact (decision 049), so handing either of them a substitution has to be a type error.
 */
export type RetroFact = Extract<RetroAction, { type: RetroFactType }>;

/** The substitution rows of a sheet, in the order the coach typed them. */
export function retroSubstitutions(actions: readonly RetroAction[]): readonly RetroChange[] {
  return actions.filter((action): action is RetroChange => action.type === "SUBSTITUTION");
}

/**
 * The football-fact rows of a sheet, in the order the coach typed them.
 *
 * Asks `isRetroFactType` rather than « anything that is not a substitution », so a third arm added to
 * `RetroAction` is excluded here by default instead of being silently treated as a goal.
 */
export function retroFacts(actions: readonly RetroAction[]): readonly RetroFact[] {
  return actions.filter((action): action is RetroFact => isRetroFactType(action.type));
}

export type RetroEntry = {
  /**
   * One uuid per attempt at the form, generated once by the browser. Every synthesised event's
   * `client_event_id` is derived from it, which makes a double tap on « Enregistrer » land exactly
   * one log (invariant 6) instead of two.
   */
  submissionId: string;
  periods: { periodsCount?: number | null; periodMinutes?: number | null };
  /** Epoch milliseconds of the kick-off, from `matches.kickoff_at`. Only feeds `occurred_at`. */
  kickoffAtMs: number;
  /** The planned initial composition this seven came from, when it is unchanged. */
  lineupId: string | null;
  starters: readonly RetroStarter[];
  /**
   * Everything that happened, substitutions included, in the order the coach typed it. One array,
   * because « un changement est une action comme une autre » — and because the order inside it is
   * data: two actions that land on the same stamp are emitted in it (see `buildRetroLog`).
   */
  actions: readonly RetroAction[];
};

/* -------------------------------------------------------------------------- */
/* Who was on the pitch, and when                                             */
/* -------------------------------------------------------------------------- */

/** A stint on the pitch, in match-time milliseconds. Closed: retro entry knows the whistle. */
export type RetroSpell = { fromMs: number; toMs: number };

export type RetroResolvedChange = {
  key: string;
  outId: string;
  inId: string;
  /** The slot the outgoing player vacates, which is the one the incoming player takes. */
  slotId: string | null;
  clockMs: number;
  /** True when the coach did not give a minute and the break was used instead. */
  guessed: boolean;
  /** False when the outgoing player was not on the pitch at that moment — a contradiction. */
  outWasOn: boolean;
  /** True when the incoming player was already on the pitch — the other contradiction. */
  inAlreadyOn: boolean;
};

export type RetroPitch = {
  periods: PeriodsConfig;
  /** Every stint each player had, in order. A player may come back on (reducer rule 7). */
  spells: ReadonlyMap<string, readonly RetroSpell[]>;
  changes: readonly RetroResolvedChange[];
};

/**
 * The substitution the coach cannot date happened at the break.
 *
 * With 2×30 that is 30′, with 4×15 it is also 30′, and with a single period there is no break at
 * all so the middle of the match is the only honest answer. Both come out at "half-way through",
 * which is what « je ne sais plus » means in practice.
 */
export function breakClockMs(periods: PeriodsConfig): number {
  const endMs = regulationMs(periods);
  if (periods.periodsCount <= 1) return snapToMinute(endMs / 2, 0, endMs);
  return periodStartMs(Math.floor(periods.periodsCount / 2) + 1, periods);
}

/**
 * Replay the starting seven and the substitutions into stints on the pitch.
 *
 * Exported because the form needs it to validate a substitution before it is submitted — "you
 * cannot take off somebody who is not on" is a question about this structure, not about the log.
 */
export function retroPitch(entry: RetroEntry): RetroPitch {
  const periods = periodsConfig(entry.periods);
  const endMs = regulationMs(periods);

  const spells = new Map<string, RetroSpell[]>();
  const bank = (memberId: string, fromMs: number, toMs: number) => {
    const list = spells.get(memberId);
    const spell = { fromMs, toMs: Math.max(fromMs, toMs) };
    if (list) list.push(spell);
    else spells.set(memberId, [spell]);
  };

  /** Who is on, since when, in which slot. */
  const onPitch = new Map<string, { fromMs: number; slotId: string | null }>();
  for (const starter of entry.starters) {
    onPitch.set(starter.memberId, { fromMs: 0, slotId: starter.slotId });
  }

  // The substitutions and nothing else: the pitch is replayed from the rows that move players, and
  // `resolveChangeClockMs` below is the half of decision 048 that only applies to them.
  const ordered = retroSubstitutions(entry.actions)
    .map((change, index) => ({ change, index, clockMs: resolveChangeClockMs(change, periods) }))
    // Stable on the coach's typing order, so two changes at the same minute keep their sequence.
    .sort((a, b) => a.clockMs - b.clockMs || a.index - b.index);

  const changes: RetroResolvedChange[] = [];
  for (const { change, clockMs } of ordered) {
    const leaving = onPitch.get(change.outId);
    const slotId = leaving?.slotId ?? null;
    if (leaving) {
      bank(change.outId, leaving.fromMs, clockMs);
      onPitch.delete(change.outId);
    }
    const inAlreadyOn = onPitch.has(change.inId);
    if (!inAlreadyOn) onPitch.set(change.inId, { fromMs: clockMs, slotId });
    changes.push({
      key: change.key,
      outId: change.outId,
      inId: change.inId,
      slotId,
      clockMs,
      guessed: change.minute === null,
      outWasOn: leaving !== undefined,
      inAlreadyOn,
    });
  }

  for (const [memberId, entryOn] of onPitch) bank(memberId, entryOn.fromMs, endMs);

  return { periods, spells, changes };
}

function resolveChangeClockMs(change: RetroChange, periods: PeriodsConfig): number {
  if (change.minute === null) return breakClockMs(periods);
  return clamp(minuteToClockMs(change.minute), 0, regulationMs(periods));
}

/* -------------------------------------------------------------------------- */
/* When a fact happened                                                      */
/* -------------------------------------------------------------------------- */

export type RetroStamp = { clockMs: number; guessed: boolean };

/**
 * The match time of one fact.
 *
 * A minute the coach typed is taken as given (clamped to regulation). A minute he does not have is
 * the midpoint of the window the event must have fallen in — see the note at the top of the file.
 *
 * It takes **`RetroFact`, not `RetroAction`**, and that is the mechanism and not a preference. Decision
 * 048 gives an undated substitution the break and an undated fact the middle of its player's spell;
 * now that the two travel in one array, « just resolve the stamp of an action » is an easy and wrong
 * thing to write. Passing a substitution here does not compile.
 */
export function resolveFactClockMs(fact: RetroFact, pitch: RetroPitch): RetroStamp {
  const endMs = regulationMs(pitch.periods);
  if (fact.minute !== null) {
    return { clockMs: clamp(minuteToClockMs(fact.minute), 0, endMs), guessed: false };
  }

  const window = plausibleWindow(
    [fact.memberId, fact.assistId].filter((id): id is string => id !== null),
    pitch.spells,
    endMs,
  );
  const middle = window.fromMs + (window.toMs - window.fromMs) / 2;
  return { clockMs: snapToMinute(middle, window.fromMs, window.toMs), guessed: true };
}

/**
 * The span an event involving these players can have happened in: their stints on the pitch,
 * narrowed to the overlap when they have one (a goal and its assist were on the pitch together),
 * and the whole match when nobody is known to have been on at all.
 */
function plausibleWindow(
  memberIds: readonly string[],
  spells: ReadonlyMap<string, readonly RetroSpell[]>,
  endMs: number,
): RetroSpell {
  const known = memberIds
    .map((memberId) => spells.get(memberId) ?? [])
    .filter((list) => list.length > 0);
  if (known.length === 0) return { fromMs: 0, toMs: endMs };

  let candidates: readonly RetroSpell[] = known[0];
  for (const other of known.slice(1)) {
    const overlap = intersectSpells(candidates, other);
    // No overlap at all is a contradiction the validation layer reports; here, the first player's
    // window is still a better guess than the whole match.
    if (overlap.length > 0) candidates = overlap;
  }

  return candidates.reduce((longest, spell) =>
    spell.toMs - spell.fromMs > longest.toMs - longest.fromMs ? spell : longest,
  );
}

function intersectSpells(
  a: readonly RetroSpell[],
  b: readonly RetroSpell[],
): readonly RetroSpell[] {
  const out: RetroSpell[] = [];
  for (const left of a) {
    for (const right of b) {
      const fromMs = Math.max(left.fromMs, right.fromMs);
      const toMs = Math.min(left.toMs, right.toMs);
      if (toMs > fromMs) out.push({ fromMs, toMs });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Building the log                                                           */
/* -------------------------------------------------------------------------- */

export type RetroLog = {
  /** Ready for `matchEventBatchSchema`, in the order they must be inserted. */
  events: readonly MatchEventInput[];
  /** How many stamps the app had to invent. The screen says so, in French. */
  guessedStamps: number;
};

/**
 * The whole match as an event log.
 *
 * The shape is exactly what game mode leaves behind: a `KICKOFF` per period, the starting seven as
 * a `LINEUP_APPLIED` at 0′ (so the seven count as starters and the goalkeeper is known), the facts
 * and substitutions at their minutes, a `PERIOD_END` at each period boundary, and a `FINAL_WHISTLE`
 * at the end of regulation — which is what lets `finalizeMatch` freeze the match afterwards with no
 * special case at all.
 */
export function buildRetroLog(entry: RetroEntry): RetroLog {
  const pitch = retroPitch(entry);
  const periods = pitch.periods;
  const endMs = regulationMs(periods);

  type Pending = { clockMs: number; order: number; build: () => Omit<Draft, "clockMs" | "period"> };

  const pending: Pending[] = [];

  /*
   * `order` is **two buckets, not the index in `entry.actions`** — facts first, substitutions after —
   * and that is load-bearing rather than tidy. Within one stamp the facts of a minute must be emitted
   * before the substitutions of that minute, so a player replaced at 30′ is still on the pitch when a
   * 30′ goal is read and the one who came on is not. `onPitchAt` in `validation.ts` encodes that same
   * boundary, and `validation.test.ts` pins it. Merging the two arrays into one array made this the
   * typing order, which would flip it for a coach who writes the change down before the goal.
   */
  const facts = retroFacts(entry.actions);

  facts.forEach((fact, index) => {
    // The fact half of decision 048: the middle of this player's own spell on the pitch.
    const stamp = resolveFactClockMs(fact, pitch);
    pending.push({
      clockMs: stamp.clockMs,
      order: index,
      build: () => ({ type: fact.type, payload: retroActionPayload(fact, null) }),
    });
  });

  const resolvedByKey = new Map(pitch.changes.map((change) => [change.key, change]));
  retroSubstitutions(entry.actions).forEach((action, index) => {
    // The substitution half: the break, already resolved by `retroPitch` — which also worked out the
    // slot the outgoing player was standing in, and that is not something the row itself knows.
    const resolved = resolvedByKey.get(action.key);
    if (!resolved) return;
    pending.push({
      clockMs: resolved.clockMs,
      order: facts.length + index,
      build: () => ({
        type: "SUBSTITUTION" as MatchEventType,
        payload: retroActionPayload(action, resolved.slotId),
      }),
    });
  });

  pending.sort((a, b) => a.clockMs - b.clockMs || a.order - b.order);

  const drafts: Draft[] = [];
  for (let period = 1; period <= periods.periodsCount; period += 1) {
    drafts.push({ type: "KICKOFF", payload: {}, clockMs: periodStartMs(period, periods), period });

    if (period === 1) {
      drafts.push({
        type: "LINEUP_APPLIED",
        payload: {
          ...(entry.lineupId ? { lineupId: entry.lineupId } : {}),
          slots: entry.starters.map((starter) => ({
            slotId: starter.slotId,
            memberId: starter.memberId,
          })),
        },
        clockMs: 0,
        period: 1,
      });
    }

    for (const item of pending) {
      // The boundary belongs to the period that is starting (`periodOfClockMs`), so a change « à la
      // mi-temps » is recorded after the second kick-off rather than before the first period's end.
      if (periodOfClockMs(item.clockMs, periods) !== period) continue;
      drafts.push({ ...item.build(), clockMs: item.clockMs, period });
    }

    drafts.push({ type: "PERIOD_END", payload: {}, clockMs: periodEndMs(period, periods), period });
    if (period === periods.periodsCount) {
      drafts.push({ type: "FINAL_WHISTLE", payload: {}, clockMs: endMs, period });
    }
  }

  const guessedStamps =
    facts.filter((fact) => fact.minute === null).length +
    pitch.changes.filter((change) => change.guessed).length;

  return {
    events: drafts.map((draft, index) => toEventInput(draft, index, entry)),
    guessedStamps,
  };
}

type Draft = {
  type: MatchEventType;
  payload: Record<string, unknown>;
  clockMs: number;
  period: number;
};

function toEventInput(draft: Draft, index: number, entry: RetroEntry): MatchEventInput {
  return {
    clientEventId: retroEventId(entry.submissionId, index),
    type: draft.type,
    period: draft.period,
    minute: clockMsToMinute(draft.clockMs),
    clockMs: draft.clockMs,
    // An approximation, and an honest one: the wall clock of a retro-entered event is unknowable.
    // `clock_ms` is what every consumer reads (`resolveClockMs`); `occurred_at` only ever drives the
    // projection of a *running* clock, which a match entered after the fact does not have.
    occurredAt: new Date(entry.kickoffAtMs + draft.clockMs),
    payload: draft.payload,
    voidsEventId: null,
  };
}

/**
 * The `payload` of any row of the sheet.
 *
 * One of the four places the union is taken apart. The `default` arm hands `retroFactPayload` a value
 * narrowed to `RetroFact`, so a third member of `RetroAction` does not quietly fall through here as a
 * goal — it fails to compile on this line, which is the whole bargain of the discriminated union.
 *
 * `slotId` is not a field of the action: it is the slot `retroPitch` worked out the outgoing player
 * was standing in, which is why the substitution payload is built from a *resolved* change.
 */
export function retroActionPayload(
  action: RetroAction,
  slotId: string | null,
): Record<string, unknown> {
  switch (action.type) {
    case "SUBSTITUTION":
      return slotId
        ? { outId: action.outId, inId: action.inId, slotId }
        : { outId: action.outId, inId: action.inId };
    default:
      return retroFactPayload(action);
  }
}

/**
 * The `payload` of one fact. Shared with the amendment builder, so a corrected goal is written in
 * exactly the same shape as the one it replaces — which is why it keeps taking the narrowed arm.
 */
export function retroFactPayload(fact: {
  type: RetroFactType;
  memberId: string | null;
  assistId: string | null;
}): Record<string, unknown> {
  switch (fact.type) {
    case "GOAL_FOR":
      // Both optional: decision 017 keeps `scorerId` absent for a goal whose scorer is forgotten,
      // which is the whole point of retro entry.
      return {
        ...(fact.memberId ? { scorerId: fact.memberId } : {}),
        ...(fact.assistId ? { assistId: fact.assistId } : {}),
      };
    case "GOAL_AGAINST":
      return {};
    case "PENALTY_SCORED":
    case "PENALTY_MISSED":
    case "OWN_GOAL":
      return fact.memberId ? { scorerId: fact.memberId } : {};
    case "FOUL":
    case "INJURY":
      return fact.memberId ? { memberId: fact.memberId } : {};
  }
}

/* -------------------------------------------------------------------------- */
/* Idempotency                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The `client_event_id` of the nth event of one submission.
 *
 * Derived rather than random so that the whole batch is a pure function of the form: submitting it
 * twice — a double tap, a retry on a flaky connection — produces the same 21 ids, which
 * `insertNewEvents` resolves to one log through `on conflict do nothing` (invariant 6).
 *
 * The last three hex digits of the submission uuid are replaced by the index. They carry no
 * meaning: the version nibble (character 14) and the variant nibble (character 19) are further
 * left, so the result is still a well-formed uuid — which `matchEventInputSchema` insists on.
 */
export function retroEventId(submissionId: string, index: number): string {
  const suffix = clamp(Math.floor(index), 0, 0xfff).toString(16).padStart(3, "0");
  return `${submissionId.slice(0, 33)}${suffix}`.toLowerCase();
}

/**
 * The submission id itself, derived from **what is being submitted** rather than drawn at random.
 *
 * This is the load-bearing half of invariant 6 for this screen, and it replaces a hidden field
 * holding a `crypto.randomUUID()`. Three things fall out of it:
 *
 * - a retry is a retry. The same sheet posted twice — a double tap, a browser replaying a POST, a
 *   response lost on the way back — yields the same submission id, hence the same `client_event_id`s,
 *   hence one log. A random uuid held in client state survives a double tap but not a page restored
 *   from the back-forward cache;
 * - a *different* sheet is a different submission, so nothing is ever silently swallowed as a
 *   duplicate of something the coach did not type;
 * - it is the same on the server and in the browser, which a random uuid in a hidden input is not:
 *   the two would disagree and React would report a hydration mismatch on every load of the form.
 *
 * The hash is `deterministicUuid` (`lib/match/ids.ts`), which game mode's automatic composition
 * shares (decision 153). A collision would mean two *different* sheets for the same match hashing
 * together, and the sheet is re-read from the database before anything is written.
 */
export function retroSubmissionId(parts: readonly (string | number | null | undefined)[]): string {
  return deterministicUuid(parts);
}

/**
 * The seed of a whole retro entry: everything that changes what the log will say, and nothing else.
 *
 * The row keys are deliberately left out — they are DOM bookkeeping, and re-adding a row the coach
 * deleted must not turn an identical sheet into a different submission.
 *
 * **Every field of every arm has to appear here.** Invariant 6 keys idempotent ingestion on this
 * string: two sheets that hash identically produce the same `client_event_id`s, so the second one is
 * swallowed by `on conflict do nothing` and the coach is told nothing. A field left out of the seed is
 * therefore a field the coach can change without the app noticing.
 */
export function retroEntrySeed(matchId: string, entry: Omit<RetroEntry, "submissionId">): string {
  return [
    matchId,
    entry.lineupId ?? "",
    entry.periods.periodsCount ?? "",
    entry.periods.periodMinutes ?? "",
    entry.starters.map((starter) => `${starter.slotId}=${starter.memberId}`).join(","),
    entry.actions.map(retroActionSeed).join(","),
  ].join("|");
}

/**
 * One row of the sheet as a seed fragment. The third of the four places the union is taken apart, and
 * the `default` arm narrows to `RetroFact` before reading `memberId`/`assistId`, so a new arm with
 * different fields cannot be seeded as a half-empty fact.
 */
function retroActionSeed(action: RetroAction): string {
  switch (action.type) {
    case "SUBSTITUTION":
      return `SUBSTITUTION:${action.outId}>${action.inId}@${action.minute ?? "?"}`;
    default:
      return retroFactSeed(action);
  }
}

function retroFactSeed(fact: RetroFact): string {
  return `${fact.type}:${fact.memberId ?? ""}:${fact.assistId ?? ""}@${fact.minute ?? "?"}`;
}

/* -------------------------------------------------------------------------- */
/* Reducing what was built                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The synthesised batch as `reduceMatch` wants it.
 *
 * The score, the minutes and the clean sheets of a retro-entered match are **not** computed here:
 * they are read back out of the reducer, exactly like a live match's (invariant 2). The form uses
 * this to show the coach the score his entry implies before he saves it, and the Server Action uses
 * it to refuse a log that would reduce with anomalies. `client_event_id` stands in for `id`, which
 * the database has not handed out yet, and the array index for `seq`, which is what the insert will
 * assign.
 */
export function retroEventRecords(
  events: readonly MatchEventInput[],
): readonly MatchEventRecord[] {
  return events.map((event, index) => ({
    id: event.clientEventId,
    clientEventId: event.clientEventId,
    type: event.type,
    period: event.period,
    minute: event.minute,
    clockMs: event.clockMs,
    occurredAt: event.occurredAt,
    payload: event.payload,
    voidsEventId: event.voidsEventId ?? null,
    seq: index,
  }));
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The nearest whole minute inside `[minMs, maxMs]`: stamps stay readable, `12’` not `12’34″`. */
function snapToMinute(atMs: number, minMs: number, maxMs: number): number {
  return clamp(minuteToClockMs(Math.round(atMs / MS_PER_MINUTE)), minMs, maxMs);
}
