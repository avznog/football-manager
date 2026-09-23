/**
 * Playwright configuration — the end-to-end happy path.
 *
 * Three choices are worth explaining, because they are the ones that keep this suite honest:
 *
 * 1. **Mobile viewport by default.** This is a mobile-first app (`docs/PLAN.md`): a test that
 *    passes at 1280×720 and fails in a coach's hand is worse than no test. 390×844 is an iPhone
 *    12/13/14 in portrait. `hasTouch` stays off on purpose — the specs drive the app with the
 *    mouse, and the composition editor's tap-then-tap flow is pointer-event based, so it behaves
 *    identically either way while mouse clicks keep failure messages readable.
 * 2. **One worker, no parallelism.** The suite talks to the one local Postgres. Its fixtures are
 *    run-scoped (`e2e/fixtures/seed.ts`), so two workers would not corrupt each other's data, but
 *    they would compete for the dev server's compile and turn timeouts into flakes.
 * 3. **`reuseExistingServer` outside CI.** `npm run dev` is slow to boot and slower to compile the
 *    first hit of each route; reusing the server a session already has running is the difference
 *    between a two-minute run and a five-minute one. In CI there is never one to reuse.
 *
 * `npm test` stays Vitest-only (`CLAUDE.md`): nothing here is wired into it, and `vitest.config.ts`
 * only collects `lib/**` and `db/**`, so an `e2e/*.spec.ts` file is invisible to the unit suite.
 */

import { defineConfig } from "@playwright/test";

/** Kept configurable so a session with something already on 3000 can move the run aside. */
const PORT = Number(process.env.E2E_PORT ?? 3000);

/**
 * **`localhost`, not `127.0.0.1`.** Next 16's dev server refuses cross-origin requests to its dev
 * resources, and it considers `127.0.0.1` a different origin from the `localhost` it is serving:
 * `/_next/hmr` is blocked, the client bundle never finishes wiring itself up, and the page **never
 * hydrates**. Everything still renders — server-rendered HTML and Server Actions posted by a plain
 * form both work — so the symptom is not a blank screen but a suite that silently only ever tests
 * the no-JavaScript fallbacks. Which is exactly the kind of quiet half-test this file exists to
 * avoid.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  /**
   * The happy path is one long scenario — create a match, select a squad, build two compositions,
   * play a match, rate the squad twice — against a **development** server that compiles each route
   * on first hit. Five minutes is not generous, it is realistic.
   */
  timeout: 5 * 60_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    hasTouch: false,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    // Match minutes are Paris wall-clock in the UI; a browser in another zone would type the
    // wrong `datetime-local` and then disagree with the server about which day it is.
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  webServer: {
    /**
     * `npm run dev` locally, because that is the server a session already has running and the code
     * it is editing. CI overrides this with `next start` on a built app (`E2E_WEB_SERVER`): a
     * production server has nothing left to compile, which is both faster and one less source of
     * timeouts on a cold runner.
     */
    command: process.env.E2E_WEB_SERVER ?? `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
