/**
 * Gives each player the password he already knows, from the team's previous app.
 *
 * ```bash
 *   DATABASE_URL='…' npx tsx --conditions=react-server scripts/import-passwords.mts
 *   DATABASE_URL='…' npx tsx --conditions=react-server scripts/import-passwords.mts --commit
 * ```
 *
 * ## Why this exists
 *
 * The production accounts were created from invites and nobody remembers their passwords; the app has
 * no way to change or reset one (`docs/ROADMAP.md`, `A1`). The passwords the team actually knows are
 * the ones from `info-radarlocal`, the Supabase app they used before. So the owner asked for those to
 * be carried over — **except his own (`potter`) and the super admin's**, which he keeps as they are.
 *
 * ## The thing to understand before running this
 *
 * Supabase stores **bcrypt** (`$2a$…`, 60 characters). This app hashes with **argon2id** (decision
 * 008), and `verifyPassword` answers `false` for a correct password against a bcrypt hash — tested,
 * not assumed. bcrypt is one-way, so these hashes cannot be converted into argon2 ones.
 *
 * That is why **decision 200** exists: the app verifies bcrypt as well as argon2 and silently
 * re-hashes to argon2 the first time a man logs in. **This script is useless without that code.**
 * It checks for it and refuses to write if it is missing, rather than quietly locking fifteen people
 * out of their own team's app.
 *
 * ## Input
 *
 * `audit/radarlocal-passwords/hashes.json` — `[{ full_name, hash }]`, exported from the old app's
 * `auth.users`. That directory is gitignored and stays outside the repository: a password hash is a
 * credential, this repository is public, and sixty characters of bcrypt is an offline cracking target
 * for whoever reads it.
 *
 * Names are mapped through `scripts/radarlocal-names.mts`, the one table both other importers use.
 * An unmapped or ambiguous name aborts; it never guesses which teammate a hash belongs to.
 *
 * ## Safety
 *
 * Preview or a local database only. Production is refused **by name** — these are credentials, and
 * writing them on the instance the team logs into is the owner's deliberate act, not a side effect of
 * a rehearsal. A `-pooler` host is refused (`COORDINATION.md`). Dry run unless `--commit`, and the
 * target is printed with its own password redacted first. No hash is ever printed in full.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import { readFileSync } from "node:fs";

import postgres from "postgres";

import { OLD_TO_TARGET_DISPLAY_NAME } from "./radarlocal-names.mjs";

const PREVIEW_HOST = "ep-raspy-fire-zam9gi7k";
const PRODUCTION_HOST = "ep-gentle-cherry";
const INPUT = "audit/radarlocal-passwords/hashes.json";

/** The owner keeps his own password, and the super admin's is not the old app's business. */
const NEVER_TOUCH_USERNAMES = new Set(["potter", "admin"]);
/** Old-app names the owner excluded by name rather than by username. */
const NEVER_TOUCH_OLD_NAMES = new Set(["Benjamin Gonzva"]);

const commit = process.argv.includes("--commit");

const redact = (url: string) => url.replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@");
function refuse(message: string): never {
  console.error(`ABANDON : ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) refuse("DATABASE_URL n'est pas défini.");
if (url!.includes(PRODUCTION_HOST)) {
  refuse(
    `Cette base est la PRODUCTION (${PRODUCTION_HOST}). Ce script ne s'y exécute pas : ce sont des ` +
      `mots de passe, et les écrire sur l'instance où l'équipe se connecte est une décision du ` +
      `propriétaire, pas l'effet de bord d'une répétition.`,
  );
}
if (url!.includes("-pooler")) {
  refuse(
    "Cette URL passe par le pooler Neon. Utilise le point d'entrée direct (COORDINATION.md).",
  );
}
const isLocal = url!.includes("localhost") || url!.includes("127.0.0.1");
if (!isLocal && !url!.includes(PREVIEW_HOST)) {
  refuse(`Cette base n'est ni la préproduction (${PREVIEW_HOST}) ni locale (${redact(url!)}).`);
}

type Row = { full_name: string; hash: string };
let input: Row[];
try {
  input = JSON.parse(readFileSync(INPUT, "utf8")) as Row[];
} catch {
  refuse(`${INPUT} est introuvable ou illisible. Il reste hors du dépôt, qui est public.`);
}

const BCRYPT = /^\$2[aby]\$/;
const bad = input!.filter((r) => !BCRYPT.test(r.hash) || r.hash.length !== 60);
if (bad.length > 0) {
  refuse(`${bad.length} empreinte(s) ne sont pas du bcrypt de 60 caractères : ${bad.map((r) => r.full_name).join(", ")}`);
}

const sql = postgres(url!, { max: 1 });

console.log(`motsdepasse  ${redact(url!)}`);
console.log(`motsdepasse  ${commit ? "ÉCRITURE (--commit)" : "simulation — rien ne sera écrit"}`);
console.log(`motsdepasse  ${input!.length} empreintes lues dans ${INPUT}\n`);

const members = (await sql`
  select u.id, u.username, u.display_name as "displayName", u.password_hash as "hash"
  from users u
  join team_members tm on tm.user_id = u.id and tm.left_at is null
`) as unknown as { id: string; username: string; displayName: string; hash: string }[];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const byName = new Map<string, typeof members>();
for (const m of members) {
  const key = norm(m.displayName);
  byName.set(key, [...(byName.get(key) ?? []), m]);
}

/**
 * The shared table is keyed on the spelling the old app's JSON export used; `auth.users`'s own
 * `profiles.full_name` differs in accents and trailing spaces — « Léo COACH » against the table's
 * « Leo COACH ». So the key is matched accent- and space-insensitively rather than by adding a second
 * alias table that could drift from the first. The normalisation keeps the two Léos apart, which is
 * the only pair where a collision would matter: « leo coach » and « leo m » are still distinct.
 */
const mappingByNormalisedKey = new Map(
  Object.entries(OLD_TO_TARGET_DISPLAY_NAME).map(([from, to]) => [norm(from), to]),
);
if (mappingByNormalisedKey.size !== Object.keys(OLD_TO_TARGET_DISPLAY_NAME).length) {
  refuse("Deux clés du tableau de noms se confondent une fois les accents retirés.");
}

type Plan = { username: string; displayName: string; oldName: string; hash: string; was: string };
const plan: Plan[] = [];
const skipped: string[] = [];
const unmapped: string[] = [];

for (const row of input!) {
  const oldName = row.full_name.trim();
  if (NEVER_TOUCH_OLD_NAMES.has(oldName)) {
    skipped.push(`${oldName} (exclu par le propriétaire)`);
    continue;
  }
  const target = mappingByNormalisedKey.get(norm(oldName)) ?? oldName;
  const found = byName.get(norm(target)) ?? [];
  if (found.length === 0) {
    unmapped.push(`${oldName} → « ${target} » : aucun membre actif de ce nom`);
    continue;
  }
  if (found.length > 1) {
    refuse(`« ${target} » désigne ${found.length} membres : ${found.map((m) => m.username).join(", ")}`);
  }
  const member = found[0]!;
  if (NEVER_TOUCH_USERNAMES.has(member.username)) {
    skipped.push(`${oldName} → ${member.username} (exclu par le propriétaire)`);
    continue;
  }
  plan.push({
    username: member.username,
    displayName: member.displayName,
    oldName,
    hash: row.hash,
    was: member.hash,
  });
}

if (unmapped.length > 0) {
  console.log("motsdepasse  non rattachés, laissés tels quels :");
  for (const line of unmapped) console.log(`    ${line}`);
  console.log("");
}
if (skipped.length > 0) {
  console.log(`motsdepasse  exclus : ${skipped.join(" · ")}\n`);
}
if (plan.length === 0) refuse("Aucun mot de passe à écrire.");

const algoOf = (hash: string) => (BCRYPT.test(hash) ? "bcrypt" : hash.startsWith("$argon2") ? "argon2" : "?");
console.log("utilisateur   joueur         avant     après     (déjà fait ?)");
console.log("------------  -------------  --------  --------  -------------");
let already = 0;
for (const p of plan) {
  const same = p.was === p.hash;
  if (same) already += 1;
  console.log(
    `${p.username.padEnd(12)}  ${p.displayName.padEnd(13)}  ${algoOf(p.was).padEnd(8)}  ` +
      `${algoOf(p.hash).padEnd(8)}  ${same ? "oui" : "non"}`,
  );
}
console.log(
  `\nmotsdepasse  ${plan.length} à écrire, dont ${already} déjà identiques · ` +
    `${members.length} membres actifs en base`,
);

// The app must understand bcrypt before these are written, or fifteen people lose their access.
const password = readFileSync("lib/auth/password.ts", "utf8");
const understandsBcrypt = /\$2\[aby\]|\$2a|bcrypt/i.test(password);
if (!understandsBcrypt) {
  refuse(
    "`lib/auth/password.ts` ne sait pas vérifier du bcrypt : écrire ces empreintes maintenant " +
      "empêcherait ces joueurs de se connecter (décision 200). Fusionne d'abord ce support.",
  );
}
console.log("motsdepasse  `lib/auth/password.ts` sait lire du bcrypt : les connexions fonctionneront.");

if (!commit) {
  console.log("\nSimulation terminée : rien n'a été écrit. Relance avec --commit.");
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const p of plan) {
    await tx`update users set password_hash = ${p.hash} where username = ${p.username}`;
  }
});

const after = (await sql`
  select u.username, left(u.password_hash, 4) as algo
  from users u where u.username in ${sql(plan.map((p) => p.username))}
`) as unknown as { username: string; algo: string }[];
const wrong = after.filter((r) => !BCRYPT.test(r.algo));
if (wrong.length > 0) refuse(`Après écriture, ${wrong.length} empreinte(s) ne sont pas du bcrypt.`);

const untouched = (await sql`
  select u.username from users u where u.username in ('potter', 'admin')
    and left(u.password_hash, 7) = '$argon2'
`) as unknown as { username: string }[];

console.log(`\nmotsdepasse  écrit : ${plan.length} mots de passe.`);
console.log(
  `motsdepasse  intacts et toujours en argon2 : ${untouched.map((r) => r.username).join(", ") || "(aucun trouvé)"}`,
);
console.log(
  "motsdepasse  chacun redeviendra de l'argon2 à la première connexion de son propriétaire (décision 200).",
);

await sql.end();
