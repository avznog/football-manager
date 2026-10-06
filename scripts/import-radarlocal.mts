/**
 * Import the two historical matches of the old app (« RadarLocal » / "FC Manager") into this one.
 *
 * Run it:
 *
 * ```bash
 * DATABASE_URL='postgresql://football:…@localhost:5432/football_prod' \
 *   npx tsx --conditions=react-server scripts/import-radarlocal.mts            # dry run
 * DATABASE_URL='…' npx tsx --conditions=react-server scripts/import-radarlocal.mts --commit
 * ```
 *
 * `--conditions=react-server` is not optional: `db/client.ts` and the whole `lib/match` tree are
 * `import "server-only"`, whose `default` export throws. Every other script in this repo that touches
 * the database is launched the same way (`npm run db:seed`, `npm run db:bootstrap`). The extension is
 * `.mts` because tsx's CJS output has no top-level `await`.
 *
 * ## What it does
 *
 * `audit/radarlocal/*.json` is a verbatim export of the old app's Supabase tables (see
 * `audit/radarlocal/MANIFEST.md`). Two matches, both already present in *this* database as rows
 * somebody typed into the calendar by hand, with **no log at all**. This script writes the log.
 *
 * For each of the two matches, in this order:
 *
 *  1. an initial `lineups` row (`is_initial`, `from_minute = 0`) on the built-in **1-2-3-1**
 *     formation, plus its seven `lineup_slots`;
 *  2. `match_squad`: the starting seven as `starter`, whoever came on as `substitute`, and the old
 *     app's `role: "supporter"` rows as `supporter`;
 *  3. the event log, synthesised by **`buildRetroLog`** — the application's own retro-entry path —
 *     from the starting seven, the substitutions and the facts of the match, then written through
 *     **`amendMatchEvents`** and frozen through **`finalizeMatchById`**;
 *  4. `matches.entry_mode = 'retro'`, which is a label and nothing else (decision 013);
 *  5. the ratings, from the **final means the owner supplied** (`RATING_MEANS` below), written as if
 *     every player who played had given every other player that other player's mean.
 *
 * Nothing is hand-rolled: no SQL writes `match_events`, and no arithmetic here produces a score, a
 * minute or a goal tally. The score and the minutes are whatever `reduceMatch` derives from the log
 * (invariant 2), and the script **asserts** that the derived score equals the old app's own cached
 * `goals_for`/`goals_against` before it commits anything. If it does not, it refuses and says so.
 *
 * ## Why this is a copy of `submitRetroMatch` rather than a call to it
 *
 * `lib/retro/actions.ts` is the right code and cannot be called from a command line: it begins with
 * `requireActor()` (a session cookie), calls `assertCan()` against that actor, and ends in
 * `redirect()`. So this script replicates its **sequence** — build the `RetroEntry`, derive the
 * submission id from the sheet, `findRetroIssues` + `blockingRetroIssues`, `retroLogIssuesFr`,
 * squad upsert, `amendMatchEvents`, `entry_mode` — and skips only the three request-bound parts:
 * authentication, cache revalidation and the redirect. The permission check is not skipped so much
 * as answered by construction: the actor handed to `amendMatchEvents` is Benjamin's real coach
 * membership, read from the database, and `can()` still runs inside it.
 *
 * **One ugly consequence, declared rather than hidden.** `amendMatchEvents` ends with
 * `revalidatePath()`, which throws `Invariant: static generation store missing` outside a Next
 * request. That happens *after* the insert and *after* `finalizeMatchById`, so the write is complete
 * when it fires. The call is therefore wrapped in a `try` that re-throws anything which is not
 * exactly that invariant, and the write is then verified by reading the log back out of the database
 * rather than by trusting the return value we never received.
 *
 * ## Assumptions, every one of them
 *
 *  - **The matches already exist and are not created here.** They are matched by `kickoff_at` *and*
 *    opponent (accent- and case-insensitively), and the script asserts that each target match has
 *    `periods_count = 2`, `period_minutes = 30` (= the old app's `duration: 60`), no `match_events`
 *    and no `lineups`. Anything else aborts.
 *  - **Old formation `2-3-1` is this app's built-in `1-2-3-1`.** The old app counted outfield players
 *    and this one counts the goalkeeper too. The slot map is `GK→GB`, `DEF_L→the DC at x=330`,
 *    `DEF_R→the DC at x=670`, `MID_L→MG`, `MID_C→MC`, `MID_R→MD`, `ATT→AT`, resolved by querying
 *    `formation_slots`; no uuid is hardcoded.
 *  - **Players are mapped by name, declared in `OLD_TO_TARGET_DISPLAY_NAME` below and verified
 *    against the database.** The old `profiles.full_name` is free text and mixes first names,
 *    "Prénom NOM" and nicknames, so the pairing is a judgement that cannot be computed: « Leo COACH »
 *    is « Léo C » and « Léo Montpre » is « Léo M », and no edit distance tells you which way round.
 *    What *is* computed is the verification: every declared target must resolve to exactly one
 *    `team_members` row (joined on `users.display_name`, trimmed and accent-insensitive), and where
 *    the old app recorded a jersey number it must equal the target's. Any miss, duplicate or
 *    disagreement aborts before a single row is written.
 *  - **« Alexis CHARRIER » maps to nobody**, and the script asserts he is referenced by no lineup,
 *    goal, assist or substitution row. Target member « Raphaël » is simply unused.
 *  - **The seven rows per match with a non-null `slot` are the starters**, and the ten with a null
 *    one are substitutes or supporters, as the manifest states.
 *  - **Substitutions at the same minute are applied in `created_at` order.** The old app stores only
 *    a minute, and four changes at 20′ only replay coherently in the order they were typed;
 *    `retroPitch` sorts stably on the order of `RetroEntry.actions`, so that order is the data.
 *  - **Every minute is taken as given** — `guessedStamps` must come out 0. The old app recorded a
 *    minute for every goal and every change, so none of decision 048's midpoint guessing applies,
 *    and the script asserts as much.
 *  - **No `PAUSE`/`RESUME` is emitted.** A stoppage would shorten the derived minutes, and the old
 *    app has no record of one.
 *  - **The old `lineups.minutes_played`, `goals` and `assists` are ignored as inputs.** They are the
 *    old app's own stored numbers and this app derives all three from the log (invariant 2). The
 *    script prints the delta rather than resolving it, so a disagreement is visible instead of
 *    forced into agreement. On the import of 2026-10-06 there was none: all 24 rows came out with a
 *    delta of 0, and the goals and assists agreed too — so the manifest's warning that
 *    `minutes_played` « does not obviously reconcile with the substitution minutes » turns out to be
 *    untrue of these two matches. Do not take that as a guarantee for a third one.
 *  - **`goals_conceded` has no scorer and no own-goal flag**, so each conceded goal becomes a bare
 *    `GOAL_AGAINST` with an empty payload. `goals_conceded_lineup` is not read: who was on the pitch
 *    at that moment is derived by the reducer from the log, and importing it would be storing a
 *    derived quantity (invariant 2).
 *  - **`match_events.created_by` is Benjamin's `users.id`** (`display_name = 'Benjamin'`,
 *    `username = 'potter'`). Somebody has to own these rows and he is the coach doing the import.
 *  - **The ratings are the owner's final means, not the old app's rows.** `ratings_mine.json` — the
 *    twenty notes Benjamin himself gave, the only ones RLS let out of the old database — is
 *    **deliberately not read any more**; see `RATING_MEANS` below for why, and for the shape the
 *    notes take instead.
 *  - **One injury is declared rather than imported**, because the old app had no injury concept at
 *    all: see `INJURIES`.
 *  - **`matches.ratings_published_at` is left null**: the means stay hidden until the owner decides.
 *    Publishing is his switch and never this script's.
 *  - **`match_availability` is not written.** `availabilities.json` exists but is out of scope here.
 *
 * ## Idempotency and transactions
 *
 * Re-runnable by construction. The `client_event_id` of every event is `retroEventId(submissionId,
 * i)` where the submission id is `retroSubmissionId([retroEntrySeed(matchId, sheet)])` — a pure
 * function of the sheet — so a second run produces the same ids and `amendMatchEvents` answers
 * « already stored » without inserting anything. The `lineups.id` is likewise **derived** from the
 * match id rather than drawn at random: a random one would change `retroEntrySeed` through
 * `lineupId` and so change every `client_event_id`, which would make the second run write a second
 * log. Squad, lineup slots and ratings are all `onConflictDoNothing`.
 *
 * The rows this script owns — lineup, slots, squad, ratings — are written inside one transaction per
 * match. The log itself is **not** inside it, and cannot be: `amendMatchEvents` and
 * `finalizeMatchById` open their own transactions on the shared `db` handle (that row lock is how
 * two phones flushing the same match do not race for a `seq`), and passing them a `tx` would mean
 * forking them. What makes that safe is the idempotency above: a run that dies halfway is re-run,
 * not repaired.
 *
 * ## Safety
 *
 * It refuses any `DATABASE_URL` that is not on `localhost`/`127.0.0.1` unless `--allow-remote` is
 * passed, and it prints the database it is about to touch (password redacted) before doing anything.
 * Production is a deliberate act, never a default.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded. `dotenv` does
// not override what is already there, so `DATABASE_URL=… tsx …` wins over the file — which is how
// this script is pointed at `football_prod` rather than at the development database.
import "../db/load-env";

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

// `rawSql` is the postgres.js tag, imported only to close the pool at the end; `sql` above is
// Drizzle's expression builder, and the two must not share a name.
import { db, sql as rawSql } from "../db/client";
import {
  formationSlots,
  formations,
  lineupSlots,
  lineups,
  matchEvents,
  matchPlayerStats,
  matchSquad,
  matches,
  ratings,
  teamMembers,
  users,
} from "../db/schema";
import type { Actor } from "../lib/auth/can";
import { amendMatchEvents } from "../lib/match/append";
import { finalizeMatchById } from "../lib/match/finalize";
import type { SlotInfo } from "../lib/match/lineup";
import { reduceMatch } from "../lib/match/reducer";
import {
  buildRetroLog,
  retroEntrySeed,
  retroEventRecords,
  retroSubmissionId,
  type RetroAction,
  type RetroEntry,
  type RetroStarter,
} from "../lib/retro/log";
import {
  blockingRetroIssues,
  findRetroIssues,
  retroLogIssuesFr,
  retroSubmitSchema,
} from "../lib/retro/validation";

/* -------------------------------------------------------------------------- */
/* The export, as the old app shaped it                                       */
/* -------------------------------------------------------------------------- */

const EXPORT_DIR = resolve(process.cwd(), "audit/radarlocal");

type OldProfile = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  is_admin: boolean;
};

type OldMatch = {
  id: string;
  opponent: string;
  match_date: string;
  competition: string;
  formation: string;
  status: string;
  goals_for: number;
  goals_against: number;
  venue: string;
  duration: number;
};

/** The old app's seven slot codes. Nothing else ever appears in `lineups.slot`. */
const OLD_SLOTS = ["GK", "DEF_L", "DEF_R", "MID_L", "MID_C", "MID_R", "ATT"] as const;
type OldSlot = (typeof OLD_SLOTS)[number];

type OldLineup = {
  match_id: string;
  player_id: string;
  role: "player" | "supporter";
  slot: OldSlot | null;
  minutes_played: number;
  goals: number;
  assists: number;
};

type OldGoalFor = {
  match_id: string;
  minute: number;
  scorer_id: string | null;
  assist_id: string | null;
};

type OldGoalConceded = { match_id: string; minute: number };

type OldSubstitution = {
  match_id: string;
  minute: number;
  player_off: string;
  player_on: string;
  created_at: string;
};

function readExport<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(EXPORT_DIR, file), "utf8")) as T;
}

/* -------------------------------------------------------------------------- */
/* The three mappings this import rests on                                    */
/* -------------------------------------------------------------------------- */

/**
 * Old `profiles.full_name`, **verbatim including its trailing spaces**, to this app's
 * `users.display_name`.
 *
 * Declared rather than computed, because it is a judgement: « Leo COACH » is Léo C and « Léo
 * Montpre » is Léo M, and nothing in the two strings says which of the two « Léo »s each one is.
 * `null` means « this person has no counterpart in this team », which the verification then holds to
 * its word by asserting he is referenced nowhere in the match data.
 */
const OLD_TO_TARGET_DISPLAY_NAME: Readonly<Record<string, string | null>> = {
  Samuel: "Samuel",
  Lucas: "Lucas",
  Nicolas: "Nicolas",
  "Lucien ": "Lucien",
  Edouard: "Édouard",
  Charles: "Charles",
  Clément: "Clément",
  Benoît: "Benoît",
  "Maxime Goulard ": "Maxime",
  "Leo COACH": "Léo C",
  Pierre: "Pierre",
  Rémi: "Rémi",
  "Léo Montpre": "Léo M",
  "Nicodème (gronaldo)": "Nicodème",
  "Thomas Brunet": "Thomas",
  "Benjamin Gonzva": "Benjamin",
  "Alexis CHARRIER": null,
};

/** Old slot code to the `position_code` + `x` of the 1-2-3-1 slot it means. */
const SLOT_MAP: Readonly<Record<OldSlot, { positionCode: string; x?: number }>> = {
  GK: { positionCode: "GB" },
  DEF_L: { positionCode: "DC", x: 330 },
  DEF_R: { positionCode: "DC", x: 670 },
  MID_L: { positionCode: "MG" },
  MID_C: { positionCode: "MC" },
  MID_R: { positionCode: "MD" },
  ATT: { positionCode: "AT" },
};

/** Old match id to the `matches.id` it is in this database, plus the identity to check it against. */
const MATCH_MAP: ReadonlyArray<{ oldId: string; targetId: string }> = [
  {
    oldId: "4aba4be3-fae5-4e56-8980-1233c52a1d75",
    targetId: "b777ba19-29b0-493e-925a-38bd14ca96e6",
  },
  {
    oldId: "e67b0d73-386a-4fbb-9b48-2dacec240b52",
    targetId: "d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a",
  },
];

/**
 * **The injuries, which come from the owner and from nowhere else.**
 *
 * There is no source row to go looking for: the old app had no injury concept at all, so no
 * `audit/radarlocal/*.json` file mentions one. Benoît broke his fibula at the 36th minute of the
 * Galacticos match, the owner remembers it, and that is the whole provenance of this table. Anything
 * added here is a declaration of the same kind.
 *
 * `player` is the **target** `users.display_name`, matched accent- and case-insensitively like every
 * other name in this script, and an unmatched one aborts rather than being skipped.
 *
 * It becomes a normal `INJURY` fact of the sheet, which means two things worth knowing. The reducer
 * only *flags* it — `player.injuries += 1` and an `"injured"` actor — and never ends a spell, moves a
 * minute or empties a slot (decision 011: an injury flags, it never blocks), so Benoît's derived
 * minutes stay the 15 the substitutions imply. And `buildRetroLog` emits the **facts** of a minute
 * before the **substitutions** of that minute, so an injury at the very minute the player was taken
 * off still lands while he is on the pitch — which is both what `findRetroIssues` asks and the order
 * the stored `seq` ends up in.
 */
const INJURIES: ReadonlyArray<{ opponent: string; minute: number; player: string }> = [
  { opponent: "Galacticos de Balard", minute: 36, player: "Benoît" },
];

/**
 * **The ratings, as the owner finally gave them: one mean per player per match.**
 *
 * `audit/radarlocal/ratings_mine.json` is **not** read any more, and this is the reason. Those were
 * Benjamin's own twenty notes — all RLS let out of the old database — and they are *superseded*: the
 * owner supplied the final means, which already incorporate his notes. Loading both would collide on
 * `unique(match_id, rater_member_id, rated_member_id)` for every pair he rated, and the surviving row
 * would be whichever got there first — one man's opinion contradicting the figure the season is
 * supposed to show.
 *
 * `mean` is the owner's number verbatim. `rounded` is what will actually be stored, declared here so
 * that the arithmetic below is *checked against a statement* rather than trusted: `numeric(3,1)`
 * rounds silently on insert (decision 144 says so in as many words, and concludes that an import
 * script owns its own precision), so the rounding is done explicitly, logged before/after, and
 * compared with this column. A disagreement aborts.
 *
 * `player` is the target `users.display_name`, resolved accent- and case-insensitively, which is why
 * « benoit », « remi » and « leo m » are written the way the owner wrote them.
 */
const RATING_MEANS: ReadonlyArray<{
  opponent: string;
  players: ReadonlyArray<{ player: string; mean: number; rounded: number }>;
}> = [
  {
    opponent: "Galacticos de Balard",
    players: [
      { player: "pierre", mean: 6.5, rounded: 6.5 },
      { player: "samuel", mean: 4.5, rounded: 4.5 },
      { player: "thomas", mean: 4.5, rounded: 4.5 },
      { player: "lucas", mean: 4.45, rounded: 4.5 },
      { player: "benoit", mean: 4.18, rounded: 4.2 },
      { player: "charles", mean: 4.05, rounded: 4.1 },
      { player: "benjamin", mean: 4.0, rounded: 4.0 },
      { player: "remi", mean: 3.9, rounded: 3.9 },
      { player: "nicolas", mean: 3.8, rounded: 3.8 },
      { player: "clement", mean: 3.65, rounded: 3.7 },
      { player: "leo m", mean: 3.55, rounded: 3.6 },
    ],
  },
  {
    opponent: "FC Hexagone",
    players: [
      { player: "pierre", mean: 7.45, rounded: 7.5 },
      { player: "lucien", mean: 7.27, rounded: 7.3 },
      { player: "maxime", mean: 7.09, rounded: 7.1 },
      { player: "nicolas", mean: 7.09, rounded: 7.1 },
      { player: "samuel", mean: 6.5, rounded: 6.5 },
      { player: "edouard", mean: 6.41, rounded: 6.4 },
      { player: "lucas", mean: 6.32, rounded: 6.3 },
      { player: "nicodeme", mean: 6.23, rounded: 6.2 },
      { player: "charles", mean: 5.73, rounded: 5.7 },
      { player: "clement", mean: 5.32, rounded: 5.3 },
    ],
  },
];

const TARGET_FORMATION_LABEL = "1-2-3-1";
const COACH_USERNAME = "potter";
const PERIODS = { periodsCount: 2, periodMinutes: 30 } as const;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

class ImportError extends Error {}

function fail(message: string): never {
  throw new ImportError(message);
}

/**
 * An assertion, declared as one: `asserts condition` is what lets the lines after `check(row !==
 * undefined, …)` read `row.id` without a second `!` the compiler would not have checked.
 */
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

/**
 * The nearest tenth, halves going **up**.
 *
 * The `toFixed` is belt and braces, and the comment that used to sit here claiming otherwise was
 * **checked and found false**: it said `3.55 * 10` is `35.499999999999996` so the naive
 * `Math.round(value * 10) / 10` would give 3.5. It is exactly `35.5`, and the naive form returns the
 * owner's answer for all twenty-one means in `RATING_MEANS`. Kept anyway, because a mean arriving at
 * a tie is the one input where a representation error one bit below the halfway point would flip the
 * stored note silently, and `RATING_MEANS` declares its own `rounded` column precisely so that a
 * future figure which *does* hit that case fails the check instead of being stored wrong. `toFixed`
 * on the scaled value collapses the representation before the rounding decision — « the decimal the
 * owner wrote », not « the binary we stored » — and `Math.round` is half-up for non-negative values.
 */
function roundToTenth(value: number): number {
  return Math.round(Number((value * 10).toFixed(6))) / 10;
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

/**
 * A small fixed-width table. Everything is left-aligned; a caller that wants a column right-aligned
 * pads the cell itself with `padStart` before handing it over.
 */
function table(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: readonly string[]) =>
    cells.map((cell, column) => pad(cell ?? "", widths[column])).join("  ");
  return [
    line(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(line),
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* What the database says                                                     */
/* -------------------------------------------------------------------------- */

type TargetMember = {
  membershipId: string;
  userId: string;
  displayName: string;
  jerseyNumber: number | null;
  isPlayer: boolean;
};

type ResolvedPlayer = {
  oldId: string;
  oldName: string;
  oldJersey: number | null;
  membershipId: string;
  displayName: string;
  jerseyNumber: number | null;
};

async function loadMembers(teamId: string): Promise<TargetMember[]> {
  return db
    .select({
      membershipId: teamMembers.id,
      userId: users.id,
      displayName: users.displayName,
      jerseyNumber: teamMembers.jerseyNumber,
      isPlayer: teamMembers.isPlayer,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
}

/**
 * Turn the declared name table into old-id → membership, and refuse to continue on any
 * disagreement: an unmatched name, two members sharing one name, or a jersey number that differs
 * from the one the old app recorded.
 */
function resolvePlayers(
  profiles: readonly OldProfile[],
  members: readonly TargetMember[],
): { byOldId: Map<string, ResolvedPlayer>; unmapped: OldProfile[] } {
  const byName = new Map<string, TargetMember[]>();
  for (const member of members) {
    const key = normalise(member.displayName);
    byName.set(key, [...(byName.get(key) ?? []), member]);
  }

  const byOldId = new Map<string, ResolvedPlayer>();
  const unmapped: OldProfile[] = [];
  const takenMemberships = new Map<string, string>();

  for (const profile of profiles) {
    if (!(profile.full_name in OLD_TO_TARGET_DISPLAY_NAME)) {
      fail(
        `« ${profile.full_name} » n'est pas dans OLD_TO_TARGET_DISPLAY_NAME : ` +
          "l'export a changé, la table de correspondance doit être revue à la main.",
      );
    }
    const target = OLD_TO_TARGET_DISPLAY_NAME[profile.full_name];
    if (target === null) {
      unmapped.push(profile);
      continue;
    }

    const candidates = byName.get(normalise(target)) ?? [];
    check(
      candidates.length === 1,
      `« ${profile.full_name} » → « ${target} » : ${candidates.length} membre(s) de cette équipe ` +
        "portent ce nom. Un et un seul est attendu.",
    );
    const member = candidates[0];

    const already = takenMemberships.get(member.membershipId);
    check(
      already === undefined,
      `« ${profile.full_name} » et « ${already} » visent tous les deux ${member.displayName}.`,
    );
    takenMemberships.set(member.membershipId, profile.full_name);

    // The one independent check on a mapping that is otherwise a declaration: where the old app
    // bothered to record a number, it has to be the same number.
    if (profile.jersey_number !== null) {
      check(
        profile.jersey_number === member.jerseyNumber,
        `« ${profile.full_name} » porte le numéro ${profile.jersey_number} dans l'ancienne ` +
          `application et ${member.jerseyNumber ?? "aucun"} ici : la correspondance est fausse.`,
      );
    }

    byOldId.set(profile.id, {
      oldId: profile.id,
      oldName: profile.full_name,
      oldJersey: profile.jersey_number,
      membershipId: member.membershipId,
      displayName: member.displayName,
      jerseyNumber: member.jerseyNumber,
    });
  }

  return { byOldId, unmapped };
}

/** The 1-2-3-1 slot each old code means, by `position_code` and, for the two centre-backs, by `x`. */
async function resolveSlots(): Promise<{
  formationId: string;
  slots: SlotInfo[];
  byOldSlot: Map<OldSlot, string>;
}> {
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
  const formationId = rows[0].formationId;

  const byOldSlot = new Map<OldSlot, string>();
  for (const code of OLD_SLOTS) {
    const wanted = SLOT_MAP[code];
    const found = rows.filter(
      (row) =>
        row.positionCode === wanted.positionCode && (wanted.x === undefined || row.x === wanted.x),
    );
    check(
      found.length === 1,
      `${code} → ${wanted.positionCode}${wanted.x !== undefined ? ` @x=${wanted.x}` : ""} : ` +
        `${found.length} poste(s) correspondent dans ${TARGET_FORMATION_LABEL}.`,
    );
    byOldSlot.set(code, found[0].id);
  }

  return {
    formationId,
    slots: rows.map((row) => ({ id: row.id, positionCode: row.positionCode, sort: row.sort })),
    byOldSlot,
  };
}

/* -------------------------------------------------------------------------- */
/* Building one match                                                         */
/* -------------------------------------------------------------------------- */

type TargetMatch = {
  id: string;
  teamId: string;
  kickoffAt: Date;
  opponentName: string;
  status: "scheduled" | "live" | "finished";
  periodsCount: number;
  periodMinutes: number;
};

type Plan = {
  old: OldMatch;
  target: TargetMatch;
  /** Derived from the match id, so a re-run builds the same sheet and therefore the same log. */
  lineupId: string;
  /** The seven pairs that become both the `LINEUP_APPLIED` payload and the `lineup_slots` rows. */
  starters: RetroStarter[];
  /** `formation_slots.id` → the old app's slot code, for the dry-run summary only. */
  starterSlotCodes: Map<string, OldSlot>;
  actions: RetroAction[];
  squad: Array<{ memberId: string; role: "starter" | "substitute" | "supporter" }>;
  entry: RetroEntry;
  events: ReturnType<typeof buildRetroLog>["events"];
  guessedStamps: number;
  derived: { goalsFor: number; goalsAgainst: number };
  ratings: Array<{ raterMemberId: string; ratedMemberId: string; score: number }>;
  /** The owner's mean next to the tenth actually stored, printed so the rounding is visible. */
  ratingRounding: Array<{ name: string; mean: number; rounded: number }>;
  /** Everyone with derived minutes: in this scheme every one of them is also a rater. */
  raters: string[];
  injuries: Array<{ name: string; minute: number }>;
};

/**
 * A `lineups.id` that is a pure function of the match.
 *
 * `retroEntrySeed` includes `lineupId`, and every `client_event_id` is derived from that seed, so a
 * `defaultRandom()` id would give the second run a different submission id and a second log. There is
 * nothing meaningful in the value; `retroSubmissionId` is reused only because it already returns a
 * well-formed uuid from a string.
 */
function deterministicLineupId(matchId: string): string {
  return retroSubmissionId(["radarlocal-initial-lineup", matchId]);
}

function planMatch(input: {
  old: OldMatch;
  target: TargetMatch;
  lineupRows: readonly OldLineup[];
  goalsFor: readonly OldGoalFor[];
  goalsConceded: readonly OldGoalConceded[];
  substitutions: readonly OldSubstitution[];
  byOldId: ReadonlyMap<string, ResolvedPlayer>;
  /** Target `display_name`, normalised, to the member it is — how `INJURIES` and `RATING_MEANS` resolve. */
  byTargetName: ReadonlyMap<string, ResolvedPlayer>;
  byOldSlot: ReadonlyMap<OldSlot, string>;
  /** The 1-2-3-1 slot catalogue, so the preview reduction knows which slot is the goalkeeper's. */
  slots: readonly SlotInfo[];
}): Plan {
  const { old, target, byOldId, byOldSlot } = input;

  /* ---- the two identities have to agree -------------------------------- */

  check(
    new Date(old.match_date).getTime() === target.kickoffAt.getTime(),
    `${old.opponent} : coup d'envoi ${old.match_date} dans l'export, ` +
      `${target.kickoffAt.toISOString()} ici.`,
  );
  check(
    normalise(old.opponent) === normalise(target.opponentName),
    `Adversaire : « ${old.opponent} » dans l'export, « ${target.opponentName} » ici.`,
  );
  check(
    old.duration === target.periodsCount * target.periodMinutes,
    `${old.opponent} : ${old.duration} minutes dans l'export, ` +
      `${target.periodsCount}×${target.periodMinutes} ici.`,
  );
  check(
    target.periodsCount === PERIODS.periodsCount && target.periodMinutes === PERIODS.periodMinutes,
    `${old.opponent} : ce script ne sait importer que du ${PERIODS.periodsCount}×${PERIODS.periodMinutes}.`,
  );
  check(old.formation === "2-3-1", `${old.opponent} : formation « ${old.formation} » inattendue.`);
  check(old.status === "played", `${old.opponent} : statut « ${old.status} » inattendu.`);

  const member = (oldId: string, what: string): string => {
    const resolved = byOldId.get(oldId);
    if (!resolved) fail(`${what} : le joueur ${oldId} n'a pas de correspondance dans cette équipe.`);
    return resolved.membershipId;
  };

  /** The same thing for a name the *owner* typed, in `INJURIES` and in `RATING_MEANS`. */
  const named = (name: string, what: string): ResolvedPlayer => {
    const resolved = input.byTargetName.get(normalise(name));
    if (!resolved) {
      fail(
        `${what} : « ${name} » ne correspond à aucun joueur de cet import. ` +
          "Corrige la table en haut du script.",
      );
    }
    return resolved;
  };

  /* ---- the starting seven ---------------------------------------------- */

  const starterRows = input.lineupRows.filter((row) => row.slot !== null);
  check(
    starterRows.length === 7,
    `${old.opponent} : ${starterRows.length} titulaires dans l'export, 7 attendus.`,
  );
  const starterSlotCodes = new Map<string, OldSlot>();
  const starters: RetroStarter[] = starterRows.map((row) => {
    const code = row.slot as OldSlot;
    const slotId = byOldSlot.get(code);
    if (!slotId) fail(`${old.opponent} : poste « ${row.slot} » inconnu.`);
    check(
      row.role === "player",
      `${old.opponent} : ${row.player_id} est titulaire mais « ${row.role} ».`,
    );
    starterSlotCodes.set(slotId, code);
    return { slotId, memberId: member(row.player_id, `${old.opponent} / titulaire`) };
  });
  check(
    starterSlotCodes.size === 7,
    `${old.opponent} : deux titulaires occupent le même poste dans l'export.`,
  );

  /* ---- what happened --------------------------------------------------- */

  /*
   * One array, facts then substitutions, because that is the shape `RetroEntry` takes. The order
   * inside it is data twice over: `buildRetroLog` emits the facts of a minute before the
   * substitutions of that same minute whatever the order here, but `retroPitch` replays substitutions
   * stably on *this* order, so four changes at 20′ only come out right if they are in the order the
   * old app's `created_at` says they were typed.
   */
  const actions: RetroAction[] = [];

  /*
   * The declared injuries first — `INJURIES`, which says where they come from. Their position in this
   * array is not what keeps them ahead of the substitution of the same minute: `buildRetroLog` sorts
   * facts before substitutions at an identical `clockMs` whatever order they were typed in. They are
   * written first because they are the only rows here that are not in the export.
   */
  const injuries: Plan["injuries"] = [];
  for (const injury of INJURIES.filter(
    (row) => normalise(row.opponent) === normalise(old.opponent),
  )) {
    const player = named(injury.player, `${old.opponent} / blessure`);
    actions.push({
      key: `injury-${injury.minute}-${player.membershipId}`,
      type: "INJURY",
      memberId: player.membershipId,
      assistId: null,
      minute: injury.minute,
    });
    injuries.push({ name: player.displayName, minute: injury.minute });
  }

  for (const goal of [...input.goalsFor].sort((a, b) => a.minute - b.minute)) {
    actions.push({
      key: `gf-${goal.minute}-${goal.scorer_id ?? "?"}`,
      type: "GOAL_FOR",
      memberId: goal.scorer_id ? member(goal.scorer_id, `${old.opponent} / buteur`) : null,
      assistId: goal.assist_id ? member(goal.assist_id, `${old.opponent} / passeur`) : null,
      minute: goal.minute,
    });
  }

  for (const [index, conceded] of [...input.goalsConceded]
    .sort((a, b) => a.minute - b.minute)
    .entries()) {
    actions.push({
      key: `ga-${index}-${conceded.minute}`,
      type: "GOAL_AGAINST",
      memberId: null,
      assistId: null,
      minute: conceded.minute,
    });
  }

  const orderedChanges = [...input.substitutions].sort(
    (a, b) => a.minute - b.minute || a.created_at.localeCompare(b.created_at),
  );
  for (const [index, change] of orderedChanges.entries()) {
    actions.push({
      key: `sub-${index}`,
      type: "SUBSTITUTION",
      outId: member(change.player_off, `${old.opponent} / sortant`),
      inId: member(change.player_on, `${old.opponent} / entrant`),
      minute: change.minute,
    });
  }

  /* ---- the sheet, and the log it implies -------------------------------- */

  const lineupId = deterministicLineupId(target.id);
  const sheet = {
    periods: { periodsCount: target.periodsCount, periodMinutes: target.periodMinutes },
    kickoffAtMs: target.kickoffAt.getTime(),
    lineupId,
    starters,
    actions,
  };
  const entry: RetroEntry = {
    ...sheet,
    submissionId: retroSubmissionId([retroEntrySeed(target.id, sheet)]),
  };

  const built = buildRetroLog(entry);
  check(
    built.guessedStamps === 0,
    `${old.opponent} : ${built.guessedStamps} minute(s) ont dû être devinées, ` +
      "alors que l'export en donne une pour chaque action.",
  );

  /* ---- the squad -------------------------------------------------------- */

  const roles = new Map<string, "starter" | "substitute" | "supporter">();
  for (const starter of starters) roles.set(starter.memberId, "starter");
  for (const change of orderedChanges) {
    const memberId = member(change.player_on, `${old.opponent} / entrant`);
    if (!roles.has(memberId)) roles.set(memberId, "substitute");
  }
  for (const row of input.lineupRows) {
    if (row.role !== "supporter") continue;
    const memberId = member(row.player_id, `${old.opponent} / supporter`);
    check(
      !roles.has(memberId),
      `${old.opponent} : ${memberId} est à la fois supporter et sur le terrain.`,
    );
    roles.set(memberId, "supporter");
  }
  /*
   * A `role: "player"` row with no slot who never came on: named, and sat out. `match_squad` has no
   * such role, and `substitute` is exactly what he was — somebody on the sheet who did not play. The
   * reducer gives him zero minutes either way, so nothing derived depends on this choice.
   */
  for (const row of input.lineupRows) {
    if (row.role !== "player" || row.slot !== null) continue;
    const memberId = member(row.player_id, `${old.opponent} / remplaçant`);
    if (!roles.has(memberId)) roles.set(memberId, "substitute");
  }

  /* ---- the score, derived and checked ----------------------------------- */

  const state = reduceMatch(retroEventRecords(built.events), [], {
    periodsCount: target.periodsCount,
    periodMinutes: target.periodMinutes,
    slots: input.slots,
  });

  /* ---- the ratings ------------------------------------------------------ */

  /*
   * « Comme si tout le monde avait mis la moyenne. » The raters are exactly the players with derived
   * minutes, and each of them gives every *other* one that other player's rounded mean. So a rated
   * player ends up with N−1 identical notes — which satisfies `ratings_no_self`, the unique triple,
   * and `MIN_NOTES_FOR_MEAN = 3` all at once, and whose mean is by construction the number the owner
   * gave. Who played is read off the reducer and never off the means table (invariant 2).
   */
  const played = state.players
    .filter((player) => player.minutes > 0)
    .map((player) => player.memberId)
    .sort((a, b) =>
      (byMembershipName(byOldId, a) ?? a).localeCompare(byMembershipName(byOldId, b) ?? b, "fr"),
    );
  const playedSet = new Set(played);

  const meansForMatch = RATING_MEANS.find(
    (row) => normalise(row.opponent) === normalise(old.opponent),
  );
  check(
    meansForMatch !== undefined,
    `${old.opponent} : aucune moyenne déclarée dans RATING_MEANS pour ce match.`,
  );

  const scoreByMember = new Map<string, number>();
  const ratingRounding: Plan["ratingRounding"] = [];
  for (const row of meansForMatch.players) {
    const player = named(row.player, `${old.opponent} / moyenne`);

    // Explicit, because `numeric(3,1)` would do it silently on insert (decision 144).
    const rounded = roundToTenth(row.mean);
    check(
      rounded === row.rounded,
      `${old.opponent} : la moyenne ${row.mean} de ${player.displayName} s'arrondit à ${rounded} ` +
        `alors que la table en déclare ${row.rounded}.`,
    );
    check(
      rounded >= 0 && rounded <= 10 && Math.abs(rounded * 10 - Math.round(rounded * 10)) < 1e-9,
      `${old.opponent} : la note ${rounded} de ${player.displayName} n'est pas une décimale ` +
        "entre 0 et 10 (contraintes ratings_score_range / ratings_score_one_decimal).",
    );
    check(
      !scoreByMember.has(player.membershipId),
      `${old.opponent} : ${player.displayName} apparaît deux fois dans RATING_MEANS.`,
    );

    scoreByMember.set(player.membershipId, rounded);
    ratingRounding.push({ name: player.displayName, mean: row.mean, rounded });
  }

  /*
   * The two lists have to be the same list. A player with minutes and no mean would receive nothing
   * while rating everybody; a mean for somebody who did not play would be a note on a player
   * `lib/rating/progress.ts` does not consider a legal target. Either way the import is wrong about
   * the match, so it says which name and stops.
   */
  const withoutMean = played.filter((memberId) => !scoreByMember.has(memberId));
  const withoutMinutes = [...scoreByMember.keys()].filter((memberId) => !playedSet.has(memberId));
  check(
    withoutMean.length === 0 && withoutMinutes.length === 0,
    `${old.opponent} : l'effectif et RATING_MEANS ne concordent pas. ` +
      `Minutes sans moyenne : ${withoutMean.map((id) => byMembershipName(byOldId, id) ?? id).join(", ") || "aucun"}. ` +
      `Moyenne sans minute : ${withoutMinutes.map((id) => byMembershipName(byOldId, id) ?? id).join(", ") || "aucun"}.`,
  );

  const ratingRows: Plan["ratings"] = [];
  for (const raterMemberId of played) {
    for (const ratedMemberId of played) {
      if (raterMemberId === ratedMemberId) continue;
      const score = scoreByMember.get(ratedMemberId);
      check(score !== undefined, `${old.opponent} : note manquante pour ${ratedMemberId}.`);
      ratingRows.push({ raterMemberId, ratedMemberId, score });
    }
  }

  return {
    old,
    target,
    lineupId,
    starters,
    starterSlotCodes,
    actions,
    squad: [...roles].map(([memberId, role]) => ({ memberId, role })),
    entry,
    events: built.events,
    guessedStamps: built.guessedStamps,
    derived: { goalsFor: state.goalsFor, goalsAgainst: state.goalsAgainst },
    ratings: ratingRows,
    ratingRounding,
    raters: played,
    injuries,
  };
}

/** The display name of a membership, when this import knows one. For messages only. */
function byMembershipName(
  byOldId: ReadonlyMap<string, ResolvedPlayer>,
  membershipId: string,
): string | null {
  for (const row of byOldId.values()) {
    if (row.membershipId === membershipId) return row.displayName;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Validating one match, the way the Server Action does                       */
/* -------------------------------------------------------------------------- */

function validatePlan(
  plan: Plan,
  input: { members: readonly TargetMember[]; slots: readonly SlotInfo[] },
): void {
  const label = plan.old.opponent;

  // The shape the form would have posted. Not strictly needed — nothing came from a browser — but it
  // is the schema `submitRetroMatch` runs, and a sheet this script builds has to satisfy it too.
  const parsed = retroSubmitSchema.safeParse({
    teamId: plan.target.teamId,
    matchId: plan.target.id,
    lineupId: plan.lineupId,
    starters: plan.entry.starters,
    actions: plan.entry.actions,
  });
  check(
    parsed.success,
    `${label} : la feuille ne passe pas retroSubmitSchema — ` +
      (parsed.success ? "" : parsed.error.issues.map((issue) => issue.message).join(" / ")),
  );

  const issues = findRetroIssues({
    entry: plan.entry,
    members: input.members
      .filter((member) => member.isPlayer)
      .map((member) => ({ membershipId: member.membershipId, name: member.displayName })),
    slots: input.slots,
  });
  const blocking = blockingRetroIssues(issues);
  check(
    blocking.length === 0,
    `${label} : saisie refusée — ` + blocking.map((issue) => `${issue.code}: ${issue.messageFr}`).join(" / "),
  );
  for (const issue of issues) {
    console.log(`  avertissement (${issue.code}) : ${issue.messageFr}`);
  }

  const logIssues = retroLogIssuesFr(plan.events, {
    periods: { periodsCount: plan.target.periodsCount, periodMinutes: plan.target.periodMinutes },
    slots: input.slots,
  });
  check(
    logIssues.length === 0,
    `${label} : le réducteur refuse ce déroulé — ${logIssues.join(" / ")}`,
  );

  // The one check nothing else makes: the log has to say what the old app said.
  check(
    plan.derived.goalsFor === plan.old.goals_for &&
      plan.derived.goalsAgainst === plan.old.goals_against,
    `${label} : LE SCORE NE CONCORDE PAS. Le déroulé donne ` +
      `${plan.derived.goalsFor}–${plan.derived.goalsAgainst}, l'ancienne application ` +
      `${plan.old.goals_for}–${plan.old.goals_against}. Rien n'est écrit.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Writing one match                                                          */
/* -------------------------------------------------------------------------- */

const REVALIDATE_OUTSIDE_REQUEST = /static generation store missing in revalidatePath/;

async function commitPlan(plan: Plan, input: { actor: Actor; formationId: string }): Promise<void> {
  const label = plan.old.opponent;
  const matchId = plan.target.id;

  /*
   * The rows this script owns, in one transaction. `is_initial` with `from_minute = 0` is the
   * composition the seven started in; `applied_event_id` is left null here and filled in by
   * `amendMatchEvents`, which is the only thing that knows the id the `LINEUP_APPLIED` event got
   * (decision 006 — the link records what happened).
   */
  await db.transaction(async (tx) => {
    await tx
      .insert(lineups)
      .values({
        id: plan.lineupId,
        matchId,
        formationId: input.formationId,
        fromMinute: 0,
        isInitial: true,
        createdBy: input.actor.userId,
      })
      .onConflictDoNothing({ target: lineups.id });

    await tx
      .insert(lineupSlots)
      .values(
        plan.starters.map((starter) => ({
          lineupId: plan.lineupId,
          formationSlotId: starter.slotId,
          teamMemberId: starter.memberId,
        })),
      )
      .onConflictDoNothing({ target: [lineupSlots.lineupId, lineupSlots.formationSlotId] });

    await tx
      .insert(matchSquad)
      .values(
        plan.squad.map((row) => ({ matchId, teamMemberId: row.memberId, role: row.role })),
      )
      .onConflictDoNothing({ target: [matchSquad.matchId, matchSquad.teamMemberId] });
  });

  /*
   * The log, through the application's own write path. See the header: `amendMatchEvents` ends in
   * `revalidatePath`, which throws outside a Next request — after the insert and after the freeze.
   * Anything else is a real failure and is re-thrown.
   */
  try {
    const result = await amendMatchEvents(input.actor, { matchId, events: plan.events });
    check(
      result.ok,
      `${label} : amendMatchEvents a refusé le déroulé — ` + (result.ok ? "" : result.body.error),
    );
  } catch (error) {
    if (error instanceof ImportError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (!REVALIDATE_OUTSIDE_REQUEST.test(message)) throw error;
    console.log(`  (revalidatePath ignoré hors requête Next : « ${message} »)`);
  }

  // Verified rather than trusted, because the return value above may have been lost to the throw.
  const stored = await db
    .select({ clientEventId: matchEvents.clientEventId })
    .from(matchEvents)
    .where(
      and(
        eq(matchEvents.matchId, matchId),
        inArray(
          matchEvents.clientEventId,
          plan.events.map((event) => event.clientEventId),
        ),
      ),
    );
  check(
    stored.length === plan.events.length,
    `${label} : ${stored.length} des ${plan.events.length} événements sont en base. ` +
      "Relance le script : l'ingestion est idempotente.",
  );

  // Defensive, and free: `amendMatchEvents` already froze the match, but a run that was interrupted
  // between the insert and the freeze would otherwise leave the cache empty.
  const frozen = await finalizeMatchById(plan.target.teamId, matchId);
  check(frozen.finished, `${label} : le match n'a pas pu être figé — pas de coup de sifflet final ?`);

  // A label and nothing else: it records how the log came to exist so the recap can say so.
  await db
    .update(matches)
    .set({ entryMode: "retro" })
    .where(and(eq(matches.id, matchId), eq(matches.teamId, plan.target.teamId)));

  if (plan.ratings.length > 0) {
    await db
      .insert(ratings)
      .values(plan.ratings.map((row) => ({ matchId, ...row })))
      .onConflictDoNothing({
        target: [ratings.matchId, ratings.raterMemberId, ratings.ratedMemberId],
      });
  }
  // `ratings_published_at` is deliberately not set: the means stay hidden until the owner says so.
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

function describePlan(plan: Plan, byMembershipId: ReadonlyMap<string, string>): void {
  const name = (memberId: string) => byMembershipId.get(memberId) ?? memberId;

  console.log("");
  console.log(`### ${plan.old.opponent} — ${plan.old.match_date.slice(0, 10)}`);
  console.log(`  match cible          ${plan.target.id} (${plan.target.status})`);
  console.log(`  composition initiale ${plan.lineupId} (${TARGET_FORMATION_LABEL})`);
  console.log(`  submission id        ${plan.entry.submissionId}`);
  console.log(
    `  score dérivé         ${plan.derived.goalsFor}–${plan.derived.goalsAgainst} ` +
      `(ancienne application : ${plan.old.goals_for}–${plan.old.goals_against})`,
  );
  console.log(`  minutes devinées     ${plan.guessedStamps}`);

  const histogram = new Map<string, number>();
  for (const event of plan.events) histogram.set(event.type, (histogram.get(event.type) ?? 0) + 1);
  console.log(
    `  événements           ${plan.events.length} — ` +
      [...histogram].map(([type, count]) => `${type}×${count}`).join(", "),
  );

  console.log("  titulaires :");
  for (const starter of plan.starters) {
    console.log(`    ${pad(plan.starterSlotCodes.get(starter.slotId) ?? "?", 6)} ${name(starter.memberId)}`);
  }

  const bySquadRole = new Map<string, string[]>();
  for (const row of plan.squad) {
    bySquadRole.set(row.role, [...(bySquadRole.get(row.role) ?? []), name(row.memberId)]);
  }
  for (const [role, names] of bySquadRole) {
    console.log(`  ${pad(role, 10)} ${names.sort().join(", ")}`);
  }

  if (plan.injuries.length > 0) {
    console.log(
      `  blessures            ${plan.injuries.map((injury) => `${injury.name} à la ${injury.minute}′`).join(", ")}` +
        " (déclarées par le propriétaire, absentes de l'export)",
    );
  }

  console.log("");
  console.log("  moyennes du propriétaire → note stockée :");
  console.log(
    table(
      ["joueur", "moyenne", "arrondi"],
      plan.ratingRounding.map((row) => [
        row.name,
        padStart(row.mean.toFixed(2), 7),
        padStart(row.rounded.toFixed(1), 7),
      ]),
    )
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
  );
  console.log(
    `  notes                ${plan.ratings.length} lignes = ${plan.raters.length} notateurs × ` +
      `${plan.raters.length - 1} notés (« comme si tout le monde avait mis la moyenne »)`,
  );
  console.log("  notes publiées       non — ratings_published_at reste nul, c'est le choix du propriétaire");
}

/** Minutes, goals and assists as this app derives them, next to the old app's stored numbers. */
async function reportStats(
  plan: Plan,
  byMembershipId: ReadonlyMap<string, string>,
  oldRows: readonly OldLineup[],
  byOldId: ReadonlyMap<string, ResolvedPlayer>,
): Promise<void> {
  const rows = await db
    .select({
      teamMemberId: matchPlayerStats.teamMemberId,
      minutes: matchPlayerStats.minutes,
      goals: matchPlayerStats.goals,
      assists: matchPlayerStats.assists,
      gkMinutes: matchPlayerStats.gkMinutes,
      concededWhileOn: matchPlayerStats.concededWhileOn,
      squadRole: matchPlayerStats.squadRole,
    })
    .from(matchPlayerStats)
    .where(eq(matchPlayerStats.matchId, plan.target.id));

  const oldByMember = new Map<string, OldLineup>();
  for (const row of oldRows) {
    const resolved = byOldId.get(row.player_id);
    if (resolved) oldByMember.set(resolved.membershipId, row);
  }

  const body = rows
    .map((row) => {
      const old = oldByMember.get(row.teamMemberId);
      const delta = old ? row.minutes - old.minutes_played : null;
      return [
        byMembershipId.get(row.teamMemberId) ?? row.teamMemberId,
        row.squadRole ?? "—",
        padStart(String(row.minutes), 7),
        padStart(old ? String(old.minutes_played) : "—", 8),
        padStart(delta === null ? "—" : (delta > 0 ? `+${delta}` : String(delta)), 5),
        padStart(`${row.goals} / ${old ? old.goals : "—"}`, 9),
        padStart(`${row.assists} / ${old ? old.assists : "—"}`, 9),
        padStart(String(row.gkMinutes), 9),
        padStart(String(row.concededWhileOn), 9),
      ];
    })
    .sort((a, b) => a[0].localeCompare(b[0], "fr"));

  console.log("");
  console.log(`### ${plan.old.opponent} — match_player_stats`);
  console.log(
    table(
      ["joueur", "rôle", "minutes", "ancienne", "delta", "buts n/a", "passes", "min. gard", "encaissés"],
      body,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Main                                                                      */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const allowRemote = process.argv.includes("--allow-remote");

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL n'est pas défini.");
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal && !allowRemote) {
    fail(
      `Cette base n'est pas locale (${redact(url)}). ` +
        "Ajoute --allow-remote pour l'accepter — c'est un acte volontaire.",
    );
  }

  console.log("## Import RadarLocal");
  console.log(`base      ${redact(url)}`);
  console.log(`mode      ${commit ? "ÉCRITURE (--commit)" : "simulation (ajoute --commit pour écrire)"}`);

  /* ---- the export ------------------------------------------------------- */

  const profiles = readExport<OldProfile[]>("profiles.json");
  const oldMatches = readExport<OldMatch[]>("matches.json");
  const oldLineups = readExport<OldLineup[]>("lineups.json");
  const oldGoalsFor = readExport<OldGoalFor[]>("goals_for.json");
  const oldGoalsConceded = readExport<OldGoalConceded[]>("goals_conceded.json");
  const oldSubstitutions = readExport<OldSubstitution[]>("substitutions.json");
  // `ratings_mine.json` is deliberately not read: see `RATING_MEANS`.

  /* ---- the target match rows ------------------------------------------- */

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
    .from(matches)
    .where(inArray(matches.id, MATCH_MAP.map((pair) => pair.targetId)));

  check(
    targetRows.length === MATCH_MAP.length,
    `${targetRows.length} des ${MATCH_MAP.length} matchs cibles existent. Aucun n'est créé ici.`,
  );
  const teamIds = new Set(targetRows.map((row) => row.teamId));
  check(teamIds.size === 1, "Les deux matchs cibles n'appartiennent pas à la même équipe.");
  const teamId = [...teamIds][0];

  /* ---- the actor and the two name mappings ------------------------------ */

  const members = await loadMembers(teamId);
  const byMembershipId = new Map(members.map((member) => [member.membershipId, member.displayName]));

  const [coach] = await db
    .select({
      userId: users.id,
      membershipId: teamMembers.id,
      role: teamMembers.role,
      isPlayer: teamMembers.isPlayer,
      displayName: users.displayName,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.username, COACH_USERNAME)))
    .limit(1);
  check(coach !== undefined, `Aucun membre « ${COACH_USERNAME} » dans cette équipe.`);
  check(coach.role === "coach", `« ${COACH_USERNAME} » n'est pas coach : il ne peut pas amender.`);
  console.log(`auteur    ${coach.displayName} (users.id ${coach.userId})`);

  const actor: Actor = {
    userId: coach.userId,
    isSuperAdmin: false,
    memberships: [
      {
        membershipId: coach.membershipId,
        teamId,
        role: coach.role,
        isPlayer: coach.isPlayer,
      },
    ],
  };

  const { byOldId, unmapped } = resolvePlayers(profiles, members);
  const { formationId, slots, byOldSlot } = await resolveSlots();

  /* ---- the unmapped profile must be referenced nowhere ------------------ */

  const referenced = new Set<string>([
    ...oldLineups.map((row) => row.player_id),
    ...oldGoalsFor.flatMap((row) => [row.scorer_id, row.assist_id]),
    ...oldSubstitutions.flatMap((row) => [row.player_off, row.player_on]),
  ].filter((id): id is string => typeof id === "string"));

  for (const profile of unmapped) {
    check(
      !referenced.has(profile.id),
      `« ${profile.full_name} » n'a pas de correspondance mais apparaît dans les données du match.`,
    );
  }
  for (const id of referenced) {
    check(byOldId.has(id), `Le profil ${id} est référencé mais n'a pas de correspondance.`);
  }

  /*
   * Target name → member, for the two tables the owner wrote by hand (`INJURIES`, `RATING_MEANS`).
   * Built from the *resolved* players rather than from `members`, so a name only an un-imported
   * member answers to still aborts.
   */
  const byTargetName = new Map<string, ResolvedPlayer>();
  for (const player of byOldId.values()) {
    const key = normalise(player.displayName);
    check(
      !byTargetName.has(key),
      `Deux joueurs importés s'appellent « ${player.displayName} » : ` +
        "INJURIES et RATING_MEANS ne pourraient pas les distinguer.",
    );
    byTargetName.set(key, player);
  }

  /* ---- the mapping, written down so it can be audited ------------------- */

  console.log("");
  console.log("## Correspondance des joueurs");
  console.log(
    table(
      ["ancien nom", "numéro", "→ membre", "numéro", "team_members.id"],
      [
        ...[...byOldId.values()]
          .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"))
          .map((row) => [
            row.oldName,
            row.oldJersey === null ? "—" : String(row.oldJersey),
            row.displayName,
            row.jerseyNumber === null ? "—" : String(row.jerseyNumber),
            row.membershipId,
          ]),
        ...unmapped.map((profile) => [
          profile.full_name,
          profile.jersey_number === null ? "—" : String(profile.jersey_number),
          "(aucun)",
          "—",
          "—",
        ]),
      ],
    ),
  );
  const unused = members.filter(
    (member) => ![...byOldId.values()].some((row) => row.membershipId === member.membershipId),
  );
  console.log(
    `membres de l'équipe sans antécédent : ${unused.map((member) => member.displayName).join(", ") || "aucun"}`,
  );

  console.log("");
  console.log("## Correspondance des postes (2-3-1 → " + TARGET_FORMATION_LABEL + ")");
  for (const code of OLD_SLOTS) {
    const wanted = SLOT_MAP[code];
    console.log(
      `  ${pad(code, 6)} → ${pad(wanted.positionCode + (wanted.x ? ` @x=${wanted.x}` : ""), 12)} ${byOldSlot.get(code)}`,
    );
  }

  const mappingPath = resolve(EXPORT_DIR, "player-mapping.json");
  const mappingDocument = {
    _note:
      "Resolved mapping from the old app's profiles to this app's team_members, produced by " +
      "scripts/import-radarlocal.mts. The pairing of names is declared in that script and verified " +
      "here against the database; jersey numbers were checked wherever the old app recorded one.",
    generatedAt: new Date().toISOString(),
    teamId,
    players: [...byOldId.values()].map((row) => ({
      oldProfileId: row.oldId,
      oldFullName: row.oldName,
      oldJerseyNumber: row.oldJersey,
      teamMemberId: row.membershipId,
      displayName: row.displayName,
      jerseyNumber: row.jerseyNumber,
    })),
    unmapped: unmapped.map((profile) => ({
      oldProfileId: profile.id,
      oldFullName: profile.full_name,
      reason: "no counterpart in this team; referenced by no lineup, goal or substitution row",
    })),
    unusedTeamMembers: unused.map((member) => ({
      teamMemberId: member.membershipId,
      displayName: member.displayName,
    })),
    formationSlots: Object.fromEntries(
      OLD_SLOTS.map((code) => [
        code,
        {
          positionCode: SLOT_MAP[code].positionCode,
          x: SLOT_MAP[code].x ?? null,
          formationSlotId: byOldSlot.get(code),
        },
      ]),
    ),
    matches: MATCH_MAP,
  };
  writeFileSync(mappingPath, `${JSON.stringify(mappingDocument, null, 2)}\n`, "utf8");
  console.log(`correspondance écrite dans ${mappingPath}`);

  /* ---- plan both matches ------------------------------------------------ */

  const plans: Plan[] = [];
  for (const pair of MATCH_MAP) {
    const old = oldMatches.find((row) => row.id === pair.oldId);
    check(old !== undefined, `Le match ${pair.oldId} n'est pas dans l'export.`);
    const row = targetRows.find((candidate) => candidate.id === pair.targetId);
    check(row !== undefined, `Le match cible ${pair.targetId} n'existe pas.`);

    /*
     * The preconditions. A match that already has a log is corrected action by action (decision
     * 049), never re-entered — except by this very script run again, which `amendMatchEvents`
     * recognises by `client_event_id`. A match that already has a composition is one somebody
     * prepared in the app, and overwriting it is not this script's business.
     */
    const [{ count: eventCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, row.id));
    const [{ count: lineupCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lineups)
      .where(eq(lineups.matchId, row.id));

    const target: TargetMatch = {
      id: row.id,
      teamId: row.teamId,
      kickoffAt: new Date(row.kickoffAt),
      opponentName: row.opponentName,
      status: row.status,
      periodsCount: row.periodsCount,
      periodMinutes: row.periodMinutes,
    };

    const plan = planMatch({
      old,
      target,
      lineupRows: oldLineups.filter((line) => line.match_id === pair.oldId),
      goalsFor: oldGoalsFor.filter((line) => line.match_id === pair.oldId),
      goalsConceded: oldGoalsConceded.filter((line) => line.match_id === pair.oldId),
      substitutions: oldSubstitutions.filter((line) => line.match_id === pair.oldId),
      byOldId,
      byTargetName,
      byOldSlot,
      slots,
    });

    // Checked after planning, so a re-run still prints the sheet and the submission id it would
    // produce before saying whether the log is already there.
    const already = plan.events.map((event) => event.clientEventId);
    const [{ count: mine }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchEvents)
      .where(and(eq(matchEvents.matchId, row.id), inArray(matchEvents.clientEventId, already)));
    check(
      Number(eventCount) === 0 || Number(mine) === Number(eventCount),
      `${old.opponent} : ce match a déjà ${eventCount} événements qui ne viennent pas de cet import. ` +
        "Les corrections se font action par action (décision 049).",
    );
    check(
      Number(lineupCount) === 0 || plan.lineupId !== undefined,
      `${old.opponent} : ce match a déjà ${lineupCount} composition(s).`,
    );
    if (Number(lineupCount) > 0) {
      const [existing] = await db
        .select({ id: lineups.id })
        .from(lineups)
        .where(eq(lineups.matchId, row.id));
      check(
        existing.id === plan.lineupId,
        `${old.opponent} : une composition (${existing.id}) existe déjà et ne vient pas de cet import.`,
      );
    }

    validatePlan(plan, { members, slots });
    plans.push(plan);
  }

  /*
   * Both hand-written tables are keyed by opponent, so a misspelt one would simply never be found and
   * the import would succeed having quietly dropped an injury or a whole match's notes.
   */
  const planned = new Set(plans.map((plan) => normalise(plan.old.opponent)));
  for (const injury of INJURIES) {
    check(
      planned.has(normalise(injury.opponent)),
      `INJURIES : « ${injury.opponent} » ne correspond à aucun des matchs importés.`,
    );
  }
  for (const row of RATING_MEANS) {
    check(
      planned.has(normalise(row.opponent)),
      `RATING_MEANS : « ${row.opponent} » ne correspond à aucun des matchs importés.`,
    );
  }

  /* ---- say what would happen ------------------------------------------- */

  console.log("");
  console.log("## Résumé");
  for (const plan of plans) describePlan(plan, byMembershipId);

  if (!commit) {
    console.log("");
    console.log("Simulation terminée : rien n'a été écrit en base. Relance avec --commit.");
    return;
  }

  /* ---- write ------------------------------------------------------------ */

  console.log("");
  console.log("## Écriture");
  for (const plan of plans) {
    console.log(`${plan.old.opponent} …`);
    await commitPlan(plan, { actor, formationId });
    console.log(`  écrit.`);
  }

  /* ---- and then say what is in the database ---------------------------- */

  console.log("");
  console.log("## Vérification");
  for (const plan of plans) {
    const events = await db
      .select({ type: matchEvents.type })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, plan.target.id));
    const histogram = new Map<string, number>();
    for (const event of events) histogram.set(event.type, (histogram.get(event.type) ?? 0) + 1);

    const [after] = await db
      .select({
        status: matches.status,
        entryMode: matches.entryMode,
        published: matches.ratingsPublishedAt,
      })
      .from(matches)
      .where(eq(matches.id, plan.target.id));

    const stats = await db
      .select({ minutes: matchPlayerStats.minutes })
      .from(matchPlayerStats)
      .where(eq(matchPlayerStats.matchId, plan.target.id));
    const goals = (histogram.get("GOAL_FOR") ?? 0) + (histogram.get("PENALTY_SCORED") ?? 0);
    const conceded = histogram.get("GOAL_AGAINST") ?? 0;

    console.log("");
    console.log(`### ${plan.old.opponent}`);
    console.log(`  match_events        ${events.length}`);
    console.log(
      `  histogramme         ${[...histogram].sort().map(([type, count]) => `${type}×${count}`).join(", ")}`,
    );
    console.log(
      `  score (log)         ${goals}–${conceded} / ancienne application ` +
        `${plan.old.goals_for}–${plan.old.goals_against}`,
    );
    console.log(`  statut              ${after.status} · entry_mode ${after.entryMode}`);
    console.log(`  notes publiées      ${after.published === null ? "non (voulu)" : String(after.published)}`);
    console.log(`  match_player_stats  ${stats.length} lignes`);

    check(
      goals === plan.old.goals_for && conceded === plan.old.goals_against,
      `${plan.old.opponent} : LE SCORE EN BASE NE CONCORDE PAS avec l'ancienne application.`,
    );
    check(
      after.status === "finished",
      `${plan.old.opponent} : statut ${after.status}, « finished » attendu.`,
    );
    check(after.entryMode === "retro", `${plan.old.opponent} : entry_mode ${after.entryMode}.`);

    await reportStats(
      plan,
      byMembershipId,
      oldLineups.filter((line) => line.match_id === plan.old.id),
      byOldId,
    );
  }

  const [{ count: ratingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ratings)
    .where(inArray(ratings.matchId, plans.map((plan) => plan.target.id)));
  const expectedRatings = plans.reduce((sum, plan) => sum + plan.ratings.length, 0);
  console.log("");
  console.log(
    `notes en base : ${ratingCount} pour ${expectedRatings} attendues ` +
      `(${plans.map((plan) => `${plan.raters.length}×${plan.raters.length - 1}`).join(" + ")})`,
  );
  check(
    Number(ratingCount) === expectedRatings,
    `${ratingCount} notes en base, ${expectedRatings} attendues : il reste des lignes d'un autre ` +
      "import, ou une insertion a été avalée par on conflict do nothing.",
  );
  console.log("ratings_published_at : laissé nul pour les deux matchs — publier est le choix du propriétaire.");
}

main()
  .then(async () => {
    await rawSql.end();
  })
  .catch(async (error: unknown) => {
    console.error("");
    console.error(error instanceof ImportError ? `ABANDON : ${error.message}` : error);
    await rawSql.end().catch(() => undefined);
    process.exitCode = 1;
  });
