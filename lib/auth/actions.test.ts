/**
 * `login` upgrades an imported bcrypt hash to argon2id, and only when the password was right
 * (decision 200).
 *
 * A unit test, like `lib/rating/actions.test.ts`: Postgres, the cookie store and `redirect` are
 * mocked, and what is under test is the order of the steps in `login` — verify, then upgrade, then
 * the session. `./password` is **not** mocked, so the hashes here are real ones and the test fails
 * if the upgrade writes something argon2 would not recognise.
 */

import { hash as bcryptHash } from "@node-rs/bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const USERNAME = "lucas";
const PASSWORD = "allez-les-7-orteils";

const state = vi.hoisted(() => ({
  /** The one row `db.query.users.findFirst` answers with, or `null` for "no such username". */
  user: null as null | { id: string; username: string; passwordHash: string },
  /** Every `update(users).set(…)` the action performed, newest last. */
  writes: [] as { passwordHash?: string }[],
  /** Set when the update should blow up, to prove a failed upgrade does not cost the login. */
  failTheUpdate: false,
  sessions: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("./session", () => ({
  createSession: async (userId: string) => {
    state.sessions.push(userId);
  },
  destroySession: async () => {},
}));
vi.mock("./dal", () => ({
  getCurrentUser: async () => null,
  redirectSignedOut: async () => {
    throw new Error("NEXT_REDIRECT:/connexion");
  },
}));
vi.mock("@/db/client", () => ({
  db: {
    query: {
      users: { findFirst: async () => state.user ?? undefined },
      invites: { findFirst: async () => undefined },
      teamMembers: { findFirst: async () => undefined },
    },
    update: () => ({
      set: (values: { passwordHash?: string }) => ({
        where: async () => {
          if (state.failTheUpdate) throw new Error("la base refuse l'écriture");
          state.writes.push(values);
        },
      }),
    }),
  },
}));

const { login } = await import("./actions");
const { verifyPassword } = await import("./password");

function form(password: string, username = USERNAME): FormData {
  const data = new FormData();
  data.set("username", username);
  data.set("password", password);
  return data;
}

/** `login` ends in a `redirect`, which the mock turns into a throw. */
async function loginExpectingRedirect(password: string): Promise<void> {
  await expect(login(undefined, form(password))).rejects.toThrow("NEXT_REDIRECT:/");
}

beforeEach(async () => {
  state.user = {
    id: USER_ID,
    username: USERNAME,
    passwordHash: await bcryptHash(PASSWORD, { cost: 6, version: "2a" }),
  };
  state.writes = [];
  state.failTheUpdate = false;
  state.sessions = [];
});

describe("login, against a bcrypt hash inherited from the previous app", () => {
  it("re-hashes to argon2id after a successful login", async () => {
    await loginExpectingRedirect(PASSWORD);

    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].passwordHash?.startsWith("$argon2id$")).toBe(true);
    expect(state.sessions).toEqual([USER_ID]);
  });

  it("writes a hash that really verifies the same password", async () => {
    await loginExpectingRedirect(PASSWORD);

    const upgraded = state.writes[0].passwordHash as string;
    expect(await verifyPassword(upgraded, PASSWORD)).toEqual({ ok: true, needsUpgrade: false });
    expect(await verifyPassword(upgraded, "pas-le-bon")).toEqual({
      ok: false,
      needsUpgrade: false,
    });
  });

  it("does not re-hash after a failed login", async () => {
    expect(await login(undefined, form("pas-le-bon"))).toEqual({
      error: "Nom d'utilisateur ou mot de passe incorrect.",
    });

    expect(state.writes).toEqual([]);
    expect(state.sessions).toEqual([]);
  });

  it("logs the user in anyway when the upgrade cannot be written", async () => {
    state.failTheUpdate = true;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await loginExpectingRedirect(PASSWORD);

    expect(state.sessions).toEqual([USER_ID]);
    // Nothing in the log line is the password or a hash.
    const printed = logged.mock.calls.flat().join(" ");
    expect(printed).not.toContain(PASSWORD);
    expect(printed).not.toContain("$2a$");
    expect(printed).not.toContain("$argon2");
    logged.mockRestore();
  });

  it("the second login then works against the new argon2 hash, and rewrites nothing", async () => {
    await loginExpectingRedirect(PASSWORD);
    const upgraded = state.writes[0].passwordHash as string;

    // What the database now holds for that user.
    state.user = { id: USER_ID, username: USERNAME, passwordHash: upgraded };
    state.writes = [];
    state.sessions = [];

    await loginExpectingRedirect(PASSWORD);

    expect(state.writes).toEqual([]);
    expect(state.sessions).toEqual([USER_ID]);
  });
});

describe("login, otherwise unchanged", () => {
  it("rewrites nothing after a login against an argon2 hash", async () => {
    const { hashPassword } = await import("./password");
    state.user = {
      id: USER_ID,
      username: USERNAME,
      passwordHash: await hashPassword(PASSWORD),
    };

    await loginExpectingRedirect(PASSWORD);

    expect(state.writes).toEqual([]);
    expect(state.sessions).toEqual([USER_ID]);
  });

  it("refuses an unknown username against the decoy, and writes nothing", async () => {
    state.user = null;

    expect(await login(undefined, form(PASSWORD, "inconnu"))).toEqual({
      error: "Nom d'utilisateur ou mot de passe incorrect.",
    });

    expect(state.writes).toEqual([]);
    expect(state.sessions).toEqual([]);
  });
});
