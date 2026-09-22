/**
 * Applies committed SQL migrations. Run with `npm run db:migrate`.
 *
 * Migrations are always generated (`npm run db:generate`) and committed alongside the schema
 * change that produced them — never applied with `db:push` outside local experimentation.
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

async function main() {
  const sql = postgres(url!, { max: 1 });

  await migrate(drizzle(sql, { casing: "snake_case" }), { migrationsFolder: "./db/migrations" });
  console.log("migrations applied");

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
