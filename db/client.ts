/**
 * The database client.
 *
 * One driver (postgres.js) for both local development and production: Neon accepts standard
 * TCP connections through its pooler, so there is no need for a second Neon-specific driver
 * and no divergence between environments (decision 016).
 *
 * Server-only. Importing this from a Client Component is a bug.
 */

import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

/**
 * Next hot-reloads modules in development, which would otherwise open a new pool on every
 * edit until Postgres refuses connections.
 */
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__sql ??
  postgres(connectionString, {
    // Serverless functions are short-lived; a small pool avoids exhausting Postgres.
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__sql = sql;
}

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type Db = typeof db;
export { schema, sql };
