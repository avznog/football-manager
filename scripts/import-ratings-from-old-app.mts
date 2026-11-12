/**
 * Brings a match's individual ratings over from the old app, which is still where the team votes.
 *
 * ```bash
 *   SUPABASE_ACCESS_TOKEN='sbp_…' DATABASE_URL='…' \
 *     npx tsx --conditions=react-server scripts/import-ratings-from-old-app.mts
 *   … --commit                 # write to the preview or a local database
 *   … --commit --production    # write to production, which must be spelled out
 * ```
 *
 * `--conditions=react-server` is not optional: `lib/rating/progress.ts` sits behind modules marked
 * `import "server-only"`, whose `default` export throws otherwise. `.mts` because tsx's CJS output
 * has no top-level `await`.
 *
 * ## Why this exists, and why it is not `scripts/import-ratings.mts`
 *
 * That script was a one-off: it retired the fabricated means of decision 145 in favour of the 342
 * real notes, and it is pinned to those three matches by name and by note count, cross-checks them
 * against the owner's hand-typed means, and **deletes** a match's ratings before writing. None of
 * that is what is wanted now, and all of it would be dangerous now that production is the only copy
 * of the season (decision 201).
 *
 * The team keeps voting in `info-radarlocal` after each match, so this is a recurring import rather
 * than a migration. It therefore does the opposite of its predecessor: it **only ever inserts**,
 * never deletes and never updates, and it leaves any note already present exactly as it is.
 *
 * ## What it reads and how a match is identified
 *
 * Live from the old app's Supabase project over the Management API, not from a dumped file: a file
 * is a snapshot and the point here is the notes added since the last one. A match is matched to this
 * database by **Paris calendar day and opponent name**, accent- and case-insensitively. The old
 * app's `match_id` is printed but never looked up, because this database has never heard of it. A
 * Supabase match that resolves to no row here, or to more than one, is **reported and skipped** —
 * not guessed at, and not a reason to abort the matches that did resolve.
 *
 * ## Names
 *
 * `OLD_TO_TARGET_DISPLAY_NAME` in `scripts/radarlocal-names.mts` is the one table, shared with the
 * other importers. It is applied after a normalisation that strips accents and collapses spaces, so
 * « Edouard » reaches « Édouard » and the trailing space on « Lucien » is harmless. One alias is
 * declared here because the two spellings differ by more than punctuation: **« Léo COACH » is
 * « Léo C »**. Nothing is inferred — no prefix match, no edit distance — because « Léo » is a prefix
 * of both Léos and getting that wrong would attribute one man's notes to another with nothing
 * failing anywhere. A name that resolves to nobody aborts before a single row is written.
 *
 * ## The two rules it will not break
 *
 * The app refuses a note that breaks either of these, so a row that breaks one is a row the screens
 * would never have produced. Both are checked against this database and a failure **aborts before
 * anything is written** rather than being quietly dropped:
 *
 *  1. **the rated player has `minutes > 0`** in that match (decision 137). Who may be rated is a
 *     fact about the log, not about the sheet;
 *  2. **the rater is eligible** — a `match_squad` row as starter, substitute or supporter, or
 *     minutes in the match (decision 159). It asks `eligibleRaterIds` from `lib/rating/progress.ts`,
 *     the same function the screens ask, rather than a restatement of it that could drift.
 *
 * The database's own constraints are the backstop and are checked first anyway: `ratings_no_self`,
 * `ratings_score_range`, `ratings_score_one_decimal`.
 *
 * ## What it does not touch
 *
 * **`matches.ratings_published_at`.** Publishing is the coach's switch and never a script's
 * (decisions 139, 145 and 180), so imported notes land hidden on an unpublished match and stay
 * hidden until he presses « Sortir les moyennes ».
 *
 * ## Idempotency
 *
 * `ratings.id` is the **old app's own note id**, so a second run offers the same primary keys and
 * every row is recognised as already present and skipped. Running it twice changes nothing, and the
 * count it prints says how many it skipped for that reason.
 *
 * ## Safety
 *
 * **Warns** on a `-pooler` host rather than refusing it (decision 219). It refused until the CI job
 * hit it: the `DATABASE_URL` secret is the pooled string, by `release.yml`'s own instruction, and
 * production migrations run through it. The hazard `COORDINATION.md` names — a pooled session carrying
 * an empty `search_path` after a `pg_restore` — fails loudly on the first query rather than reading or
 * writing the wrong thing. **Production needs `--production` on the command line**, because decision 201 made it the only copy of the season. Dry run unless
 * `--commit`, and the target is printed with its password redacted first.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import postgres from "postgres";

import { eligibleRaterIds, type SquadEntry } from "../lib/rating/progress";
import { OLD_TO_TARGET_DISPLAY_NAME } from "./radarlocal-names.mjs";

const PROJECT_REF = "foqqovzyvstancdtxnyn";
const PREVIEW_HOST = "ep-raspy-fire-zam9gi7k";
const PRODUCTION_HOST = "ep-gentle-cherry";
/** « Léo COACH » and « Léo C » differ by more than accents, so the pairing is declared, not guessed. */
const EXPORT_ALIASES: Readonly<Record<string, string>> = { "leo coach": "Léo C" };

const commit = process.argv.includes("--commit");
const production = process.argv.includes("--production");

const redact = (url: string) => url.replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@");
function refuse(message: string): never {
  console.error(`ABANDON : ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) refuse("DATABASE_URL n'est pas défini.");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) refuse("SUPABASE_ACCESS_TOKEN n'est pas défini : c'est la source des notes.");
if (url!.includes("-pooler")) {
  /*
   * A warning and not a refusal, since 2026-10-28 (decision 219).
   *
   * `COORDINATION.md` says « direct endpoint only, never -pooler », and this script refused on that
   * basis until the CI job it exists for hit it on its first run: the `DATABASE_URL` secret is the
   * **pooled** string, deliberately and by `release.yml`'s own instruction — « Set it to the pooled
   * Neon string — docs/DEPLOY.md §4 » — and production migrations have been running through it for
   * every release so far.
   *
   * The hazard that rule protects against is real but it is **loud**: a pooled session that inherited
   * `search_path = ''` from a `pg_restore` answers every query with « relation does not exist », so it
   * aborts rather than reading or writing the wrong thing. Nothing here can produce a *wrong* figure
   * over the pooler; it can only fail. That is worth a line of output, not a refusal that stops the
   * job the owner asked for.
   *
   * The dump-and-restore rule in `COORDINATION.md` is untouched: that is about `pg_dump`,
   * `pg_restore` and a hand-run migration after one, where the pooled connection really can leave a
   * schema nobody notices.
   */
  console.log(
    "ATTENTION : cette URL passe par le pooler Neon. C'est ce que le secret CI contient et ce que " +
      "release.yml demande ; si une requête échoue sur « relation … does not exist », c'est le " +
      "search_path du pooler (COORDINATION.md) et il faut le point d'entrée direct.",
  );
}
const isProductionUrl = url!.includes(PRODUCTION_HOST);
if (isProductionUrl && !production) {
  refuse(
    `Cette base est la PRODUCTION (${PRODUCTION_HOST}). Ajoute --production pour l'écrire : ` +
      `c'est la seule copie de la saison (décision 201).`,
  );
}
const isLocal = url!.includes("localhost") || url!.includes("127.0.0.1");
if (!isProductionUrl && !isLocal && !url!.includes(PREVIEW_HOST)) {
  refuse(`Cette base n'est ni la production, ni la préproduction, ni locale (${redact(url!)}).`);
}

/* -------------------------------------------------------------------------- */
/* The old app                                                                */
/* -------------------------------------------------------------------------- */

async function query<T>(text: string): Promise<T[]> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: text }),
    },
  );
  const body = (await response.json()) as unknown;
  if (!response.ok || !Array.isArray(body)) {
    refuse(`L'API Supabase a répondu ${response.status} : ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body as T[];
}

type OldNote = {
  id: string;
  match_id: string;
  rating: string;
  rater: string;
  rated: string;
  day: string;
  opponent: string;
};

const notes = await query<OldNote>(`
  select r.id, r.match_id, r.rating::text as rating,
         pr.full_name as rater, pd.full_name as rated,
         to_char(m.match_date at time zone 'Europe/Paris', 'YYYY-MM-DD') as day,
         m.opponent
  from ratings r
  join profiles pr on pr.id = r.rater_id
  join profiles pd on pd.id = r.rated_player_id
  join matches m on m.id = r.match_id
  order by m.match_date, pr.full_name, pd.full_name
`);

const sql = postgres(url!, { max: 1 });

console.log(`notes      ${redact(url!)}${isProductionUrl ? "   *** PRODUCTION ***" : ""}`);
console.log(`notes      ${commit ? "ÉCRITURE (--commit)" : "simulation — rien ne sera écrit"}`);
console.log(`notes      ${notes.length} notes lues dans l'ancienne application\n`);

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const members = (await sql`
  select tm.id, u.display_name as "displayName"
  from team_members tm join users u on u.id = tm.user_id
  where tm.left_at is null
`) as unknown as { id: string; displayName: string }[];
const memberByName = new Map(members.map((m) => [norm(m.displayName), m.id]));

const tableByNormalisedKey = new Map(
  Object.entries(OLD_TO_TARGET_DISPLAY_NAME).map(([from, to]) => [norm(from), to]),
);

/** Old-app name → this database's `team_members.id`. Aborts rather than guessing. */
function memberIdFor(oldName: string): string {
  const key = norm(oldName);
  const target = EXPORT_ALIASES[key] ?? tableByNormalisedKey.get(key) ?? oldName;
  if (target === null) refuse(`« ${oldName} » est explicitement associé à personne.`);
  const id = memberByName.get(norm(target));
  if (!id) refuse(`« ${oldName} » → « ${target} » : aucun membre actif de ce nom dans cette base.`);
  return id;
}

/* -------------------------------------------------------------------------- */
/* Matches                                                                    */
/* -------------------------------------------------------------------------- */

const localMatches = (await sql`
  select id, opponent_name as "opponentName", status::text as status,
         to_char(kickoff_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as day,
         ratings_published_at as "publishedAt"
  from matches
`) as unknown as {
  id: string;
  opponentName: string;
  status: string;
  day: string;
  publishedAt: Date | null;
}[];

type Plan = { matchId: string; day: string; opponent: string; rows: OldNote[]; published: boolean };
const plans: Plan[] = [];
const unresolved: string[] = [];

const byOldMatch = new Map<string, OldNote[]>();
for (const note of notes) {
  byOldMatch.set(note.match_id, [...(byOldMatch.get(note.match_id) ?? []), note]);
}

for (const [oldId, rows] of byOldMatch) {
  const { day, opponent } = rows[0]!;
  const found = localMatches.filter(
    (m) => m.day === day && norm(m.opponentName) === norm(opponent),
  );
  if (found.length !== 1) {
    unresolved.push(
      `${day} « ${opponent} » (${oldId.slice(0, 8)}, ${rows.length} notes) → ` +
        `${found.length} match(s) ici, ignoré`,
    );
    continue;
  }
  plans.push({
    matchId: found[0]!.id,
    day,
    opponent: found[0]!.opponentName,
    rows,
    published: found[0]!.publishedAt !== null,
  });
}
plans.sort((a, b) => a.day.localeCompare(b.day));

if (unresolved.length > 0) {
  console.log("notes      non résolus, laissés de côté :");
  for (const line of unresolved) console.log(`    ${line}`);
  console.log("");
}
if (plans.length === 0) refuse("Aucun match de l'ancienne application ne correspond à cette base.");

/* -------------------------------------------------------------------------- */
/* Check, then plan                                                           */
/* -------------------------------------------------------------------------- */

type Insert = { id: string; matchId: string; rater: string; rated: string; score: string };
const toInsert: Insert[] = [];
const problems: string[] = [];
/** Matches left out because at least one of their notes is one the app would refuse. */
const skippedMatches: string[] = [];
let alreadyThere = 0;
/** Notes whose rater or rated is not on that match here (decision 226): skipped one by one. */
let offTheMatch = 0;
/** Per match and rater: how many players he rated in both apps, and on how many the notes differ. */
const doubleVotes = new Map<string, { name: string; pairs: number; differing: number }>();

console.log("date         adversaire                   notes  à écrire  déjà là  publié");
console.log("-----------  ---------------------------  -----  --------  -------  ------");

for (const plan of plans) {
  const squad = (await sql`
    select team_member_id as "teamMemberId", role::text as role
    from match_squad where match_id = ${plan.matchId}
  `) as unknown as SquadEntry[];
  const played = (await sql`
    select team_member_id as "teamMemberId", minutes
    from match_player_stats where match_id = ${plan.matchId}
  `) as unknown as { teamMemberId: string; minutes: number }[];
  const eligible = new Set(eligibleRaterIds(squad, played));
  const withMinutes = new Set(played.filter((p) => p.minutes > 0).map((p) => p.teamMemberId));

  const existing = (await sql`
    select id, rater_member_id as "raterMemberId", rated_member_id as "ratedMemberId", score
    from ratings where match_id = ${plan.matchId}
  `) as unknown as { id: string; raterMemberId: string; ratedMemberId: string; score: string }[];
  const existingIds = new Set(existing.map((r) => r.id));
  const existingByPair = new Map(
    existing.map((r) => [`${r.raterMemberId}|${r.ratedMemberId}`, r]),
  );

  let planned = 0;
  let skipped = 0;
  const problemsBefore = problems.length;
  const insertsBefore = toInsert.length;
  for (const row of plan.rows) {
    const rater = memberIdFor(row.rater);
    const rated = memberIdFor(row.rated);
    const score = Number(row.rating);

    if (rater === rated) problems.push(`${plan.day} : ${row.rater} se note lui-même`);
    /*
     * No score and no « X→Y » pair in these messages (decision 220). This script now runs in CI, and
     * the Actions logs of a public repository are readable by anybody: a peer's mark is the one figure
     * in this app given in confidence, and a log line is the kind of thing that leaks once and for
     * ever. The rater's name is enough to go and look.
     */
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      problems.push(`${plan.day} : une note de ${row.rater} est hors de 0–10`);
    }
    if (Math.round(score * 10) !== score * 10) {
      problems.push(`${plan.day} : une note de ${row.rater} a plus d'une décimale`);
    }
    /*
     * A note whose rater or rated is **not on this match here** is skipped on its own and counted,
     * not a reason to skip the whole match (decision 226). Since a coach can remove somebody from a
     * finished match, « nobody on the sheet named Lucien » is an ordinary state rather than a
     * corruption: the old app still has his notes, this app keeps them hidden while he is off it, and
     * they would only be written here to be filtered out of every screen anyway. The other refusals —
     * a self-rating, a score out of range — are still the old app writing something malformed, and
     * still skip the match.
     */
    if (!withMinutes.has(rated) || !eligible.has(rater)) {
      offTheMatch += 1;
      continue;
    }

    // The same old-app note, offered again: a re-run, and nothing to say about it.
    if (existingIds.has(row.id)) {
      skipped += 1;
      continue;
    }
    /*
     * Somebody who rated this player **in both apps** (decision 220). The note already here wins and
     * the old app's is dropped — this script never updates — but it is counted apart from a re-run
     * now, because it is a different event: he voted twice, and possibly differently. It used to
     * vanish into « déjà là » with the re-runs, so nobody could tell that it had happened.
     */
    const here = existingByPair.get(`${rater}|${rated}`);
    if (here) {
      skipped += 1;
      const tally = doubleVotes.get(`${plan.matchId}|${rater}`) ?? {
        name: `${row.rater} (${plan.day})`,
        pairs: 0,
        differing: 0,
      };
      tally.pairs += 1;
      if (Number(here.score) !== score) tally.differing += 1;
      doubleVotes.set(`${plan.matchId}|${rater}`, tally);
      continue;
    }
    planned += 1;
    toInsert.push({ id: row.id, matchId: plan.matchId, rater, rated, score: score.toFixed(1) });
  }
  /*
   * One bad match skips **that match**, not the whole sync (decision 225). It used to abort
   * everything, so a single unrecorded match — the 2026-11-10 one, closed by tapping through game mode
   * in eight seconds, where nobody has a minute — held back every other match's notes indefinitely.
   * The rule itself is unchanged: none of that match's notes is written, because the app would refuse
   * every one of them.
   */
  if (problems.length > problemsBefore) {
    toInsert.length = insertsBefore;
    skippedMatches.push(`${plan.day} ${plan.opponent}`);
    planned = 0;
  }
  alreadyThere += skipped;
  console.log(
    `${plan.day}   ${plan.opponent.padEnd(27)}  ${String(plan.rows.length).padStart(5)}  ` +
      `${String(planned).padStart(8)}  ${String(skipped).padStart(7)}  ${plan.published ? "oui" : "non"}` +
      (problems.length > problemsBefore ? "   ← ignoré" : ""),
  );
}

if (problems.length > 0) {
  // `::warning::` is a GitHub Actions annotation: it surfaces on the run's summary page, so a skipped
  // match is seen without reading the log. On a terminal it is just a line.
  console.log(
    `\n::warning::${skippedMatches.length} match(s) ignoré(s), aucune de leurs notes n'est écrite : ` +
      skippedMatches.join(", "),
  );
  console.log(`notes      ${problems.length} note(s) que l'application elle-même refuserait :`);
  for (const line of [...new Set(problems)].slice(0, 20)) console.log(`    ${line}`);
  console.log("notes      les autres matchs sont synchronisés normalement.");
}

console.log(
  `\nnotes      ${toInsert.length} à écrire, ${alreadyThere} déjà en base · ` +
    `aucune suppression, aucune mise à jour`,
);
if (offTheMatch > 0) {
  console.log(
    `notes      ${offTheMatch} note(s) ignorée(s) : la personne n’est plus sur ce match ` +
      `(décision 226). Elles restent dans l’ancienne application.`,
  );
}
if (doubleVotes.size > 0) {
  // Counts and names only, never a score (see above).
  const differing = [...doubleVotes.values()].reduce((n, t) => n + t.differing, 0);
  console.log(
    `notes      ${doubleVotes.size} personne(s) ont noté dans les deux applications : la note de ` +
      `7orteils est gardée, celle de l'ancienne ignorée` +
      (differing > 0 ? ` — ${differing} note(s) différaient` : " — toutes identiques"),
  );
  for (const tally of doubleVotes.values()) {
    console.log(
      `             ${tally.name} : ${tally.pairs} joueur(s) noté(s) deux fois` +
        (tally.differing > 0 ? `, ${tally.differing} différemment` : ""),
    );
  }
}
console.log(
  "notes      les deux règles vérifiées : noté = a joué (137), notant = sur la feuille (159).",
);
console.log("notes      `ratings_published_at` n'est pas touché : publier est la décision du coach.");

if (toInsert.length === 0) {
  console.log("\nRien à faire.");
  await sql.end();
  process.exit(0);
}
if (!commit) {
  console.log("\nSimulation terminée : rien n'a été écrit. Relance avec --commit.");
  await sql.end();
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

const publishedBefore = (await sql`
  select id, ratings_published_at as "publishedAt" from matches
`) as unknown as { id: string; publishedAt: Date | null }[];

await sql.begin(async (tx) => {
  for (const row of toInsert) {
    await tx`
      insert into ratings (id, match_id, rater_member_id, rated_member_id, score)
      values (${row.id}, ${row.matchId}, ${row.rater}, ${row.rated}, ${row.score})
      on conflict do nothing
    `;
  }
});

console.log(`\nnotes      écrit : ${toInsert.length} notes.`);

for (const plan of plans) {
  const after = (await sql`
    select count(*)::int as n,
           round(avg(score), 2)::text as mean,
           count(distinct rater_member_id)::int as raters,
           count(distinct rated_member_id)::int as rated
    from ratings where match_id = ${plan.matchId}
  `) as unknown as { n: number; mean: string; raters: number; rated: number }[];
  const row = after[0]!;
  console.log(
    `  ${plan.day}  ${plan.opponent.padEnd(27)} ${String(row.n).padStart(3)} notes · ` +
      `moyenne ${row.mean} · ${row.raters} notants · ${row.rated} notés`,
  );
}

const publishedAfter = (await sql`
  select id, ratings_published_at as "publishedAt" from matches
`) as unknown as { id: string; publishedAt: Date | null }[];
const before = new Map(publishedBefore.map((m) => [m.id, String(m.publishedAt)]));
const moved = publishedAfter.filter((m) => before.get(m.id) !== String(m.publishedAt));
if (moved.length > 0) refuse(`${moved.length} match(s) ont vu leur publication changer. Ce script ne doit jamais faire ça.`);
console.log("notes      publication inchangée sur les 4 matchs, vérifié après écriture.");

await sql.end();
