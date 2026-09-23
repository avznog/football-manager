/**
 * Loads the developer's environment for scripts run outside Next (`tsx db/*.ts`).
 *
 * Import this *first*, before anything that reads `process.env` — ES module imports are evaluated
 * in order, and a script that queries before `.env.local` is loaded fails on a `DATABASE_URL`
 * that is sitting in a file right next to it. Next loads `.env.local` by itself, so this is for
 * the command line only.
 */

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
