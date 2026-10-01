/**
 * Reading the retro-entry form, and telling the coach what is wrong with it.
 *
 * Two jobs, both pure, so both testable without a browser or a database.
 *
 * 1. **Decoding.** The screen is one `<form>` with a variable number of rows, so the rows travel as
 *    controls whose *names* carry their identity: `starter:<slotId>`, `action-type:<rowKey>`,
 *    `action-out:<rowKey>`… Same trick as `lib/composition/validation.ts`, for the same reason — it
 *    survives with JavaScript switched off, and it needs no JSON blob in a hidden field.
 * 2. **Judging.** `findRetroIssues` answers "can this be saved, and what should I warn about",
 *    in French, before anything is written. `retroLogIssuesFr` is the belt-and-braces check: the
 *    synthesised log is run through `reduceMatch` and refused if the reducer finds a contradiction
 *    in it. A log the app wrote itself must never produce an anomaly.
 */

import { z } from "zod";

import { FORMATION_SLOT_COUNT } from "@/db/reference";
import { MAX_MINUTE } from "@/lib/match/events";
import { type PeriodsConfig, periodsConfig, regulationMinutes } from "@/lib/match/clock";
import type { MatchEventInput } from "@/lib/match/events";
import type { SlotInfo } from "@/lib/match/lineup";
import { type MatchAnomalyCode, reduceMatch } from "@/lib/match/reducer";

import {
  RETRO_FACT_TYPES,
  type RetroAction,
  type RetroChange,
  type RetroEntry,
  type RetroFact,
  type RetroFactType,
  type RetroStarter,
  isRetroActionType,
  resolveFactClockMs,
  retroEventRecords,
  retroFactNeedsMember,
  retroFactTakesAssist,
  retroFactTakesMember,
  retroPitch,
} from "./log";

/* -------------------------------------------------------------------------- */
/* Decoding the form                                                          */
/* -------------------------------------------------------------------------- */

/** What an empty minute field means: « je ne sais plus ». */
export const RETRO_MINUTE_UNKNOWN = "";

type Entries = Iterable<[string, FormDataEntryValue]>;

function text(value: FormDataEntryValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** `null` for an empty field, the integer otherwise. `NaN` is left for Zod to reject. */
function optionalMinute(value: FormDataEntryValue | undefined): number | null {
  const raw = text(value);
  if (raw === RETRO_MINUTE_UNKNOWN) return null;
  return Number(raw);
}

function optionalId(value: FormDataEntryValue | undefined): string | null {
  const raw = text(value);
  return raw === "" ? null : raw;
}

/**
 * The starting seven: one `<select name="starter:<slotId>">` per slot of the formation, whose value
 * is a membership id or empty for a slot left open.
 */
export function readStarterFields(entries: Entries): RetroStarter[] {
  const out: RetroStarter[] = [];
  for (const [name, value] of entries) {
    if (!name.startsWith("starter:")) continue;
    const slotId = name.slice("starter:".length);
    const memberId = text(value);
    if (slotId === "" || memberId === "") continue;
    out.push({ slotId, memberId });
  }
  return out;
}

/**
 * Rows keyed by name suffix, gathered in the order the browser submitted them — which is DOM order,
 * which is the order the coach added them.
 */
function readRows<T>(
  entries: Entries,
  prefixes: readonly string[],
  build: (key: string, values: Record<string, FormDataEntryValue>) => T,
): T[] {
  const rows = new Map<string, Record<string, FormDataEntryValue>>();
  for (const [name, value] of entries) {
    const prefix = prefixes.find((candidate) => name.startsWith(`${candidate}:`));
    if (!prefix) continue;
    const key = name.slice(prefix.length + 1);
    if (key === "") continue;
    const row = rows.get(key) ?? {};
    row[prefix] = value;
    rows.set(key, row);
  }
  return [...rows].map(([key, values]) => build(key, values));
}

/**
 * Every row of the sheet, from one `action-*` family of controls: a substitution and a goal arrive
 * through the same decoder and come out as the two arms of `RetroAction`.
 *
 * Two behaviours are deliberate and are the reason this is not a one-liner:
 *
 * - a row whose `action-type` is not enterable is **dropped**. Nothing in the form can produce one, so
 *   it is a crafted POST, and the right answer is to ignore it rather than to explain it;
 * - a **half-filled substitution is kept**. « Sort… » chosen and « Entre… » still empty is a row the
 *   coach started, and `findRetroIssues` says so by name; swallowing it here would make the row vanish
 *   on submit and the match save as if it had never been typed (UX audit D22).
 *
 * The `optionalId` nulls on the fact arm are what « Buteur inconnu » and « Sans passe décisive » post
 * (decisions 017 and 036): absent, not invalid.
 */
export function readActionFields(entries: Entries): RetroAction[] {
  return readRows(
    entries,
    ["action-type", "action-minute", "action-member", "action-assist", "action-out", "action-in"],
    (key, values): RetroAction | null => {
      const type = text(values["action-type"]);
      if (!isRetroActionType(type)) return null;
      const minute = optionalMinute(values["action-minute"]);

      switch (type) {
        case "SUBSTITUTION": {
          const row = {
            key,
            type,
            outId: text(values["action-out"]),
            inId: text(values["action-in"]),
            minute,
          };
          // An untouched row the coach added and left alone is not a mistake to report.
          return row.outId === "" && row.inId === "" ? null : row;
        }
        case "POSITION_CHANGE":
          // Enterable per `RETRO_ACTION_TYPES`, but `RetroAction` has no arm for it yet: the form
          // offers no such row, so one can only have been crafted. Dropped like an unknown type until
          // the arm lands, at which point this case is where it is decoded.
          return null;
        default:
          return {
            key,
            type,
            memberId: optionalId(values["action-member"]),
            assistId: optionalId(values["action-assist"]),
            minute,
          };
      }
    },
  ).filter((row): row is RetroAction => row !== null);
}

/* -------------------------------------------------------------------------- */
/* Validating the shape                                                       */
/* -------------------------------------------------------------------------- */

const minuteSchema = z
  .number()
  .int("Une minute s’écrit en nombre entier.")
  .min(0, "La minute ne peut pas être négative.")
  .max(MAX_MINUTE, "Cette minute est impossible.")
  .nullable();

const idSchema = z.uuid("Ce joueur n’est pas valide.");

const rowKeySchema = z.string().min(1).max(64);

/**
 * **The correctable fact, and no longer the entry schema.**
 *
 * `retroActionSchema` below is what the entry form posts. This one survives for `amendSubmitSchema`,
 * which is a different question: `RETRO_FACT_TYPES` is what a coach may *correct* on a frozen match and
 * `RETRO_ACTION_TYPES` is what he may *type up* on a sheet (decision 049). Building the amendment
 * schema out of the wider list would hand `SUBSTITUTION` and `POSITION_CHANGE` a correction payload
 * nobody decided to give them.
 *
 * It is also the fact arm of the union below, rather than a second copy of those five fields: one
 * declaration, so « corriger un but » and « saisir un but » cannot drift apart in shape while staying
 * apart in *which types* they accept.
 */
export const retroFactSchema = z.object({
  key: rowKeySchema,
  // The list itself, not a second copy of it: this was seven literals hand-kept in step with
  // `RETRO_FACT_TYPES`, which is the kind of duplication decision 064 exists about.
  type: z.enum(RETRO_FACT_TYPES),
  memberId: idSchema.nullable(),
  assistId: idSchema.nullable(),
  minute: minuteSchema,
});

export const retroChangeSchema = z.object({
  key: rowKeySchema,
  type: z.literal("SUBSTITUTION"),
  // Both required, unlike the fact arm's nullable players: « je ne sais plus qui est sorti » is not a
  // substitution, it is an unfinished row — which `findRetroIssues` reports rather than this schema.
  outId: idSchema,
  inId: idSchema,
  minute: minuteSchema,
});

/**
 * One row of the sheet, as a discriminated union on `type` — the schema-level mirror of `RetroAction`.
 *
 * Discriminated rather than a widened object so Zod reports « ce joueur n'est pas valide » against the
 * arm the row actually is, instead of complaining that a goal has no outgoing player.
 */
export const retroActionSchema = z.discriminatedUnion("type", [retroFactSchema, retroChangeSchema]);

/**
 * The form as a whole. The cap is a sanity ceiling, not a rule: a seven-a-side match with more than a
 * hundred actions on the sheet is a typo, and `matchEventBatchSchema` refuses more than 200 events
 * anyway — which, with the frame of the match, is the real limit.
 *
 * There is no `submissionId` field: the action derives it from the content with
 * `retroSubmissionId`, so a retry is idempotent without the browser having to carry a uuid around.
 */
export const retroSubmitSchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  lineupId: z.uuid().nullish(),
  starters: z
    .array(z.object({ slotId: z.uuid(), memberId: idSchema }))
    .min(1, "Il faut au moins un joueur dans la composition de départ.")
    .max(FORMATION_SLOT_COUNT, "Une équipe de foot à 7 compte sept joueurs sur le terrain."),
  actions: z.array(retroActionSchema).max(100),
});

/**
 * One correction to a finished match.
 *
 * `intent` is explicit rather than inferred from which fields arrived: « annuler » and « corriger »
 * are different requests, and a `<select>` that failed to submit must not turn one into the other.
 * - `void` — the event happened and did not: a target, no replacement.
 * - `correct` — a replacement fact, with a target when something is being replaced and without when
 *   the coach is adding an event the log never had.
 *
 * As with the entry form, the submission id is derived from the content rather than submitted.
 */
export const amendSubmitSchema = z
  .object({
    teamId: z.uuid(),
    matchId: z.uuid(),
    intent: z.enum(["correct", "void"]),
    targetEventId: z.uuid().nullish(),
    fact: retroFactSchema.omit({ key: true }).nullish(),
  })
  .refine((value) => value.intent !== "void" || !!value.targetEventId, {
    path: ["targetEventId"],
    message: "Il faut désigner l’action à annuler.",
  })
  .refine((value) => value.intent !== "correct" || !!value.fact, {
    path: ["fact"],
    message: "Il faut dire ce qui s’est réellement passé.",
  });

/* -------------------------------------------------------------------------- */
/* Judging the content                                                        */
/* -------------------------------------------------------------------------- */

export type RetroIssueCode =
  | "incomplete"
  | "duplicate-member"
  | "no-goalkeeper"
  | "unknown-slot"
  | "unknown-member"
  | "missing-scorer"
  | "change-same-player"
  | "change-out-not-on"
  | "change-in-already-on"
  | "minute-out-of-range"
  | "player-not-on-pitch";

export type RetroIssue = {
  code: RetroIssueCode;
  /** The player concerned, when the problem is about one. */
  memberId: string | null;
  /** The row of the form to point at, when the problem is about one. */
  rowKey: string | null;
  /** Ready to print. French, because the coach reads it (decision 012). */
  messageFr: string;
  /** A blocking problem cannot be saved; a warning is only shown. */
  blocking: boolean;
};

export type RetroMember = {
  membershipId: string;
  name: string;
};

export function blockingRetroIssues(issues: readonly RetroIssue[]): RetroIssue[] {
  return issues.filter((issue) => issue.blocking);
}

/**
 * Everything worth telling the coach before the log is written.
 *
 * Deliberately not a Zod refinement: the same function drives the live warnings in the form and the
 * refusal in the Server Action, and the form wants the *list*, not the first failure.
 */
export function findRetroIssues(input: {
  entry: RetroEntry;
  members: readonly RetroMember[];
  /** The slot catalogue of the formation the starters were placed in. */
  slots: readonly SlotInfo[];
}): RetroIssue[] {
  const { entry, slots } = input;
  const periods = periodsConfig(entry.periods);
  const regulation = regulationMinutes(periods);
  const byId = new Map(input.members.map((member) => [member.membershipId, member]));
  const nameOf = (memberId: string | null): string =>
    (memberId && byId.get(memberId)?.name) || "Ce joueur";
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));

  const issues: RetroIssue[] = [];
  const add = (issue: Omit<RetroIssue, "memberId" | "rowKey"> & Partial<RetroIssue>) =>
    issues.push({ memberId: null, rowKey: null, ...issue });

  /* ---- the starting seven ------------------------------------------------ */

  const seen = new Set<string>();
  for (const starter of entry.starters) {
    if (!slotById.has(starter.slotId)) {
      add({
        code: "unknown-slot",
        messageFr: "Un poste de cette composition n’existe pas dans cette formation.",
        blocking: true,
      });
    }
    if (!byId.has(starter.memberId)) {
      add({
        code: "unknown-member",
        memberId: starter.memberId,
        messageFr: "Un joueur de cette composition ne fait plus partie de l’effectif.",
        blocking: true,
      });
    }
    if (seen.has(starter.memberId)) {
      add({
        code: "duplicate-member",
        memberId: starter.memberId,
        messageFr: `${nameOf(starter.memberId)} est placé à deux postes.`,
        blocking: true,
      });
    }
    seen.add(starter.memberId);
  }

  if (entry.starters.length > 0 && entry.starters.length < FORMATION_SLOT_COUNT) {
    const missing = FORMATION_SLOT_COUNT - entry.starters.length;
    add({
      code: "incomplete",
      messageFr:
        missing === 1
          ? "Il reste un poste vide dans la composition de départ."
          : `Il reste ${missing} postes vides dans la composition de départ.`,
      // A team that finished with six is a real thing; the minutes are still right.
      blocking: false,
    });
  }

  if (
    entry.starters.length > 0 &&
    !entry.starters.some((starter) => slotById.get(starter.slotId)?.positionCode === "GB")
  ) {
    add({
      code: "no-goalkeeper",
      messageFr: "Personne n’est dans les buts : les minutes de gardien resteront à zéro.",
      blocking: false,
    });
  }

  /* ---- the actions ------------------------------------------------------- */

  const pitch = retroPitch(entry);
  /**
   * On the pitch at that match time, **as the reducer will see it**.
   *
   * The boundary matters and is not symmetric. `buildRetroLog` emits the facts of a given minute
   * before the substitutions of that same minute, so a player replaced at 30′ is still on when a
   * 30′ goal is read, and a player who came on at 30′ is not — except at kick-off, where the
   * starting seven is applied before anything else. Getting this wrong here would either refuse a
   * legitimate entry or let one through that `reduceMatch` then flags as `scorer-off-pitch`.
   */
  const onPitchAt = (memberId: string, clockMs: number): boolean =>
    (pitch.spells.get(memberId) ?? []).some(
      (spell) =>
        (spell.fromMs < clockMs || spell.fromMs === 0) && clockMs <= spell.toMs,
    );
  const everOn = (memberId: string): boolean => (pitch.spells.get(memberId) ?? []).length > 0;

  const addChangeIssues = (change: RetroChange): void => {
    const resolved = pitch.changes.find((candidate) => candidate.key === change.key);
    for (const memberId of [change.outId, change.inId]) {
      if (!byId.has(memberId)) {
        add({
          code: "unknown-member",
          memberId,
          rowKey: change.key,
          messageFr: "Un joueur de ce changement ne fait plus partie de l’effectif.",
          blocking: true,
        });
      }
    }
    if (change.outId === change.inId) {
      add({
        code: "change-same-player",
        memberId: change.outId,
        rowKey: change.key,
        messageFr: `${nameOf(change.outId)} ne peut pas se remplacer lui-même.`,
        blocking: true,
      });
      return;
    }
    if (change.minute !== null && (change.minute < 0 || change.minute > regulation)) {
      add({
        code: "minute-out-of-range",
        rowKey: change.key,
        messageFr: `Ce match dure ${regulation} minutes : la minute ${change.minute} n’existe pas.`,
        blocking: true,
      });
    }
    if (!resolved) return;
    if (!resolved.outWasOn) {
      add({
        code: "change-out-not-on",
        memberId: change.outId,
        rowKey: change.key,
        messageFr: `${nameOf(change.outId)} n’était pas sur le terrain à ce moment-là : il ne peut pas sortir.`,
        blocking: true,
      });
    }
    if (resolved.inAlreadyOn) {
      add({
        code: "change-in-already-on",
        memberId: change.inId,
        rowKey: change.key,
        messageFr: `${nameOf(change.inId)} était déjà sur le terrain à ce moment-là.`,
        blocking: true,
      });
    }
  };

  const addFactIssues = (fact: RetroFact): void => {
    if (fact.memberId !== null && !byId.has(fact.memberId)) {
      add({
        code: "unknown-member",
        memberId: fact.memberId,
        rowKey: fact.key,
        messageFr: "Un joueur de cette ligne ne fait plus partie de l’effectif.",
        blocking: true,
      });
    }
    if (retroFactNeedsMember(fact.type) && fact.memberId === null) {
      add({
        code: "missing-scorer",
        rowKey: fact.key,
        messageFr: missingMemberMessageFr(fact.type),
        blocking: true,
      });
    }
    if (fact.minute !== null && (fact.minute < 0 || fact.minute > regulation)) {
      add({
        code: "minute-out-of-range",
        rowKey: fact.key,
        messageFr: `Ce match dure ${regulation} minutes : la minute ${fact.minute} n’existe pas.`,
        blocking: true,
      });
    }

    // Only a minute the coach typed himself can contradict the pitch: a guessed one is placed
    // inside the player's own time on the pitch by construction (`resolveFactClockMs`).
    const { clockMs } = resolveFactClockMs(fact, pitch);
    for (const memberId of [
      retroFactTakesMember(fact.type) ? fact.memberId : null,
      retroFactTakesAssist(fact.type) ? fact.assistId : null,
    ]) {
      if (memberId === null || !byId.has(memberId)) continue;
      if (onPitchAt(memberId, clockMs)) continue;
      add({
        code: "player-not-on-pitch",
        memberId,
        rowKey: fact.key,
        messageFr: everOn(memberId)
          ? `${nameOf(memberId)} n’était pas sur le terrain à cette minute.`
          : `${nameOf(memberId)} n’apparaît ni dans la composition de départ ni dans les changements.`,
        blocking: true,
      });
    }
  };

  /*
   * One pass over the sheet, in the order the coach typed it, and the fourth of the four places the
   * union is taken apart. The two arms get genuinely different rules — three of the substitution ones
   * are about `RetroPitch`, which a goal has nothing to do with — so a widened record would have meant
   * a null check in front of every rule instead of a narrowed argument. A third arm fails to compile on
   * the `default` line rather than falling through as a fact.
   */
  for (const action of entry.actions) {
    switch (action.type) {
      case "SUBSTITUTION":
        addChangeIssues(action);
        break;
      default:
        addFactIssues(action);
        break;
    }
  }

  return issues;
}

function missingMemberMessageFr(type: RetroFactType): string {
  switch (type) {
    case "PENALTY_SCORED":
      return "Il faut dire qui a transformé le penalty.";
    case "PENALTY_MISSED":
      return "Il faut dire qui a manqué le penalty.";
    case "OWN_GOAL":
      return "Il faut dire qui a marqué contre son camp.";
    case "FOUL":
      return "Il faut dire qui a commis la faute.";
    case "INJURY":
      return "Il faut dire qui s’est blessé.";
    default:
      return "Il faut désigner un joueur sur cette ligne.";
  }
}

/* -------------------------------------------------------------------------- */
/* The last check: what the reducer makes of it                               */
/* -------------------------------------------------------------------------- */

/**
 * Anomalies that mean the log is wrong, as opposed to merely unusual.
 *
 * `goalkeeper-unknown` and `no-goalkeeper-on-pitch` are not here: a team that played without a
 * recognised goalkeeper is a fact about the match, not a fault in the entry.
 */
const BLOCKING_ANOMALIES: readonly MatchAnomalyCode[] = [
  "invalid-payload",
  "goal-before-kickoff",
  "event-after-final-whistle",
  "duplicate-final-whistle",
  "kickoff-while-in-play",
  "period-end-while-stopped",
  "substitute-in-already-on",
  "substitute-out-not-on",
  "position-change-off-pitch",
  "scorer-off-pitch",
  "too-many-on-pitch",
  "lineup-slot-conflict",
  "void-targets-void",
  "void-without-target",
  "voids-on-non-void",
  "duplicate-void",
];

/**
 * Run the synthesised batch through the reducer and refuse it if the reducer disagrees with it.
 *
 * This is the only check that cannot be fooled by a gap between what the form thinks it built and
 * what the log actually says — the same function every consumer of the match will use is asked
 * whether it can read it. The anomaly detail is English (it is a developer diagnostic), so the
 * coach gets one French sentence and the log stays unwritten.
 */
export function retroLogIssuesFr(
  events: readonly MatchEventInput[],
  config: { periods: PeriodsConfig; slots: readonly SlotInfo[] },
): string[] {
  const state = reduceMatch(retroEventRecords(events), [], {
    periodsCount: config.periods.periodsCount,
    periodMinutes: config.periods.periodMinutes,
    slots: config.slots,
  });

  const codes = new Set(
    state.anomalies
      .map((anomaly) => anomaly.code)
      .filter((code) => BLOCKING_ANOMALIES.includes(code)),
  );

  if (codes.size === 0) return [];
  return [
    "Cette saisie produit un déroulé incohérent : vérifie la composition, les changements et les minutes.",
  ];
}
