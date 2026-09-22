/**
 * Drops and recreates the public schema. Local development only — `npm run db:reset`.
 *
 * Refuses to run against anything that does not look like a local database, so that a stray
 * DATABASE_URL pointing at Neon cannot wipe real data.
 */

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
if (!isLocal && process.env.ALLOW_REMOTE_RESET !== "yes") {
  throw new Error(
    `Refusing to reset a non-local database (${url.replace(/:[^:@]*@/, ":***@")}). ` +
      "Set ALLOW_REMOTE_RESET=yes if you really mean it.",
  );
}

async function main() {
  const sql = postgres(url!, { max: 1 });

  await sql.unsafe("drop schema public cascade; create schema public;");
  // Drizzle keeps its migration journal in its own schema. Leaving it behind makes the next
  // `db:migrate` believe every migration is already applied, and the tables never come back.
  await sql.unsafe("drop schema if exists drizzle cascade;");
  await sql.unsafe("create extension if not exists pgcrypto;");
  console.log("schema dropped and recreated");

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
