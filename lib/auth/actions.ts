"use server";

/**
 * Authentication and team-joining Server Actions.
 *
 * Joining is always by invite code — a coach generates one and shares it on WhatsApp
 * (decision 008). There is no self-service signup and no password recovery by email.
 */

import { randomBytes } from "node:crypto";

import { and, eq, isNull, sql as raw } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { invites, teamMembers, users } from "@/db/schema";
import { ACTIVE_TEAM_COOKIE } from "./cookies";
import { getCurrentUser } from "./dal";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession } from "./session";
import {
  type FormState,
  joinWithExistingAccountSchema,
  joinWithNewAccountSchema,
  loginSchema,
  toFormState,
} from "./validation";

/** Uniform message: never reveal whether a username exists. */
const BAD_CREDENTIALS = "Nom d'utilisateur ou mot de passe incorrect.";

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const user = await db.query.users.findFirst({
    where: eq(users.username, parsed.data.username),
  });

  // Always run a real verification, even when the username does not exist, so the response
  // time cannot be used to discover which accounts are real.
  const storedHash = user?.passwordHash ?? (await getDecoyHash());
  const ok = await verifyPassword(storedHash, parsed.data.password);

  if (!user || !ok) return { error: BAD_CREDENTIALS };

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

/**
 * Where to land after logging in. `proxy.ts` puts the requested path in `?suivant=`, and that
 * value reaches us through a hidden field — so it is attacker-controlled. Only same-site
 * absolute paths are honoured, never `//evil.com` or a full URL.
 */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/**
 * A genuine argon2id hash of a random value, computed once per process. Verifying against it
 * costs the same as verifying a real password — which is the whole point. A hardcoded string
 * would not do: a malformed hash fails instantly and leaks the timing difference we are
 * trying to hide.
 */
let decoyHash: Promise<string> | undefined;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return decoyHash;
}

export async function logout(): Promise<void> {
  await destroySession();
  const store = await cookies();
  store.delete(ACTIVE_TEAM_COOKIE);
  redirect("/connexion");
}

type InviteResolution =
  | { ok: true; invite: { id: string; teamId: string; role: "coach" | "player" } }
  | { ok: false; error: string };

/**
 * Validates an invite without consuming it. Expiry and use count are re-checked inside the
 * transaction that consumes it, so a race cannot over-issue places.
 */
async function resolveInvite(code: string): Promise<InviteResolution> {
  const invite = await db.query.invites.findFirst({ where: eq(invites.code, code) });
  if (!invite) return { ok: false, error: "Ce code d'invitation n'existe pas." };
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "Ce code d'invitation a expiré. Demande-en un nouveau à ton coach." };
  }
  if (invite.uses >= invite.maxUses) {
    return { ok: false, error: "Ce code d'invitation a déjà été utilisé." };
  }
  return { ok: true, invite: { id: invite.id, teamId: invite.teamId, role: invite.role } };
}

/** Creates an account from an invite code and joins the team in one step. */
export async function joinWithNewAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = joinWithNewAccountSchema.safeParse({
    code: formData.get("code"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const resolution = await resolveInvite(parsed.data.code);
  if (!resolution.ok) return { fieldErrors: { code: [resolution.error] } };

  const existing = await db.query.users.findFirst({
    where: eq(users.username, parsed.data.username),
    columns: { id: true },
  });
  if (existing) {
    return {
      fieldErrors: {
        username: ["Ce nom d'utilisateur est déjà pris. Choisis-en un autre."],
      },
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      // Re-check and consume atomically: only claim a place if one is still free.
      const claimed = await tx
        .update(invites)
        .set({ uses: raw`${invites.uses} + 1` })
        .where(
          and(
            eq(invites.id, resolution.invite.id),
            raw`${invites.uses} < ${invites.maxUses}`,
            raw`${invites.expiresAt} > now()`,
          ),
        )
        .returning({ id: invites.id });

      if (claimed.length === 0) {
        throw new InviteUnavailableError();
      }

      const [created] = await tx
        .insert(users)
        .values({
          username: parsed.data.username,
          displayName: parsed.data.displayName,
          passwordHash,
        })
        .returning({ id: users.id });

      await tx.insert(teamMembers).values({
        teamId: resolution.invite.teamId,
        userId: created.id,
        role: resolution.invite.role,
        isPlayer: true,
      });

      return created.id;
    });
  } catch (error) {
    if (error instanceof InviteUnavailableError) {
      return { fieldErrors: { code: ["Ce code d'invitation vient d'être utilisé."] } };
    }
    throw error;
  }

  await createSession(userId);
  await setActiveTeam(resolution.invite.teamId);
  redirect("/");
}

/** Adds an already-authenticated user to another team. */
export async function joinWithExistingAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  const parsed = joinWithExistingAccountSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return toFormState(parsed.error);

  const resolution = await resolveInvite(parsed.data.code);
  if (!resolution.ok) return { fieldErrors: { code: [resolution.error] } };

  const already = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, resolution.invite.teamId),
      eq(teamMembers.userId, user.id),
      isNull(teamMembers.leftAt),
    ),
    columns: { id: true },
  });
  if (already) {
    await setActiveTeam(resolution.invite.teamId);
    redirect("/");
  }

  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(invites)
        .set({ uses: raw`${invites.uses} + 1` })
        .where(
          and(
            eq(invites.id, resolution.invite.id),
            raw`${invites.uses} < ${invites.maxUses}`,
            raw`${invites.expiresAt} > now()`,
          ),
        )
        .returning({ id: invites.id });

      if (claimed.length === 0) throw new InviteUnavailableError();

      await tx.insert(teamMembers).values({
        teamId: resolution.invite.teamId,
        userId: user.id,
        role: resolution.invite.role,
        isPlayer: true,
      });
    });
  } catch (error) {
    if (error instanceof InviteUnavailableError) {
      return { fieldErrors: { code: ["Ce code d'invitation vient d'être utilisé."] } };
    }
    throw error;
  }

  await setActiveTeam(resolution.invite.teamId);
  redirect("/");
}

class InviteUnavailableError extends Error {
  constructor() {
    super("invite unavailable");
    this.name = "InviteUnavailableError";
  }
}

/** Remembers which team the user is looking at (decision 002 — single-team UX). */
export async function setActiveTeam(teamId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_TEAM_COOKIE, teamId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Team switcher for the rare user who belongs to several teams. */
export async function switchTeam(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  const teamId = String(formData.get("teamId") ?? "");
  const membership = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.userId, user.id),
      isNull(teamMembers.leftAt),
    ),
    columns: { id: true },
  });

  if (membership || user.isSuperAdmin) {
    await setActiveTeam(teamId);
  }
  redirect("/");
}
