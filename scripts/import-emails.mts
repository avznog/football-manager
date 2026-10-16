/**
 * Gives each man the address he logged in with on the team's previous app.
 *
 * ```bash
 *   SUPABASE_ACCESS_TOKEN='sbp_…' DATABASE_URL='…' \
 *     npx tsx --conditions=react-server scripts/import-emails.mts
 *   … --commit                 # write to the preview or a local database
 *   … --commit --production    # write to production, which must be spelled out
 * ```
 *
 * ## Why this exists
 *
 * `info-radarlocal` identified people by **email**; this app has always identified them by username
 * (decision 008). Decision 208 lets the address name the same account, so that a teammate can type
 * whichever of the two he remembers. The password side needed nothing: decision 200 imported the old
 * app's bcrypt hashes, so for most of these men the password here already *is* their old-app one.
 *
 * This is the import that fills `users.email`. Sixteen of the eighteen accounts have an address;
 * `admin` and `raphael` have none, because there is none to have.
 *
 * ## What it is not
 *
 * **It is not a contact list.** Nothing in the app sends to this column, there is no « mot de passe
 * oublié » (decision 200's whole premise), and the addresses are read only by the login lookup. They
 * are personal data all the same: they are never printed in full by this script, never committed, and
 * live in the database and the old app alone.
 *
 * ## Names
 *
 * `OLD_TO_TARGET_DISPLAY_NAME` in `scripts/radarlocal-names.mts` is the one table, shared with the
 * other three importers, applied after a normalisation that strips accents and collapses spaces. Two
 * aliases are declared here because the spellings differ by more than punctuation: « Léo COACH » is
 * « Léo C », and the old app's own `profiles.full_name` for the owner is now « Benjamin » where the
 * table still knows him as « Benjamin Gonzva ». Nothing is inferred — « Léo » is a prefix of both
 * Léos, and guessing would hand one man's address to the other with nothing failing anywhere.
 *
 * « Alexis CHARRIER » maps to nobody and is reported as such rather than forced.
 *
 * ## Idempotency and what it refuses to overwrite
 *
 * Convergent: it sets each address to what the old app says, so a second run writes nothing. It
 * **never clears** an address, and it stops rather than moving one that already belongs to a different
 * user — `users_email_unique` would reject that anyway, and a crash is a worse way to find out.
 *
 * ## Safety
 *
 * Refuses a `-pooler` host (`COORDINATION.md`: a pooled connection can carry an empty `search_path`
 * left by a `pg_restore`). **Production needs `--production` on the command line**, because decision
 * 201 made it the only copy of the season. Dry run unless `--commit`, and the target is printed with
 * its password redacted first.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import postgres from "postgres";

import { OLD_TO_TARGET_DISPLAY_NAME } from "./radarlocal-names.mjs";

const PROJECT_REF = "foqqovzyvstancdtxnyn";
const PREVIEW_HOST = "ep-raspy-fire-zam9gi7k";
const PRODUCTION_HOST = "ep-gentle-cherry";
/** Spellings that differ from the shared table by more than accents or spaces. */
const EXPORT_ALIASES: Readonly<Record<string, string>> = {
  "leo coach": "Léo C",
  "benjamin": "Benjamin",
};

const commit = process.argv.includes("--commit");
const production = process.argv.includes("--production");

const redact = (url: string) => url.replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@");
/** Never the whole address in a log: `pie***@outlook.fr`. */
const mask = (email: string) => {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, Math.min(3, at))}***${email.slice(at)}`;
};
function refuse(message: string): never {
  console.error(`ABANDON : ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) refuse("DATABASE_URL n'est pas défini.");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) refuse("SUPABASE_ACCESS_TOKEN n'est pas défini : c'est la source des adresses.");
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

/* -------------------------------------------------------------------------- */
/* The old app                                                                */
/* -------------------------------------------------------------------------- */

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `select p.full_name as name, lower(u.email) as email
            from auth.users u join public.profiles p on p.id = u.id
            where u.email is not null order by p.full_name`,
  }),
});
const body = (await response.json()) as unknown;
if (!response.ok || !Array.isArray(body)) {
  refuse(`L'API Supabase a répondu ${response.status} : ${JSON.stringify(body).slice(0, 300)}`);
}
const oldAccounts = body as { name: string; email: string }[];

const sql = postgres(url!, { max: 1 });

console.log(`adresses   ${redact(url!)}${isProductionUrl ? "   *** PRODUCTION ***" : ""}`);
console.log(`adresses   ${commit ? "ÉCRITURE (--commit)" : "simulation — rien ne sera écrit"}`);
console.log(`adresses   ${oldAccounts.length} comptes lus dans l'ancienne application\n`);

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

const users = (await sql`
  select id, username, display_name as "displayName", lower(email) as email from users
`) as unknown as { id: string; username: string; displayName: string; email: string | null }[];
const byName = new Map<string, typeof users>();
for (const user of users) {
  const key = norm(user.displayName);
  byName.set(key, [...(byName.get(key) ?? []), user]);
}

const tableByNormalisedKey = new Map(
  Object.entries(OLD_TO_TARGET_DISPLAY_NAME).map(([from, to]) => [norm(from), to]),
);

type Plan = { id: string; username: string; email: string; was: string | null };
const plan: Plan[] = [];
const unmapped: string[] = [];

for (const account of oldAccounts) {
  const key = norm(account.name);
  const target = EXPORT_ALIASES[key] ?? tableByNormalisedKey.get(key) ?? account.name;
  if (target === null) {
    unmapped.push(`${account.name} : associé à personne dans le tableau de noms`);
    continue;
  }
  const found = byName.get(norm(target)) ?? [];
  if (found.length === 0) {
    unmapped.push(`${account.name} → « ${target} » : aucun utilisateur de ce nom`);
    continue;
  }
  if (found.length > 1) {
    refuse(`« ${target} » désigne ${found.length} utilisateurs : ${found.map((u) => u.username).join(", ")}`);
  }
  const user = found[0]!;
  // Never move an address off one account onto another: the unique index would reject it, and a
  // crash is a worse way to learn that the name table is wrong.
  const owner = users.find((u) => u.email === account.email && u.id !== user.id);
  if (owner) {
    refuse(
      `${mask(account.email)} appartient déjà à « ${owner.username} » et l'ancienne application ` +
        `l'attribue à « ${user.username} ». Le tableau de noms est à corriger avant d'écrire.`,
    );
  }
  plan.push({ id: user.id, username: user.username, email: account.email, was: user.email });
}

if (unmapped.length > 0) {
  console.log("adresses   non rattachées, laissées de côté :");
  for (const line of unmapped) console.log(`    ${line}`);
  console.log("");
}
if (plan.length === 0) refuse("Aucune adresse à écrire.");

const toWrite = plan.filter((p) => p.was !== p.email);
console.log("utilisateur   adresse                          état");
console.log("------------  -------------------------------  ----------------");
for (const p of plan) {
  const state = p.was === p.email ? "déjà en base" : p.was === null ? "à écrire" : "à remplacer";
  console.log(`${p.username.padEnd(12)}  ${mask(p.email).padEnd(31)}  ${state}`);
}

const without = users.filter((u) => !plan.some((p) => p.id === u.id));
console.log(
  `\nadresses   ${toWrite.length} à écrire, ${plan.length - toWrite.length} déjà identiques · ` +
    `${without.length} utilisateur(s) sans adresse : ${without.map((u) => u.username).join(", ") || "aucun"}`,
);
console.log(
  "adresses   rien n'est envoyé à ces adresses : elles ne servent qu'à reconnaître un compte " +
    "au moment de la connexion (décision 208).",
);

if (toWrite.length === 0) {
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

await sql.begin(async (tx) => {
  for (const p of toWrite) {
    await tx`update users set email = ${p.email} where id = ${p.id}`;
  }
});

const after = (await sql`
  select username, lower(email) as email from users where email is not null order by username
`) as unknown as { username: string; email: string }[];
const duplicates = (await sql`
  select count(*)::int as n from (select email from users where email is not null group by email having count(*) > 1) z
`) as unknown as { n: number }[];
if ((duplicates[0]?.n ?? 0) > 0) refuse(`${duplicates[0]!.n} adresse(s) sont partagées par deux comptes.`);

console.log(`\nadresses   écrit : ${toWrite.length}. ${after.length} comptes ont une adresse :`);
for (const row of after) console.log(`  ${row.username.padEnd(12)} ${mask(row.email)}`);
console.log("adresses   aucune adresse partagée, vérifié après écriture.");

await sql.end();
