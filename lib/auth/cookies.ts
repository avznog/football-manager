/**
 * Cookie names, on their own.
 *
 * `session.ts` and `dal.ts` are `server-only` and reach for the database; `proxy.ts` needs the
 * session cookie *name* and nothing else. Keeping the constants in a leaf module means the
 * proxy bundle stays free of the Postgres driver.
 */

/** Holds the raw session token. httpOnly; only its SHA-256 is stored server-side. */
export const SESSION_COOKIE = "fm_session";

/** Which team the user is currently looking at (decision 002 — single-team UX). */
export const ACTIVE_TEAM_COOKIE = "fm_team";
