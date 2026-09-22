/**
 * Loads the developer's environment for scripts run outside Next (`tsx db/*.ts`).
 *
 * Import this *first*, before anything that reads `process.env` at module scope — ES module
 * imports are evaluated in order, and `db/client.ts` throws on a missing `DATABASE_URL`.
 * Next loads `.env.local` by itself, so this is for the command line only.
 */

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
