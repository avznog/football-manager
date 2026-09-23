/**
 * What these cover is a deployment property, not a query: importing this module must not need
 * `DATABASE_URL`, because `next build` imports every route module to collect its configuration
 * (decision 075). Three production builds died there, and the suite had nothing to say about it —
 * 868 tests, every one of them run with a `DATABASE_URL` in the environment. The end-to-end suite
 * proves the proxies work against a real Postgres; these prove the *absence* is survivable, which
 * is the half that was broken.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `server-only` resolves to its throwing variant outside a React Server build: the empty module
 * sits behind the `react-server` export condition, which Vitest does not apply. The guard is for
 * the bundler, and there is no bundler here.
 */
vi.mock("server-only", () => ({}));

const A_PLAUSIBLE_URL = "postgres://nobody:nothing@127.0.0.1:5432/none";

/** `postgres()` does not dial on construction, so nothing here opens a socket. */
async function freshImport() {
  vi.resetModules();
  return import("./client");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("importing the client", () => {
  it("does not need DATABASE_URL, because a build never queries", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(freshImport()).resolves.toHaveProperty("db");
  });
});

describe("first use", () => {
  it("still fails loudly when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { db } = await freshImport();

    expect(() => db.select()).toThrow(/DATABASE_URL is not set/);
  });

  it("reads DATABASE_URL then, not at import — so a variable set late is honoured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { db } = await freshImport();

    vi.stubEnv("DATABASE_URL", A_PLAUSIBLE_URL);

    expect(typeof db.select).toBe("function");
  });
});

describe("the proxies", () => {
  it("expose the Drizzle query builders", async () => {
    vi.stubEnv("DATABASE_URL", A_PLAUSIBLE_URL);
    const { db } = await freshImport();

    expect(typeof db.select).toBe("function");
    expect(db.query).toHaveProperty("users");
  });

  it("keep `sql` both callable and indexable — it is a tagged template with methods", async () => {
    vi.stubEnv("DATABASE_URL", A_PLAUSIBLE_URL);
    const { sql } = await freshImport();

    expect(typeof sql).toBe("function");
    expect(typeof sql.unsafe).toBe("function");
    expect(typeof sql.end).toBe("function");
  });
});
