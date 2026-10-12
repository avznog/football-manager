/**
 * Fills every player's preferred positions from where he has actually played.
 *
 * ```bash
 *   DATABASE_URL='…' npx tsx --conditions=react-server scripts/assign-positions-from-play.mts
 *   DATABASE_URL='…' npx tsx --conditions=react-server scripts/assign-positions-from-play.mts --commit
 * ```
 *
 * ## Why this exists
 *
 * Since decision 163 the preferred positions on a player's card are the **coach's** to set, and since
 * decision 158 they are the five codes of the one formation. They are not decoration: the équipe type
 * places a player only at a post he has been given, primary before secondary, and badges every other
 * disc « pas son poste » (decision 171). Production holds wishes for exactly **one** of eighteen
 * members, so six of seven discs in every seven read « pas son poste ».
 *
 * The owner asked for them to be filled in from the record, « as if the coach assigned those per
 * player ». After the rebuild of the first three matches (decision 179) there is a record to read:
 * `match_player_positions` says how many minutes each player spent at each post, which the paper
 * sheets are the source of and which nothing else in the app knew before.
 *
 * ## The rule, which the owner chose
 *
 * - **primary** is the post with the most minutes. At most one `primary` per member is an invariant
 *   (`docs/DATA_MODEL.md`), so exactly one is written;
 * - **secondary** is every other post worth **at least a tenth of that player's own minutes**. That
 *   keeps the real second posts and drops two incidental spells — Pierre's 6′ at `AT` and Maxime's 4′
 *   at `DC`, 5% each. The share is his own total, not the season's, so a man who played twice is
 *   judged on his own two matches;
 * - a member with **no recorded minutes gets nothing**: no row, which is how « pas son poste » is
 *   stored. That is Raphaël, Léo C and the super admin today.
 *
 * Ties are broken by `POSITION_CODES` order (`GB, DC, MC, AIL, AT`) so two equal totals cannot make
 * the result depend on the order rows come back in. No tie exists in the data today; the rule is there
 * so a re-run after the next match is still deterministic.
 *
 * **The rule agrees with the one real coach assignment there is.** Lucas already carried `DC` primary
 * with `GB` and `MC` secondary, set by hand; the rule derives exactly that from his minutes. The
 * script checks it and says so rather than leaving the reader to notice.
 *
 * ## Safety
 *
 * Preview or a local database only, like `scripts/rebuild-matches.mts`: production is refused **by
 * name**, a `-pooler` host is refused (a pooled connection can carry an empty `search_path` left by a
 * `pg_restore` — `COORDINATION.md`), and anything else remote is refused. Dry run unless `--commit`,
 * and the target is printed with its password redacted first.
 *
 * It is **not** idempotent in the sense of "writes once": it is **convergent**. Every run recomputes
 * from the record and replaces the rows of the members it is about, so running it after another match
 * updates the wishes rather than duplicating them. Members it has nothing to say about are never
 * touched.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import postgres from "postgres";

import { POSITION_CODES, POSITION_BY_CODE, type PositionCode } from "../db/reference";

const PREVIEW_HOST = "ep-raspy-fire-zam9gi7k";
const PRODUCTION_HOST = "ep-gentle-cherry";
/** A post is a secondary wish from this share of the player's own minutes upwards. */
const SECONDARY_SHARE_NUMERATOR = 1;
const SECONDARY_SHARE_DENOMINATOR = 10;

const commit = process.argv.includes("--commit");

function redact(url: string): string {
  return url.replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@");
}

function refuse(message: string): never {
  console.error(`ABANDON : ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) refuse("DATABASE_URL n'est pas défini.");

if (url!.includes(PRODUCTION_HOST)) {
  refuse(
    `Cette base est la PRODUCTION (${PRODUCTION_HOST}). Ce script ne s'y exécute pas : les postes de ` +
      `production se décident avec le propriétaire, pas par un script.`,
  );
}
if (url!.includes("-pooler")) {
  refuse(
    "Cette URL passe par le pooler Neon. Utilise le point d'entrée direct : une connexion mutualisée " +
      "peut porter un search_path vide laissé par un pg_restore (COORDINATION.md).",
  );
}
const isLocal = url!.includes("localhost") || url!.includes("127.0.0.1");
if (!isLocal && !url!.includes(PREVIEW_HOST)) {
  refuse(
    `Cette base n'est ni la préproduction (${PREVIEW_HOST}) ni une base locale (${redact(url!)}). Refusé.`,
  );
}

type Row = { memberId: string; name: string; code: string; minutes: number };
type Wish = { code: PositionCode; preference: "primary" | "secondary"; minutes: number; share: number };

/** Pure: the wishes implied by one player's minutes per post. */
export function wishesFor(byCode: ReadonlyMap<string, number>): Wish[] {
  const total = [...byCode.values()].reduce((sum, n) => sum + n, 0);
  if (total <= 0) return [];
  const ordered = [...byCode.entries()]
    .filter(([code]) => (POSITION_CODES as readonly string[]).includes(code))
    .sort(
      ([codeA, a], [codeB, b]) =>
        b - a ||
        POSITION_CODES.indexOf(codeA as PositionCode) - POSITION_CODES.indexOf(codeB as PositionCode),
    );
  if (ordered.length === 0) return [];
  return ordered
    .map(([code, minutes], index) => ({
      code: code as PositionCode,
      preference: (index === 0 ? "primary" : "secondary") as "primary" | "secondary",
      minutes,
      share: minutes / total,
    }))
    .filter(
      (wish) =>
        wish.preference === "primary" ||
        wish.minutes * SECONDARY_SHARE_DENOMINATOR >= total * SECONDARY_SHARE_NUMERATOR,
    );
}

const sql = postgres(url!, { max: 1 });

console.log(`postes     ${redact(url!)}`);
console.log(`postes     ${commit ? "ÉCRITURE (--commit)" : "simulation — rien ne sera écrit"}\n`);

const rows = (await sql`
  select p.team_member_id as "memberId", u.display_name as name, p.position_code as code,
         sum(p.minutes)::int as minutes
  from match_player_positions p
  join team_members tm on tm.id = p.team_member_id
  join users u on u.id = tm.user_id
  where tm.left_at is null
  group by 1, 2, 3
`) as unknown as Row[];

if (rows.length === 0) refuse("Aucune minute par poste en base : il n'y a rien à déduire.");

const byMember = new Map<string, { name: string; minutes: Map<string, number> }>();
for (const row of rows) {
  const entry = byMember.get(row.memberId) ?? { name: row.name, minutes: new Map() };
  entry.minutes.set(row.code, (entry.minutes.get(row.code) ?? 0) + row.minutes);
  byMember.set(row.memberId, entry);
}

const existing = (await sql`
  select pp.team_member_id as "memberId", pp.position_code as code, pp.preference
  from player_positions pp
`) as unknown as { memberId: string; code: string; preference: string }[];
const existingByMember = new Map<string, Map<string, string>>();
for (const row of existing) {
  const m = existingByMember.get(row.memberId) ?? new Map();
  m.set(row.code, row.preference);
  existingByMember.set(row.memberId, m);
}

const plan = [...byMember.entries()]
  .map(([memberId, { name, minutes }]) => {
    const wishes = wishesFor(minutes);
    const total = [...minutes.values()].reduce((sum, n) => sum + n, 0);
    return { memberId, name, total, wishes, minutes };
  })
  .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));

const label = (code: PositionCode) => POSITION_BY_CODE[code]?.labelFr ?? code;
let agreements = 0;
let disagreements = 0;

console.log("joueur     min   poste principal        postes secondaires");
console.log("---------  ----  ---------------------  ----------------------------------------");
for (const row of plan) {
  const primary = row.wishes.find((w) => w.preference === "primary");
  if (!primary) refuse(`${row.name} : aucun poste principal déduit, ce qui ne devrait pas arriver.`);
  const seconds = row.wishes.filter((w) => w.preference === "secondary");
  const dropped = [...row.minutes.entries()]
    .filter(([code]) => !row.wishes.some((w) => w.code === code))
    .map(([code, m]) => `${code} ${m}′`);
  console.log(
    `${row.name.padEnd(9)}  ${String(row.total).padStart(4)}  ` +
      `${`${primary!.code} ${Math.round(primary!.share * 100)}%`.padEnd(21)}  ` +
      (seconds.map((w) => `${w.code} ${Math.round(w.share * 100)}%`).join(" · ") || "—") +
      (dropped.length > 0 ? `   [écartés : ${dropped.join(", ")}]` : ""),
  );
  const was = existingByMember.get(row.memberId);
  if (was && was.size > 0) {
    const before = [...was.entries()]
      .map(([c, p]) => `${c}:${p}`)
      .sort()
      .join(",");
    const after = row.wishes
      .map((w) => `${w.code}:${w.preference}`)
      .sort()
      .join(",");
    if (before === after) agreements += 1;
    else {
      disagreements += 1;
      console.log(`           déjà en base et différent : ${before}  →  ${after}`);
    }
  }
}

const untouched = (await sql`
  select u.display_name as name, tm.role, tm.is_player as "isPlayer"
  from team_members tm join users u on u.id = tm.user_id
  where tm.left_at is null
    and tm.id not in (select team_member_id from match_player_positions)
  order by u.display_name
`) as unknown as { name: string; role: string; isPlayer: boolean }[];

console.log(
  `\npostes     ${plan.length} joueurs avec des minutes · ` +
    `${plan.reduce((n, r) => n + r.wishes.length, 0)} postes au total ` +
    `(${plan.length} principaux, ${plan.reduce((n, r) => n + r.wishes.length - 1, 0)} secondaires)`,
);
console.log(
  `postes     ${untouched.length} membres sans minutes, laissés sans poste : ` +
    untouched.map((m) => `${m.name} (${m.isPlayer ? m.role : `${m.role}, ne joue pas`})`).join(", "),
);
console.log(
  `postes     déjà en base : ${agreements} membre(s) à l'identique, ${disagreements} différent(s)`,
);

if (!commit) {
  console.log("\nSimulation terminée : rien n'a été écrit. Relance avec --commit.");
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const row of plan) {
    await tx`delete from player_positions where team_member_id = ${row.memberId}`;
    for (const wish of row.wishes) {
      await tx`
        insert into player_positions (team_member_id, position_code, preference)
        values (${row.memberId}, ${wish.code}, ${wish.preference})
      `;
    }
  }
});

const check = (await sql`
  select u.display_name as name,
         count(*) filter (where pp.preference = 'primary')::int as primaries,
         count(*)::int as total
  from player_positions pp
  join team_members tm on tm.id = pp.team_member_id
  join users u on u.id = tm.user_id
  group by 1 order by 1
`) as unknown as { name: string; primaries: number; total: number }[];

const manyPrimaries = check.filter((r) => r.primaries !== 1);
if (manyPrimaries.length > 0) {
  refuse(
    `Après écriture, ${manyPrimaries.length} membre(s) n'ont pas exactement un poste principal : ` +
      manyPrimaries.map((r) => `${r.name} (${r.primaries})`).join(", "),
  );
}

const unknownCodes = (await sql`
  select distinct pp.position_code as code from player_positions pp
  where pp.position_code not in ${sql(POSITION_CODES as unknown as string[])}
`) as unknown as { code: string }[];
if (unknownCodes.length > 0) {
  refuse(`Codes hors vocabulaire écrits : ${unknownCodes.map((r) => r.code).join(", ")}`);
}

console.log(
  `\npostes     écrit. ${check.length} membres ont des postes, ` +
    `tous avec exactement un principal, tous dans ${POSITION_CODES.join("/")}.`,
);
console.log(`postes     ${label("GB")} / ${label("AT")} compris : le vocabulaire est celui du 1-2-3-1.`);

await sql.end();
