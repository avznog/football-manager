import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { SESSION_COOKIE } from "./cookies";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Below this remaining lifetime, a session is extended on use. */
const SESSION_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * The cookie holds a raw random token; the database stores only its SHA-256.
 * A leaked database dump therefore cannot be replayed as a login.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/** Creates a session row and sets the cookie. Only valid inside a Server Action or Route Handler. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/**
 * Resolves the current session, or null. Also prunes the row if it has expired and extends
 * sessions that are close to expiry.
 *
 * Safe to call from a Server Component: cookie writes are attempted but swallowed, because
 * Next only permits them in Server Actions and Route Handlers.
 */
export async function readSession(): Promise<{ userId: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = hashToken(token);
  const row = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.expiresAt.getTime() - Date.now() < SESSION_REFRESH_THRESHOLD_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    try {
      store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
    } catch {
      // Read-only context (Server Component). The row is extended; the cookie catches up on
      // the next action.
    }
  }

  return { userId: row.userId };
}

/** Deletes the session row and clears the cookie. Server Action / Route Handler only. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Housekeeping; called opportunistically, never on the hot path. */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
