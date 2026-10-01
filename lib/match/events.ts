/**
 * The typed vocabulary of the match event log.
 *
 * `match_events` is append-only (decision 003) and its `payload` column is `jsonb`, which means
 * the database cannot check what is inside it. This file is that check, and it is the **single**
 * definition of every payload shape: the ingestion API, the Server Actions and the reducer all
 * read it, so a new event type is added in one place instead of three.
 *
 * Pure and framework-free: no database client, no React, no `Date.now()`. The only import from
 * `db/schema.ts` is a *type*, erased at build time, so this module is safe in a client bundle.
 *
 * ## Two strictnesses, one definition
 *
 * `MATCH_EVENT_PAYLOAD_SCHEMAS` requires member and slot references to be UUIDs — that is the
 * truth of the columns they point at, and what the ingestion boundary must enforce.
 * `LENIENT_MATCH_EVENT_PAYLOAD_SCHEMAS` accepts any non-empty string id. The reducer uses the
 * lenient set on purpose: **it must never refuse to read a log Postgres has already accepted.**
 * A reducer that dropped a goal because an id looked odd would lose real history; the shape of an
 * id is the API's problem, not the historian's. Both sets come from one factory, so they cannot
 * drift apart.
 *
 * See `docs/DATA_MODEL.md` § "The match event log" for the table, and decision 010 for why there
 * are no cards, no opponent scorers, no shots and no corners.
 */

import { z } from "zod";

import type { MatchEventType as SchemaMatchEventType } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Event types                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every type the log can hold, in the order of the `match_event_type` Postgres enum.
 * Declared locally rather than read from `matchEventType.enumValues` so that this module stays
 * free of any runtime dependency on Drizzle; `MATCH_EVENT_TYPES_MATCH_THE_DATABASE` below makes
 * the duplication safe.
 */
export const MATCH_EVENT_TYPES = [
  "KICKOFF",
  "PERIOD_END",
  "PAUSE",
  "RESUME",
  "GOAL_FOR",
  "GOAL_AGAINST",
  "OWN_GOAL",
  "PENALTY_SCORED",
  "PENALTY_MISSED",
  "SUBSTITUTION",
  "POSITION_CHANGE",
  "LINEUP_APPLIED",
  "FOUL",
  "INJURY",
  "COMMENT",
  "REMARK",
  "FINAL_WHISTLE",
  "VOID",
] as const;

export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Compile-time proof that the list above is exactly the database enum. If someone adds a type to
 * `db/schema.ts` and forgets this file (or the other way round), this line stops compiling.
 */
export const MATCH_EVENT_TYPES_MATCH_THE_DATABASE: Equals<MatchEventType, SchemaMatchEventType> =
  true;

export const matchEventTypeSchema = z.enum(MATCH_EVENT_TYPES);

/** Types that move the score. Used by the reducer and by the timeline. */
export const SCORING_EVENT_TYPES = [
  "GOAL_FOR",
  "PENALTY_SCORED",
  "GOAL_AGAINST",
  "OWN_GOAL",
] as const satisfies readonly MatchEventType[];

/** Types that put a goal on our own scoreboard. */
export const GOAL_FOR_TYPES = ["GOAL_FOR", "PENALTY_SCORED"] as const satisfies
  readonly MatchEventType[];

/**
 * Types that concede. An own goal counts against us and breaks the clean sheet — it is a goal in
 * our net like any other (`docs/DATA_MODEL.md`), it simply also credits an own goal to a player.
 */
export const GOAL_AGAINST_TYPES = ["GOAL_AGAINST", "OWN_GOAL"] as const satisfies
  readonly MatchEventType[];

/** Types that drive the clock rather than the football. */
export const CLOCK_EVENT_TYPES = [
  "KICKOFF",
  "PERIOD_END",
  "PAUSE",
  "RESUME",
  "FINAL_WHISTLE",
] as const satisfies readonly MatchEventType[];

export function isScoringEvent(type: MatchEventType): boolean {
  return (SCORING_EVENT_TYPES as readonly MatchEventType[]).includes(type);
}

export function isClockEvent(type: MatchEventType): boolean {
  return (CLOCK_EVENT_TYPES as readonly MatchEventType[]).includes(type);
}

/**
 * A `VOID` may not target another `VOID` (`docs/DATA_MODEL.md`): an annulment is undone by
 * appending the event again, not by annulling the annulment, which would be unreadable in a
 * timeline and ambiguous in a reducer.
 */
export function canBeVoided(type: MatchEventType): boolean {
  return type !== "VOID";
}

/* -------------------------------------------------------------------------- */
/* Payloads                                                                   */
/* -------------------------------------------------------------------------- */

/** Free-text reason on a pause, e.g. « joueur au sol ». Optional, short, never required. */
const reasonSchema = z.string().trim().min(1).max(120);

/**
 * The free-text note of a `COMMENT`, e.g. « Coup franc dangereux, mur mal placé ». Longer than a
 * pause reason because it is the point of the event rather than an aside, and still short enough to
 * read on one timeline line.
 */
const noteSchema = z.string().trim().min(1).max(280);

/**
 * The six things a coach taps about a player during a match.
 *
 * They are **one** event type with the kind in the payload, not six types: a seventh remark is a
 * line in this array, whereas a seventh enum value would be a migration on a production database.
 * Same screaming-snake style as the event types above, because they are read in the same breath.
 */
export const REMARK_KINDS = [
  "GOOD_TRACK_BACK",
  "GOOD_EFFORT",
  "BAD_PASS",
  "GOOD_POSITIONING",
  "LOST_BALL",
  "NICE_SKILL",
] as const;

export type RemarkKind = (typeof REMARK_KINDS)[number];

/**
 * Both payload dictionaries come from here, differing only in how an id is validated.
 * `id` is applied to every `team_members.id` and `formation_slots.id` reference.
 */
function buildPayloadSchemas(id: z.ZodType<string, unknown>) {
  const empty = z.object({});
  const pause = z.object({ reason: reasonSchema.optional() });

  return {
    KICKOFF: empty,
    PERIOD_END: empty,
    PAUSE: pause,
    RESUME: pause,

    /**
     * `scorerId` is **optional**, unlike the other goal types. Two real cases need it: an
     * opponent who scores an own goal in our favour (we track no opponent players, so there is
     * nobody to credit — decision 010), and retro-entry of an old match where the score is
     * remembered but the scorer is not (decision 013). The reducer still counts the goal; it
     * simply credits nobody.
     */
    GOAL_FOR: z.object({ scorerId: id.optional(), assistId: id.optional() }),

    /** No opponent detail at all, by decision 010. The minute is the whole story. */
    GOAL_AGAINST: empty,

    /** Counts against us, and as an own goal for the player — never as a goal for them. */
    OWN_GOAL: z.object({ scorerId: id }),

    /** A penalty is taken by a known player: the point of the stat is who took it. */
    PENALTY_SCORED: z.object({ scorerId: id }),
    PENALTY_MISSED: z.object({ scorerId: id }),

    /**
     * `slotId` is optional: the ACTION sheet's quick substitution does not always ask where the
     * incoming player goes. When it is absent the reducer puts them in the slot the outgoing
     * player has just vacated, which is what a coach means by "Momo for Julien".
     */
    SUBSTITUTION: z.object({ outId: id, inId: id, slotId: id.optional() }),

    /**
     * `fromSlotId` is optional because the reducer already knows where the player was; it is
     * recorded so the timeline can read « passe MC → AT » without replaying the whole log.
     */
    POSITION_CHANGE: z.object({ memberId: id, fromSlotId: id.optional(), toSlotId: id }),

    /**
     * The confirmed result of a composition, planned or ad-hoc: it supersedes the on-pitch state
     * wholesale, so it must list the entire team. `lineupId` is absent for an ad-hoc TERRAIN
     * change, which corresponds to no row in `lineups`.
     */
    LINEUP_APPLIED: z.object({
      lineupId: id.nullish(),
      slots: z.array(z.object({ slotId: id, memberId: id })).min(1),
    }),

    FOUL: z.object({ memberId: id }),
    INJURY: z.object({ memberId: id }),

    /**
     * A note the coach types during the match. `memberId` is optional: a comment is about the game
     * as often as it is about a player, and forcing a subject would make the coach pick one.
     */
    COMMENT: z.object({ note: noteSchema, memberId: id.optional() }),

    /**
     * One tap about one player. `memberId` is **required**, which is the one way a remark differs
     * from a `COMMENT`: « bel effort » about nobody in particular is not a remark, it is a note.
     */
    REMARK: z.object({ kind: z.enum(REMARK_KINDS), memberId: id }),

    FINAL_WHISTLE: empty,

    /** The target is carried by the `voids_event_id` column, not by the payload. */
    VOID: empty,
  };
}

/** UUID-strict. What the ingestion API and the Server Actions validate against. */
export const MATCH_EVENT_PAYLOAD_SCHEMAS = buildPayloadSchemas(z.uuid());

/** Shape-strict, id-lenient. What the reducer reads, so history is never refused. */
export const LENIENT_MATCH_EVENT_PAYLOAD_SCHEMAS = buildPayloadSchemas(z.string().trim().min(1));

type PayloadSchemas = typeof MATCH_EVENT_PAYLOAD_SCHEMAS;

/** The payload of each event type, inferred from the schema — never declared twice. */
export type MatchEventPayloads = {
  [K in MatchEventType]: z.infer<PayloadSchemas[K]>;
};

export type MatchEventPayload<K extends MatchEventType = MatchEventType> = MatchEventPayloads[K];

/** The discriminated union the UI matches on: `switch (event.type)` narrows `event.payload`. */
export type MatchEventData = {
  [K in MatchEventType]: { type: K; payload: MatchEventPayloads[K] };
}[MatchEventType];

export type PayloadParseResult<K extends MatchEventType> =
  | { ok: true; payload: MatchEventPayloads[K] }
  | { ok: false; issues: readonly string[] };

/**
 * Parse a raw `jsonb` payload against its type.
 *
 * `strict` is for the ingestion boundary (ids must be UUIDs); the default is lenient, which is
 * what the reducer wants — see the note at the top of this file. A missing payload is read as
 * `{}`, because the column defaults to `'{}'` and the clock events legitimately carry nothing.
 */
export function parseMatchEventPayload<K extends MatchEventType>(
  type: K,
  payload: unknown,
  options: { strict?: boolean } = {},
): PayloadParseResult<K> {
  const schemas = options.strict ? MATCH_EVENT_PAYLOAD_SCHEMAS : LENIENT_MATCH_EVENT_PAYLOAD_SCHEMAS;
  // The dictionary is keyed by the same union `K` ranges over, but TypeScript cannot see that an
  // indexed access into it yields the schema of *that* member, so the narrowing is asserted once,
  // here, rather than at every call site.
  const schema: z.ZodType = schemas[type];
  const result = schema.safeParse(payload ?? {});
  if (result.success) return { ok: true, payload: result.data as MatchEventPayloads[K] };
  return {
    ok: false,
    issues: result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* The envelope, for ingestion                                                */
/* -------------------------------------------------------------------------- */

/** A tournament could plausibly have four; nine is simply beyond argument. */
export const MAX_PERIOD_NUMBER = 9;
/** A match minute nobody will ever exceed, and a cheap guard against a runaway device clock. */
export const MAX_MINUTE = 600;
export const MAX_CLOCK_MS = MAX_MINUTE * 60_000;

/**
 * One event as the device POSTs it. Messages are French: they surface in the operator's UI when
 * the outbox rejects something (decision 012).
 *
 * The server adds `id`, `matchId`, `recordedAt`, `createdBy` and `seq`; `clientEventId` is the
 * device's own idempotency key and is what makes a retry safe (decision 004).
 */
export const matchEventInputSchema = z
  .object({
    clientEventId: z.uuid("Identifiant d’action invalide."),
    type: matchEventTypeSchema,
    period: z.coerce
      .number()
      .int()
      .min(1, "Le numéro de période commence à 1.")
      .max(MAX_PERIOD_NUMBER, "Ce numéro de période est impossible."),
    minute: z.coerce
      .number()
      .int()
      .min(0, "La minute ne peut pas être négative.")
      .max(MAX_MINUTE, "Cette minute est impossible."),
    clockMs: z.coerce
      .number()
      .int()
      .min(0, "Le chrono ne peut pas être négatif.")
      .max(MAX_CLOCK_MS, "Ce chrono est impossible."),
    occurredAt: z.coerce.date("Cet horodatage n’est pas valide."),
    payload: z.unknown().optional(),
    voidsEventId: z.uuid("Identifiant d’événement invalide.").nullish(),
  })
  .superRefine((value, ctx) => {
    const parsed = parseMatchEventPayload(value.type, value.payload, { strict: true });
    if (!parsed.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["payload"],
        message: `Contenu invalide pour un événement ${value.type} (${parsed.issues.join(" · ")}).`,
      });
    }
    if (value.type === "VOID" && !value.voidsEventId) {
      ctx.addIssue({
        code: "custom",
        path: ["voidsEventId"],
        message: "Une annulation doit désigner l’événement qu’elle annule.",
      });
    }
    if (value.type !== "VOID" && value.voidsEventId) {
      ctx.addIssue({
        code: "custom",
        path: ["voidsEventId"],
        message: "Seule une annulation peut désigner un autre événement.",
      });
    }
  });

export type MatchEventInput = z.infer<typeof matchEventInputSchema>;

/** A batch as the outbox flushes it: every queued action in one POST. */
export const matchEventBatchSchema = z.object({
  matchId: z.uuid(),
  events: z.array(matchEventInputSchema).min(1, "Aucune action à envoyer.").max(200),
});

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What the reducer sorts by. The outbox retries, so **insertion order means nothing**: an event
 * logged at 12′ can land after one logged at 40′. `clock_ms` is the truth of when something
 * happened, and `seq` breaks ties in the order the operator's device produced them — which is
 * what makes the 55′ chain (a position change then the substitution that completes it) replay
 * correctly. `id` is the last resort, only so the sort is total and therefore deterministic.
 */
export function compareMatchEvents(
  a: { clockMs: number; seq?: number | null; id?: string | null },
  b: { clockMs: number; seq?: number | null; id?: string | null },
): number {
  if (a.clockMs !== b.clockMs) return a.clockMs - b.clockMs;
  const aSeq = a.seq ?? Number.MAX_SAFE_INTEGER;
  const bSeq = b.seq ?? Number.MAX_SAFE_INTEGER;
  if (aSeq !== bSeq) return aSeq - bSeq;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

/* -------------------------------------------------------------------------- */
/* French labels                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What the timeline calls each event. French, with the typographic apostrophe (decision 012).
 * Player names are spliced in by the UI, which is the only place that knows them — the reducer
 * deliberately never sees a name.
 */
export const EVENT_LABELS_FR: Record<MatchEventType, string> = {
  KICKOFF: "Coup d’envoi",
  PERIOD_END: "Fin de période",
  PAUSE: "Pause",
  RESUME: "Reprise",
  GOAL_FOR: "But",
  GOAL_AGAINST: "But encaissé",
  OWN_GOAL: "But contre son camp",
  PENALTY_SCORED: "Penalty transformé",
  PENALTY_MISSED: "Penalty manqué",
  SUBSTITUTION: "Changement",
  POSITION_CHANGE: "Changement de poste",
  LINEUP_APPLIED: "Composition appliquée",
  FOUL: "Faute",
  INJURY: "Blessure",
  COMMENT: "Commentaire",
  /**
   * The generic word on purpose: the timeline prints the *kind* right next to it
   * (« Remarque · Bel effort — Karim »), so naming the kind twice would say nothing twice. It is
   * also what a `REMARK` whose payload cannot be read has left to show.
   */
  REMARK: "Remarque",
  FINAL_WHISTLE: "Coup de sifflet final",
  VOID: "Annulation",
};

export function eventLabelFr(type: MatchEventType): string {
  return EVENT_LABELS_FR[type];
}

/** What the timeline calls each remark. The owner's own words (decision 074: it tutoies, it is terse). */
export const REMARK_LABELS_FR: Record<RemarkKind, string> = {
  GOOD_TRACK_BACK: "Bon retour",
  GOOD_EFFORT: "Bel effort",
  BAD_PASS: "Mauvaise passe",
  GOOD_POSITIONING: "Bon placement",
  LOST_BALL: "Perte de balle",
  NICE_SKILL: "Beau geste",
};

export function remarkLabelFr(kind: RemarkKind): string {
  return REMARK_LABELS_FR[kind];
}

/** How a voided line reads in the timeline: « But 58’ — annulé ». */
export const VOIDED_SUFFIX_FR = "annulé";
