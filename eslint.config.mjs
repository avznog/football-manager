import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright's output. Both are in `.gitignore`, which ESLint does not read: the HTML report
    // embeds a bundled copy of its own viewer, so a single failed `npm run test:e2e` used to make
    // `npm run lint` — a gate in the definition of done — report 259 errors in vendored JavaScript.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
