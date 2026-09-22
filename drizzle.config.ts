import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next loads .env.local automatically; drizzle-kit does not.
config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  // Lets the schema use camelCase properties that map to snake_case columns.
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
