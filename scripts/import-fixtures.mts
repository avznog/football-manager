/**
 * Puts the season's remaining fixtures in the calendar, read from the FSGT's own one.
 *
 * ```bash
 *   DATABASE_URL='…' npx tsx --conditions=react-server scripts/import-fixtures.mts
 *   DATABASE_URL='…' npx tsx --conditions=react-server scripts/import-fixtures.mts --commit
 *   DATABASE_URL='…' npx tsx --conditions=react-server scripts/import-fixtures.mts --commit --production
 * ```
 *
 * ## Why this exists
 *
 * The app knew about four matches — the Coupe Automne ties — because they were entered by hand as
 * they were played. The championship's eighteen rounds were only ever on the FSGT's site, which
 * means nobody could declare himself available for a match the app had never heard of. The owner
 * asked for them, so they are read from `backlogs/fsgt-championnat-2026-27.json` rather than typed
 * eighteen times into a form.
 *
 * ## What it writes
 *
 * One `matches` row per fixture: `status = 'scheduled'`, 2×30 (decision 009), `entry_mode = 'live'`,
 * and the **Ligue** competition — the four existing matches are Coupe Automne and are left alone.
 * Nothing else: no squad, no composition, no event. A fixture is an empty calendar entry until
 * somebody picks a team for it.
 *
 * **Kick-off times are Europe/Paris local and converted by Postgres**, not by arithmetic here. The
 * season straddles the end of summer time on 2026-10-25, so two fixtures are `+02:00` and sixteen
 * are `+01:00`; doing that by hand is how an hour goes missing in December.
 *
 * It is `make_timestamptz(y, m, d, h, min, 0, 'Europe/Paris')` from **integer** parts rather than a
 * string, and that is not fussiness. Handing `'2026-10-20 21:05'` to `postgres.js` as a bound
 * parameter of `::timestamp` silently gives the wrong instant: the driver parses the string into a
 * JavaScript `Date` using *the machine's* offset and sends a `timestamptz`, so with a `GMT` session
 * the subsequent `at time zone 'Europe/Paris'` subtracts Paris's offset a **second** time. It was
 * caught on the preview, where every kick-off landed two hours early — 21:05 stored as 19:05 Paris.
 * Integers cannot be reinterpreted on the way in, so the bug cannot come back.
 *
 * ## Idempotent, not write-once
 *
 * A fixture is recognised by `(team, opponent, the day of its kick-off)` and skipped if it is
 * already there, so a re-run after the FSGT moves one round adds only what is missing. It never
 * updates or deletes an existing match: a match that has been played carries events, stats and
 * ratings, and this script has no business touching any of it. If a kick-off genuinely moves, that
 * is a change to make in the app, where the move is visible to everybody.
 *
 * ## Safety
 *
 * Preview or local by default, like every other script here. **Production needs `--production`
 * spelled out on the command line** — it is the only script in this repository allowed to write
 * there, because the owner asked for these fixtures on both, and it still refuses unless told. A
 * `-pooler` host is refused: a pooled connection can carry an empty `search_path` left behind by a
 * `pg_restore` (`COORDINATION.md`). Dry run unless `--commit`, and the target is printed with its
 * password redacted first.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import { readFileSync } from "node:fs";

import postgres from "postgres";

const PREVIEW_HOST = "ep-raspy-fire-zam9gi7k";
const PRODUCTION_HOST = "ep-gentle-cherry";
const INPUT = "backlogs/fsgt-championnat-2026-27.json";
/** The owner's own account: he is who asked for these, and `created_by` is not nullable. */
const CREATED_BY_USERNAME = "potter";

type Fixture = {
  round: number;
  date: string;
  time: string;
  opponent: string;
  isHome: boolean;
  venue: string;
};

const commit = process.argv.includes("--commit");
const production = process.argv.includes("--production");

const redact = (url: string) => url.replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@");
function refuse(message: string): never {
  console.error(`ABANDON : ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) refuse("DATABASE_URL n'est pas défini.");
if (url!.includes("-pooler")) {
  refuse("Cette URL passe par le pooler Neon. Utilise le point d'entrée direct (COORDINATION.md).");
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

let input: { competition: string; fixtures: Fixture[] };
try {
  input = JSON.parse(readFileSync(INPUT, "utf8")) as typeof input;
} catch {
  refuse(`${INPUT} est introuvable ou illisible.`);
}
const fixtures = input!.fixtures;
if (fixtures.length === 0) refuse(`${INPUT} ne contient aucun match.`);

const sql = postgres(url!, { max: 1 });

console.log(`matchs     ${redact(url!)}${isProductionUrl ? "   *** PRODUCTION ***" : ""}`);
console.log(`matchs     ${commit ? "ÉCRITURE (--commit)" : "simulation — rien ne sera écrit"}`);
console.log(`matchs     ${fixtures.length} matchs lus dans ${INPUT}\n`);

const teams = (await sql`select id, name from teams`) as unknown as { id: string; name: string }[];
if (teams.length !== 1) refuse(`${teams.length} équipes en base : ce script en attend une seule.`);
const team = teams[0]!;

const competitions = (await sql`
  select id, label_fr as "labelFr" from competitions
  where team_id = ${team.id} and archived_at is null
`) as unknown as { id: string; labelFr: string }[];
const competition = competitions.find((c) => c.labelFr === input!.competition);
if (!competition) {
  refuse(
    `Aucune compétition « ${input!.competition} » pour ${team.name}. ` +
      `Trouvées : ${competitions.map((c) => c.labelFr).join(", ") || "(aucune)"}`,
  );
}

const author = (await sql`
  select id from users where username = ${CREATED_BY_USERNAME}
`) as unknown as { id: string }[];
if (author.length !== 1) refuse(`L'utilisateur « ${CREATED_BY_USERNAME} » est introuvable.`);

const existing = (await sql`
  select opponent_name as "opponentName",
         to_char(kickoff_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as day
  from matches where team_id = ${team.id}
`) as unknown as { opponentName: string; day: string }[];
const key = (opponent: string, day: string) => `${opponent.trim().toLowerCase()}@${day}`;
const already = new Set(existing.map((m) => key(m.opponentName, m.day)));

const toWrite = fixtures.filter((f) => !already.has(key(f.opponent, f.date)));
const skipped = fixtures.filter((f) => already.has(key(f.opponent, f.date)));

console.log("J    date         heure   dom/ext  adversaire                  terrain");
console.log("---  -----------  ------  -------  --------------------------  -------------------");
for (const f of fixtures) {
  const seen = already.has(key(f.opponent, f.date));
  console.log(
    `${String(f.round).padStart(2)}   ${f.date}   ${f.time}   ` +
      `${(f.isHome ? "dom." : "ext.").padEnd(7)}  ${f.opponent.padEnd(26)}  ${f.venue}` +
      (seen ? "   [déjà en base, ignoré]" : ""),
  );
}
console.log(
  `\nmatchs     ${toWrite.length} à créer, ${skipped.length} déjà en base · ` +
    `${existing.length} matchs actuellement · compétition « ${competition!.labelFr} »`,
);

if (toWrite.length === 0) {
  console.log("Rien à faire.");
  await sql.end();
  process.exit(0);
}

if (!commit) {
  console.log("\nSimulation terminée : rien n'a été écrit. Relance avec --commit.");
  await sql.end();
  process.exit(0);
}

/** `2026-10-20` + `21:05` as five integers, so nothing can reinterpret them as a local instant. */
function parts(fixture: Fixture): [number, number, number, number, number] {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fixture.date);
  const time = /^(\d{2}):(\d{2})$/.exec(fixture.time);
  if (!date || !time) refuse(`J${fixture.round} : « ${fixture.date} ${fixture.time} » est illisible.`);
  return [
    Number(date[1]),
    Number(date[2]),
    Number(date[3]),
    Number(time[1]),
    Number(time[2]),
  ];
}

await sql.begin(async (tx) => {
  for (const f of toWrite) {
    const [year, month, day, hour, minute] = parts(f);
    await tx`
      insert into matches (
        team_id, kickoff_at, opponent_name, is_home, venue,
        periods_count, period_minutes, status, entry_mode, created_by, competition_id
      ) values (
        ${team.id},
        make_timestamptz(${year}, ${month}, ${day}, ${hour}, ${minute}, 0, 'Europe/Paris'),
        ${f.opponent}, ${f.isHome}, ${f.venue},
        2, 30, 'scheduled', 'live', ${author[0]!.id}, ${competition!.id}
      )
    `;
  }
});

const after = (await sql`
  select to_char(kickoff_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI') as paris,
         to_char(kickoff_at, 'HH24:MI') as utc,
         opponent_name as "opponentName", is_home as "isHome", venue, status::text as status
  from matches where team_id = ${team.id} and kickoff_at > now()
  order by kickoff_at
`) as unknown as {
  paris: string;
  utc: string;
  opponentName: string;
  isHome: boolean;
  venue: string;
  status: string;
}[];

console.log(`\nmatchs     écrit : ${toWrite.length} matchs. À venir en base :`);
for (const m of after) {
  console.log(
    `  ${m.paris} Paris (${m.utc} UTC)  ${(m.isHome ? "dom." : "ext.").padEnd(5)} ` +
      `${m.opponentName.padEnd(26)} ${m.venue.padEnd(19)} ${m.status}`,
  );
}

const wrong = (await sql`
  select count(*)::int as n from matches
  where team_id = ${team.id} and (periods_count <> 2 or period_minutes <> 30)
`) as unknown as { n: number }[];
if ((wrong[0]?.n ?? 0) > 0) refuse(`${wrong[0]!.n} match(s) ne sont pas en 2×30.`);

/*
 * Read every kick-off back as a Paris wall clock and compare it to the file. This is the check that
 * would have caught the double conversion described at the top, so it runs on every write rather
 * than being left to the reader's eye: two hours is invisible in a list and obvious in a diff.
 */
const written = (await sql`
  select opponent_name as "opponentName",
         to_char(kickoff_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as day,
         to_char(kickoff_at at time zone 'Europe/Paris', 'HH24:MI') as time
  from matches where team_id = ${team.id}
`) as unknown as { opponentName: string; day: string; time: string }[];
const clock = new Map(written.map((m) => [key(m.opponentName, m.day), m.time]));
const drifted = fixtures.filter((f) => clock.get(key(f.opponent, f.date)) !== f.time);
if (drifted.length > 0) {
  refuse(
    `${drifted.length} coup(s) d'envoi ne sont pas à l'heure du fichier : ` +
      drifted
        .map((f) => `J${f.round} ${f.opponent} attendu ${f.time}, en base ${clock.get(key(f.opponent, f.date))}`)
        .join(" · "),
  );
}
console.log(
  `matchs     ${fixtures.length} coups d'envoi relus en heure de Paris : tous identiques au fichier.`,
);

console.log(
  "matchs     tous en 2×30, sans composition ni événement : chacun attend qu'on lui choisisse une équipe.",
);

await sql.end();
