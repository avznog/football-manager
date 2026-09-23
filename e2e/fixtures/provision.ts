/**
 * Runs `e2e/fixtures/seed.ts` and hands the spec what it created.
 *
 * A child process rather than an import: `db/client.ts` is `import "server-only"`, which only
 * resolves under the `react-server` condition, and Playwright's runner does not use it. `tsx` does,
 * with the same flag `npm run db:seed` uses — so the fixture loads the schema exactly the way the
 * application does, instead of a second, subtly different copy.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import type { Fixture, FixturePlayer, FixturePlayerKey } from "./types";

const SCRIPT = path.join("e2e", "fixtures", "seed.ts");

export function provisionFixture(): Fixture {
  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  if (!existsSync(tsx)) {
    throw new Error("tsx introuvable : lance `npm install` avant les tests end-to-end.");
  }

  const stdout = execFileSync(tsx, ["--conditions=react-server", SCRIPT], {
    encoding: "utf8",
    // `.env.local` is read relative to the working directory, like every db script in the repo.
    cwd: process.cwd(),
    // A cold argon2id hash plus a handful of inserts; 60 s is only a guard against a dead Postgres.
    timeout: 60_000,
    // Let a crash speak for itself in the test output instead of being swallowed.
    stdio: ["ignore", "pipe", "inherit"],
  });

  return parseFixture(stdout);
}

/** The JSON is the last line: anything a dependency logged before it is ignored. */
function parseFixture(stdout: string): Fixture {
  const line = stdout
    .split("\n")
    .map((candidate) => candidate.trim())
    .reverse()
    .find((candidate) => candidate.startsWith("{"));

  if (!line) {
    throw new Error(`La fixture n'a rien renvoyé d'exploitable :\n${stdout}`);
  }

  const fixture = JSON.parse(line) as Fixture;
  if (fixture.players.length !== 8) {
    throw new Error(`La fixture doit créer 8 joueurs, pas ${fixture.players.length}.`);
  }
  return fixture;
}

/** Throws rather than returning `undefined`: a missing key is a bug in the spec, not a skip. */
export function playerOf(fixture: Fixture, key: FixturePlayerKey): FixturePlayer {
  const player = fixture.players.find((candidate) => candidate.key === key);
  if (!player) throw new Error(`Aucun joueur « ${key} » dans la fixture.`);
  return player;
}
