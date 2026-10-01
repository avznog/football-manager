import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `proxy.test.ts` sits next to `proxy.ts` at the root, as the convention asks: a test lives
    // beside what it tests, and the routing guard has nowhere else to live. `tutoiement.test.ts` is
    // the other root case, for the opposite reason: what it tests is `app/`, `components/`, `lib/`
    // and `db/` at once, read as text precisely because the first two are not collected here.
    include: ["lib/**/*.test.ts", "db/**/*.test.ts", "*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
