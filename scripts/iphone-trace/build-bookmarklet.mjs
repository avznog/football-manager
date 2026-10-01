/**
 * Turns `capture.js` into the three artefacts the iPhone trace sink needs.
 *
 *   TRACE_SECRET=… node scripts/iphone-trace/build-bookmarklet.mjs
 *   node scripts/iphone-trace/build-bookmarklet.mjs --secret=…
 *
 * Node's standard library only, and no npm dependency: a minifier is a build tool, and this is a
 * throwaway diagnostic that must not grow the lockfile of a production app to exist. The repo's
 * other probes (`scripts/probe-iphone16.mjs`) are plain `.mjs` for the same family of reasons.
 *
 * ## What it emits, and why there are three things
 *
 * 1. **`lib/dev/capture-source.ts`** — the minified capture source as a committed TypeScript constant.
 *    This is the one output that is **tracked by git**, and the reason it exists is a deployment fact
 *    rather than a preference: `scripts/` is not included in Vercel's serverless bundle, so
 *    `GET /api/dev/trace` cannot read `capture.js` off the disk at runtime. It would work on the
 *    owner's machine and 500 on preview — a failure that only appears where nobody is holding a
 *    debugger. So the source travels into the bundle as a string, and this script is what puts it
 *    there. **Edit `capture.js`, rerun this, commit both.**
 *
 * 2. **`audit/iphone-trace-loader.txt`** — the bookmarklet the owner actually installs: a little over
 *    400 characters once URL-encoded, which injects `<script src="/api/dev/trace?k=…">`. Thirty-odd
 *    times shorter than the inline form, and short enough to read end to end in Safari's address
 *    field — which kills the one failure mode of the long form, a truncated paste that looks exactly
 *    like success. (The length is reported on every build rather than asserted here, because the key
 *    is part of it.)
 *
 * 3. **`audit/iphone-trace-bookmarklet.txt`** — the whole capture script inline, ~14 KB, as a
 *    fallback for the day the route is unreachable or the secret is not set in Vercel yet. Kept
 *    because it depends on nothing but the bookmark itself.
 *
 * Both artefacts embed the secret, which is why they go to `audit/` — already gitignored, and already
 * where `scripts/audit-screens.ts` puts generated output. **The secret is never printed in full**; the
 * script reports its length and first two characters so the owner can tell which key an artefact
 * carries without putting it in a terminal scrollback.
 *
 * ## The minifier is deliberately almost useless
 *
 * It strips whole-line comments and leading indentation and nothing else — it does not rename
 * identifiers, does not join lines, does not touch anything inside a line. A clever minifier here
 * would be a liability twice over: a bug in it is a bug in a tool whose whole purpose is to be trusted
 * about what the page did, and renaming identifiers would make `__fmTrace` — which the owner types
 * into a tethered Web Inspector — vanish. Newlines survive into the URL as `%0A`, which is legal and
 * costs three characters each; that is a price worth paying for a transform that cannot break
 * semantics.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SOURCE = join(HERE, "capture.js");
const OUT_DIR = join(REPO, "audit");
const OUT_INLINE = join(OUT_DIR, "iphone-trace-bookmarklet.txt");
const OUT_LOADER = join(OUT_DIR, "iphone-trace-loader.txt");
const OUT_MODULE = join(REPO, "lib", "dev", "capture-source.ts");

/**
 * Safari's bookmark address field has no documented limit and in practice swallows far more than
 * this, but a URL the owner cannot paste in one go is a URL that silently gets truncated. 8 000 is
 * the usual conservative ceiling quoted for bookmarklets; past it, warn rather than fail — a working
 * long bookmarklet beats a refused build. The loader comes in around a twentieth of it, which is the
 * whole reason the loader exists.
 */
const LENGTH_WARNING = 8000;

/* -------------------------------------------------------------------------- */
/* The secret                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `--secret=…` or `TRACE_SECRET`, and **it is required**.
 *
 * Emitting a loader with an empty key would produce an artefact that installs cleanly and then gets a
 * 404 from a route that refuses to say why — the endpoint is indistinguishable from absent by design,
 * so the one place that can catch a missing key is here, before the bookmark exists.
 */
function readSecret(argv) {
  const flag = argv.find((arg) => arg.startsWith("--secret="));
  const fromFlag = flag ? flag.slice("--secret=".length) : "";
  return (fromFlag || process.env.TRACE_SECRET || "").trim();
}

/** Never the key itself: enough to recognise which one an artefact carries, and no more. */
function describeSecret(secret) {
  return `${secret.length} caractères, commence par « ${secret.slice(0, 2)} »`;
}

const secret = readSecret(process.argv.slice(2));

if (!secret) {
  console.error(
    "Refus : aucune clé. Passe --secret=… ou exporte TRACE_SECRET.\n" +
      "C'est la même valeur que TRACE_SECRET dans l'environnement « preview » de Vercel ;\n" +
      "sans elle la route répond 404 et ne dit pas pourquoi.",
  );
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* The minifier                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Strip comments and indentation, conservatively.
 *
 * The rules, in full:
 *   - a line whose trimmed form starts with `//` is dropped;
 *   - a run of lines from one whose trimmed form starts with `/*` to the one containing `*​/` is
 *     dropped, including the single-line `/* ... *​/` case;
 *   - every surviving line is left-trimmed;
 *   - blank lines are dropped.
 *
 * What it explicitly does **not** do: look inside a line. A trailing comment after code survives
 * into the output, and so does a `//` in a string literal — which is the reason this is safe. The
 * cost is that `capture.js` has to keep its comments on their own lines, which it does, and which is
 * this repo's house style anyway.
 */
function minify(source) {
  const out = [];
  let inBlock = false;

  for (const raw of source.split("\n")) {
    const line = raw.trim();

    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    if (line.startsWith("//")) continue;
    if (line === "") continue;

    out.push(line);
  }

  return out.join("\n");
}

const source = await readFile(SOURCE, "utf8");
const code = minify(source);

/* -------------------------------------------------------------------------- */
/* 1. The committed module                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `JSON.stringify` on the whole body, which is the correct and complete escape for a JavaScript
 * string literal: it handles the newlines the minifier keeps, the `«` and `✓` the French strings
 * contain, and the quotes and backslashes inside the code. Hand-rolling the escaping here would be
 * the classic way to generate a file that compiles until the day someone adds a backtick.
 *
 * The constant carries **no secret**: the key reaches the shim from `window.__fmTraceKey` or from the
 * script's own `src`, so this committed file is safe to read in a diff.
 */
const moduleText = `/**
 * The capture script's source, as a string — **generated, do not edit**.
 *
 *   TRACE_SECRET=… node scripts/iphone-trace/build-bookmarklet.mjs
 *
 * Regenerate and commit this file whenever \`scripts/iphone-trace/capture.js\` changes. Nothing checks
 * that automatically beyond \`lib/dev/trace.test.ts\`, which fails if the constant is empty or has lost
 * the markers it should contain — a drift smaller than that is a drift nobody notices, so the rule is
 * « rerun the build in the same commit », not « the test will tell you ».
 *
 * It exists because \`GET /api/dev/trace\` has to serve the capture script and **cannot read it from
 * disk**: \`scripts/\` is not part of Vercel's serverless bundle, so a \`readFile\` would work locally and
 * 500 on preview. A committed constant is in the bundle by construction.
 *
 * Source: \`scripts/iphone-trace/capture.js\`, comments and indentation stripped. No secret is baked in;
 * the shim reads its key from \`window.__fmTraceKey\` or from its own \`src\`.
 */

export const CAPTURE_SOURCE = ${JSON.stringify(code)};
`;

await writeFile(OUT_MODULE, moduleText, "utf8");

/* -------------------------------------------------------------------------- */
/* 2. The loader bookmarklet                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The install path. It prompts for nothing, sets the key for the shim to find, and injects the
 * script.
 *
 * Idempotent on the **same flag the capture script already sets**, `window.__fmTrace`: a bookmark in
 * Safari is tapped twice as often as once, and the second tap means « I could not tell whether the
 * first one worked ». So the second tap re-shows the panel instead of loading a second copy. The
 * `__fmTraceLoading` guard covers the gap the first one cannot — the second or so between the tap and
 * the script arriving, during which `__fmTrace` does not exist yet and two taps would fetch twice.
 *
 * The key travels in the query string because **a bookmarklet cannot set a header on a
 * `<script src>`**. That is the weaker of the two forms the endpoint accepts and the route's comment
 * says so; the POSTs the shim then makes use the header.
 */
const loaderSource = [
  "(function(w,d){",
  "if(w.__fmTrace)return w.__fmTrace.show();",
  "if(w.__fmTraceLoading)return;",
  "w.__fmTraceLoading=1;",
  `w.__fmTraceKey=${JSON.stringify(secret)};`,
  "var s=d.createElement('script');",
  "s.src='/api/dev/trace?k='+encodeURIComponent(w.__fmTraceKey);",
  "s.onerror=function(){w.__fmTraceLoading=0;alert('Trace KO')};",
  "d.head.appendChild(s)",
  "})(window,document)",
].join("");

const loaderUrl = "javascript:" + encodeURIComponent(loaderSource);

/* -------------------------------------------------------------------------- */
/* 3. The inline fallback                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `encodeURIComponent` on the whole body, which is the only encoding that is correct for every byte
 * a bookmarklet can contain. Hand-escaping just the obvious offenders (`%`, `"`, spaces) is the
 * classic way to ship a bookmarklet that works until the day a `#` appears in a French string and
 * truncates the rest of the program into a fragment identifier — and this file has `«` and `✓` in it.
 *
 * The key is assigned before the IIFE so the shim finds it on `window`, exactly as the loader does.
 */
const inlineSource = `window.__fmTraceKey=${JSON.stringify(secret)};\n${code}`;
const inlineUrl = "javascript:" + encodeURIComponent(inlineSource);

for (const url of [loaderUrl, inlineUrl]) {
  if (!url.startsWith("javascript:")) {
    console.error("Refus : la sortie ne commence pas par « javascript: ».");
    process.exit(1);
  }
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_LOADER, loaderUrl + "\n", "utf8");
await writeFile(OUT_INLINE, inlineUrl + "\n", "utf8");

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

const sourceLines = source.split("\n").length;
const codeLines = code.split("\n").length;

console.log(`source    ${SOURCE}`);
console.log(`clé       ${describeSecret(secret)}`);
console.log("");
console.log(`généré    ${OUT_MODULE} (committé — ${code.length} caractères de code)`);
console.log(`écrit     ${OUT_LOADER} — ${loaderUrl.length} caractères (le loader, à installer)`);
console.log(`écrit     ${OUT_INLINE} — ${inlineUrl.length} caractères (le repli, tout en ligne)`);
console.log("");
console.log(`code      ${code.length} caractères, ${codeLines} lignes sur ${sourceLines}`);

if (loaderUrl.length > LENGTH_WARNING) {
  console.warn(
    `attention le loader fait ${loaderUrl.length} caractères, au-delà du seuil prudent de ` +
      `${LENGTH_WARNING} : ce n'est pas censé arriver, relis-le avant de t'en servir.`,
  );
}

console.log(
  "rappel    les deux artefacts contiennent la clé en clair ; audit/ est gitignoré, " +
    "ne les recopie pas ailleurs.",
);
