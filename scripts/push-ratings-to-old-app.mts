/**
 * Copies the notes given in 7orteils into `info-radarlocal`, when the old app does not have them.
 *
 * ```bash
 *   SUPABASE_SERVICE_ROLE_KEY='eyJ…' DATABASE_URL='…' \
 *     npx tsx --conditions=react-server scripts/push-ratings-to-old-app.mts
 *   … --commit                 # actually write
 * ```
 *
 * ## Why this exists
 *
 * The team votes in both apps now. `scripts/import-ratings-from-old-app.mts` already brings the old
 * app's notes here; the owner asked for the other half — « if someone put a rating on 7orteils and not
 * on info radar, it is also updated in info radar » (decision 222). Together the two make
 * `sync-ratings` a two-way sync.
 *
 * ## The rule, the same in both directions: insert, never update
 *
 * A note that exists in only one app is copied to the other. **Where both apps already have a note for
 * the same (match, rater, rated), neither is touched**, whatever the two scores are: there is no way to
 * tell which one he meant, and an update in either direction would rewrite somebody's vote without
 * telling him. The pull reports those pairs; this script simply leaves them alone.
 *
 * ## Why the old app's copy keeps 7orteils' id
 *
 * The note is written over there **with this app's `ratings.id`**. The pull keys on the old app's note
 * id, so on the next run it sees that id already here and skips it as a re-run. Without that, a note
 * would come back as a « double vote » with itself, and the two scripts would report each other's work
 * as a conflict for ever.
 *
 * ## What is skipped, and why it is not an error
 *
 * The old app's own rules, which the `service_role` key bypasses and this script therefore applies by
 * hand, so that nothing written there is a row its own screens could not have produced:
 *
 *  - **the rater has a `lineups` row for that match** over there (its RLS, `ratings_insert_if_in_lineup`);
 *  - **the rated player has `minutes_played > 0`** over there (what its rating screen offers).
 *
 * A note failing either is counted and skipped, not written and not fatal: a match never pushed to the
 * old app, or a supporter named here after the push, is an ordinary state. So is a teammate with no
 * account over there. Each is reported with a count.
 *
 * ## Privacy
 *
 * **No score is ever printed**, nor a rater→rated pair. This runs in CI, and the Actions logs of a
 * public repository are public (decision 220).
 *
 * ## Safety
 *
 * Reads this app and **never writes it**. Writes only `ratings` over there, insert-only, and only with
 * `--commit`; `on_conflict … ignore-duplicates` is the backstop if somebody votes between the read and
 * the write. Warns on a pooled connection string rather than refusing it (decision 219).
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import postgres from "postgres";

import {
  eligibleRatingsByMatch,
  type RatingEligibilityContext,
} from "../lib/rating/eligibility.js";
import type { SquadEntry } from "../lib/rating/progress.js";
import { OLD_TO_TARGET_DISPLAY_NAME } from "./radarlocal-names.mjs";

const PROJECT_REF = "foqqovzyvstancdtxnyn";
const REST = `https://${PROJECT_REF}.supabase.co/rest/v1`;

/** Spellings that differ from the shared table by more than accents or spaces. Same as the push. */
const EXPORT_ALIASES: Readonly<Record<string, string>> = {
  "leo coach": "Léo C",
  benjamin: "Benjamin",
  raph: "Raphaël",
};

const commit = process.argv.includes("--commit");

const redact = (url: string) => url.replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@");
function refuse(message: string): never {
  console.error(`ABANDON : ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) refuse("DATABASE_URL n'est pas défini.");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) refuse("SUPABASE_SERVICE_ROLE_KEY n'est pas défini : c'est la clé qui écrit l'ancienne app.");
if (url!.includes("-pooler")) {
  console.log("ATTENTION : cette URL passe par le pooler Neon (décision 219).");
}

async function rest<T>(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<T> {
  const response = await fetch(`${REST}/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key!}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  if (!response.ok) {
    refuse(`L'ancienne app a répondu ${response.status} sur ${path.split("?")[0]} : ${text.slice(0, 200)}`);
  }
  return (text === "" ? null : JSON.parse(text)) as T;
}

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const parisDay = (iso: string): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/* -------------------------------------------------------------------------- */
/* This app                                                                   */
/* -------------------------------------------------------------------------- */

const sql = postgres(url!, { max: 1 });
console.log(`notes      ${redact(url!)}`);
console.log(`notes      ${commit ? "ÉCRITURE (--commit)" : "simulation — rien ne sera écrit"}\n`);

type OurNote = {
  id: string;
  matchId: string;
  day: string;
  opponent: string;
  rater: string;
  rated: string;
  score: string;
};
const allNotes = (await sql`
  select r.id, r.match_id as "matchId",
         r.rater_member_id as "raterMemberId", r.rated_member_id as "ratedMemberId",
         to_char(m.kickoff_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as day,
         m.opponent_name as opponent,
         coalesce(ur.display_name, ur.username) as rater,
         coalesce(ud.display_name, ud.username) as rated,
         r.score::text as score
  from ratings r
  join matches m on m.id = r.match_id
  join team_members tr on tr.id = r.rater_member_id
  left join users ur on ur.id = tr.user_id
  join team_members td on td.id = r.rated_member_id
  left join users ud on ud.id = td.user_id
  order by m.kickoff_at
`) as unknown as (OurNote & { raterMemberId: string; ratedMemberId: string })[];

/*
 * A note that does not count here is not copied there (decision 226). When the coach removes somebody
 * from a finished match his notes are kept but hidden, and copying them to the old app would put back
 * over there exactly what he took off here. Judged with the same shared rule every screen uses
 * (`lib/rating/eligibility.ts`), against each match's sheet and frozen minutes.
 */
const matchIds = [...new Set(allNotes.map((note) => note.matchId))];
const sheetRows = (matchIds.length === 0
  ? []
  : await sql`
      select match_id as "matchId", team_member_id as "teamMemberId", role::text as role
      from match_squad where match_id in ${sql(matchIds)}
    `) as unknown as { matchId: string; teamMemberId: string; role: SquadEntry["role"] }[];
const playedRows = (matchIds.length === 0
  ? []
  : await sql`
      select match_id as "matchId", team_member_id as "teamMemberId", minutes
      from match_player_stats where match_id in ${sql(matchIds)}
    `) as unknown as { matchId: string; teamMemberId: string; minutes: number }[];
await sql.end();

const contexts = new Map<string, RatingEligibilityContext>(
  matchIds.map((matchId) => [
    matchId,
    {
      sheet: sheetRows.filter((row) => row.matchId === matchId),
      played: playedRows.filter((row) => row.matchId === matchId),
    },
  ]),
);
const ours = eligibleRatingsByMatch(allNotes, contexts);
const hiddenHere = allNotes.length - ours.length;

/* -------------------------------------------------------------------------- */
/* The old app                                                                */
/* -------------------------------------------------------------------------- */

const profiles = await rest<{ id: string; full_name: string }[]>("profiles?select=id,full_name");
const tableByKey = new Map(
  Object.entries(OLD_TO_TARGET_DISPLAY_NAME).map(([from, to]) => [norm(from), to]),
);
// An explicit `null` in the table means « no counterpart », and is tested before the fallback.
const profileByOurName = new Map<string, string>();
for (const profile of profiles) {
  const k = norm(profile.full_name);
  const alias = EXPORT_ALIASES[k];
  const mapped = tableByKey.has(k) ? tableByKey.get(k) : undefined;
  if (mapped === null && alias === undefined) continue;
  profileByOurName.set(norm(alias ?? mapped ?? profile.full_name), profile.id);
}

const targets = await rest<{ id: string; opponent: string; match_date: string }[]>(
  "matches?select=id,opponent,match_date",
);
/** One of our matches → the old app's, by Paris day and then by opponent, as the importer does. */
const targetCache = new Map<string, string | null>();
function targetFor(note: OurNote): string | null {
  const cacheKey = note.matchId;
  if (targetCache.has(cacheKey)) return targetCache.get(cacheKey)!;
  const sameDay = targets.filter((t) => parisDay(t.match_date) === note.day);
  const found =
    sameDay.length === 1 ? sameDay[0] : sameDay.find((t) => norm(t.opponent) === norm(note.opponent));
  targetCache.set(cacheKey, found?.id ?? null);
  return found?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

type Row = { id: string; match_id: string; rater_id: string; rated_player_id: string; rating: number };
type Tally = { day: string; opponent: string; total: number; write: number; there: number; skipped: number };

const tallies = new Map<string, Tally>();
const toWrite: Row[] = [];
const noMatchThere = new Set<string>();
const noAccountThere = new Set<string>();
let notOnSheetThere = 0;
let ratedDidNotPlayThere = 0;

/** Per old-app match: its lineups and its existing notes, fetched once. */
const sheets = new Map<
  string,
  { onSheet: Set<string>; played: Set<string>; pairs: Set<string>; ids: Set<string> }
>();
async function sheetOf(targetId: string) {
  const known = sheets.get(targetId);
  if (known) return known;
  const [lineups, notes] = await Promise.all([
    rest<{ player_id: string; minutes_played: number }[]>(
      `lineups?select=player_id,minutes_played&match_id=eq.${targetId}`,
    ),
    rest<{ id: string; rater_id: string; rated_player_id: string }[]>(
      `ratings?select=id,rater_id,rated_player_id&match_id=eq.${targetId}`,
    ),
  ]);
  const sheet = {
    onSheet: new Set(lineups.map((l) => l.player_id)),
    played: new Set(lineups.filter((l) => l.minutes_played > 0).map((l) => l.player_id)),
    pairs: new Set(notes.map((n) => `${n.rater_id}|${n.rated_player_id}`)),
    ids: new Set(notes.map((n) => n.id)),
  };
  sheets.set(targetId, sheet);
  return sheet;
}

for (const note of ours) {
  const tally = tallies.get(note.matchId) ?? {
    day: note.day,
    opponent: note.opponent,
    total: 0,
    write: 0,
    there: 0,
    skipped: 0,
  };
  tallies.set(note.matchId, tally);
  tally.total += 1;

  const targetId = targetFor(note);
  if (!targetId) {
    noMatchThere.add(`${note.day} ${note.opponent}`);
    tally.skipped += 1;
    continue;
  }
  const rater = profileByOurName.get(norm(note.rater));
  const rated = profileByOurName.get(norm(note.rated));
  if (!rater || !rated) {
    if (!rater) noAccountThere.add(note.rater);
    if (!rated) noAccountThere.add(note.rated);
    tally.skipped += 1;
    continue;
  }
  const sheet = await sheetOf(targetId);
  // Already there: either this very note (pushed before, or imported from there), or his own vote
  // over there for the same pair. Both are left alone — insert, never update.
  if (sheet.ids.has(note.id) || sheet.pairs.has(`${rater}|${rated}`)) {
    tally.there += 1;
    continue;
  }
  if (!sheet.onSheet.has(rater)) {
    notOnSheetThere += 1;
    tally.skipped += 1;
    continue;
  }
  if (!sheet.played.has(rated)) {
    ratedDidNotPlayThere += 1;
    tally.skipped += 1;
    continue;
  }
  tally.write += 1;
  toWrite.push({
    id: note.id,
    match_id: targetId,
    rater_id: rater,
    rated_player_id: rated,
    rating: Number(note.score),
  });
}

console.log("date         adversaire                   notes  à copier  déjà là  ignorées");
console.log("-----------  ---------------------------  -----  --------  -------  --------");
for (const t of tallies.values()) {
  console.log(
    `${t.day}   ${t.opponent.padEnd(27)}  ${String(t.total).padStart(5)}  ${String(t.write).padStart(8)}  ` +
      `${String(t.there).padStart(7)}  ${String(t.skipped).padStart(8)}`,
  );
}
console.log(`\nnotes      ${toWrite.length} à copier vers l'ancienne application · aucune mise à jour`);
if (hiddenHere > 0) {
  console.log(
    `notes      ${hiddenHere} note(s) non copiée(s) : la personne n’est plus sur ce match ici (décision 226)`,
  );
}
if (noMatchThere.size > 0) {
  console.log(`notes      match absent là-bas (pousse-le d'abord) : ${[...noMatchThere].join(", ")}`);
}
if (noAccountThere.size > 0) {
  console.log(`notes      sans compte là-bas : ${[...noAccountThere].join(", ")}`);
}
if (notOnSheetThere > 0) {
  console.log(
    `notes      ${notOnSheetThere} note(s) d'une personne absente de la feuille là-bas — relance ` +
      `push-match avec « overwrite » pour l'y inscrire`,
  );
}
if (ratedDidNotPlayThere > 0) {
  console.log(`notes      ${ratedDidNotPlayThere} note(s) sur un joueur à 0' là-bas, ignorées`);
}

if (!commit || toWrite.length === 0) {
  console.log(commit ? "\nRien à copier." : "\nSimulation terminée : rien n'a été écrit. Relance avec --commit.");
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

// The unique key on (match, rater, rated) is the backstop for a vote cast between the read and now.
for (let i = 0; i < toWrite.length; i += 200) {
  await rest("ratings?on_conflict=match_id,rater_id,rated_player_id", {
    method: "POST",
    body: toWrite.slice(i, i + 200),
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
}
console.log(`\nnotes      ${toWrite.length} note(s) copiée(s) dans l'ancienne application.`);
