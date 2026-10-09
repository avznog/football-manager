/**
 * Re-freeze every finished match: `npm run db:refreeze` (decision 161).
 *
 * `match_player_stats` and `match_player_positions` are caches of the reduction, written at the final
 * whistle by `finalizeMatchById` (`lib/match/finalize.ts`). When the reducer learns to compute
 * something new — `goals_for_while_on` and the per-position figures of decision 160 — every match
 * frozen before that has the old rows, and nothing re-freezes a match nobody touches. This does: it
 * calls the one writer for every match whose status is `finished`, which replays the log and replaces
 * the rows wholesale. There is no arithmetic here and no SQL that writes a figure (invariant 2).
 *
 * **Idempotent.** The writer deletes and reinserts from the log, so a second run writes the same rows;
 * running it on every deploy is what CI does, right after `db:migrate`, so a migration that adds a
 * column and the backfill that fills it ship together.
 *
 * A finished match whose log holds no final whistle — a match closed by the « Terminer le match » card
 * with nothing typed (decision 121) — is left exactly as it is: `finalizeMatch` declines it and says
 * so, and this script counts it rather than inventing a freeze.
 *
 * ## Safety
 *
 * Refuses a `DATABASE_URL` that is not on `localhost`/`127.0.0.1` unless `--allow-remote` is passed,
 * and prints the database (password redacted) before touching it — the guard of
 * `scripts/import-radarlocal.mts`. CI passes the flag, because there the remote *is* the target.
 *
 * `--conditions=react-server` (in the npm script) because `lib/match` is `import "server-only"`.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "../db/load-env";

import { asc, eq } from "drizzle-orm";

import { db, sql as rawSql } from "../db/client";
import { matches } from "../db/schema";
import { finalizeMatchById } from "../lib/match/finalize";

function redact(url: string): string {
  return url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");
}

async function main(): Promise<void> {
  const allowRemote = process.argv.includes("--allow-remote");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas défini.");
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal && !allowRemote) {
    throw new Error(
      `Cette base n'est pas locale (${redact(url)}). ` +
        "Ajoute --allow-remote pour l'accepter — c'est un acte volontaire.",
    );
  }
  // In CI the URL is a secret: GitHub masks it in the log, and the redaction drops the password.
  console.log(`refreeze  ${isLocal ? redact(url) : "base distante (--allow-remote)"}`);

  const finished = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.status, "finished"))
    .orderBy(asc(matches.kickoffAt));

  let frozen = 0;
  let declined = 0;
  let players = 0;
  let positions = 0;
  for (const match of finished) {
    const result = await finalizeMatchById(match.teamId, match.id);
    if (result.finished) {
      frozen += 1;
      players += result.players;
      positions += result.positions;
    } else {
      declined += 1;
    }
  }

  console.log(
    `refreeze  ${finished.length} matchs terminés · ${frozen} regelés ` +
      `(${players} lignes joueur, ${positions} lignes poste) · ${declined} sans coup de sifflet final, laissés tels quels`,
  );
}

try {
  await main();
} finally {
  await rawSql.end();
}
