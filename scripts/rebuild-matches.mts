/**
 * Rebuild the event log of the season's first three matches from the owner's verified paper sheets.
 *
 * Run it:
 *
 * ```bash
 * DATABASE_URL='postgresql://…@ep-raspy-fire-zam9gi7k.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require' \
 *   npx tsx --conditions=react-server scripts/rebuild-matches.mts            # dry run
 * DATABASE_URL='…' npx tsx --conditions=react-server scripts/rebuild-matches.mts --commit
 * ```
 *
 * `--conditions=react-server` is not optional: `db/client.ts` and the whole `lib/match` tree are
 * `import "server-only"`, whose `default` export throws. The extension is `.mts` because tsx's CJS
 * output has no top-level `await`.
 *
 * ## What it does, and the rule it breaks
 *
 * `backlogs/matches-1-3.md` is the owner-verified transcription of three handwritten sheets;
 * `backlogs/matches-1-3-blocks.json` is the same **blocks** — the complete seven on the pitch at a
 * given minute, with each man's post — machine-readable. The sheets are the one record of *where
 * everybody stood, minute by minute*, and the stored logs have **no** `POSITION_CHANGE` at all: the
 * old-app import paired substitutions with no position and gave each arrival the slot of the man he
 * replaced, so match 1 records two goalkeepers where the paper has four.
 *
 * Correcting that by appending is not possible — see **decision 179**, which this script is the
 * instrument of. So, per match, inside one transaction: delete `match_events`,
 * `match_player_stats` and `match_player_positions`, null `lineups.applied_event_id`, insert the new
 * log, then `finalizeMatchById` to rebuild the caches. `ratings` and `ratings_published_at` are
 * **not** touched.
 *
 * That contradicts **invariant 1** (`match_events` is append-only). It is the owner's explicit
 * decision for this one job, it is scripted rather than typed, and it is **preview-only**: the guard
 * below refuses any database that is not the Neon preview branch or a localhost one, and refuses
 * production outright.
 *
 * ## What the new log says, and where each part comes from
 *
 *  - **The facts come out of the existing log, never from this file.** The paper records almost no
 *    goals, and production's logs are the truth for them: `KEPT_FACT_TYPES` is read back from
 *    `match_events` and re-inserted **with its own `id`, `client_event_id`, `occurred_at`,
 *    `recorded_at` and `created_by`**, so a real recorded event keeps its identity across the
 *    rebuild. Only its `seq` changes.
 *  - **Match 3 (Bayern) is the exception**, and only for its goals: it is still `live` with no goal
 *    at all, so its 2–5 comes from the JSON (`goalsFor`, `goalsAgainst`). Its real `REMARK` 1′,
 *    `COMMENT` 3′ and `REMARK` 21′ are kept like any other fact.
 *  - **Every `PAUSE` and `RESUME` is dropped.** Bayern has two pairs (4′, 10′) and a stray `PAUSE`
 *    at 91′ from a match left running. The paper's minutes assume continuous play, and a 91′ pause
 *    in a 2×30 match is an artefact of nobody blowing the whistle — keeping them would move every
 *    minute the sheets state.
 *  - **The pitch comes from the blocks.** Each block is one `LINEUP_APPLIED` carrying the **whole**
 *    pitch at that minute (decision 147): the reducer turns a snapshot into leave / move / enter, so
 *    a pure position move and a goalkeeper change are expressed naturally and need no new event
 *    type. The 0′ block is the starting composition and carries the `lineups.id` of the match's
 *    initial composition — asserted first to hold the same men at the same position codes.
 *  - **The skeleton** is `KICKOFF` 0′ p1, the 0′ composition, the facts and blocks of the first
 *    half, `PERIOD_END` **p1 explicitly** at 30′, `KICKOFF` p2 at 30′, the second half, `PERIOD_END`
 *    p2 at 60′, `FINAL_WHISTLE`. `periodOfClockMs` assigns a boundary to the period that is
 *    *starting*, which is why the explicit period on a `PERIOD_END` matters, and why the 30′ block
 *    belongs to period 2, after the second kick-off.
 *  - **The order at an identical `clockMs` is `orderMatchEvents`'**, not a rule rewritten here
 *    (decisions 147 and 152). The list is built in its natural order, handed to that function, and
 *    the result is asserted to be a fixed point of it. That is what puts Galacticos' 60′
 *    `GOAL_AGAINST` before the 60′ `PERIOD_END`.
 *
 * ## The left and right of the paper, kept verbatim
 *
 * The two `AIL` and the two `DC` are one position each (decisions 157/158), but the sheets do record
 * which side a man stood on, so `AIL (left)` → the `AIL` at `x=160`, `AIL (right)` → `x=840`, and the
 * two `DC` of a block in written order → `x=330` then `x=670`. The consequence, declared rather than
 * smoothed away: a man who swaps wings between two blocks produces a slot change the timeline will
 * call a move, even though his *position* did not change. That is what the paper says happened, and
 * nothing derived depends on the side.
 *
 * ## Idempotency
 *
 * Every synthesised row's `id` and `client_event_id` are `deterministicUuid` of the match, the index
 * and the content, and every kept fact keeps its own, so a second `--commit` writes a log that is
 * identical column for column — `recorded_at` included, because a reconstructed event has no real
 * recording instant and the column is read nowhere in the application. The script prints a digest of
 * the stored log and stats so two runs can be compared by eye as well as by assertion.
 *
 * ## Safety
 *
 *  - refuses any `DATABASE_URL` that does not contain the preview endpoint or a localhost host;
 *  - refuses outright anything containing the production endpoint;
 *  - refuses a `-pooler` host (`COORDINATION.md`: a `pg_restore`'s empty `search_path` survives on a
 *    pooled connection and 500s the whole application);
 *  - **dry run by default**; `--commit` writes. The database is printed, password redacted, first.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded. `dotenv` does
// not override what is already there, so `DATABASE_URL=… tsx …` wins over the file.
import "../db/load-env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { and, asc, eq, sql } from "drizzle-orm";

// `rawSql` is the postgres.js tag, imported only to close the pool at the end; `sql` above is
// Drizzle's expression builder, and the two must not share a name.
import { db, sql as rawSql } from "../db/client";
import {
  formationSlots,
  formations,
  lineupSlots,
  lineups,
  matchEvents,
  matchPlayerPositions,
  matchPlayerStats,
  matchSquad,
  matches,
  ratings,
  teamMembers,
  users,
} from "../db/schema";
import {
  clockMsToMinute,
  minuteToClockMs,
  periodEndMs,
  periodOfClockMs,
  periodStartMs,
  regulationMs,
  type PeriodsConfig,
} from "../lib/match/clock";
import {
  matchEventInputSchema,
  orderMatchEvents,
  type MatchEventInput,
  type MatchEventType,
} from "../lib/match/events";
import { finalizeMatchById } from "../lib/match/finalize";
import { deterministicUuid } from "../lib/match/ids";
import type { SlotInfo } from "../lib/match/lineup";
import { reduceMatch, type MatchEventRecord, type MatchState } from "../lib/match/reducer";
import { retroLogIssuesFr } from "../lib/retro/validation";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const BLOCKS_FILE = resolve(process.cwd(), "backlogs/matches-1-3-blocks.json");

/** The Neon preview branch. Anything else is refused unless it is a localhost database. */
const PREVIEW_ENDPOINT = "ep-raspy-fire-zam9gi7k";
/** The Neon production branch. Named so it can be refused by name rather than by omission. */
const PRODUCTION_ENDPOINT = "ep-gentle-cherry";

const TARGET_FORMATION_LABEL = "1-2-3-1";
const COACH_USERNAME = "potter";
const PERIODS: PeriodsConfig = { periodsCount: 2, periodMinutes: 30 };

/**
 * The event types that are *facts* of the match: what the log knows and the paper does not. Read
 * back out of the existing log and re-inserted untouched.
 */
const KEPT_FACT_TYPES = [
  "GOAL_FOR",
  "GOAL_AGAINST",
  "OWN_GOAL",
  "PENALTY_SCORED",
  "PENALTY_MISSED",
  "FOUL",
  "INJURY",
  "COMMENT",
  "REMARK",
] as const satisfies readonly MatchEventType[];

/**
 * The subset of the above that the JSON supplies for a match whose goals are not in the log. Read
 * from the log it would double them on a second run, which is the whole reason this list exists.
 */
const GOAL_FACT_TYPES = [
  "GOAL_FOR",
  "GOAL_AGAINST",
  "OWN_GOAL",
  "PENALTY_SCORED",
] as const satisfies readonly MatchEventType[];

/** Dropped on purpose: see the header. */
const DROPPED_CLOCK_TYPES = ["PAUSE", "RESUME"] as const satisfies readonly MatchEventType[];

/* -------------------------------------------------------------------------- */
/* The blocks file                                                            */
/* -------------------------------------------------------------------------- */

type BlockSlot = { slot: string; player: string };
type Block = { minute: number; slots: BlockSlot[] };

type GoalFor = { minute: number; scorer: string; assist?: string | null };
type GoalAgainst = { minute: number };

type MatchSpec = {
  key: string;
  opponent: string;
  kickoff: string;
  sheet: string;
  expectedScore: { for: number; against: number };
  /** True when production's own log is the truth for the goals; false for the match still `live`. */
  keepGoalsFromExistingLog: boolean;
  goalsFor?: GoalFor[];
  goalsAgainst?: GoalAgainst[];
  blocks: Block[];
};

type BlocksFile = { _note: string; matches: MatchSpec[] };

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

class RebuildError extends Error {}

function fail(message: string): never {
  throw new RebuildError(message);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

/** Trimmed, lowercased, diacritics stripped, inner runs of whitespace collapsed. */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

function table(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: readonly string[]) =>
    cells.map((cell, column) => pad(cell ?? "", widths[column])).join("  ");
  return [line(headers), widths.map((width) => "-".repeat(width)).join("  "), ...rows.map(line)].join(
    "\n",
  );
}

/** A minute, for a readout: `11′`. */
function min(clockMs: number): string {
  return `${clockMsToMinute(clockMs)}′`;
}

/* -------------------------------------------------------------------------- */
/* The slot catalogue, and the paper's left/right                             */
/* -------------------------------------------------------------------------- */

type SlotCatalogue = {
  formationId: string;
  slots: SlotInfo[];
  /** `GB`, `MC`, `AT`, `AIL@160`, `AIL@840`, `DC@330`, `DC@670`. */
  byKey: Map<string, string>;
};

/** The `position_code` and `x` each label of a block means. `x` only where the code is shared. */
const SLOT_KEYS: Readonly<Record<string, { positionCode: string; x?: number }>> = {
  GB: { positionCode: "GB" },
  MC: { positionCode: "MC" },
  AT: { positionCode: "AT" },
  "AIL (left)": { positionCode: "AIL", x: 160 },
  "AIL (right)": { positionCode: "AIL", x: 840 },
  "DC#1": { positionCode: "DC", x: 330 },
  "DC#2": { positionCode: "DC", x: 670 },
};

async function loadSlots(): Promise<SlotCatalogue> {
  const rows = await db
    .select({
      id: formationSlots.id,
      positionCode: formationSlots.positionCode,
      x: formationSlots.x,
      sort: formationSlots.sort,
      formationId: formationSlots.formationId,
    })
    .from(formationSlots)
    .innerJoin(formations, eq(formations.id, formationSlots.formationId))
    .where(eq(formations.label, TARGET_FORMATION_LABEL))
    .orderBy(asc(formationSlots.sort));

  check(rows.length === 7, `La formation ${TARGET_FORMATION_LABEL} a ${rows.length} postes, pas 7.`);

  const byKey = new Map<string, string>();
  for (const [key, wanted] of Object.entries(SLOT_KEYS)) {
    const found = rows.filter(
      (row) =>
        row.positionCode === wanted.positionCode && (wanted.x === undefined || row.x === wanted.x),
    );
    check(
      found.length === 1,
      `« ${key} » → ${wanted.positionCode}${wanted.x === undefined ? "" : `@x=${wanted.x}`} : ` +
        `${found.length} poste(s) correspondent dans ${TARGET_FORMATION_LABEL}.`,
    );
    byKey.set(key, found[0].id);
  }

  return {
    formationId: rows[0].formationId,
    slots: rows.map((row) => ({ id: row.id, positionCode: row.positionCode, sort: row.sort })),
    byKey,
  };
}

/**
 * One block, as `slot_id → member_id`.
 *
 * The two `DC` of a block carry no side in the JSON, so the **written order** is the side: the first
 * is the left one (`x=330`), the second the right one. The two `AIL` do carry it.
 */
function resolveBlock(
  block: Block,
  catalogue: SlotCatalogue,
  memberOf: (name: string, what: string) => string,
  label: string,
): Array<{ slotId: string; memberId: string }> {
  let dcSeen = 0;
  const out: Array<{ slotId: string; memberId: string }> = [];
  for (const entry of block.slots) {
    const key = entry.slot === "DC" ? `DC#${(dcSeen += 1)}` : entry.slot;
    const slotId = catalogue.byKey.get(key);
    check(slotId !== undefined, `${label} / bloc ${block.minute}′ : poste « ${entry.slot} » inconnu.`);
    out.push({ slotId, memberId: memberOf(entry.player, `${label} / bloc ${block.minute}′`) });
  }
  check(
    out.length === 7,
    `${label} / bloc ${block.minute}′ : ${out.length} joueurs sur le terrain, 7 attendus.`,
  );
  check(
    new Set(out.map((row) => row.slotId)).size === 7,
    `${label} / bloc ${block.minute}′ : deux joueurs au même poste.`,
  );
  check(
    new Set(out.map((row) => row.memberId)).size === 7,
    `${label} / bloc ${block.minute}′ : un joueur apparaît deux fois.`,
  );
  return out;
}

/* -------------------------------------------------------------------------- */
/* Planning one match                                                         */
/* -------------------------------------------------------------------------- */

/** One row of the log to be written. `origin` is only ever printed. */
type Draft = {
  id: string;
  clientEventId: string;
  type: MatchEventType;
  period: number;
  minute: number;
  clockMs: number;
  occurredAt: Date;
  recordedAt: Date;
  createdBy: string;
  payload: Record<string, unknown>;
  seq: number;
  origin: "kept" | "built";
};

type KeptFact = {
  id: string;
  clientEventId: string;
  type: MatchEventType;
  period: number;
  minute: number;
  clockMs: number;
  occurredAt: Date;
  recordedAt: Date;
  createdBy: string;
  payload: Record<string, unknown>;
  seq: number;
};

type TargetMatch = {
  id: string;
  teamId: string;
  kickoffAt: Date;
  opponentName: string;
  status: "scheduled" | "live" | "finished";
  periodsCount: number;
  periodMinutes: number;
  entryMode: string;
};

type Plan = {
  spec: MatchSpec;
  target: TargetMatch;
  /** The initial composition this log's 0′ event says was applied. */
  initialLineupId: string;
  /** Every `lineups.id` of the match, whose `applied_event_id` is cleared. */
  lineupIds: string[];
  events: Draft[];
  /** For each block, its index in `events` and the seven it asserts. */
  blocks: Array<{
    minute: number;
    eventIndex: number;
    expected: Array<{ slotId: string; memberId: string }>;
  }>;
  squad: Array<{ memberId: string; role: "starter" | "substitute" }>;
  keptFacts: number;
  droppedClockEvents: Array<{ type: string; minute: number }>;
  state: MatchState;
};

function planMatch(input: {
  spec: MatchSpec;
  target: TargetMatch;
  existing: readonly KeptFact[];
  catalogue: SlotCatalogue;
  lineupRows: ReadonlyArray<{ id: string; fromMinute: number; isInitial: boolean }>;
  initialAssignments: ReadonlyArray<{ slotId: string; memberId: string }>;
  memberOf: (name: string, what: string) => string;
  coachUserId: string;
}): Plan {
  const { spec, target, catalogue, memberOf } = input;
  const label = spec.opponent;

  check(
    target.periodsCount === PERIODS.periodsCount && target.periodMinutes === PERIODS.periodMinutes,
    `${label} : ce script ne sait reconstruire que du ${PERIODS.periodsCount}×${PERIODS.periodMinutes}, ` +
      `et ce match est en ${target.periodsCount}×${target.periodMinutes}.`,
  );
  check(
    normalise(target.opponentName) === normalise(spec.opponent),
    `${label} : adversaire « ${target.opponentName} » en base.`,
  );
  check(
    target.kickoffAt.toISOString().slice(0, 10) === spec.kickoff,
    `${label} : coup d'envoi ${target.kickoffAt.toISOString()} en base, ${spec.kickoff} sur la feuille.`,
  );

  const endMs = regulationMs(PERIODS);
  const kickoffAtMs = target.kickoffAt.getTime();

  /* ---- the blocks -------------------------------------------------------- */

  const blocks = [...spec.blocks].sort((a, b) => a.minute - b.minute);
  check(blocks.length > 0, `${label} : aucun bloc sur la feuille.`);
  check(blocks[0].minute === 0, `${label} : le premier bloc est à ${blocks[0].minute}′, 0′ attendu.`);
  check(
    new Set(blocks.map((block) => block.minute)).size === blocks.length,
    `${label} : deux blocs à la même minute.`,
  );
  for (const block of blocks) {
    check(
      block.minute >= 0 && minuteToClockMs(block.minute) <= endMs,
      `${label} : le bloc ${block.minute}′ sort du temps réglementaire.`,
    );
  }
  const resolvedBlocks = blocks.map((block) => ({
    minute: block.minute,
    clockMs: minuteToClockMs(block.minute),
    assignments: resolveBlock(block, catalogue, memberOf, label),
  }));

  /*
   * The 0′ block is the starting composition, and it says so by naming the match's own `lineups`
   * row. The link is asserted rather than assumed, **by position code and not by slot**: the two
   * `AIL` and the two `DC` are one position each (decisions 157/158), so the stored composition and
   * the paper may disagree about which man stood on which wing while describing the same seven in
   * the same shape. A disagreement about *who* or about the shape aborts.
   */
  const initialLineup = input.lineupRows.find((row) => row.isInitial && row.fromMinute === 0);
  check(
    initialLineup !== undefined,
    `${label} : pas de composition initiale (is_initial, from_minute 0) à laquelle rattacher le 0′.`,
  );
  const byPosition = (rows: ReadonlyArray<{ slotId: string; memberId: string }>) => {
    const index = new Map(catalogue.slots.map((slot) => [slot.id, slot.positionCode]));
    const out = new Map<string, string[]>();
    for (const row of rows) {
      const code = index.get(row.slotId) ?? "?";
      out.set(code, [...(out.get(code) ?? []), row.memberId].sort());
    }
    return [...out].sort().map(([code, members]) => `${code}=${members.join("+")}`).join(" ");
  };
  const paperShape = byPosition(resolvedBlocks[0].assignments);
  const storedShape = byPosition(input.initialAssignments);
  check(
    paperShape === storedShape,
    `${label} : le bloc 0′ et la composition initiale enregistrée ne décrivent pas le même sept.\n` +
      `  feuille : ${paperShape}\n  en base : ${storedShape}`,
  );

  /* ---- the facts --------------------------------------------------------- */

  const excluded = new Set<string>(spec.keepGoalsFromExistingLog ? [] : GOAL_FACT_TYPES);
  const keptFacts = input.existing.filter((row) => !excluded.has(row.type));

  const builtFacts: Array<{ clockMs: number; type: MatchEventType; payload: Record<string, unknown> }> =
    [];
  if (!spec.keepGoalsFromExistingLog) {
    check(
      (spec.goalsFor?.length ?? 0) > 0 || (spec.goalsAgainst?.length ?? 0) > 0,
      `${label} : ses buts doivent venir du JSON et il n'en déclare aucun.`,
    );
    for (const goal of [...(spec.goalsFor ?? [])].sort((a, b) => a.minute - b.minute)) {
      const scorerId = memberOf(goal.scorer, `${label} / buteur ${goal.minute}′`);
      const assistId = goal.assist ? memberOf(goal.assist, `${label} / passeur ${goal.minute}′`) : null;
      builtFacts.push({
        clockMs: minuteToClockMs(goal.minute),
        type: "GOAL_FOR",
        payload: { scorerId, ...(assistId ? { assistId } : {}) },
      });
    }
    for (const goal of [...(spec.goalsAgainst ?? [])].sort((a, b) => a.minute - b.minute)) {
      builtFacts.push({
        clockMs: minuteToClockMs(goal.minute),
        type: "GOAL_AGAINST",
        payload: {},
      });
    }
  } else {
    check(
      (spec.goalsFor?.length ?? 0) === 0 && (spec.goalsAgainst?.length ?? 0) === 0,
      `${label} : ses buts viennent du déroulé enregistré, mais le JSON en déclare aussi. ` +
        "Les deux sources se contrediraient.",
    );
  }

  /* ---- the pending items, facts and blocks ------------------------------- */

  type Pending =
    | { clockMs: number; order: number; kind: "kept-fact"; fact: KeptFact }
    | {
        clockMs: number;
        order: number;
        kind: "built-fact";
        type: MatchEventType;
        payload: Record<string, unknown>;
      }
    | {
        clockMs: number;
        order: number;
        kind: "block";
        minute: number;
        assignments: Array<{ slotId: string; memberId: string }>;
      };

  const pending: Pending[] = [];
  let order = 0;
  // Kept facts first, in their stored `seq` order; then the JSON goals; then the blocks. `order`
  // only breaks ties at an identical reading, and `orderMatchEvents` below owns the real rule.
  for (const fact of [...keptFacts].sort((a, b) => a.clockMs - b.clockMs || a.seq - b.seq)) {
    pending.push({ clockMs: fact.clockMs, order: (order += 1), kind: "kept-fact", fact });
  }
  for (const fact of builtFacts) {
    pending.push({ ...fact, order: (order += 1), kind: "built-fact" });
  }
  for (const block of resolvedBlocks) {
    pending.push({
      clockMs: block.clockMs,
      order: (order += 1),
      kind: "block",
      minute: block.minute,
      assignments: block.assignments,
    });
  }
  pending.sort((a, b) => a.clockMs - b.clockMs || a.order - b.order);

  /* ---- the skeleton ----------------------------------------------------- */

  type Raw = {
    type: MatchEventType;
    period: number;
    clockMs: number;
    payload: Record<string, unknown>;
    kept: KeptFact | null;
  };

  const raws: Raw[] = [];
  const push = (raw: Raw) => raws.push(raw);

  for (let period = 1; period <= PERIODS.periodsCount; period += 1) {
    push({ type: "KICKOFF", period, clockMs: periodStartMs(period, PERIODS), payload: {}, kept: null });

    for (const item of pending) {
      // The boundary belongs to the period that is *starting* (`periodOfClockMs`), which is what puts
      // the 30′ block after the second kick-off rather than before the first period's end.
      if (periodOfClockMs(item.clockMs, PERIODS) !== period) continue;
      if (item.kind === "kept-fact") {
        push({
          type: item.fact.type,
          period,
          clockMs: item.clockMs,
          payload: item.fact.payload,
          kept: item.fact,
        });
      } else if (item.kind === "built-fact") {
        push({ type: item.type, period, clockMs: item.clockMs, payload: item.payload, kept: null });
      } else {
        push({
          type: "LINEUP_APPLIED",
          period,
          clockMs: item.clockMs,
          payload: {
            // Only the 0′ block names a plan: every later one is the pitch as it was, which
            // corresponds to no row in `lineups`.
            ...(item.minute === 0 ? { lineupId: initialLineup.id } : {}),
            slots: item.assignments,
          },
          kept: null,
        });
      }
    }

    push({
      type: "PERIOD_END",
      period,
      clockMs: periodEndMs(period, PERIODS),
      payload: {},
      kept: null,
    });
    if (period === PERIODS.periodsCount) {
      push({ type: "FINAL_WHISTLE", period, clockMs: endMs, payload: {}, kept: null });
    }
  }

  /* ---- the order is `orderMatchEvents`', not this file's ----------------- */

  const provisional = raws.map((raw, index) => ({ raw, seq: index }));
  const ordered = orderMatchEvents(provisional, (item) => ({
    clockMs: item.raw.clockMs,
    seq: item.seq,
    id: String(item.seq),
    type: item.raw.type,
  }));
  // A fixed point: re-ordering the result with its new sequence numbers must move nothing, which is
  // what says the renumbering below has not undone the rule it was just handed.
  const settled = orderMatchEvents(
    ordered.map((item, index) => ({ raw: item.raw, seq: index })),
    (item) => ({
      clockMs: item.raw.clockMs,
      seq: item.seq,
      id: String(item.seq),
      type: item.raw.type,
    }),
  );
  check(
    settled.every((item, index) => item.raw === ordered[index].raw),
    `${label} : l'ordre produit n'est pas un point fixe de orderMatchEvents.`,
  );

  /* ---- identity, deterministic by construction --------------------------- */

  const events: Draft[] = ordered.map((item, index) => {
    const { raw } = item;
    if (raw.kept) {
      return {
        id: raw.kept.id,
        clientEventId: raw.kept.clientEventId,
        type: raw.type,
        period: raw.kept.period,
        minute: raw.kept.minute,
        clockMs: raw.clockMs,
        occurredAt: raw.kept.occurredAt,
        recordedAt: raw.kept.recordedAt,
        createdBy: raw.kept.createdBy,
        payload: raw.payload,
        seq: index,
        origin: "kept",
      };
    }
    const seed = [
      "rebuild-matches",
      target.id,
      String(index),
      raw.type,
      String(raw.period),
      String(raw.clockMs),
      JSON.stringify(raw.payload),
    ].join("|");
    const stamp = new Date(kickoffAtMs + raw.clockMs);
    return {
      id: deterministicUuid([`event-id|${seed}`]),
      clientEventId: deterministicUuid([`client-event-id|${seed}`]),
      type: raw.type,
      period: raw.period,
      minute: clockMsToMinute(raw.clockMs),
      clockMs: raw.clockMs,
      occurredAt: stamp,
      recordedAt: stamp,
      createdBy: input.coachUserId,
      payload: raw.payload,
      seq: index,
      origin: "built",
    };
  });

  check(
    new Set(events.map((event) => event.id)).size === events.length,
    `${label} : deux événements partagent un id.`,
  );
  check(
    new Set(events.map((event) => event.clientEventId)).size === events.length,
    `${label} : deux événements partagent un client_event_id.`,
  );

  /* ---- the squad --------------------------------------------------------- */

  const starters = new Set(resolvedBlocks[0].assignments.map((row) => row.memberId));
  const everOn = new Set(
    resolvedBlocks.flatMap((block) => block.assignments.map((row) => row.memberId)),
  );
  const squad = [...everOn].map((memberId) => ({
    memberId,
    role: (starters.has(memberId) ? "starter" : "substitute") as "starter" | "substitute",
  }));

  /* ---- the reduction, which is the only thing that says what the log means */

  const state = reduceMatch(toRecords(events), [], {
    periodsCount: PERIODS.periodsCount,
    periodMinutes: PERIODS.periodMinutes,
    slots: catalogue.slots,
    squad: squad.map((row) => ({ teamMemberId: row.memberId, role: row.role })),
  });

  const blockIndex = resolvedBlocks.map((block) => {
    const eventIndex = events.findIndex(
      (event) => event.type === "LINEUP_APPLIED" && event.clockMs === block.clockMs,
    );
    check(eventIndex >= 0, `${label} : le bloc ${block.minute}′ n'a pas d'événement.`);
    return { minute: block.minute, eventIndex, expected: block.assignments };
  });

  return {
    spec,
    target,
    initialLineupId: initialLineup.id,
    lineupIds: input.lineupRows.map((row) => row.id),
    events,
    blocks: blockIndex,
    squad,
    keptFacts: keptFacts.length,
    droppedClockEvents: [],
    state,
  };
}

/** The drafts as the reducer and the ingestion schema want them. */
function toRecords(events: readonly Draft[]): MatchEventRecord[] {
  return events.map((event) => ({
    id: event.id,
    clientEventId: event.clientEventId,
    type: event.type,
    period: event.period,
    minute: event.minute,
    clockMs: event.clockMs,
    occurredAt: event.occurredAt,
    payload: event.payload,
    voidsEventId: null,
    seq: event.seq,
  }));
}

function toInputs(events: readonly Draft[]): MatchEventInput[] {
  return events.map((event) => ({
    clientEventId: event.clientEventId,
    type: event.type,
    period: event.period,
    minute: event.minute,
    clockMs: event.clockMs,
    occurredAt: event.occurredAt,
    payload: event.payload,
    voidsEventId: null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Verifying one plan                                                         */
/* -------------------------------------------------------------------------- */

type Verification = {
  blockFailures: string[];
  keeperSpells: Array<{ name: string; fromMs: number; toMs: number | null }>;
  positionFailures: string[];
};

function verifyPlan(
  plan: Plan,
  catalogue: SlotCatalogue,
  nameOf: (memberId: string) => string,
): Verification {
  const label = plan.spec.opponent;

  /* ---- 1. the score ----------------------------------------------------- */

  check(
    plan.state.goalsFor === plan.spec.expectedScore.for &&
      plan.state.goalsAgainst === plan.spec.expectedScore.against,
    `${label} : LE SCORE NE CONCORDE PAS. Le déroulé donne ${plan.state.goalsFor}–` +
      `${plan.state.goalsAgainst}, la feuille annonce ${plan.spec.expectedScore.for}–` +
      `${plan.spec.expectedScore.against}. Rien n'est écrit.`,
  );

  /* ---- 2. every block, replayed ----------------------------------------- */

  /*
   * The whole point of the exercise, and it is asked of the **reducer** rather than of the payload:
   * the log is replayed up to and including each block's own event, and `onPitch` — who is on, in
   * which slot — has to be exactly the seven the paper drew. A payload the reducer reads differently
   * (a man who was already on, a slot taken twice) fails here and nowhere else.
   */
  const blockFailures: string[] = [];
  for (const block of plan.blocks) {
    const prefix = toRecords(plan.events.slice(0, block.eventIndex + 1));
    const state = reduceMatch(prefix, [], {
      periodsCount: PERIODS.periodsCount,
      periodMinutes: PERIODS.periodMinutes,
      slots: catalogue.slots,
    });
    const got = [...state.onPitch]
      .map((entry) => `${entry.slotId ?? "?"}=${entry.memberId}`)
      .sort()
      .join(" ");
    const want = [...block.expected]
      .map((entry) => `${entry.slotId}=${entry.memberId}`)
      .sort()
      .join(" ");
    if (got !== want) {
      const describe = (rows: string[]) =>
        rows
          .map((row) => {
            const [slotId, memberId] = row.split("=");
            const code = catalogue.slots.find((slot) => slot.id === slotId)?.positionCode ?? "?";
            return `${code}:${nameOf(memberId)}`;
          })
          .sort()
          .join(", ");
      blockFailures.push(
        `${label} / bloc ${block.minute}′ : le réducteur a « ${describe(got.split(" "))} », ` +
          `la feuille dit « ${describe(want.split(" "))} »`,
      );
    }
  }

  /* ---- 3. minutes per position add up ----------------------------------- */

  const positionFailures: string[] = [];
  for (const player of plan.state.players) {
    const sum = player.positions.reduce((total, position) => total + position.minutes, 0);
    const unknown = player.positionSpells.some((spell) => spell.positionCode === null);
    if (!unknown && sum !== player.minutes) {
      positionFailures.push(
        `${label} : ${nameOf(player.memberId)} — Σ postes ${sum}′ ≠ minutes ${player.minutes}′`,
      );
    }
    const gb = player.positions.find((position) => position.positionCode === "GB");
    const gbMinutes = gb?.minutes ?? 0;
    if (gbMinutes !== player.gkMinutes) {
      positionFailures.push(
        `${label} : ${nameOf(player.memberId)} — GB ${gbMinutes}′ ≠ gk_minutes ${player.gkMinutes}′`,
      );
    }
  }

  /* ---- 4. the goalkeeper spells ----------------------------------------- */

  const keeperSpells = plan.state.players
    .flatMap((player) =>
      player.positionSpells
        .filter((spell) => spell.positionCode === "GB")
        .map((spell) => ({
          name: nameOf(player.memberId),
          fromMs: spell.fromClockMs,
          toMs: spell.toClockMs,
        })),
    )
    .sort((a, b) => a.fromMs - b.fromMs);

  /* ---- 5. the reducer must not be unhappy ------------------------------- */

  const issues = retroLogIssuesFr(toInputs(plan.events), {
    periods: PERIODS,
    slots: catalogue.slots,
  });
  check(
    issues.length === 0,
    `${label} : le réducteur refuse ce déroulé — ${issues.join(" / ")}\n` +
      plan.state.anomalies.map((anomaly) => `    ${anomaly.code}: ${anomaly.message}`).join("\n"),
  );

  // And the shape the ingestion boundary would have insisted on, even though nothing came from a
  // browser: a payload this script writes has to satisfy the same schema a phone's would.
  for (const input of toInputs(plan.events)) {
    const parsed = matchEventInputSchema.safeParse(input);
    check(
      parsed.success,
      `${label} : un événement ${input.type} à ${min(input.clockMs)} ne passe pas ` +
        `matchEventInputSchema — ${parsed.success ? "" : parsed.error.issues.map((issue) => issue.message).join(" · ")}`,
    );
  }

  return { blockFailures, keeperSpells, positionFailures };
}

/* -------------------------------------------------------------------------- */
/* Writing one plan                                                           */
/* -------------------------------------------------------------------------- */

async function commitPlan(plan: Plan): Promise<void> {
  const matchId = plan.target.id;

  /*
   * One transaction per match. The delete is what decision 179 is about; it is here, next to the
   * insert, so a match is never left with no log at all.
   */
  await db.transaction(async (tx) => {
    await tx.delete(matchEvents).where(eq(matchEvents.matchId, matchId));
    await tx.delete(matchPlayerStats).where(eq(matchPlayerStats.matchId, matchId));
    await tx.delete(matchPlayerPositions).where(eq(matchPlayerPositions.matchId, matchId));

    // Every plan of this match stops claiming to have been applied by an event that no longer
    // exists; the 0′ event below re-establishes the one link the log actually makes.
    await tx.update(lineups).set({ appliedEventId: null }).where(eq(lineups.matchId, matchId));

    await tx.insert(matchEvents).values(
      plan.events.map((event) => ({
        id: event.id,
        matchId,
        clientEventId: event.clientEventId,
        type: event.type,
        period: event.period,
        minute: event.minute,
        clockMs: event.clockMs,
        occurredAt: event.occurredAt,
        recordedAt: event.recordedAt,
        payload: event.payload,
        createdBy: event.createdBy,
        voidsEventId: null,
        seq: event.seq,
      })),
    );

    const zero = plan.events.find(
      (event) => event.type === "LINEUP_APPLIED" && event.clockMs === 0,
    );
    check(zero !== undefined, `${plan.spec.opponent} : pas d'événement de composition à 0′.`);
    await tx
      .update(lineups)
      .set({ appliedEventId: zero.id })
      .where(and(eq(lineups.id, plan.initialLineupId), eq(lineups.matchId, matchId)));

    /*
     * `match_squad` decides who may be rated (decision 159), so a man who played must not lose his
     * row. The paper's names are written; **every row it does not name is left exactly as it is**,
     * which is how production's supporters survive a rebuild that never mentions them.
     */
    for (const row of plan.squad) {
      await tx
        .insert(matchSquad)
        .values({ matchId, teamMemberId: row.memberId, role: row.role })
        .onConflictDoUpdate({
          target: [matchSquad.matchId, matchSquad.teamMemberId],
          set: { role: row.role },
        });
    }
  });

  // Outside the transaction, because it opens its own: the caches, from the log that is now stored.
  const frozen = await finalizeMatchById(plan.target.teamId, plan.target.id);
  check(
    frozen.finished,
    `${plan.spec.opponent} : le match n'a pas pu être figé — pas de coup de sifflet final ?`,
  );
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

function describePlan(
  plan: Plan,
  catalogue: SlotCatalogue,
  nameOf: (memberId: string) => string,
  verification: Verification,
): void {
  const codeOf = (slotId: string | null) =>
    catalogue.slots.find((slot) => slot.id === slotId)?.positionCode ?? "?";

  console.log("");
  console.log(`### ${plan.spec.opponent} — ${plan.spec.kickoff} (${plan.spec.sheet})`);
  console.log(`  match                ${plan.target.id} (${plan.target.status})`);
  console.log(`  composition 0′       ${plan.initialLineupId}`);
  console.log(
    `  score dérivé         ${plan.state.goalsFor}–${plan.state.goalsAgainst} ` +
      `(attendu ${plan.spec.expectedScore.for}–${plan.spec.expectedScore.against})`,
  );
  console.log(
    `  faits conservés      ${plan.keptFacts} relus du déroulé enregistré` +
      (plan.spec.keepGoalsFromExistingLog ? ", buts compris" : ", buts exclus (ils viennent du JSON)"),
  );
  if (plan.droppedClockEvents.length > 0) {
    console.log(
      `  PAUSE/RESUME écartés ${plan.droppedClockEvents
        .map((row) => `${row.type} ${row.minute}′`)
        .join(", ")}`,
    );
  }

  const histogram = new Map<string, number>();
  for (const event of plan.events) histogram.set(event.type, (histogram.get(event.type) ?? 0) + 1);
  console.log(
    `  événements           ${plan.events.length} — ` +
      [...histogram].map(([type, count]) => `${type}×${count}`).join(", "),
  );

  console.log("");
  console.log("  déroulé :");
  for (const event of plan.events) {
    const detail =
      event.type === "LINEUP_APPLIED"
        ? (event.payload.slots as Array<{ slotId: string; memberId: string }>)
            .slice()
            .sort(
              (a, b) =>
                (catalogue.slots.find((slot) => slot.id === a.slotId)?.sort ?? 0) -
                (catalogue.slots.find((slot) => slot.id === b.slotId)?.sort ?? 0),
            )
            .map((slot) => `${codeOf(slot.slotId)} ${nameOf(slot.memberId)}`)
            .join(" · ")
        : describeFactPayload(event.payload, nameOf);
    console.log(
      `    ${padStart(String(event.seq), 3)}  ${padStart(min(event.clockMs), 5)}  p${event.period}  ` +
        `${pad(event.type, 15)} ${pad(event.origin, 6)} ${detail}`,
    );
  }

  console.log("");
  console.log(`  blocs vérifiés       ${plan.blocks.length}`);
  if (verification.blockFailures.length > 0) {
    for (const failure of verification.blockFailures) console.log(`    ÉCHEC ${failure}`);
  } else {
    console.log("    tous les blocs sont reproduits à l'identique (joueurs et postes)");
  }

  console.log("");
  console.log("  gardiens :");
  for (const spell of verification.keeperSpells) {
    console.log(
      `    ${pad(spell.name, 10)} ${padStart(min(spell.fromMs), 5)} → ` +
        `${spell.toMs === null ? "fin" : min(spell.toMs)}`,
    );
  }

  console.log("");
  console.log("  minutes dérivées :");
  console.log(
    table(
      ["joueur", "rôle", "min", "gardien", "propre", "encaissés", "buts", "passes", "postes"],
      [...plan.state.players]
        .sort((a, b) => nameOf(a.memberId).localeCompare(nameOf(b.memberId), "fr"))
        .map((player) => [
          nameOf(player.memberId),
          player.squadRole ?? "—",
          padStart(String(player.minutes), 3),
          padStart(String(player.gkMinutes), 7),
          padStart(String(player.cleanMinutes), 6),
          padStart(String(player.concededWhileOn), 9),
          padStart(String(player.goals), 4),
          padStart(String(player.assists), 6),
          player.positions.map((position) => `${position.positionCode} ${position.minutes}′`).join(", "),
        ]),
    )
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
  );

  if (verification.positionFailures.length > 0) {
    for (const failure of verification.positionFailures) console.log(`    ÉCHEC ${failure}`);
  } else {
    console.log("    Σ minutes par poste = minutes, et GB = minutes de gardien, pour tout le monde");
  }

  const anomalies = plan.state.anomalies;
  console.log("");
  console.log(
    `  anomalies            ${anomalies.length === 0 ? "aucune" : anomalies.map((anomaly) => anomaly.code).join(", ")}`,
  );

  console.log(
    `  feuille de match     ${plan.squad
      .map((row) => `${nameOf(row.memberId)} (${row.role})`)
      .sort()
      .join(", ")}`,
  );
}

function describeFactPayload(
  payload: Record<string, unknown>,
  nameOf: (memberId: string) => string,
): string {
  const parts: string[] = [];
  if (typeof payload.scorerId === "string") parts.push(`buteur ${nameOf(payload.scorerId)}`);
  if (typeof payload.assistId === "string") parts.push(`passe ${nameOf(payload.assistId)}`);
  if (typeof payload.memberId === "string") parts.push(nameOf(payload.memberId));
  if (typeof payload.kind === "string") parts.push(String(payload.kind));
  if (typeof payload.note === "string") parts.push(`« ${payload.note} »`);
  return parts.join(" · ");
}

/* -------------------------------------------------------------------------- */
/* What is in the database afterwards                                         */
/* -------------------------------------------------------------------------- */

/**
 * A digest of everything this script wrote, read back out of the database.
 *
 * Printed so that two `--commit` runs can be compared as text as well as by assertion. It
 * deliberately includes `recorded_at` and excludes nothing: the rows are meant to be identical.
 */
async function digestOf(matchId: string): Promise<string> {
  const events = await db
    .select({
      seq: matchEvents.seq,
      id: matchEvents.id,
      clientEventId: matchEvents.clientEventId,
      type: matchEvents.type,
      period: matchEvents.period,
      minute: matchEvents.minute,
      clockMs: matchEvents.clockMs,
      occurredAt: matchEvents.occurredAt,
      recordedAt: matchEvents.recordedAt,
      payload: matchEvents.payload,
      createdBy: matchEvents.createdBy,
    })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.seq));

  const stats = await db
    .select()
    .from(matchPlayerStats)
    .where(eq(matchPlayerStats.matchId, matchId))
    .orderBy(asc(matchPlayerStats.teamMemberId));

  const positions = await db
    .select()
    .from(matchPlayerPositions)
    .where(eq(matchPlayerPositions.matchId, matchId))
    .orderBy(asc(matchPlayerPositions.teamMemberId), asc(matchPlayerPositions.positionCode));

  const squad = await db
    .select({ memberId: matchSquad.teamMemberId, role: matchSquad.role })
    .from(matchSquad)
    .where(eq(matchSquad.matchId, matchId))
    .orderBy(asc(matchSquad.teamMemberId));

  // `computed_at` is the wall clock of the freeze and the one thing that cannot be stable; it is
  // replaced by a placeholder rather than quietly dropped.
  const serialisable = {
    events,
    stats: stats.map((row) => ({ ...row, computedAt: "<freeze>" })),
    positions,
    squad,
  };
  return JSON.stringify(serialisable, (_key, value) =>
    value instanceof Date ? value.toISOString() : value,
  );
}

async function reportStored(plan: Plan, nameOf: (memberId: string) => string): Promise<void> {
  const [after] = await db
    .select({
      status: matches.status,
      entryMode: matches.entryMode,
      published: matches.ratingsPublishedAt,
    })
    .from(matches)
    .where(eq(matches.id, plan.target.id));

  const [{ count: eventCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, plan.target.id));

  const stats = await db
    .select({
      memberId: matchPlayerStats.teamMemberId,
      minutes: matchPlayerStats.minutes,
      gkMinutes: matchPlayerStats.gkMinutes,
    })
    .from(matchPlayerStats)
    .where(eq(matchPlayerStats.matchId, plan.target.id));

  const positions = await db
    .select({
      memberId: matchPlayerPositions.teamMemberId,
      positionCode: matchPlayerPositions.positionCode,
      minutes: matchPlayerPositions.minutes,
    })
    .from(matchPlayerPositions)
    .where(eq(matchPlayerPositions.matchId, plan.target.id));

  const byMember = new Map<string, { minutes: number; gk: number }>();
  for (const row of stats) byMember.set(row.memberId, { minutes: row.minutes, gk: row.gkMinutes });
  const sums = new Map<string, { total: number; gb: number }>();
  for (const row of positions) {
    const entry = sums.get(row.memberId) ?? { total: 0, gb: 0 };
    entry.total += row.minutes;
    if (row.positionCode === "GB") entry.gb += row.minutes;
    sums.set(row.memberId, entry);
  }

  console.log("");
  console.log(`### ${plan.spec.opponent} — en base`);
  console.log(`  match_events         ${eventCount} (${plan.events.length} planifiés)`);
  console.log(`  statut               ${after.status} · entry_mode ${after.entryMode}`);
  console.log(
    `  notes publiées       ${after.published === null ? "non (inchangé)" : after.published.toISOString()}`,
  );
  console.log(`  match_player_stats   ${stats.length} lignes`);
  console.log(`  match_player_positions ${positions.length} lignes`);

  check(
    Number(eventCount) === plan.events.length,
    `${plan.spec.opponent} : ${eventCount} événements en base pour ${plan.events.length} planifiés.`,
  );
  check(
    after.status === "finished",
    `${plan.spec.opponent} : statut ${after.status}, « finished » attendu.`,
  );

  for (const [memberId, totals] of sums) {
    const stat = byMember.get(memberId);
    check(stat !== undefined, `${plan.spec.opponent} : ${nameOf(memberId)} a des postes sans stats.`);
    check(
      totals.total === stat.minutes,
      `${plan.spec.opponent} : ${nameOf(memberId)} — Σ match_player_positions ${totals.total}′ ` +
        `≠ match_player_stats.minutes ${stat.minutes}′`,
    );
    check(
      totals.gb === stat.gk,
      `${plan.spec.opponent} : ${nameOf(memberId)} — GB ${totals.gb}′ ≠ gk_minutes ${stat.gk}′`,
    );
  }
  console.log("  Σ postes = minutes et GB = gk_minutes vérifiés sur les tables figées");
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");

  /* ---- the guard, before anything is read ------------------------------- */

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL n'est pas défini.");
  if (url.includes(PRODUCTION_ENDPOINT)) {
    fail(
      `Cette base est la PRODUCTION (${PRODUCTION_ENDPOINT}). Ce script ne s'y exécute jamais : ` +
        "la décision 179 est explicitement limitée à la préproduction.",
    );
  }
  const isPreview = url.includes(PREVIEW_ENDPOINT);
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isPreview && !isLocal) {
    fail(
      `Cette base n'est ni la préproduction (${PREVIEW_ENDPOINT}) ni une base locale ` +
        `(${redact(url)}). Refusé.`,
    );
  }
  if (url.includes("-pooler")) {
    fail(
      "Cette URL passe par le pooler Neon. Utilise le point d'entrée direct : une connexion " +
        "mutualisée peut porter un search_path vide laissé par un pg_restore, et l'application " +
        "répond alors 500 partout (COORDINATION.md).",
    );
  }

  console.log("## Reconstruction des matchs 1 à 3 depuis les feuilles papier (décision 179)");
  console.log(`base      ${redact(url)}`);
  console.log(`cible     ${isPreview ? "préproduction Neon" : "base locale"}`);
  console.log(
    `mode      ${commit ? "ÉCRITURE (--commit)" : "simulation (ajoute --commit pour écrire)"}`,
  );

  /* ---- the sheets ------------------------------------------------------- */

  const file = JSON.parse(readFileSync(BLOCKS_FILE, "utf8")) as BlocksFile;
  check(Array.isArray(file.matches) && file.matches.length > 0, `${BLOCKS_FILE} ne décrit aucun match.`);
  console.log(
    `feuilles  ${file.matches.length} matchs, ` +
      `${file.matches.reduce((total, spec) => total + spec.blocks.length, 0)} blocs`,
  );

  /* ---- the matches, the members and the slots --------------------------- */

  const targetRows = await db
    .select({
      id: matches.id,
      teamId: matches.teamId,
      kickoffAt: matches.kickoffAt,
      opponentName: matches.opponentName,
      status: matches.status,
      periodsCount: matches.periodsCount,
      periodMinutes: matches.periodMinutes,
      entryMode: matches.entryMode,
    })
    .from(matches);

  const targets = new Map<string, TargetMatch>();
  for (const spec of file.matches) {
    const found = targetRows.filter(
      (row) =>
        normalise(row.opponentName) === normalise(spec.opponent) &&
        row.kickoffAt.toISOString().slice(0, 10) === spec.kickoff,
    );
    check(
      found.length === 1,
      `« ${spec.opponent} » du ${spec.kickoff} : ${found.length} match(s) correspondent. ` +
        "Un et un seul est attendu, et aucun n'est créé ici.",
    );
    targets.set(spec.key, { ...found[0], kickoffAt: new Date(found[0].kickoffAt) });
  }
  const teamIds = new Set([...targets.values()].map((target) => target.teamId));
  check(teamIds.size === 1, "Les matchs visés n'appartiennent pas à la même équipe.");
  const teamId = [...teamIds][0];

  const members = await db
    .select({
      membershipId: teamMembers.id,
      displayName: users.displayName,
      isPlayer: teamMembers.isPlayer,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));

  /*
   * Name → membership, accent- and case-insensitively, and **exactly one or abort**. « Léo M » and
   * « Léo C » normalise to « leo m » and « leo c », which is why this is a lookup and never a
   * fuzzy match: the two are different people and a near miss would silently credit one with the
   * other's match.
   */
  const byName = new Map<string, string[]>();
  for (const member of members) {
    const key = normalise(member.displayName);
    byName.set(key, [...(byName.get(key) ?? []), member.membershipId]);
  }
  const byMembershipId = new Map(members.map((member) => [member.membershipId, member.displayName]));
  const nameOf = (memberId: string) => byMembershipId.get(memberId) ?? memberId;
  const memberOf = (name: string, what: string): string => {
    const candidates = byName.get(normalise(name)) ?? [];
    check(
      candidates.length === 1,
      `${what} : « ${name} » correspond à ${candidates.length} membre(s) de cette équipe. ` +
        "Un et un seul est attendu — rien n'est deviné.",
    );
    return candidates[0];
  };

  const catalogue = await loadSlots();

  const [coach] = await db
    .select({ userId: users.id, role: teamMembers.role, displayName: users.displayName })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.username, COACH_USERNAME)))
    .limit(1);
  check(coach !== undefined, `Aucun membre « ${COACH_USERNAME} » dans cette équipe.`);
  check(coach.role === "coach", `« ${COACH_USERNAME} » n'est pas coach.`);
  console.log(`auteur    ${coach.displayName} (users.id ${coach.userId})`);

  /* ---- plan every match ------------------------------------------------- */

  const plans: Plan[] = [];
  for (const spec of file.matches) {
    const target = targets.get(spec.key);
    check(target !== undefined, `${spec.opponent} : match cible introuvable.`);

    const existingRows = await db
      .select({
        id: matchEvents.id,
        clientEventId: matchEvents.clientEventId,
        type: matchEvents.type,
        period: matchEvents.period,
        minute: matchEvents.minute,
        clockMs: matchEvents.clockMs,
        occurredAt: matchEvents.occurredAt,
        recordedAt: matchEvents.recordedAt,
        createdBy: matchEvents.createdBy,
        payload: matchEvents.payload,
        voidsEventId: matchEvents.voidsEventId,
        seq: matchEvents.seq,
      })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, target.id))
      .orderBy(asc(matchEvents.seq));

    /*
     * A voided event would mean the stored log already disagrees with itself, and the rebuild has no
     * rule for which half of a correction to keep. None of the three matches has one; if one appears,
     * that is a decision to take rather than a case to guess.
     */
    const voids = existingRows.filter(
      (row) => row.type === "VOID" || row.voidsEventId !== null,
    );
    check(
      voids.length === 0,
      `${spec.opponent} : le déroulé enregistré contient ${voids.length} annulation(s). ` +
        "Ce script ne sait pas quoi en faire : rien n'est reconstruit.",
    );

    const dropped = existingRows
      .filter((row) => (DROPPED_CLOCK_TYPES as readonly string[]).includes(row.type))
      .map((row) => ({ type: row.type, minute: row.minute }));

    const keptTypes = new Set<string>(KEPT_FACT_TYPES);
    const existing: KeptFact[] = existingRows
      .filter((row) => keptTypes.has(row.type))
      .map((row) => ({
        id: row.id,
        clientEventId: row.clientEventId,
        type: row.type,
        period: row.period,
        minute: row.minute,
        clockMs: row.clockMs,
        occurredAt: new Date(row.occurredAt),
        recordedAt: new Date(row.recordedAt),
        createdBy: row.createdBy,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        seq: row.seq,
      }));

    const lineupRows = await db
      .select({ id: lineups.id, fromMinute: lineups.fromMinute, isInitial: lineups.isInitial })
      .from(lineups)
      .where(eq(lineups.matchId, target.id))
      .orderBy(asc(lineups.fromMinute));

    const initialLineup = lineupRows.find((row) => row.isInitial && row.fromMinute === 0);
    check(
      initialLineup !== undefined,
      `${spec.opponent} : pas de composition initiale à laquelle rattacher le bloc 0′.`,
    );
    const initialAssignments = await db
      .select({ slotId: lineupSlots.formationSlotId, memberId: lineupSlots.teamMemberId })
      .from(lineupSlots)
      .where(eq(lineupSlots.lineupId, initialLineup.id));

    const plan = planMatch({
      spec,
      target,
      existing,
      catalogue,
      lineupRows,
      initialAssignments,
      memberOf,
      coachUserId: coach.userId,
    });
    plan.droppedClockEvents = dropped;
    plans.push(plan);
  }

  /* ---- say what it would do, and check it ------------------------------- */

  console.log("");
  console.log("## Résumé et vérifications");

  const verifications = new Map<string, Verification>();
  for (const plan of plans) {
    const verification = verifyPlan(plan, catalogue, nameOf);
    verifications.set(plan.spec.key, verification);
    describePlan(plan, catalogue, nameOf, verification);
  }

  const blockFailures = plans.flatMap(
    (plan) => verifications.get(plan.spec.key)?.blockFailures ?? [],
  );
  const positionFailures = plans.flatMap(
    (plan) => verifications.get(plan.spec.key)?.positionFailures ?? [],
  );
  const totalBlocks = plans.reduce((total, plan) => total + plan.blocks.length, 0);

  console.log("");
  console.log(
    `## ${totalBlocks - blockFailures.length}/${totalBlocks} blocs reproduits, ` +
      `${positionFailures.length} désaccord(s) de minutes par poste`,
  );
  check(
    blockFailures.length === 0,
    `${blockFailures.length} bloc(s) ne sont pas reproduits :\n  ${blockFailures.join("\n  ")}`,
  );
  check(
    positionFailures.length === 0,
    `Les minutes par poste ne bouclent pas :\n  ${positionFailures.join("\n  ")}`,
  );

  if (!commit) {
    console.log("");
    console.log("Simulation terminée : rien n'a été écrit en base. Relance avec --commit.");
    return;
  }

  /* ---- write ------------------------------------------------------------ */

  console.log("");
  console.log("## Écriture");
  const before = new Map<string, string>();
  for (const plan of plans) before.set(plan.spec.key, await digestOf(plan.target.id));

  for (const plan of plans) {
    console.log(`${plan.spec.opponent} …`);
    await commitPlan(plan);
    console.log("  écrit et figé.");
  }

  console.log("");
  console.log("## Vérification en base");
  for (const plan of plans) await reportStored(plan, nameOf);

  console.log("");
  console.log("## Idempotence");
  for (const plan of plans) {
    const after = await digestOf(plan.target.id);
    const previous = before.get(plan.spec.key) ?? "";
    console.log(
      `  ${pad(plan.spec.opponent, 22)} empreinte ${after.length} octets — ` +
        (previous === after
          ? "identique à avant cette écriture (rien n'a changé)"
          : "différente d'avant cette écriture"),
    );
  }
  console.log(
    "  Relance ce script avec --commit : les empreintes « avant » et « après » doivent alors " +
      "être identiques pour les trois matchs.",
  );

  const [{ count: ratingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ratings);
  console.log("");
  console.log(`notes (ratings) en base : ${ratingCount} — ce script n'en touche aucune.`);
}

main()
  .then(async () => {
    await rawSql.end();
  })
  .catch(async (error: unknown) => {
    console.error("");
    console.error(error instanceof RebuildError ? `ABANDON : ${error.message}` : error);
    await rawSql.end().catch(() => undefined);
    process.exitCode = 1;
  });
