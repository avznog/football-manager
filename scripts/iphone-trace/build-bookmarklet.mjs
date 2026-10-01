/**
 * Turns `capture.js` into the one-line `javascript:` URL the owner saves as a Safari bookmark.
 *
 *   node scripts/iphone-trace/build-bookmarklet.mjs
 *
 * Node's standard library only, and no npm dependency: a minifier is a build tool, and this is a
 * throwaway diagnostic that must not grow the lockfile of a production app to exist. The repo's
 * other probes (`scripts/probe-iphone16.mjs`) are plain `.mjs` for the same family of reasons.
 *
 * **The minifier is deliberately almost useless.** It strips whole-line comments and leading
 * indentation and nothing else — it does not rename identifiers, does not join lines, does not touch
 * anything inside a line. A clever minifier here would be a liability twice over: a bug in it is a
 * bug in a tool whose whole purpose is to be trusted about what the page did, and renaming
 * identifiers would make `__fmTrace` — which the owner types into a tethered Web Inspector — vanish.
 * Newlines survive into the URL as `%0A`, which is legal and costs three characters each; that is a
 * price worth paying for a transform that cannot break semantics.
 *
 * Output goes to `audit/`, which is already gitignored and already where `scripts/audit-screens.ts`
 * puts generated artefacts. Nothing new is added to `.gitignore`: the generated URL is a derivative
 * of a committed source file and must never be the thing anyone edits.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SOURCE = join(HERE, "capture.js");
const OUT_DIR = join(REPO, "audit");
const OUT_FILE = join(OUT_DIR, "iphone-trace-bookmarklet.txt");

/**
 * Safari's bookmark address field has no documented limit and in practice swallows far more than
 * this, but a URL the owner cannot paste in one go is a URL that silently gets truncated. 8 000 is
 * the usual conservative ceiling quoted for bookmarklets; past it, warn rather than fail — a working
 * long bookmarklet beats a refused build.
 */
const LENGTH_WARNING = 8000;

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

/**
 * `encodeURIComponent` on the whole body, which is the only encoding that is correct for every byte
 * a bookmarklet can contain. Hand-escaping just the obvious offenders (`%`, `"`, spaces) is the
 * classic way to ship a bookmarklet that works until the day a `#` appears in a French string and
 * truncates the rest of the program into a fragment identifier — and this file has `«` and `✓` in it.
 */
const url = "javascript:" + encodeURIComponent(code);

if (!url.startsWith("javascript:")) {
  console.error("Refus : la sortie ne commence pas par « javascript: ».");
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_FILE, url + "\n", "utf8");

const sourceLines = source.split("\n").length;
const codeLines = code.split("\n").length;

console.log(url);
console.log("");
console.log(`source   ${SOURCE}`);
console.log(`écrit    ${OUT_FILE}`);
console.log(
  `taille   ${url.length} caractères (code ${code.length} avant encodage ; ` +
    `${codeLines} lignes sur ${sourceLines})`,
);

if (url.length > LENGTH_WARNING) {
  console.warn(
    `attention ${url.length} caractères dépasse le seuil prudent de ${LENGTH_WARNING} : ` +
      `vérifie que Safari a bien pris l'adresse en entier avant de t'en servir.`,
  );
}
