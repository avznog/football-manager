/**
 * The sentences `compositionsScreenFr` owns are written in one place only.
 *
 * This test exists because of a passing one. `plan.test.ts` asserts « never tells a coach to place
 * seven players in a match that is over », with `not.toContain("Place tes sept joueurs")`, and it was
 * green the whole time the composition card on `/match/[id]` printed that exact sentence under a match
 * played ten days earlier. The function was right, the test was right, and the card simply did not
 * call the function — so nothing anywhere could notice.
 *
 * Vitest collects `lib/**` and `db/**` and nothing under `app/` or `components/` (`vitest.config.ts`),
 * which is the mechanical reason a screen can contradict a tested function indefinitely. A test on a
 * pure function proves nothing about a screen that never asks it. This one scans the source instead:
 * it is not a unit test of behaviour, it is the only cheap way to assert that the behaviour is the one
 * reached.
 *
 * Deliberately narrow. It pins the handful of sentences that are *already* derived from the match's
 * status — the ones where a hard-coded copy is by definition a claim about a match nobody checked. It
 * is not a ban on French in `.tsx`, which would fail on hundreds of legitimate labels.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** The sentences that are only true of a match still to be played. */
const DERIVED_SENTENCES = [
  "Place tes sept joueurs sur la pelouse",
  "tu pourras ensuite planifier les changements",
  "puis indique en dessous les remplaçants et les supporters",
  // And the sentences that are only true of a composition nothing has saved: the pitch of a new
  // composition is pre-filled with the team in force at that minute (decision 106), which is seven
  // discs that look exactly like a plan and are not one.
  "déplace seulement ce qui change",
  "Rien n’est encore enregistré",
  "n’a pas pu être replacé",
];

/** Where they may be written. Nowhere else, and never in a `.tsx`. */
const OWNERS = [join("lib", "composition", "plan.ts"), join("lib", "composition", "prefill.ts")];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) {
      out.push(path);
    }
  }
  return out;
}

describe("the composition copy that depends on a match's status", () => {
  const files = sourceFiles(join(process.cwd(), "app"))
    .concat(sourceFiles(join(process.cwd(), "components")))
    .concat(sourceFiles(join(process.cwd(), "lib")));

  it.each(DERIVED_SENTENCES)("« %s » is written only in plan.ts", (sentence) => {
    const offenders = files
      .filter((path) => readFileSync(path, "utf8").includes(sentence))
      .map((path) => path.slice(process.cwd().length + 1))
      // A comment quoting the sentence to explain the defect is the point, not a copy of it.
      .filter((path) => !OWNERS.includes(path));

    expect(offenders).toEqual([]);
  });

  /** Proof the scan actually reads files, so an empty glob cannot make this vacuously green. */
  it("reads the modules that own them", () => {
    for (const owner of OWNERS) {
      expect(files.some((path) => path.endsWith(owner))).toBe(true);
    }
    expect(readFileSync(join(process.cwd(), OWNERS[0]), "utf8")).toContain(DERIVED_SENTENCES[0]);
  });
});
