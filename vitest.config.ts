import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `proxy.test.ts` sits next to `proxy.ts` at the root, as the convention asks: a test lives
    // beside what it tests, and the routing guard has nowhere else to live.
    include: ["lib/**/*.test.ts", "db/**/*.test.ts", "*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
