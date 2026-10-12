/**
 * Replace the fabricated per-match notes with the **real individual ratings** recovered from the old
 * app (`info-radarlocal`, a Supabase project).
 *
 * Run it:
 *
 * ```bash
 * DATABASE_URL='postgresql://…@ep-raspy-fire-zam9gi7k.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require' \
 *   npx tsx --conditions=react-server scripts/import-ratings.mts            # dry run
 * DATABASE_URL='…' npx tsx --conditions=react-server scripts/import-ratings.mts --commit
 * ```
 *
 * `--conditions=react-server` is not optional: `db/client.ts` is `import "server-only"`, whose
 * `default` export throws. The extension is `.mts` because tsx's CJS output has no top-level
 * `await`.
 *
 * ## What it replaces, and why replacing is the point
 *
 * When matches 1 and 2 were imported (`scripts/import-radarlocal.mts`), Supabase's row-level
 * security had let only the owner's **own** twenty notes out of the old database. So he supplied the
 * final **means** by hand and asked that they be recorded « as if everyone had put the mean »
 * (decision 145). That is what the preview holds today: 200 rows in which every note about a player
 * is the same number, attributed to teammates who never gave that score. The mean on the recap is
 * right; everything built on the individual notes — the coach's per-note panel above all, and behind
 * it the man of the match and the notes seven — is a fabrication.
 *
 * The RLS problem is solved and the real rows are out: `audit/radarlocal-ratings/ratings.json`, 342
 * notes across **three** matches, including Bayern Barbecue Club, for which this database holds no
 * note at all. **Decision 188** retires the fabrication in favour of the real record, so this script
 * deletes a match's `ratings` and inserts the real ones, rather than adding to them: the two cannot
 * coexist — `ratings_unique(match_id, rater_member_id, rated_member_id)` is the same key for both,
 * and the surviving row would be whichever got there first.
 *
 * ## What it does not touch
 *
 * **`matches.ratings_published_at` is left exactly as it is.** Galacticos is published and stays
 * published; Hexagone and Bayern are not, and publishing is the coach's switch and never a script's
 * (decisions 139, 145 and 180). So Bayern's 121 notes land hidden, and stay hidden until he presses
 * « Sortir les moyennes ».
 *
 * Nothing else in the database is read for writing: no event, no squad row, no stat. The notes are
 * the only thing this script owns.
 *
 * ## The three consistency checks, which report rather than repair
 *
 * The app has two rules about notes, and a row that breaks either is a row the app itself would
 * refuse. Both are checked against the database, and a failure **aborts before anything is written**
 * rather than being quietly dropped:
 *
 *  1. **every rated player has `minutes > 0`** for that match (`lib/rating/progress.ts`,
 *     decision 137). Who may be rated is a fact about the log, not about the sheet;
 *  2. **every rater is eligible** under decision 159 — a `match_squad` row as starter, substitute or
 *     supporter, or minutes in the match. `eligibleRaterIds` from `lib/rating/progress.ts` answers
 *     it, so this script asks the same function the screens ask rather than a restatement of it;
 *  3. the **means**, printed beside the owner's hand-typed ones (`OWNER_MEANS`), so that the
 *     agreement between the figure he typed and the notes that produce it is visible rather than
 *     asserted. The stored fabrication is checked against `OWNER_MEANS` too, before it is deleted:
 *     that is what makes the copy below a faithful record of what is being retired.
 *
 * ## Names, and the one thing that must not be got wrong
 *
 * The pairing of old names with this app's `users.display_name` is
 * `OLD_TO_TARGET_DISPLAY_NAME` in `scripts/radarlocal-names.mts` — the same table
 * `scripts/import-radarlocal.mts` uses, moved there so there is one of it. **« Léo C » and « Léo M »
 * are two different men**, and a mapping that confused them would attribute one's notes to the other
 * with nothing failing anywhere.
 *
 * This export does not spell every name the way `profiles.full_name` does, though: five raters
 * arrive under a shortened form (« Léo M » for « Léo Montpre », « Maxime » for « Maxime Goulard »,
 * « Thomas » for « Thomas Brunet », « Nicodème » for « Nicodème (gronaldo) », « Léo COACH » for
 * « Leo COACH »). `EXPORT_ALIASES` declares those five and nothing is inferred: no prefix match, no
 * edit distance. « Léo M » *is* a prefix of « Léo Montpre » and so is « Léo » of both Léos, which is
 * exactly why guessing is refused. Any name in the file that is neither a key of the shared table
 * nor an alias **aborts**, and so does an alias that is also a key, or two names resolving to one
 * person.
 *
 * « Alexis CHARRIER » maps to nobody and the script asserts he rates nobody and is rated by nobody,
 * which he is not: he is in `profiles.json` and gives no note.
 *
 * ## Match identity
 *
 * By **Paris calendar day and opponent**, accent- and case-insensitively, against `matches`. Each
 * of the three must resolve to exactly one row or the script aborts; the old app's `match_id` is
 * carried in the report but is never the thing looked up, because this database has never heard of
 * it.
 *
 * ## Idempotency
 *
 * `ratings.id` is the **old app's own note id**, not a fresh random one, so a second run inserts the
 * same 342 rows with the same primary keys. `created_at` would be the only thing to move, so the
 * rows that already exist have theirs **read before the delete and re-used**: a second `--commit`
 * therefore leaves the table byte-identical, and the fingerprint printed before and after proves it
 * rather than asserting it.
 *
 * ## Safety
 *
 * Mirrors `scripts/rebuild-matches.mts`, for the same reason — it deletes rows:
 *
 *  - **refuses production by name** (`ep-gentle-cherry`), not merely by not matching the preview;
 *  - refuses any host that is neither the preview endpoint nor a localhost one;
 *  - refuses a `-pooler` host (`COORDINATION.md`: a pooled connection can carry an empty
 *    `search_path` left by a `pg_restore`, and the whole app then 500s);
 *  - **dry run by default**; `--commit` writes. The database is printed, password redacted, first.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded. `dotenv` does
// not override what is already there, so `DATABASE_URL=… tsx …` wins over the file.
import "../db/load-env";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// `rawSql` is the postgres.js tag, imported only to close the pool at the end; `sql` above is
// Drizzle's expression builder, and the two must not share a name.
import { db, sql as rawSql } from "../db/client";
import { matchPlayerStats, matchSquad, matches, ratings, teamMembers, users } from "../db/schema";
import { dayKey } from "../lib/calendar/time";
import { MIN_NOTES_FOR_MEAN } from "../lib/rating/aggregate";
import { eligibleRaterIds, type SquadEntry } from "../lib/rating/progress";
import { OLD_TO_TARGET_DISPLAY_NAME } from "./radarlocal-names.mjs";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const RATINGS_FILE = resolve(process.cwd(), "audit/radarlocal-ratings/ratings.json");

/** The Neon preview branch. Anything else is refused unless it is a localhost database. */
const PREVIEW_ENDPOINT = "ep-raspy-fire-zam9gi7k";
/** The Neon production branch. Named so it can be refused by name rather than by omission. */
const PRODUCTION_ENDPOINT = "ep-gentle-cherry";

/**
 * The five names this export spells differently from `profiles.full_name`, each declared.
 *
 * The value is the **key of `OLD_TO_TARGET_DISPLAY_NAME`** the alias stands for, so the pairing with
 * a `display_name` still happens in exactly one place. A key that is already a name in the shared
 * table is refused below: an alias is for a spelling the table does *not* hold.
 */
const EXPORT_ALIASES: Readonly<Record<string, string>> = {
  "Léo COACH": "Leo COACH",
  "Léo M": "Léo Montpre",
  Maxime: "Maxime Goulard ",
  Thomas: "Thomas Brunet",
  Nicodème: "Nicodème (gronaldo)",
};

/** The three matches this file covers, by Paris day and opponent. Nothing else is imported. */
const EXPECTED_MATCHES: ReadonlyArray<{ day: string; opponent: string; notes: number }> = [
  { day: "2026-09-22", opponent: "Galacticos de Balard", notes: 111 },
  { day: "2026-09-29", opponent: "FC Hexagone", notes: 110 },
  { day: "2026-10-06", opponent: "Bayern Barbecue Club", notes: 121 },
];

/**
 * **The means the owner typed by hand, copied verbatim from `RATING_MEANS` in
 * `scripts/import-radarlocal.mts`.**
 *
 * Copied rather than imported, and the copy is the point: this table is a **record of what is being
 * retired**, not a live input. It is used twice and written to nowhere — to check that the
 * fabrication now in the database really is these numbers before it is deleted, and to print the
 * owner's figure beside the mean the real notes give. Decision 188 holds the result.
 *
 * `player` is the target `users.display_name`, resolved accent- and case-insensitively, which is why
 * « benoit », « remi » and « leo m » are written the way the owner wrote them. Bayern Barbecue Club
 * is absent because he never typed a mean for it: it had no notes at all.
 */
const OWNER_MEANS: ReadonlyArray<{
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

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

class ImportError extends Error {}

function fail(message: string): never {
  throw new ImportError(message);
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

/** The mean of a list of notes, to four decimals — enough to see a rounding, not enough to drown. */
function meanOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function fixed(value: number, places: number): string {
  return value.toFixed(places);
}

/* -------------------------------------------------------------------------- */
/* The export file                                                            */
/* -------------------------------------------------------------------------- */

type SourceNote = {
  id: string;
  match_id: string;
  match_date: string;
  opponent: string;
  rater: string;
  rated: string;
  rating: string;
};

function readSource(): SourceNote[] {
  const parsed = JSON.parse(readFileSync(RATINGS_FILE, "utf8")) as unknown;
  check(Array.isArray(parsed), `${RATINGS_FILE} ne contient pas un tableau.`);
  const notes = parsed as SourceNote[];
  for (const note of notes) {
    check(
      typeof note.id === "string" &&
        typeof note.match_id === "string" &&
        typeof note.match_date === "string" &&
        typeof note.opponent === "string" &&
        typeof note.rater === "string" &&
        typeof note.rated === "string" &&
        typeof note.rating === "string",
      `Une ligne de ${RATINGS_FILE} n'a pas la forme attendue : ${JSON.stringify(note)}`,
    );
  }
  return notes;
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

type TargetMember = {
  membershipId: string;
  userId: string;
  displayName: string;
};

/**
 * Every name in the export, resolved to a `team_members` row.
 *
 * Three ways to fail, all loud: a name that is neither a key of the shared table nor an alias; an
 * alias that duplicates a key (the shared table would already answer, and two answers is one too
 * many); a target `display_name` that matches no member or more than one.
 */
function resolveNames(
  sourceNames: readonly string[],
  members: readonly TargetMember[],
): Map<string, TargetMember> {
  for (const alias of Object.keys(EXPORT_ALIASES)) {
    check(
      !(alias in OLD_TO_TARGET_DISPLAY_NAME),
      `« ${alias} » est à la fois un alias d'export et un nom de OLD_TO_TARGET_DISPLAY_NAME : ` +
        "l'un des deux est en trop.",
    );
    const target = EXPORT_ALIASES[alias];
    check(
      target in OLD_TO_TARGET_DISPLAY_NAME,
      `L'alias « ${alias} » renvoie à « ${target} », qui n'est pas dans ` +
        "OLD_TO_TARGET_DISPLAY_NAME.",
    );
  }

  const byNormalisedDisplayName = new Map<string, TargetMember[]>();
  for (const member of members) {
    const key = normalise(member.displayName);
    byNormalisedDisplayName.set(key, [...(byNormalisedDisplayName.get(key) ?? []), member]);
  }

  const resolved = new Map<string, TargetMember>();
  const seenMembership = new Map<string, string>();

  for (const sourceName of sourceNames) {
    const oldName = sourceName in OLD_TO_TARGET_DISPLAY_NAME ? sourceName : EXPORT_ALIASES[sourceName];
    check(
      oldName !== undefined,
      `« ${sourceName} » n'est ni un nom de OLD_TO_TARGET_DISPLAY_NAME ni un alias déclaré dans ` +
        "EXPORT_ALIASES. Rien n'est deviné : ajoute-le explicitement.",
    );
    const displayName = OLD_TO_TARGET_DISPLAY_NAME[oldName];
    check(
      displayName !== null,
      `« ${sourceName} » est déclaré sans équivalent dans cette équipe, et pourtant il donne ou ` +
        "reçoit une note.",
    );
    const candidates = byNormalisedDisplayName.get(normalise(displayName)) ?? [];
    check(
      candidates.length === 1,
      `« ${sourceName} » → « ${displayName} » : ${candidates.length} membre(s) correspondant(s) ` +
        "dans team_members, un seul attendu.",
    );
    const member = candidates[0];
    const previous = seenMembership.get(member.membershipId);
    check(
      previous === undefined || previous === sourceName,
      `« ${sourceName} » et « ${previous} » désignent le même membre (${member.displayName}) : ` +
        "deux noms de l'export pour une personne.",
    );
    seenMembership.set(member.membershipId, sourceName);
    resolved.set(sourceName, member);
  }

  return resolved;
}

/* -------------------------------------------------------------------------- */
/* Fingerprint                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What the table holds for these three matches, as one line per note and one hash over the lot.
 *
 * `created_at` is **not** in it, and that is deliberate rather than convenient: it is the instant of
 * the insert, the one column a re-run legitimately could move, and the script's answer to that is to
 * carry the old value over rather than to hide it. The fingerprint is over the facts — which note,
 * from whom, about whom, how much.
 */
async function fingerprint(matchIds: readonly string[]): Promise<{ hash: string; lines: string[] }> {
  const raterMember = alias(teamMembers, "rater_member");
  const raterUser = alias(users, "rater_user");
  const ratedMember = alias(teamMembers, "rated_member");
  const ratedUser = alias(users, "rated_user");

  const rows = await db
    .select({
      id: ratings.id,
      matchId: ratings.matchId,
      rater: raterUser.displayName,
      rated: ratedUser.displayName,
      score: ratings.score,
    })
    .from(ratings)
    .innerJoin(raterMember, eq(raterMember.id, ratings.raterMemberId))
    .innerJoin(raterUser, eq(raterUser.id, raterMember.userId))
    .innerJoin(ratedMember, eq(ratedMember.id, ratings.ratedMemberId))
    .innerJoin(ratedUser, eq(ratedUser.id, ratedMember.userId))
    .where(inArray(ratings.matchId, [...matchIds]));

  const lines = rows
    .map((row) => `${row.matchId}|${row.id}|${row.rater}|${row.rated}|${Number(row.score).toFixed(1)}`)
    .sort();
  return { hash: createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16), lines };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

type MatchPlan = {
  matchId: string;
  day: string;
  opponent: string;
  publishedAt: Date | null;
  notes: SourceNote[];
  /** `team_members.id` → minutes, from the frozen stats. */
  minutes: Map<string, number>;
  squad: SquadEntry[];
};

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");

  /* ---- the guard, before anything is read ------------------------------- */

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL n'est pas défini.");
  if (url.includes(PRODUCTION_ENDPOINT)) {
    fail(
      `Cette base est la PRODUCTION (${PRODUCTION_ENDPOINT}). Ce script ne s'y exécute jamais : ` +
        "il supprime des notes, et la décision 188 est explicitement limitée à la préproduction.",
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

  console.log("## Import des vraies notes individuelles de l'ancienne app (décision 188)");
  console.log(`base      ${redact(url)}`);
  console.log(`cible     ${isPreview ? "préproduction Neon" : "base locale"}`);
  console.log(
    `mode      ${commit ? "ÉCRITURE (--commit)" : "simulation (ajoute --commit pour écrire)"}`,
  );

  /* ---- the export ------------------------------------------------------- */

  const source = readSource();
  console.log(`source    ${RATINGS_FILE}`);
  console.log(`notes     ${source.length}`);

  check(
    new Set(source.map((note) => note.id)).size === source.length,
    "Deux notes de l'export portent le même id.",
  );

  /* ---- what the export says about itself, before any mapping ------------ */

  console.log("");
  console.log("### Ce que l'export contient");
  const groups = new Map<string, SourceNote[]>();
  for (const note of source) {
    const key = `${note.match_date}|${note.opponent}`;
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }
  console.log(
    table(
      ["jour", "adversaire", "ancien match_id", "notes", "noteurs", "notés"],
      [...groups.entries()].map(([key, notes]) => {
        const [day, opponent] = key.split("|");
        return [
          day,
          opponent,
          notes[0].match_id,
          padStart(String(notes.length), 5),
          padStart(String(new Set(notes.map((note) => note.rater)).size), 7),
          padStart(String(new Set(notes.map((note) => note.rated)).size), 5),
        ];
      }),
    ),
  );

  const selfNotes = source.filter((note) => note.rater === note.rated);
  const outOfRange = source.filter((note) => {
    const value = Number(note.rating);
    return !Number.isFinite(value) || value < 0 || value > 10;
  });
  const notOneDecimal = source.filter((note) => {
    const value = Number(note.rating);
    return Math.round(value * 10) !== Number((value * 10).toFixed(6));
  });
  const notHalfPoint = source.filter((note) => {
    const value = Number(note.rating);
    return Math.round(value * 2) !== Number((value * 2).toFixed(6));
  });
  console.log("");
  console.log(
    table(
      ["contrainte", "lignes en faute"],
      [
        ["ratings_no_self (rater = rated)", padStart(String(selfNotes.length), 15)],
        ["ratings_score_range (0 à 10)", padStart(String(outOfRange.length), 15)],
        ["ratings_score_one_decimal", padStart(String(notOneDecimal.length), 15)],
        ["demi-point (hors contrainte, pour mémoire)", padStart(String(notHalfPoint.length), 15)],
      ],
    ),
  );
  check(selfNotes.length === 0, `${selfNotes.length} auto-notes : ratings_no_self les refuserait.`);
  check(outOfRange.length === 0, `${outOfRange.length} notes hors de 0–10.`);
  check(notOneDecimal.length === 0, `${notOneDecimal.length} notes à plus d'une décimale.`);

  const duplicateKeys = source.length - new Set(source.map((n) => `${n.match_id}|${n.rater}|${n.rated}`)).size;
  check(
    duplicateKeys === 0,
    `${duplicateKeys} couples (match, noteur, noté) en double : ratings_unique les refuserait.`,
  );

  /* ---- the members ------------------------------------------------------ */

  const memberRows = await db
    .select({
      membershipId: teamMembers.id,
      userId: users.id,
      displayName: users.displayName,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .orderBy(asc(users.displayName));

  const sourceNames = [...new Set([...source.map((n) => n.rater), ...source.map((n) => n.rated)])].sort();
  const byName = resolveNames(sourceNames, memberRows);

  console.log("");
  console.log("### Les noms");
  console.log(
    table(
      ["export", "ancien profiles.full_name", "display_name", "team_members.id", "donne", "reçoit"],
      sourceNames.map((name) => {
        const oldName = name in OLD_TO_TARGET_DISPLAY_NAME ? name : EXPORT_ALIASES[name];
        const member = byName.get(name)!;
        return [
          JSON.stringify(name),
          JSON.stringify(oldName) + (name === oldName ? "" : "  (alias)"),
          member.displayName,
          member.membershipId,
          padStart(String(source.filter((n) => n.rater === name).length), 5),
          padStart(String(source.filter((n) => n.rated === name).length), 6),
        ];
      }),
    ),
  );

  const unmapped = Object.entries(OLD_TO_TARGET_DISPLAY_NAME)
    .filter(([, target]) => target === null)
    .map(([name]) => name);
  for (const name of unmapped) {
    const aliases = Object.entries(EXPORT_ALIASES)
      .filter(([, target]) => target === name)
      .map(([alias]) => alias);
    const mentions = source.filter(
      (note) => [name, ...aliases].includes(note.rater) || [name, ...aliases].includes(note.rated),
    );
    check(
      mentions.length === 0,
      `« ${name} » n'a pas d'équivalent dans cette équipe mais apparaît dans ${mentions.length} notes.`,
    );
    console.log(`sans équivalent : « ${name} » — 0 note donnée, 0 note reçue. Confirmé.`);
  }

  /* ---- the matches ------------------------------------------------------ */

  const matchRows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      opponentName: matches.opponentName,
      status: matches.status,
      publishedAt: matches.ratingsPublishedAt,
    })
    .from(matches)
    .orderBy(asc(matches.kickoffAt));

  const plans: MatchPlan[] = [];
  for (const expected of EXPECTED_MATCHES) {
    const notes = source.filter(
      (note) =>
        note.match_date === expected.day && normalise(note.opponent) === normalise(expected.opponent),
    );
    check(
      notes.length === expected.notes,
      `${expected.opponent} : ${notes.length} notes dans l'export, ${expected.notes} attendues.`,
    );
    const candidates = matchRows.filter(
      (row) =>
        dayKey(row.kickoffAt) === expected.day &&
        normalise(row.opponentName) === normalise(expected.opponent),
    );
    check(
      candidates.length === 1,
      `${expected.day} ${expected.opponent} : ${candidates.length} match(s) correspondant(s) en ` +
        "base, un seul attendu.",
    );
    const match = candidates[0];

    const statRows = await db
      .select({ teamMemberId: matchPlayerStats.teamMemberId, minutes: matchPlayerStats.minutes })
      .from(matchPlayerStats)
      .where(eq(matchPlayerStats.matchId, match.id));
    const squadRows = await db
      .select({ teamMemberId: matchSquad.teamMemberId, role: matchSquad.role })
      .from(matchSquad)
      .where(eq(matchSquad.matchId, match.id));

    plans.push({
      matchId: match.id,
      day: expected.day,
      opponent: match.opponentName,
      publishedAt: match.publishedAt,
      notes,
      minutes: new Map(statRows.map((row) => [row.teamMemberId, row.minutes])),
      squad: squadRows.map((row) => ({ teamMemberId: row.teamMemberId, role: row.role })),
    });
  }

  console.log("");
  console.log("### Les matchs");
  console.log(
    table(
      ["jour", "adversaire", "matches.id", "notes en base", "notes à écrire", "moyennes sorties ?"],
      await Promise.all(
        plans.map(async (plan) => {
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(ratings)
            .where(eq(ratings.matchId, plan.matchId));
          return [
            plan.day,
            plan.opponent,
            plan.matchId,
            padStart(String(count), 13),
            padStart(String(plan.notes.length), 14),
            plan.publishedAt ? `oui (${plan.publishedAt.toISOString()})` : "non",
          ];
        }),
      ),
    ),
  );
  console.log(
    "ratings_published_at n'est pas touché : publier est le geste de l'entraîneur (décisions 139, 145, 180).",
  );

  /* ---- check 1: every rated player played ------------------------------- */

  console.log("");
  console.log("### Vérification 1 — tout joueur noté a des minutes (décision 137)");
  const ratedWithoutMinutes: string[] = [];
  for (const plan of plans) {
    const rows: string[][] = [];
    for (const name of [...new Set(plan.notes.map((note) => note.rated))].sort()) {
      const member = byName.get(name)!;
      const minutes = plan.minutes.get(member.membershipId) ?? null;
      const ok = minutes !== null && minutes > 0;
      if (!ok) ratedWithoutMinutes.push(`${plan.opponent} / ${member.displayName}`);
      rows.push([
        member.displayName,
        padStart(minutes === null ? "aucune ligne" : `${minutes}’`, 12),
        padStart(String(plan.notes.filter((note) => note.rated === name).length), 5),
        ok ? "ok" : "REFUSÉ",
      ]);
    }
    console.log("");
    console.log(`${plan.day} ${plan.opponent} — ${rows.length} joueurs notés`);
    console.log(table(["noté", "minutes", "notes", ""], rows));
  }
  check(
    ratedWithoutMinutes.length === 0,
    `Noté(s) sans minutes : ${ratedWithoutMinutes.join(", ")}. L'application refuserait ces notes.`,
  );

  /* ---- check 2: every rater is eligible --------------------------------- */

  console.log("");
  console.log("### Vérification 2 — tout noteur est éligible (décision 159)");
  const ineligible: string[] = [];
  for (const plan of plans) {
    const played = [...plan.minutes.entries()].map(([teamMemberId, minutes]) => ({
      teamMemberId,
      minutes,
    }));
    const eligible = new Set(eligibleRaterIds(plan.squad, played));
    const roleOf = new Map(plan.squad.map((entry) => [entry.teamMemberId, entry.role]));
    const rows: string[][] = [];
    for (const name of [...new Set(plan.notes.map((note) => note.rater))].sort()) {
      const member = byName.get(name)!;
      const ok = eligible.has(member.membershipId);
      if (!ok) ineligible.push(`${plan.opponent} / ${member.displayName}`);
      rows.push([
        member.displayName,
        roleOf.get(member.membershipId) ?? "pas sur la feuille",
        padStart(`${plan.minutes.get(member.membershipId) ?? 0}’`, 8),
        padStart(String(plan.notes.filter((note) => note.rater === name).length), 6),
        ok ? "ok" : "REFUSÉ",
      ]);
    }
    const silent = [...eligible].filter(
      (id) => ![...new Set(plan.notes.map((n) => n.rater))].some((n) => byName.get(n)!.membershipId === id),
    );
    console.log("");
    console.log(
      `${plan.day} ${plan.opponent} — ${rows.length} noteurs, ${eligible.size} éligibles sur la feuille`,
    );
    console.log(table(["noteur", "rôle", "minutes", "notes", ""], rows));
    if (silent.length > 0) {
      const names = silent
        .map((id) => memberRows.find((member) => member.membershipId === id)?.displayName ?? id)
        .sort();
      console.log(`éligibles qui n'ont rien envoyé : ${names.join(", ")}`);
    }
  }
  check(
    ineligible.length === 0,
    `Noteur(s) non éligible(s) : ${ineligible.join(", ")}. L'application refuserait ces notes, ` +
      "donc rien n'est écrit : à signaler au propriétaire plutôt qu'à contourner.",
  );

  /* ---- check 3: the means, beside the owner's --------------------------- */

  console.log("");
  console.log("### Vérification 3 — les moyennes réelles face à celles saisies à la main");
  const meansMismatch: string[] = [];
  for (const plan of plans) {
    const owner = OWNER_MEANS.find((entry) => normalise(entry.opponent) === normalise(plan.opponent));
    const stored = await db
      .select({
        member: ratings.ratedMemberId,
        score: ratings.score,
      })
      .from(ratings)
      .where(eq(ratings.matchId, plan.matchId));
    const storedByMember = new Map<string, number[]>();
    for (const row of stored) {
      storedByMember.set(row.member, [...(storedByMember.get(row.member) ?? []), Number(row.score)]);
    }

    const rows: string[][] = [];
    const names = [...new Set(plan.notes.map((note) => note.rated))];
    const realMeans = new Map(
      names.map((name) => [
        name,
        meanOf(plan.notes.filter((note) => note.rated === name).map((note) => Number(note.rating))),
      ]),
    );
    for (const name of names.sort((a, b) => realMeans.get(b)! - realMeans.get(a)!)) {
      const member = byName.get(name)!;
      const real = realMeans.get(name)!;
      const ownerEntry = owner?.players.find(
        (entry) => normalise(entry.player) === normalise(member.displayName),
      );
      const storedValues = storedByMember.get(member.membershipId) ?? [];
      const storedDistinct = [...new Set(storedValues.map((value) => value.toFixed(1)))];
      const delta = ownerEntry === undefined ? null : real - ownerEntry.mean;
      if (delta !== null && Math.abs(delta) >= 0.005) {
        meansMismatch.push(
          `${plan.opponent} / ${member.displayName} : réel ${fixed(real, 4)}, saisi ${ownerEntry!.mean}`,
        );
      }
      rows.push([
        member.displayName,
        padStart(String(plan.notes.filter((note) => note.rated === name).length), 5),
        padStart(fixed(real, 4), 9),
        padStart(ownerEntry === undefined ? "—" : fixed(ownerEntry.mean, 2), 7),
        padStart(delta === null ? "—" : fixed(delta, 4), 8),
        padStart(storedDistinct.length === 0 ? "—" : storedDistinct.join("/"), 9),
        padStart(String(storedValues.length), 5),
      ]);
    }
    console.log("");
    console.log(`${plan.day} ${plan.opponent}`);
    console.log(
      table(
        ["noté", "notes", "moy. réelle", "saisie", "écart", "en base", "lignes"],
        rows,
      ),
    );
  }
  if (meansMismatch.length > 0) {
    console.log("");
    console.log("ÉCARTS avec les moyennes saisies à la main :");
    for (const line of meansMismatch) console.log(`  ${line}`);
  } else {
    console.log("");
    console.log(
      "Chaque moyenne réelle est égale à la moyenne saisie à la main à l'arrondi de la deuxième " +
        "décimale près. La fabrication disait vrai de la moyenne, et faux de tout le reste.",
    );
  }

  /* ---- the fabrication being retired, checked against OWNER_MEANS ------- */

  console.log("");
  console.log("### Ce qui est en base : la fabrication de la décision 145, ou déjà le vrai relevé");
  for (const plan of plans) {
    const owner = OWNER_MEANS.find((entry) => normalise(entry.opponent) === normalise(plan.opponent));
    const stored = await db
      .select({
        id: ratings.id,
        rater: ratings.raterMemberId,
        rated: ratings.ratedMemberId,
        score: ratings.score,
      })
      .from(ratings)
      .where(eq(ratings.matchId, plan.matchId));

    if (stored.length === 0) {
      console.log(
        `${plan.opponent} : aucune note en base` +
          (owner === undefined ? ", et aucune moyenne saisie à la main." : "."),
      );
      continue;
    }

    const storedByMember = new Map<string, Set<string>>();
    for (const row of stored) {
      const set = storedByMember.get(row.rated) ?? new Set<string>();
      set.add(Number(row.score).toFixed(1));
      storedByMember.set(row.rated, set);
    }
    const singleValued = [...storedByMember.values()].filter((set) => set.size === 1).length;

    // Already the real record? That is what a second run sees, and it is not an error.
    const key = (row: { id: string; rater: string; rated: string; score: number | string }) =>
      `${row.id}|${row.rater}|${row.rated}|${Number(row.score).toFixed(1)}`;
    const storedKeys = stored.map(key).sort().join("\n");
    const exportKeys = plan.notes
      .map((note) =>
        key({
          id: note.id,
          rater: byName.get(note.rater)!.membershipId,
          rated: byName.get(note.rated)!.membershipId,
          score: Number(note.rating),
        }),
      )
      .sort()
      .join("\n");
    if (storedKeys === exportKeys) {
      console.log(
        `${plan.opponent} : ${stored.length} lignes, déjà exactement celles de l'export — rien à ` +
          "retirer, cette exécution est une reprise.",
      );
      continue;
    }

    // Otherwise it must be the fabrication, and the copy of `RATING_MEANS` above must describe it.
    const faithful =
      owner !== undefined &&
      owner.players.every((entry) => {
        const member = memberRows.find(
          (candidate) => normalise(candidate.displayName) === normalise(entry.player),
        );
        if (member === undefined) return false;
        const set = storedByMember.get(member.membershipId);
        return set !== undefined && set.size === 1 && [...set][0] === entry.rounded.toFixed(1);
      });
    console.log(
      `${plan.opponent} : ${stored.length} lignes, ${storedByMember.size} joueurs, ` +
        `une seule valeur distincte par joueur pour ${singleValued} d'entre eux — ` +
        `conforme à OWNER_MEANS : ${faithful ? "oui" : "NON"}`,
    );
    check(
      faithful,
      `${plan.opponent} : ce qui est en base n'est ni l'export ni la fabrication décrite par ` +
        "OWNER_MEANS. Quelqu'un d'autre a écrit ces notes : rien n'est supprimé avant que ce soit " +
        "élucidé.",
    );
  }

  /* ---- the three-note floor --------------------------------------------- */

  console.log("");
  console.log(`### Le plancher de ${MIN_NOTES_FOR_MEAN} notes (MIN_NOTES_FOR_MEAN)`);
  const belowFloor: string[] = [];
  for (const plan of plans) {
    const counts = [...new Set(plan.notes.map((note) => note.rated))].map((name) => ({
      name: byName.get(name)!.displayName,
      count: plan.notes.filter((note) => note.rated === name).length,
    }));
    const min = Math.min(...counts.map((entry) => entry.count));
    const max = Math.max(...counts.map((entry) => entry.count));
    for (const entry of counts) {
      if (entry.count < MIN_NOTES_FOR_MEAN) belowFloor.push(`${plan.opponent} / ${entry.name}`);
    }
    console.log(
      `${plan.day} ${plan.opponent} : de ${min} à ${max} notes par joueur — plancher franchi par ` +
        `${counts.filter((entry) => entry.count >= MIN_NOTES_FOR_MEAN).length}/${counts.length}`,
    );
  }
  check(belowFloor.length === 0, `Sous le plancher : ${belowFloor.join(", ")}.`);

  /* ---- the fingerprint, before -------------------------------------------- */

  const matchIds = plans.map((plan) => plan.matchId);
  const before = await fingerprint(matchIds);
  console.log("");
  console.log(`### Empreinte avant : ${before.hash} (${before.lines.length} lignes)`);

  if (!commit) {
    console.log("");
    console.log("Simulation terminée : rien n'a été écrit en base. Relance avec --commit.");
    return;
  }

  /* ---- the write ---------------------------------------------------------- */

  console.log("");
  console.log("### Écriture");
  for (const plan of plans) {
    // Read before deleting, so a second run re-uses the `created_at` of the rows it is about to
    // rewrite and the table comes out byte-identical.
    const existing = await db
      .select({ id: ratings.id, createdAt: ratings.createdAt })
      .from(ratings)
      .where(eq(ratings.matchId, plan.matchId));
    const createdAtById = new Map(existing.map((row) => [row.id, row.createdAt]));

    const values = plan.notes.map((note) => {
      const createdAt = createdAtById.get(note.id);
      return {
        id: note.id,
        matchId: plan.matchId,
        raterMemberId: byName.get(note.rater)!.membershipId,
        ratedMemberId: byName.get(note.rated)!.membershipId,
        score: Number(note.rating),
        ...(createdAt ? { createdAt } : {}),
      };
    });

    const deleted = await db.transaction(async (tx) => {
      const removed = await tx.delete(ratings).where(eq(ratings.matchId, plan.matchId)).returning({
        id: ratings.id,
      });
      await tx.insert(ratings).values(values);
      return removed.length;
    });
    const reused = values.filter((value) => "createdAt" in value).length;
    console.log(
      `${plan.day} ${plan.opponent} : ${deleted} supprimées, ${values.length} insérées ` +
        `(${reused} created_at repris).`,
    );
  }

  /* ---- verification, computed from the export rather than from the insert - */

  console.log("");
  console.log("### Vérification après écriture");

  const after = await fingerprint(matchIds);
  console.log(`empreinte après : ${after.hash} (${after.lines.length} lignes)`);

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ratings)
    .where(inArray(ratings.matchId, matchIds));
  check(
    Number(total) === source.length,
    `${total} notes en base pour ces trois matchs, ${source.length} attendues.`,
  );
  console.log(`total : ${total} notes pour les trois matchs, ${source.length} attendues.`);

  for (const plan of plans) {
    const rows = await db
      .select({
        rater: ratings.raterMemberId,
        rated: ratings.ratedMemberId,
        score: ratings.score,
      })
      .from(ratings)
      .where(eq(ratings.matchId, plan.matchId));
    check(
      rows.length === plan.notes.length,
      `${plan.opponent} : ${rows.length} notes en base, ${plan.notes.length} attendues.`,
    );
    check(
      rows.every((row) => row.rater !== row.rated),
      `${plan.opponent} : une auto-note est en base.`,
    );
    check(
      rows.every((row) => {
        const value = Number(row.score);
        return value >= 0 && value <= 10 && Math.round(value * 10) === Number((value * 10).toFixed(6));
      }),
      `${plan.opponent} : une note est hors de 0–10 ou a plus d'une décimale.`,
    );

    // Expected counts and means, recomputed **from the export** rather than from what was just
    // inserted: a verification that reads the insert back through the same arithmetic would agree
    // with itself whatever it wrote.
    const expected = new Map<string, number[]>();
    for (const note of plan.notes) {
      const id = byName.get(note.rated)!.membershipId;
      expected.set(id, [...(expected.get(id) ?? []), Number(note.rating)]);
    }
    const got = new Map<string, number[]>();
    for (const row of rows) {
      got.set(row.rated, [...(got.get(row.rated) ?? []), Number(row.score)]);
    }
    check(
      expected.size === got.size,
      `${plan.opponent} : ${got.size} joueurs notés en base, ${expected.size} attendus.`,
    );
    const lines: string[][] = [];
    for (const [memberId, values] of expected) {
      const stored = got.get(memberId) ?? [];
      const name = memberRows.find((member) => member.membershipId === memberId)!.displayName;
      check(
        stored.length === values.length,
        `${plan.opponent} / ${name} : ${stored.length} notes en base, ${values.length} attendues.`,
      );
      check(
        [...stored].sort((a, b) => a - b).join(",") === [...values].sort((a, b) => a - b).join(","),
        `${plan.opponent} / ${name} : les notes en base ne sont pas celles de l'export.`,
      );
      lines.push([
        name,
        padStart(String(values.length), 5),
        padStart(fixed(meanOf(values), 4), 11),
        padStart(String(new Set(stored.map((value) => value.toFixed(1))).size), 9),
      ]);
    }
    console.log("");
    console.log(`${plan.day} ${plan.opponent} — conforme à l'export`);
    console.log(table(["noté", "notes", "moyenne", "valeurs distinctes"], lines));
  }

  /* ---- publication, untouched -------------------------------------------- */

  console.log("");
  const published = await db
    .select({
      opponentName: matches.opponentName,
      publishedAt: matches.ratingsPublishedAt,
    })
    .from(matches)
    .where(inArray(matches.id, matchIds))
    .orderBy(asc(matches.kickoffAt));
  for (const row of published) {
    const plan = plans.find((candidate) => candidate.opponent === row.opponentName)!;
    check(
      (row.publishedAt?.toISOString() ?? null) === (plan.publishedAt?.toISOString() ?? null),
      `${row.opponentName} : ratings_published_at a bougé, ce script ne doit jamais y toucher.`,
    );
    console.log(
      `${row.opponentName} : moyennes ${
        row.publishedAt ? `sorties le ${row.publishedAt.toISOString()}` : "non sorties — cachées jusqu'à « Sortir les moyennes »"
      } (inchangé).`,
    );
  }

  console.log("");
  console.log(
    "Relance ce script avec --commit : l'empreinte « avant » doit alors être égale à " +
      `${after.hash}, et l'« après » aussi.`,
  );
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
