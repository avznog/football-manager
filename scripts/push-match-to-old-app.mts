/**
 * Pushes a played match from this app into `info-radarlocal`, so the team can vote on it there.
 *
 * ```bash
 *   SUPABASE_SERVICE_ROLE_KEY='eyJ…' DATABASE_URL='…' \
 *     npx tsx --conditions=react-server scripts/push-match-to-old-app.mts
 *   … --kickoff 2026-10-20     # a particular day, instead of the latest finished match
 *   … --commit                 # actually write
 *   … --replace                # overwrite a target that already has a result
 * ```
 *
 * ## Why this exists
 *
 * The team still votes in the old app after every match (`scripts/import-ratings-from-old-app.mts`
 * brings the notes back), and its gate only asks a man who has a row on the match sheet — so a match
 * that is not **in** the old app, played, with a composition, is a match nobody is asked to rate.
 * Filling it was done by hand twice, through the website, with a browser driven for an afternoon.
 * The owner asked for a job instead: « I want to do it through CI, so I do not have to do it with
 * claude anymore. »
 *
 * ## Why it writes the API and not the website
 *
 * Driving the site needs the owner's own password as a secret and broke twice in one afternoon on a
 * dropdown and a button name. It also stubs the app's own « rate everyone first » gate to reach the
 * admin forms, which is fine for a person at a keyboard and not for an unattended job. So this writes
 * rows, with a `service_role` key.
 *
 * ## The shapes below are read from that database, not inferred (2026-10-28)
 *
 * They were taken from the deployed client (`old-app/index.html`) first, because `old-app/schema.sql`
 * is **out of date** — it has no `substitutions` table at all and the app reads one. The owner then
 * supplied a token and every one of them was checked against the live project. What that confirmed,
 * so the next session need not re-check it:
 *
 * - `substitutions(match_id, minute, player_off, player_on)`, and the four columns this omits on every
 *   table (`id`, `created_at`, `minutes_played`, `goals`, `assists`) all have defaults, so the inserts
 *   are valid as written.
 * - `lineup_role` is `player | supporter`, `formation_type` is `2-3-1 | 3-2-1`, `match_status` is
 *   `upcoming | played`. Every value this sends is in range.
 * - **`matches.goals_for` and `goals_against` are maintained by `gf_sync_score` and `gc_sync_score`**,
 *   so this must not set them, and does not.
 * - `recompute_minutes` matches this script's own derivation exactly: a starter is `slot is not null`,
 *   substitutions are walked in `(minute, created_at)` order, and whoever is still on at the end is
 *   paid to `matches.duration`. That is why `duration` is sent and why the dry run's two minute
 *   columns agree.
 *
 * ## Everybody on the sheet gets a `lineups` row, and that is the point
 *
 * The old app's own rule, verbatim from its schema: `ratings_insert_if_in_lineup` is
 * `exists (select 1 from lineups where match_id = ratings.match_id and player_id = auth.uid())`.
 * So a man with **no `lineups` row cannot rate the match at all** — the insert is refused by RLS, not
 * merely unprompted. The role on the row is irrelevant to that check.
 *
 * Which is why this pushes the **whole match sheet** and not only the men who got minutes: the
 * supporters (decision 211 exists so that somebody who did not play can still vote) and the
 * substitutes who never came on. Pushing only the eleven who played would have left exactly the people
 * decision 211 was written for unable to vote — the same hole that stops Léo C being asked over there.
 *
 * ## What the old app derives for itself, and must not be sent
 *
 * `lineups.minutes_played`, `lineups.goals`, `lineups.assists` and `goals_conceded_lineup` are all
 * computed over there by triggers, from the starting composition and the substitutions. Sending them
 * is at best ignored and at worst fights the trigger — an earlier hand-run set `duration` to make the
 * minutes come out, and the trigger simply recomputed them. So this sends the **inputs**: the
 * composition, the substitutions, the goals, the minutes conceded. The old app's own arithmetic then
 * agrees with ours, which is the check at the bottom of a dry run.
 *
 * **The insert order below is load-bearing.** `goals_conceded` goes in **last**, after `lineups` and
 * `substitutions` exist, because the trigger that fills `goals_conceded_lineup` works out who was on
 * the pitch from those two tables — its form over there sends only a minute and says « les joueurs sur
 * le terrain sont déduits automatiquement des remplacements ». `matches.duration` is PATCHed before
 * either, because the minutes recompute reads it. That the triggers behave this way is **inferred from
 * the client's behaviour and from one hand-run**, not read from their definitions: this session has no
 * credential that can list them.
 *
 * ## The minutes sent are real elapsed, not what our screens show
 *
 * Ours display the television's clock (decision 214), so a goal can read « 30’+1 » here. The old app
 * has no notion of added time: its minute is a plain integer against `duration`. Every minute sent —
 * goals, concessions, substitutions — is therefore **real elapsed football**, which keeps the whole
 * push self-consistent: their trigger decides who was on the pitch at minute *n* from substitutions
 * stamped on the same scale. The dry run prints our own notation beside each goal so a human can check
 * the one against the other.
 *
 * ## Everything is sent on the real-elapsed scale, and the two apps will label a goal differently
 *
 * `recompute_goals_conceded_lineup` decides who was on the pitch for a conceded goal with
 * `substitutions.minute <= goals_conceded.minute`, so **the conceded minutes and the substitution
 * minutes have to be the same scale** — and `recompute_minutes` pays to `duration`, so that is the
 * same scale again. Real elapsed football is the only scale all three agree on, so that is what this
 * sends throughout.
 *
 * The consequence, which is visible and is not a bug: after a period that did not end on time the two
 * apps **name the same goal differently**. This app shows the television minute (decision 214) and the
 * old app shows real elapsed, so a goal at 62′ of football in a match whose first half ran to 33′ reads
 * « 59’ » here and « 62’ » there. The dry run prints both for every goal where they differ. Sending
 * the television minute instead would make the old app internally inconsistent — a goal at 59 among
 * substitutions at real minutes — and would move whoever is credited with a conceded goal.
 *
 * ## Minutes are whole, and some players will be a minute short
 *
 * Its forms take integers while the reducer works in milliseconds and subtracts the pauses, so a man
 * whose spell ends at 43.87′ is rounded. On 2026-10-20 that cost three men one minute each, and
 * nudging a boundary to fix one makes another wrong. The dry run prints both columns so the gap is
 * seen rather than discovered.
 *
 * ## Safety
 *
 * Reads this app's database and **never writes it**. Writes only the one match in the old app, and
 * only with `--commit`. A target that already carries a result is refused unless `--replace`, because
 * the normal way to lose data here is to re-run over something a person typed. Within the match the
 * writes are delete-then-insert on `lineups`, `substitutions`, `goals_for` and `goals_conceded` —
 * which is what the old app's own « Compo enregistrée » does — so a second run converges rather than
 * duplicating.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import postgres from "postgres";

import type { SquadRole } from "../db/schema.js";
import { actualPeriodStarts, formatMinuteFieldFr } from "../lib/match/clock.js";
import { reduceMatch, type MatchEventRecord, type SquadEntry } from "../lib/match/reducer.js";
import { OLD_TO_TARGET_DISPLAY_NAME } from "./radarlocal-names.mjs";

const PROJECT_REF = "foqqovzyvstancdtxnyn";
const REST = `https://${PROJECT_REF}.supabase.co/rest/v1`;

/** Our position codes onto the old app's 2-3-1 slots. Two DC and two AIL fill a pair each. */
const SLOT_POOL: Readonly<Record<string, readonly string[]>> = {
  GB: ["GK"],
  DC: ["DEF_L", "DEF_R"],
  AIL: ["MID_L", "MID_R"],
  MC: ["MID_C"],
  AT: ["ATT"],
};
/** The old app's own formation name for that shape. */
const FORMATION = "2-3-1";

/** Spellings that differ from the shared table by more than accents or spaces. */
const EXPORT_ALIASES: Readonly<Record<string, string>> = {
  "leo coach": "Léo C",
  benjamin: "Benjamin",
  raph: "Raphaël",
};

const commit = process.argv.includes("--commit");
const replace = process.argv.includes("--replace");
/**
 * `--kickoff 2026-10-20`, or null for « the latest finished match ».
 *
 * A `--kickoff` with nothing after it, or with the next flag after it, is an **abort** and not a
 * silent fall back to the latest: « --kickoff --commit » would otherwise have looked for a match
 * played on a day called `--commit`, found none, and said so in a sentence about a date the owner
 * never typed.
 */
const kickoffArg = (() => {
  const i = process.argv.indexOf("--kickoff");
  if (i < 0) return null;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("ABANDON : --kickoff attend une date, par exemple --kickoff 2026-10-20.");
    process.exit(1);
  }
  return value;
})();

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

/* -------------------------------------------------------------------------- */
/* The old app, over PostgREST                                                */
/* -------------------------------------------------------------------------- */

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
    refuse(`L'ancienne app a répondu ${response.status} sur ${path} : ${text.slice(0, 300)}`);
  }
  return (text === "" ? null : JSON.parse(text)) as T;
}

/* -------------------------------------------------------------------------- */
/* The match, from this app                                                   */
/* -------------------------------------------------------------------------- */

const sql = postgres(url!, { max: 1 });
console.log(`pousse     ${redact(url!)}`);
console.log(`pousse     ${commit ? "ÉCRITURE (--commit)" : "simulation — rien ne sera écrit"}\n`);

type MatchRow = {
  id: string;
  day: string;
  opponentName: string;
  periodsCount: number;
  periodMinutes: number;
  teamId: string;
};

/*
 * The conditional fragment is composed by postgres.js, and an empty `sql``` is a valid no-op in that
 * position — checked against a real database rather than assumed, because a fragment that silently
 * dropped the filter would quietly push the wrong match.
 */
const matches = (await sql`
  select id, to_char(kickoff_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as day,
         opponent_name as "opponentName", periods_count as "periodsCount",
         period_minutes as "periodMinutes", team_id as "teamId"
  from matches
  where status = 'finished' ${kickoffArg ? sql`and to_char(kickoff_at at time zone 'Europe/Paris', 'YYYY-MM-DD') = ${kickoffArg}` : sql``}
  order by kickoff_at desc
  limit 1
`) as unknown as MatchRow[];
const match = matches[0];
if (!match) {
  refuse(
    kickoffArg
      ? `Aucun match terminé le ${kickoffArg} dans cette base.`
      : "Aucun match terminé dans cette base.",
  );
}
console.log(`pousse     ${match!.day} contre ${match!.opponentName} (${match!.id})`);

const events = (await sql`
  select id, client_event_id as "clientEventId", type, period, minute, clock_ms as "clockMs",
         occurred_at as "occurredAt", payload, voids_event_id as "voidsEventId", seq
  from match_events where match_id = ${match!.id} order by seq
`) as unknown as MatchEventRecord[];
if (events.length === 0) refuse("Ce match n'a aucun événement : il n'y a rien à pousser.");

const slots = (await sql`
  select id, position_code as "positionCode", sort from formation_slots
`) as unknown as { id: string; positionCode: string | null; sort: number | null }[];
const squad = (await sql`
  select team_member_id as "teamMemberId", role from match_squad where match_id = ${match!.id}
`) as unknown as SquadEntry[];
const members = (await sql`
  select tm.id, coalesce(u.display_name, u.username) as name
  from team_members tm left join users u on u.id = tm.user_id
  where tm.team_id = ${match!.teamId}
`) as unknown as { id: string; name: string }[];
const nameOf = new Map(members.map((m) => [m.id, m.name]));

const state = reduceMatch(events, [], {
  periodsCount: match!.periodsCount,
  periodMinutes: match!.periodMinutes,
  slots,
  squad,
});
const periodStarts = actualPeriodStarts(state.playIntervals);

/** The last clock the match reached: the old app's `duration`, in whole minutes. */
const endMs = Math.max(...state.playIntervals.map((i) => i.endMs ?? i.startMs), 0);
const duration = Math.round(endMs / 60_000);

/* -------------------------------------------------------------------------- */
/* Pitch presence, which is the only thing the old app calls a substitution   */
/* -------------------------------------------------------------------------- */

const round = (ms: number) => Math.round(ms / 60_000);

type Presence = { memberId: string; intervals: { from: number; to: number }[]; minutes: number };
const presence: Presence[] = [];
for (const player of state.players) {
  if (!player.playedMatch) continue;
  const intervals: { from: number; to: number }[] = [];
  for (const spell of player.spells) {
    const from = round(spell.fromClockMs);
    const to = spell.toClockMs === null ? duration : round(spell.toClockMs);
    const last = intervals[intervals.length - 1];
    // The reducer splits a spell at the period boundary; on the pitch it is one stint.
    if (last && last.to === from) last.to = to;
    else intervals.push({ from, to });
  }
  presence.push({ memberId: player.memberId, intervals, minutes: player.minutes });
}

const firstPosition = new Map(
  state.players.map((p) => [p.memberId, p.positionSpells[0]?.positionCode ?? null]),
);

const starters = presence.filter((p) => p.intervals[0]?.from === 0).map((p) => p.memberId);
if (starters.length === 0) refuse("Aucun titulaire déduit : le journal n'a pas de composition de départ.");

/** Who goes out and who comes on, at each minute the pitch changed. */
const changes: { minute: number; off: string; on: string }[] = [];
const times = new Set<number>();
for (const p of presence) {
  for (const iv of p.intervals) {
    if (iv.from > 0) times.add(iv.from);
    if (iv.to < duration) times.add(iv.to);
  }
}
for (const minute of [...times].sort((a, b) => a - b)) {
  const off = presence.filter((p) => p.intervals.some((iv) => iv.to === minute)).map((p) => p.memberId);
  const on = presence.filter((p) => p.intervals.some((iv) => iv.from === minute)).map((p) => p.memberId);
  if (off.length !== on.length) {
    console.log(
      `pousse     ! ${minute}' : ${off.length} sortant(s) pour ${on.length} entrant(s) — ` +
        `l'ancienne app ne sait décrire qu'un échange, le surplus sera ignoré`,
    );
  }
  const pool = [...on];
  for (const o of off) {
    // Pair by position where possible, so the line reads naturally over there.
    const same = pool.findIndex((i) => firstPosition.get(i) === firstPosition.get(o));
    const picked = pool.splice(same >= 0 ? same : 0, 1)[0];
    if (picked) changes.push({ minute, off: o, on: picked });
  }
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

const live = state.timeline.filter((entry) => !entry.voided);
const goalsFor = live
  .filter((entry) => entry.type === "GOAL_FOR")
  .map((entry) => ({
    minute: entry.minute,
    label: formatMinuteFieldFr(entry.clockMs, entry.period, state.periods, periodStarts.get(entry.period)),
    scorer: entry.actors.find((a) => a.role === "scorer")?.memberId ?? null,
    assist: entry.actors.find((a) => a.role === "assist")?.memberId ?? null,
  }));
const conceded = live
  .filter((entry) => entry.type === "GOAL_AGAINST")
  .map((entry) => ({ minute: entry.minute }));

/* -------------------------------------------------------------------------- */
/* Names, and the target match over there                                     */
/* -------------------------------------------------------------------------- */

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const profiles = await rest<{ id: string; full_name: string }[]>("profiles?select=id,full_name");
const tableByKey = new Map(
  Object.entries(OLD_TO_TARGET_DISPLAY_NAME).map(([from, to]) => [norm(from), to]),
);
/**
 * Our display name → the old app's profile id. Built from their side, as the importers do.
 *
 * An explicit `null` in the shared table means « this person has no counterpart in this team »
 * (« Alexis CHARRIER »), and it has to be tested for before the fallback rather than after: `null ??
 * profile.full_name` is the full name, so a `??` chain silently turns « has no counterpart » into
 * « matches on his own name ». Harmless today, because nobody here is called that — and exactly the
 * sort of thing that stops being harmless the day somebody is.
 */
const profileByOurName = new Map<string, string>();
for (const profile of profiles) {
  const key = norm(profile.full_name);
  const alias = EXPORT_ALIASES[key];
  const mapped = tableByKey.has(key) ? tableByKey.get(key) : undefined;
  if (mapped === null && alias === undefined) continue;
  const ours = alias ?? mapped ?? profile.full_name;
  profileByOurName.set(norm(ours), profile.id);
}
function profileFor(memberId: string): string {
  const ours = nameOf.get(memberId);
  if (!ours) refuse(`Membre inconnu dans cette équipe : ${memberId}`);
  const id = profileByOurName.get(norm(ours!));
  if (!id) {
    refuse(
      `« ${ours} » n'a pas de compte dans l'ancienne application. Ajoute-le là-bas, ou ajoute la ` +
        `correspondance dans scripts/radarlocal-names.mts.`,
    );
  }
  return id!;
}

const targets = await rest<{ id: string; opponent: string; match_date: string; status: string }[]>(
  `matches?select=id,opponent,match_date,status&order=match_date.asc`,
);
/**
 * `YYYY-MM-DD` in Paris, assembled from the parts rather than from a locale that happens to print
 * ISO: `fr-CA` does today, and which locale yields which order is ICU data rather than a guarantee.
 */
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
const sameDay = targets.filter((t) => parisDay(t.match_date) === match!.day);
if (sameDay.length === 0) {
  refuse(`Aucun match du ${match!.day} dans l'ancienne application : crée-le là-bas d'abord.`);
}
const target =
  sameDay.length === 1
    ? sameDay[0]
    : sameDay.find((t) => norm(t.opponent) === norm(match!.opponentName));
if (!target) {
  refuse(
    `${sameDay.length} matchs le ${match!.day} là-bas et aucun ne s'appelle « ${match!.opponentName} » : ` +
      sameDay.map((t) => `« ${t.opponent} »`).join(", "),
  );
}
console.log(`pousse     cible : « ${target!.opponent} » (${target!.id}), statut ${target!.status}`);

const existing = await Promise.all([
  rest<{ id: string }[]>(`goals_for?select=id&match_id=eq.${target!.id}`),
  rest<{ id: string }[]>(`goals_conceded?select=id&match_id=eq.${target!.id}`),
  rest<{ match_id: string }[]>(`substitutions?select=match_id&match_id=eq.${target!.id}`),
  rest<{ match_id: string }[]>(`lineups?select=match_id&match_id=eq.${target!.id}`),
]);
const alreadyThere = existing.some((rows) => rows.length > 0);
if (alreadyThere && !replace) {
  refuse(
    `Ce match a déjà un résultat là-bas (${existing[0].length} buts, ${existing[1].length} encaissés, ` +
      `${existing[2].length} remplacements, ${existing[3].length} lignes de compo). ` +
      `Ajoute --replace pour l'écraser : quelqu'un l'a peut-être saisi à la main.`,
  );
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everyone this match concerns, and what the old app should call him.
 *
 * Three groups, in the order the rows are built: the starters, with a slot; everyone else who got a
 * minute, on the bench; and **everyone on our match sheet who never played at all** — the unused
 * substitutes and the supporters of decision 211.
 *
 * That third group is the one it would be easy to leave out and the one that matters most here: the
 * old app refuses a rating from anybody without a `lineups` row for the match
 * (`ratings_insert_if_in_lineup`), so omitting them does not merely fail to prompt them, it makes
 * voting impossible for them. A supporter exists in this app precisely so that a man who did not play
 * can still have a say.
 *
 * `profileFor` is called once per person here and nowhere else in a loop: it aborts on somebody with
 * no account over there, and the resolved map below is what every later step reads.
 */
const squadRoleOf = new Map<string, SquadRole>(
  squad.map((entry) => [entry.teamMemberId, entry.role]),
);
const played = new Set(presence.map((p) => p.memberId));
const onTheSheet = squad.map((entry) => entry.teamMemberId);
const concerned = [...new Set([...starters, ...played, ...onTheSheet])];

const profileByMember = new Map<string, string>();
for (const memberId of concerned) profileByMember.set(memberId, profileFor(memberId));
const memberByProfile = new Map([...profileByMember].map(([member, profile]) => [profile, member]));

const pool = new Map(Object.entries(SLOT_POOL).map(([code, list]) => [code, [...list]]));
const lineupRows: { match_id: string; player_id: string; slot: string | null; role: string }[] = [];
const slotOfMember = new Map<string, string>();
for (const memberId of starters) {
  const code = firstPosition.get(memberId);
  const available = code ? pool.get(code) : undefined;
  const slot = available?.shift();
  if (!slot) refuse(`Pas de place « ${code ?? "?"} » dans le ${FORMATION} pour ${nameOf.get(memberId)}.`);
  slotOfMember.set(memberId, slot!);
  lineupRows.push({
    match_id: target!.id,
    player_id: profileByMember.get(memberId)!,
    slot,
    role: "player",
  });
}
for (const memberId of concerned) {
  if (starters.includes(memberId)) continue;
  // « supporter » is the old app's own second role, and the only one it offers somebody who does not
  // play. Anybody else without a slot is a substitute, used or not.
  const role = squadRoleOf.get(memberId) === "supporter" ? "supporter" : "player";
  lineupRows.push({
    match_id: target!.id,
    player_id: profileByMember.get(memberId)!,
    slot: null,
    role,
  });
}

console.log(`\npousse     score ${state.goalsFor} – ${state.goalsAgainst} · durée ${duration}'`);
console.log("\nTITULAIRES");
// In the formation's own order, not the reducer's: this block exists to be read by a person deciding
// whether to tick « commit », and a pitch listed GK, ATT, DEF_L… cannot be checked at a glance.
const SLOT_ORDER = ["GK", "DEF_L", "DEF_R", "MID_L", "MID_C", "MID_R", "ATT"];
const bySlot = [...starters].sort(
  (a, b) =>
    SLOT_ORDER.indexOf(slotOfMember.get(a) ?? "") - SLOT_ORDER.indexOf(slotOfMember.get(b) ?? ""),
);
for (const memberId of bySlot) {
  console.log(`  ${String(slotOfMember.get(memberId) ?? "?").padEnd(6)} ${nameOf.get(memberId)}`);
}
console.log("BANC (entrés en jeu)");
for (const p of presence.filter((p) => !starters.includes(p.memberId))) {
  console.log(`  ${nameOf.get(p.memberId)} (entre à ${p.intervals[0]?.from}')`);
}
// Named so they can vote, and for no other reason — see the note on `concerned`.
const unused = concerned.filter((id) => !played.has(id));
console.log(`SUR LA FEUILLE SANS JOUER (${unused.length}) — inscrits pour pouvoir noter`);
for (const memberId of unused) {
  const role = squadRoleOf.get(memberId) === "supporter" ? "supporter" : "remplaçant";
  console.log(`  ${nameOf.get(memberId)} (${role})`);
}
console.log(`\nREMPLACEMENTS (${changes.length})`);
for (const c of changes) {
  console.log(`  ${String(c.minute).padStart(3)}'  ${nameOf.get(c.off)} → ${nameOf.get(c.on)}`);
}
console.log(`\nBUTS (${goalsFor.length})`);
for (const g of goalsFor) {
  // Our own notation only when it differs from the minute being sent — « 31' (30+2) » is worth
  // reading and « 5' (5) » is noise.
  const ours = g.label === String(g.minute) ? "" : ` (chez nous ${g.label})`;
  console.log(
    `  ${String(g.minute).padStart(3)}'${ours}  ${g.scorer ? nameOf.get(g.scorer) : "?"}` +
      `${g.assist ? ` — passe ${nameOf.get(g.assist)}` : ""}`,
  );
}
console.log(`\nENCAISSÉS (${conceded.length}) : ${conceded.map((c) => `${c.minute}'`).join(", ") || "aucun"}`);

console.log("\nMINUTES — les nôtres, et ce que l'ancienne app recalculera");
for (const p of [...presence].sort((a, b) => b.minutes - a.minutes)) {
  const theirs = p.intervals.reduce((n, iv) => n + (iv.to - iv.from), 0);
  const gap = theirs - p.minutes;
  console.log(
    `  ${String(nameOf.get(p.memberId)).padEnd(16)} nous ${String(p.minutes).padStart(3)}'  ` +
      `eux ${String(theirs).padStart(3)}'  ${gap === 0 ? "=" : (gap > 0 ? "+" : "") + gap}`,
  );
}

if (!commit) {
  console.log("\nSimulation terminée : rien n'a été écrit. Relance avec --commit.");
  await sql.end();
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Delete then insert, per table, scoped to this match: the same thing the old app's own composition
 * screen does (`persistLineup` there deletes every row for the match before inserting), and what makes
 * a second run converge instead of duplicating.
 *
 * `goals_conceded_lineup` is **not** in the list and must not be: it has no `match_id` to filter on,
 * and its `goal_id` is declared `on delete cascade` against `goals_conceded`, so deleting the goals
 * takes its rows with them. Deleting it directly would need a join PostgREST will not do.
 */
for (const table of ["goals_for", "goals_conceded", "substitutions", "lineups"]) {
  await rest(`${table}?match_id=eq.${target!.id}`, { method: "DELETE" });
}

/*
 * The insert order is load-bearing, and the comment is here because nothing in the code says it:
 *
 *   matches.duration  →  lineups  →  substitutions  →  goals_for  →  goals_conceded
 *
 * `duration` first because the minutes recompute reads it. `goals_conceded` **last**, because the
 * trigger that fills `goals_conceded_lineup` works out who was on the pitch from `lineups` and
 * `substitutions`; inserted before them it would record an empty pitch for every goal conceded, and
 * nothing would complain. Inferred from the client's behaviour, not read from the trigger bodies.
 */

await rest(`matches?id=eq.${target!.id}`, {
  method: "PATCH",
  body: { status: "played", duration, formation: FORMATION },
});
if (lineupRows.length > 0) await rest("lineups", { method: "POST", body: lineupRows });
if (changes.length > 0) {
  await rest("substitutions", {
    method: "POST",
    body: changes.map((c) => ({
      match_id: target!.id,
      minute: c.minute,
      player_off: profileByMember.get(c.off)!,
      player_on: profileByMember.get(c.on)!,
    })),
  });
}
if (goalsFor.length > 0) {
  await rest("goals_for", {
    method: "POST",
    body: goalsFor.map((g) => ({
      match_id: target!.id,
      minute: g.minute,
      scorer_id: g.scorer ? profileByMember.get(g.scorer)! : null,
      assist_id: g.assist ? profileByMember.get(g.assist)! : null,
    })),
  });
}
if (conceded.length > 0) {
  await rest("goals_conceded", {
    method: "POST",
    body: conceded.map((c) => ({ match_id: target!.id, minute: c.minute })),
  });
}

/* -------------------------------------------------------------------------- */
/* Read back, because their triggers have the last word                       */
/* -------------------------------------------------------------------------- */

const after = await rest<{ player_id: string; slot: string | null; minutes_played: number; goals: number; assists: number }[]>(
  `lineups?select=player_id,slot,minutes_played,goals,assists&match_id=eq.${target!.id}`,
);
const theirGoals = await rest<{ id: string }[]>(`goals_for?select=id&match_id=eq.${target!.id}`);
const theirConceded = await rest<{ id: string }[]>(`goals_conceded?select=id&match_id=eq.${target!.id}`);

console.log(`\npousse     écrit. Là-bas : ${theirGoals.length} buts, ${theirConceded.length} encaissés,`);
console.log(`pousse     ${after.length} lignes de compo, ${changes.length} remplacements.`);
if (theirGoals.length !== goalsFor.length || theirConceded.length !== conceded.length) {
  refuse("Le relevé après écriture ne correspond pas à ce qui a été envoyé.");
}
// One map lookup per row rather than a scan that re-resolves profiles: `profileFor` aborts, and a
// read-back check is the last place that should be able to.
const mismatched = after.filter((row) => {
  const memberId = memberByProfile.get(row.player_id);
  const ours = memberId ? presence.find((p) => p.memberId === memberId) : undefined;
  return ours !== undefined && Math.abs(row.minutes_played - ours.minutes) > 1;
});
if (mismatched.length > 0) {
  console.log(
    `pousse     ! ${mismatched.length} joueur(s) ont plus d'une minute d'écart après recalcul : ` +
      mismatched
        .map((r) => `${nameOf.get(memberByProfile.get(r.player_id) ?? "") ?? r.player_id.slice(0, 8)} ${r.minutes_played}'`)
        .join(", "),
  );
}
console.log("pousse     l'équipe peut maintenant noter ce match dans l'ancienne application.");

await sql.end();
