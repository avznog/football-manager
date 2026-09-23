/**
 * The database client.
 *
 * One driver (postgres.js) for both local development and production: Neon accepts standard
 * TCP connections through its pooler, so there is no need for a second Neon-specific driver
 * and no divergence between environments (decision 016).
 *
 * **Nothing here runs until the first query.** `DATABASE_URL` used to be read, and missing, at
 * module scope — which made it a *build-time* requirement: `next build` imports every route to
 * collect its configuration, so the throw landed in « Collecting page data » and the whole build
 * failed before a single page was rendered. A build is not a run; it should not need a production
 * secret. So the connection is created on first use behind a proxy, the check still throws — just
 * at the moment somebody actually asks for data — and the message names both environments
 * (decision 075).
 *
 * Server-only. Importing this from a Client Component is a bug.
 */

import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Next hot-reloads modules in development, which would otherwise open a new pool on every
 * edit until Postgres refuses connections.
 */
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

function connect() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Locally: copy .env.example to .env.local. " +
        "On Vercel: add it to the project's environment variables — see docs/DEPLOY.md §4.",
    );
  }

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

  return { sql, db: drizzle(sql, { schema, casing: "snake_case" }) };
}

type Connection = ReturnType<typeof connect>;

let connection: Connection | undefined;

function open(): Connection {
  connection ??= connect();
  return connection;
}

/**
 * Reads a property off the real object, bound to it. Binding matters: the proxy target is an empty
 * shell, so an unbound method would run with `this` pointing at the shell.
 */
function forward(owner: object, property: string | symbol): unknown {
  const value = Reflect.get(owner, property) as unknown;
  return typeof value === "function" ? (value as (...args: never[]) => unknown).bind(owner) : value;
}

/** The Drizzle instance. Typed exactly as `drizzle()` returns; the proxy is invisible to callers. */
export const db: Connection["db"] = new Proxy({} as Connection["db"], {
  get: (_target, property) => forward(open().db, property),
});

/**
 * The raw postgres.js tag, for the few places that need SQL the query builder cannot express, and
 * for `sql.end()`. Callable, so the proxy target has to be a function and the `apply` trap is what
 * makes `` sql`select …` `` work.
 */
export const sql: Connection["sql"] = new Proxy(
  function raw() {} as unknown as Connection["sql"],
  {
    apply: (_target, _thisArg, args: unknown[]) =>
      (open().sql as unknown as (...a: unknown[]) => unknown)(...args),
    get: (_target, property) => forward(open().sql, property),
  },
);

export type Db = Connection["db"];
export { schema };
