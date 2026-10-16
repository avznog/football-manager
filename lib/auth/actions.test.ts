/**
 * `login` upgrades an imported bcrypt hash to argon2id, and only when the password was right
 * (decision 200).
 *
 * A unit test, like `lib/rating/actions.test.ts`: Postgres, the cookie store and `redirect` are
 * mocked, and what is under test is the order of the steps in `login` — verify, then upgrade, then
 * the session. `./password` is only **wrapped**, never replaced, so the hashes here are real ones and
 * the test fails if the upgrade writes something argon2 would not recognise.
 *
 * It also covers logging in with the address inherited from that app (decision 208).
 */

import { hash as bcryptHash } from "@node-rs/bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const USERNAME = "lucas";
const EMAIL = "tsarkrek@gmail.com";
const PASSWORD = "allez-les-7-orteils";

const state = vi.hoisted(() => ({
  /** The one row `db.query.users.findFirst` answers with, or `null` for "no such identifier". */
  user: null as null | {
    id: string;
    username: string;
    email?: string | null;
    passwordHash: string;
  },
  /** Every `db.query.users.findFirst(…)` argument object, newest last. */
  lookups: [] as { where?: unknown }[],
  /** Every `update(users).set(…)` the action performed, newest last. */
  writes: [] as { passwordHash?: string }[],
  /** Set when the update should blow up, to prove a failed upgrade does not cost the login. */
  failTheUpdate: false,
  sessions: [] as string[],
  /** The stored hash each `verifyPassword` call was given, newest last. */
  verified: [] as string[],
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
// Wrapped, not replaced: the real argon2 and bcrypt still run — only the arguments are recorded,
// so a test can prove the timing decoy was verified against without faking a verification.
vi.mock("./password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./password")>();
  return {
    ...actual,
    verifyPassword: async (storedHash: string, plain: string) => {
      state.verified.push(storedHash);
      return actual.verifyPassword(storedHash, plain);
    },
  };
});
vi.mock("@/db/client", () => ({
  db: {
    query: {
      users: {
        findFirst: async (args: { where?: unknown }) => {
          state.lookups.push(args);
          return state.user ?? undefined;
        },
      },
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

/** The one message every failed login gets, whatever was wrong with it. */
const BAD_CREDENTIALS = "Identifiant ou mot de passe incorrect.";

const { login } = await import("./actions");
const { verifyPassword } = await import("./password");

function form(password: string, identifier = USERNAME): FormData {
  const data = new FormData();
  data.set("identifier", identifier);
  data.set("password", password);
  return data;
}

/**
 * The column names and bound values the lookup's `where` is built from. Walking the SQL rather
 * than running it is the only way a mocked database can prove *which* columns were compared:
 * the point of the single query is that an address is matched in the same round trip as a name.
 */
function lookupTerms(where: unknown): string[] {
  const terms: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      if (typeof node === "string") terms.push(node);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.name === "string" && "table" in record) {
      terms.push(record.name);
      return;
    }
    if (Array.isArray(record.queryChunks)) record.queryChunks.forEach(walk);
    if ("value" in record) walk(record.value);
  };
  walk(where);
  return terms;
}

/** `login` ends in a `redirect`, which the mock turns into a throw. */
async function loginExpectingRedirect(password: string, identifier = USERNAME): Promise<void> {
  await expect(login(undefined, form(password, identifier))).rejects.toThrow("NEXT_REDIRECT:/");
}

beforeEach(async () => {
  state.user = {
    id: USER_ID,
    username: USERNAME,
    email: EMAIL,
    passwordHash: await bcryptHash(PASSWORD, { cost: 6, version: "2a" }),
  };
  state.lookups = [];
  state.verified = [];
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
      error: BAD_CREDENTIALS,
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
      error: BAD_CREDENTIALS,
    });

    expect(state.writes).toEqual([]);
    expect(state.sessions).toEqual([]);
  });
});

describe("login by the address inherited from the previous app", () => {
  it("looks a man up by username and by address in the same query", async () => {
    await loginExpectingRedirect(PASSWORD, EMAIL);

    expect(state.lookups).toHaveLength(1);
    const terms = lookupTerms(state.lookups[0].where);
    expect(terms).toContain("username");
    expect(terms).toContain("email");
    expect(terms).toContain(EMAIL);
  });

  it("creates the session for the same user id as the username would", async () => {
    await loginExpectingRedirect(PASSWORD, EMAIL);
    expect(state.sessions).toEqual([USER_ID]);
  });

  it("normalises what is typed, so an address pasted with capitals still works", async () => {
    await loginExpectingRedirect(PASSWORD, `  TsarKrek@Gmail.com `);

    expect(lookupTerms(state.lookups[0].where)).toContain(EMAIL);
    expect(state.sessions).toEqual([USER_ID]);
  });

  it("lets a man with no address log in by username", async () => {
    // `admin` and `raphael`: the column is null and nothing about that may cost them the login.
    state.user = { ...state.user!, email: null };

    await loginExpectingRedirect(PASSWORD);
    expect(state.sessions).toEqual([USER_ID]);
  });

  it("refuses an address nobody has with the message a wrong password gets", async () => {
    state.user = null;

    expect(await login(undefined, form(PASSWORD, "personne@example.com"))).toEqual({
      error: BAD_CREDENTIALS,
    });
    expect(state.sessions).toEqual([]);
  });

  it("still pays the decoy verification for an unknown address", async () => {
    // The whole point: an address nobody has must cost what a name nobody has costs, or the
    // response time becomes a list of the team's addresses. The decoy is argon2id; the fixture
    // row's hash is bcrypt, so the prefix says which one was verified against.
    state.user = null;
    await login(undefined, form(PASSWORD, "personne@example.com"));

    expect(state.verified).toHaveLength(1);
    expect(state.verified[0].startsWith("$argon2id$")).toBe(true);
  });
});
