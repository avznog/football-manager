/**
 * The tutoiement (decision 074), enforced over the whole source tree instead of module by module.
 *
 * The rule itself is old and settled: the UI says « ta réponse », « appuie », « tu suis le match en
 * direct », and never « vous », « votre », « vos ». What was missing is a place that can notice a
 * breach. Four unit tests guarded it — `lib/composition/hints.test.ts`, `lib/match/presenter.test.ts`,
 * `lib/player/shirt.test.ts`, `lib/stats/best-seven-copy.test.ts` — and all four assert the absence of
 * the word in the return value of a function they import. That is a guard on four modules' copy, and
 * every one of them lives under `lib/` for a mechanical reason: `vitest.config.ts` collects
 * `lib/**`, `db/**` and the root, and nothing under `app/` or `components/` is ever collected as a
 * module at all. French written directly into a screen is therefore outside any test that could
 * possibly fail on it — which is how `components/errors/error-screen.tsx` came to say « Réessayez » and
 * « passez par un autre écran », found three times by three reviewers reading it, never once by CI.
 *
 * So this one does not import anything it checks. It reads the tree as text with `node:fs`, the way
 * `lib/composition/copy.test.ts` already does for the sentences that depend on a match's status, and
 * fails on the pronouns wherever they appear in copy. Being text, it covers the case the module tests
 * structurally cannot: **JSX text**, `<p>Réessayez</p>`, which is not inside a string literal and is
 * not the return value of anything.
 *
 * And the hole is not only `app/` and `components/`. `lib/match/presenter.ts` has been telling the coach
 * « **Touchez** un joueur pour le faire entrer » for as long as it has existed, in a module that is
 * collected, and whose own test file asserts the tutoiement — `presenter.test.ts:762` checks
 * `watching.description` for « votre », and `presenter.test.ts:428` asserted the « Touchez » sentence
 * *verbatim*, pinning the breach in place. That is the whole argument against guarding a house rule with
 * per-module assertions on hand-picked return values: the author of such a test picks the string he was
 * already thinking about, and a rule about every string cannot be checked one string at a time. The
 * eight breaches that first scan found in `terrain-sheet.tsx`, `lineup-composer.tsx` and `presenter.ts`
 * were fixed in the change that added this file.
 *
 * It lives at the repository root rather than under `lib/` because what it tests is not a module. Its
 * subject is four top-level directories at once, and the root is the only place that sits above all of
 * them; putting it in `lib/<something>/` would claim an owner it does not have. The root is already a
 * collected location (`*.test.ts` in `vitest.config.ts`).
 *
 * ## Two rules, and why neither is a general pattern
 *
 * The first is the pronouns: whole-word `vous`, `votre`, `vos`, case-insensitively.
 *
 * The second is the imperative, and it is a **curated list of verb forms, never a `-ez` pattern**. The
 * pattern was written and thrown away, because it cries wolf: « assurez » inside a French quotation,
 * a third-person sentence about the team, and a good part of the vocabulary of a form label all end in
 * those two letters without addressing anybody, and a check with a false positive a week is a check
 * somebody turns off. But that is an argument against the pattern, not against the catch — and the
 * catch matters, because the breach that caused this whole file to exist, « Réessayez ; … passez par un
 * autre écran » in `components/errors/error-screen.tsx`, contains **no pronoun at all**. A guard that
 * misses its own motivating case is not a guard. So: a list, every entry of which is a second-person
 * *plural* imperative with an unambiguous `tu` form that is the correct copy — « Réessaie »,
 * « Appuie », « Choisis ».
 *
 * **The list is meant to grow.** It was seeded from the verbs this app actually uses to tell somebody
 * to do something, which means it is a snapshot of one afternoon's vocabulary and nothing more; the
 * next French sentence anybody writes may use a verb it has never heard of. When you find one, add it.
 * The failure mode to watch for is the opposite move — deleting the list, or gutting it, the first time
 * it is inconvenient. An entry is only wrong if it is *ambiguous*, i.e. if some legitimate French
 * sentence in this app's register spells it without addressing the reader; `allez` was dropped for
 * exactly that reason and the comment on the list says so. Inconvenient is not ambiguous.
 *
 * The scan is **line-based, minus comments**, not literal-based. A literal-based scan is the obvious
 * instinct and it is the wrong one here: it would need a real tokenizer to tell a template literal's
 * French from the expressions interpolated into it, and it would miss JSX text entirely — the one case
 * that motivated the whole file. Line-based is safe because of a convention this repo already enforces
 * elsewhere: **the code is in English and only the strings are French** (`CLAUDE.md`). An identifier
 * cannot collide, since `\b` makes `vousTruc`, `nous_vos` and `appuyezTruc` no match; so a whole-word
 * French pronoun or verb form on a line that is not a comment is user-facing by construction.
 *
 * One trap, recorded here because it will bite the next person who writes a French text check in this
 * repository: **`\b` is ASCII and French is not.** It treats « é » as a non-word character, so
 * `/\bfaites\b/` matches inside « **Dé**faites » — the label over the number of losses on `/stats`, and
 * the first thing the imperative rule flagged. Every rule here therefore goes through `wholeWords`,
 * which spells the boundary out as a lookaround on `\p{L}`. Any accented prefix has the same effect, so
 * this is not one unlucky word.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/* -------------------------------------------------------------------------- */
/* The two rules                                                              */
/* -------------------------------------------------------------------------- */

/**
 * « Whole word », spelled out rather than written `\b`, because `\b` is ASCII and French is not: it
 * counts « é » as a non-word character, so `\bfaites\b` matches inside « **Dé**faites » — which is the
 * label over the number of losses on the stats screen, and was the first thing the imperative rule
 * flagged. A lookaround on `\p{L}` is the honest boundary. The hyphen is deliberately not a letter, so
 * « ouvrez-la » and « relâchez-le » still match the verb in front of the enclitic.
 *
 * One consequence of spelling the boundary as `(?<![\p{L}\p{N}_])` / `(?![\p{L}\p{N}_])` under `u`: a
 * decomposed (NFD) accented character puts a combining mark exactly where the regex expects a boundary,
 * so NFD input can read differently from the NFC this repository's files are written in.
 *
 * Neither regex is global: `RegExp.test` on a `/g` regex carries `lastIndex` from one call to the next.
 */
function wholeWords(words: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words.join("|")})(?![\\p{L}\\p{N}_])`, "iu");
}

const PRONOUNS = wholeWords(["vous", "votre", "vos"]);

/**
 * « rendez-vous » is a noun, not an address to the reader, and a calendar app is exactly the kind of
 * thing that will one day want to write it. It is the only allowed spelling of the letters: every other
 * enclitic — « asseyez-vous », « servez-vous » — is vouvoiement and stays a breach.
 */
const ALLOWED_PRONOUN_SPELLINGS = /rendez-vous/giu;

/**
 * The second-person-plural imperatives, each with the `tu` form that replaces it. Seeded from the verbs
 * the UI uses to tell somebody to do something, then widened with the six this scan found in the tree
 * itself: `utilisez`, `placez`, `renseignez`, `relâchez`, `touchez` and `faites`.
 *
 * Three judgements worth recording, because they are the entries somebody will want to argue about:
 *
 * - **`allez` is dropped.** « Allez » is an interjection before it is an imperative, and in a football
 *   team's app it is *the* interjection: « Allez, encore un effort », « Allez les gars ». Flagging it
 *   would be the first false positive, on the most idiomatic sentence in the register. « Va » is the
 *   `tu` imperative and it is not what those sentences mean.
 * - **`faites` is kept**, although `-es` and not `-ez`: the rule is about the person addressed, not
 *   about a suffix, and `components/action-sheet/terrain-sheet.tsx` says « Faites glisser un joueur ».
 *   Its only non-imperative reading is the feminine plural participle, « des choses bien faites », which
 *   needs a plural feminine noun in front of it — write that sentence and the exception can be added
 *   then, with the example to hand.
 * - **`veuillez` belongs here and not with the pronouns**, although it addresses the reader as plainly
 *   as « vous » does: it is a verb form, so the whole-word machinery and the baseline are the same ones
 *   the rest of this list needs. It is the commonest politeness form in French interface copy —
 *   « Veuillez patienter », « Veuillez réessayer » — and the tree has never contained it, which is the
 *   reason to add it before it appears rather than after.
 * - **`notez` is kept**, despite « noter » being a domain verb here: the ratings screen already writes
 *   the imperative as « Note tes coéquipiers » (`recap/_components/ratings-panel.tsx`), so the `tu` form
 *   is the one in use and the `vous` form is free to be a breach. The nouns are different words and
 *   whole-word matching does not touch them — « Note », « notes », « aucune note » all stay silent.
 *
 * `vous confirmez` and the other indicative readings need no thought: the pronoun in front of them is
 * already a breach of the first rule.
 */
const IMPERATIVES = [
  "réessayez",
  "essayez",
  "appuyez",
  "cliquez",
  "tapez",
  "touchez",
  "relâchez",
  "faites",
  "placez",
  "déplacez",
  "choisissez",
  "sélectionnez",
  "entrez",
  "saisissez",
  "remplissez",
  "renseignez",
  "utilisez",
  "vérifiez",
  "confirmez",
  "validez",
  "enregistrez",
  "supprimez",
  "ajoutez",
  "créez",
  "modifiez",
  "passez",
  "revenez",
  "consultez",
  "attendez",
  "patientez",
  "rechargez",
  "actualisez",
  "connectez",
  "déconnectez",
  "inscrivez",
  "notez",
  "indiquez",
  "précisez",
  "commencez",
  "démarrez",
  "terminez",
  "arrêtez",
  "continuez",
  "recommencez",
  "annulez",
  "fermez",
  "ouvrez",
  "envoyez",
  "partagez",
  "invitez",
  "rejoignez",
  "quittez",
  "veuillez",
];

const IMPERATIVE = wholeWords(IMPERATIVES);

/**
 * Strips comments, so that the English prose explaining the rule — including the sentences in this very
 * file — is not read as a breach of it. Three shapes to remove: `//` to end of line, `/* ... *\/`
 * possibly spanning lines, and therefore the ` * ` continuation of every JSDoc block, which needs no
 * case of its own once the block state is tracked.
 *
 * Quotes are tracked within the line so that a `//` inside a string is not mistaken for a comment. The
 * tracking is per line and does not follow a template literal across a newline; the failure mode of
 * that is a comment marker inside a multi-line French template, which would hide a breach rather than
 * invent one. Preferring the hidden breach to the invented one is the same trade as everything above.
 *
 * The one state that must not survive a file is the block one: a source that ends with `/*` still open
 * has every remaining line stripped, and the scan then reports nothing about a whole screen. The
 * optional `state` is how the suite checks that no file in the tree does that — an out-parameter rather
 * than a changed return type, so that every existing caller reads exactly as before.
 */
function withoutComments(source: string, state?: { openAtEof: boolean }): string[] {
  const out: string[] = [];
  let inBlock = false;

  for (const line of source.split("\n")) {
    let kept = "";
    let quote: string | null = null;
    let i = 0;

    while (i < line.length) {
      const two = line.slice(i, i + 2);

      if (inBlock) {
        if (two === "*/") {
          inBlock = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      if (quote) {
        if (line[i] === "\\") {
          kept += line.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (line[i] === quote) quote = null;
        kept += line[i];
        i += 1;
        continue;
      }

      if (two === "//") break;
      if (two === "/*") {
        inBlock = true;
        i += 2;
        continue;
      }
      if (line[i] === '"' || line[i] === "'" || line[i] === "`") quote = line[i];
      kept += line[i];
      i += 1;
    }

    out.push(kept);
  }

  if (state) state.openAtEof = inBlock;

  return out;
}

/** Every line of one file's text that breaks `rule`, as `line number` (1-based) and the line itself. */
function breaches(source: string, rule: RegExp): { line: number; text: string }[] {
  return withoutComments(source).flatMap((line, index) => {
    const searchable = line.replace(ALLOWED_PRONOUN_SPELLINGS, "");
    return rule.test(searchable) ? [{ line: index + 1, text: line.trim() }] : [];
  });
}

/* -------------------------------------------------------------------------- */
/* What is in scope                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `app/`, `components/` and `lib/` are the shipped copy, and the first two are the hole this file
 * exists for.
 *
 * `db/` is in, for `db/seed.ts`: the demo season is data a human reads on a screen — training themes,
 * match notes, team names — and `npm run db:reset` then walking the season is, per `CLAUDE.md`, the
 * cheapest review tool in the repo. A « Confirmez votre présence » typed into a seeded notification
 * would be read by exactly the person this rule protects. `db/migrations/` is excluded: it is
 * generated, committed and never rewritten, so a finding there would be one nobody is allowed to fix.
 *
 * `e2e/` is **out**, and that is an argument rather than an oversight. Its French is selector text that
 * mirrors the UI's, so it carries no copy of its own: if the UI is clean, a « vous » in a selector
 * matches nothing and the Playwright run already fails on it; if the UI is dirty, the screen is flagged
 * here and the selector flag would be the same finding twice. And a spec is free to assert the
 * *absence* of the word, as several unit tests under `lib/` do, which a scan cannot tell from its
 * presence.
 * Scanning it would therefore buy a duplicate alarm at the price of a false one.
 */
const ROOTS = ["app", "components", "lib", "db"];

const SKIP_DIRECTORIES = new Set(["node_modules", ".next", ".git", "db/migrations"]);

/**
 * Test files are out, all of them rather than a list of the ones that trip today. Five already contain
 * the word legitimately while asserting its absence — the four named at the top plus
 * `lib/team/membership.test.ts`, which a hand-written exclusion list had already missed once. A test is
 * not copy: whatever it asserts about lives in the module next to it, and that module is scanned.
 *
 * An entry of `SKIP_DIRECTORIES` is matched against the name *and* against the path from the repository
 * root, so that it can name one place — `db/migrations` is the directory meant, and a bare `migrations`
 * would have skipped any directory anywhere that happened to be called that.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SKIP_DIRECTORIES.has(entry) || SKIP_DIRECTORIES.has(relative(process.cwd(), path))) continue;
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) {
      out.push(path);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The scan                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **Empty, and it held entries for less than a day.** An entry excuses one known breach, keyed on its
 * file and the exact text of the line that carries it — a sentence somebody has to rewrite, never a
 * sentence this check got wrong.
 *
 * The imperative rule landed on a tree that broke it in ten places across four files. Eight were
 * corrected in the same change as this file, which is the right way to land a guard. The other two were
 * « Cet écran n’a pas pu s’afficher. Réessayez ; si cela se reproduit, passez par un autre écran et
 * revenez. » on `components/errors/error-screen.tsx` — the breach this whole file was written in
 * response to, wrapped over two lines and so two entries — in a file another session owned and had
 * already rewritten on open pull request #118, where correcting it here would have been a conflict for
 * nothing. The alternative was to hold the whole guard until that merged, that is, to have no guard
 * during exactly the days when sentences are being rewritten, which is when it earns its keep.
 *
 * **#118 merged first** (decision 127), so the two entries went rather than outliving what they
 * excused, and the cap below went to zero. The usual objection to a baseline is that nobody remembers
 * to shrink it; this one could not be forgotten. « Every known breach is still there » is asserted
 * below, so the moment one of those sentences was rewritten the suite went red naming the entry to
 * delete — which is precisely how these two left. The baseline shrinks under pressure or not at all,
 * and a new entry now costs raising a number a reviewer can see.
 *
 * Keyed on the text and never on a line number, on purpose: an edit anywhere above a breach moves its
 * number, and an entry that then excuses a line nobody chose is worse than a wrong failure, because it
 * is a silence.
 */
const KNOWN_IMPERATIVE_BREACHES: { file: string; text: string }[] = [];

function scan(files: string[], rule: RegExp): { file: string; text: string; at: string }[] {
  return files.flatMap((path) => {
    const file = relative(process.cwd(), path);
    return breaches(readFileSync(path, "utf8"), rule).map(({ line, text }) => ({
      file,
      text,
      at: `${file}:${line}: ${text}`,
    }));
  });
}

describe("the tutoiement, over the whole tree (decision 074)", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root)));

  it("never says « vous », « votre » or « vos » in user-facing copy", () => {
    // Every breach at once, with file, line and the line itself, so the fix needs no hunting. An
    // empty array is the assertion because Vitest prints the whole of the other side of the diff.
    expect(scan(files, PRONOUNS).map((breach) => breach.at)).toEqual([]);
  });

  it("never gives an order in the « vous » imperative — say « Réessaie », not « Réessayez »", () => {
    const known = (breach: { file: string; text: string }) =>
      KNOWN_IMPERATIVE_BREACHES.some(
        (entry) => entry.file === breach.file && entry.text === breach.text,
      );

    expect(
      scan(files, IMPERATIVE)
        .filter((breach) => !known(breach))
        .map((breach) => breach.at),
    ).toEqual([]);
  });

  /**
   * The baseline cannot outlive what it excuses. A fixed sentence makes its entry unmatched, and this
   * fails naming it — which is the only reason it is safe to have written a baseline at all.
   */
  it("has no stale entry left in the known-breach baseline", () => {
    const found = scan(files, IMPERATIVE);
    const stale = KNOWN_IMPERATIVE_BREACHES.filter(
      (entry) => !found.some((breach) => breach.file === entry.file && breach.text === entry.text),
    ).map((entry) => `${entry.file}: ${entry.text}`);

    // If you are reading this in a failure: the sentence was rewritten, which is the good news.
    // Delete the entry it names from KNOWN_IMPERATIVE_BREACHES.
    expect(stale).toEqual([]);
  });

  /**
   * The baseline is capped, because it is an allow-list and an allow-list with no ceiling silences the
   * guard by the same edit that would appease it: append a line and the new breach is excused. The
   * array is a record of what was already in the tree the day the rule landed, not a place to put new
   * work — and a reviewer reading a diff on that array cannot tell an added line from a deleted one
   * without a number here that has to be raised deliberately, in writing, to let one in. It is zero
   * now, which is the only number that needs no argument.
   */
  it("cannot grow its known-breach baseline", () => {
    expect(KNOWN_IMPERATIVE_BREACHES.length).toBeLessThanOrEqual(0);
  });

  /** Proof the scan reads the tree, so a bad path or an empty glob cannot make it vacuously green. */
  it("reads every shipped directory", () => {
    // Counted per root, not in total, because the total has slack and a skipped subtree fits in it: on
    // **2026-10-01** the scan saw 87 files under `app/`, 46 under `components/`, 90 under `lib/` and 9
    // under `db/`, 232 in all, so one string added to SKIP_DIRECTORIES — `"(jeu)"`, the whole of game
    // mode, or `"[id]"`, 32 files — stayed inside a floor of 200 with every test still green. The floors
    // sit just under each count instead of on it, so that neither adding a file nor deleting one is a
    // failure and hiding a directory is. A skip cannot be smuggled past this.
    //
    // `db/` is the one root with no room: nine files, and `db/migrations/` is skipped, so the floor is 5
    // rather than one short of nine. A floor of 8 would have made deleting two files from `db/` a
    // failure reporting that a directory was hidden, which is a lie about a legitimate edit — and the
    // per-root floors, not the slack-carrying total, are what actually catch a skipped subtree.
    expect(files.length).toBeGreaterThanOrEqual(225);
    const perRoot = new Map(
      ROOTS.map((root) => [root, sourceFiles(join(process.cwd(), root)).length]),
    );
    expect(perRoot.get("app")).toBeGreaterThanOrEqual(80);
    expect(perRoot.get("components")).toBeGreaterThanOrEqual(42);
    expect(perRoot.get("lib")).toBeGreaterThanOrEqual(84);
    expect(perRoot.get("db")).toBeGreaterThanOrEqual(5);
    for (const root of ROOTS) {
      expect(files.some((path) => path.includes(`${root}/`))).toBe(true);
    }
    expect(files.some((path) => path.endsWith("components/errors/error-screen.tsx"))).toBe(true);
    expect(files.every((path) => !path.includes(".test."))).toBe(true);
  });

  /**
   * The other way to be vacuously green, and the quiet one: a file whose last `/*` is never closed has
   * every line after it stripped, so the scan reads a screen's worth of copy as comment and reports
   * nothing. No file in the tree does that today, which makes this a latent hole rather than a live one —
   * and the cheapest moment to close a latent hole is before it swallows the sentence somebody is looking
   * for.
   */
  it("leaves no file with a block comment still open at its end", () => {
    const open = files.filter((path) => {
      const state = { openAtEof: false };
      withoutComments(readFileSync(path, "utf8"), state);
      return state.openAtEof;
    });

    expect(open.map((path) => relative(process.cwd(), path))).toEqual([]);

    // And the state is really reported, so the empty array above means what it says.
    const unterminated = { openAtEof: false };
    withoutComments('const a = 1;\n/* "Appuyez ici"\n', unterminated);
    expect(unterminated.openAtEof).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* The detector's own tests                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The scan above is green when the tree is clean *and* when the detector is broken, and those two look
 * identical from the outside. These pin the detector itself, including the shape the module tests could
 * not reach.
 */
describe("the detector — the pronouns", () => {
  it("catches a pronoun in JSX text, which is in no string literal at all", () => {
    expect(
      breaches("<p>Réessayez, ou revenez plus tard avec votre téléphone.</p>", PRONOUNS),
    ).toEqual([{ line: 1, text: "<p>Réessayez, ou revenez plus tard avec votre téléphone.</p>" }]);
  });

  it("catches one in a string literal, a template literal and an attribute", () => {
    expect(breaches('const a = "Vos réponses sont enregistrées";', PRONOUNS)).toHaveLength(1);
    expect(breaches("const b = `Il reste ${n} jours pour votre réponse`;", PRONOUNS)).toHaveLength(
      1,
    );
    expect(breaches('<button aria-label="Confirmez vos choix" />', PRONOUNS)).toHaveLength(1);
  });

  it("reports every line, not only the first", () => {
    expect(
      breaches('"votre équipe"\nconst ok = 1;\n"vos joueurs"', PRONOUNS).map((b) => b.line),
    ).toEqual([1, 3]);
  });

  it("ignores English comments, in all three shapes", () => {
    expect(breaches("// never say votre here", PRONOUNS)).toEqual([]);
    expect(breaches("const n = 1; /* votre */", PRONOUNS)).toEqual([]);
    expect(
      breaches("/**\n * The screen said « votre » for a year.\n * And « vous ».\n */", PRONOUNS),
    ).toEqual([]);
    expect(breaches("/*\nvos\nvotre\n*/\nconst clean = 1;", PRONOUNS)).toEqual([]);
  });

  it("does not mistake a comment marker inside a string for a comment", () => {
    expect(breaches('const url = "https://exemple.fr"; // fine', PRONOUNS)).toEqual([]);
    expect(breaches('const s = "a // b, votre tour";', PRONOUNS)).toHaveLength(1);
  });

  it("matches whole words only, so English identifiers cannot trip it", () => {
    expect(breaches("const vousLike = voserie + nous_vos_x;", PRONOUNS)).toEqual([]);
    expect(breaches("const previous = 1; const positions = [];", PRONOUNS)).toEqual([]);
  });

  it("allows « rendez-vous », the noun, and nothing else spelled with it", () => {
    expect(breaches('"Le rendez-vous est à 14 h, le rendez-vous suivant aussi"', PRONOUNS)).toEqual(
      [],
    );
    expect(breaches('"Asseyez-vous et attendez le rendez-vous"', PRONOUNS)).toHaveLength(1);
  });

  it("is case-insensitive, because a sentence starts with a capital", () => {
    expect(breaches('"Votre réponse"', PRONOUNS)).toHaveLength(1);
    expect(breaches('"VOUS"', PRONOUNS)).toHaveLength(1);
  });
});

describe("the detector — the imperatives", () => {
  it("catches an order in JSX text, the shape with no pronoun to give it away", () => {
    // Word for word the sentence that was in `error-screen.tsx` for a month: no « vous » anywhere,
    // which is why the pronoun rule alone left it standing.
    expect(
      breaches("<p>Cet écran n’a pas pu s’afficher. Réessayez ; passez par un autre.</p>", PRONOUNS),
    ).toEqual([]);
    expect(
      breaches(
        "<p>Cet écran n’a pas pu s’afficher. Réessayez ; passez par un autre.</p>",
        IMPERATIVE,
      ),
    ).toEqual([
      { line: 1, text: "<p>Cet écran n’a pas pu s’afficher. Réessayez ; passez par un autre.</p>" },
    ]);
  });

  it("catches one in a string, a template literal and an attribute", () => {
    expect(breaches('const a = "Appuyez sur un poste pour le placer.";', IMPERATIVE)).toHaveLength(
      1,
    );
    expect(breaches("const b = `Choisissez ${n} joueurs`;", IMPERATIVE)).toHaveLength(1);
    expect(breaches('<button aria-label="Validez la composition" />', IMPERATIVE)).toHaveLength(1);
  });

  it("leaves the « tu » imperative alone, which is the whole point of the rule", () => {
    expect(breaches('"Réessaie, ou reviens plus tard."', IMPERATIVE)).toEqual([]);
    expect(breaches("<p>Appuie sur un poste pour le placer.</p>", IMPERATIVE)).toEqual([]);
    const choisis = '"Choisis tes titulaires, tes remplaçants et tes supporters"';
    expect(breaches(choisis, IMPERATIVE)).toEqual([]);
    expect(breaches('"Place tes sept joueurs sur la pelouse"', IMPERATIVE)).toEqual([]);
    expect(breaches('"Note tes coéquipiers pour voir les notes"', IMPERATIVE)).toEqual([]);
  });

  it("is case-insensitive, because an order starts a sentence", () => {
    expect(breaches('"appuyez ici"', IMPERATIVE)).toHaveLength(1);
    expect(breaches('"APPUYEZ ICI"', IMPERATIVE)).toHaveLength(1);
  });

  it("matches whole words only, so no identifier and no longer word can trip it", () => {
    expect(breaches("const appuyezTruc = 1; const onAppuyez = 2;", IMPERATIVE)).toEqual([]);
    // « Défaites » is the label over the losses on `/stats`, and it is the real false positive that
    // ASCII `\b` produced: « Dé » is two non-word characters to it, so it saw « faites » standing
    // alone. Any accented prefix does the same, which is why `wholeWords` exists.
    expect(breaches('<Figure label="Défaites" value={team.losses} />', IMPERATIVE)).toEqual([]);
    expect(breaches('"un contre-attaquant, le nez du ballon, déplacement"', IMPERATIVE)).toEqual([]);
    expect(breaches('"Note", "notes", "Aucune note à afficher", "4 notes"', IMPERATIVE)).toEqual([]);
  });

  it("ignores English comments here too, including the quoted French in this file's own header", () => {
    expect(breaches("// « Réessayez » is the breach this rule exists for", IMPERATIVE)).toEqual([]);
    expect(
      breaches("/**\n * It said « Appuyez sur un poste », and nothing failed.\n */", IMPERATIVE),
    ).toEqual([]);
  });

  it("catches « veuillez », the politeness form that carries no pronoun either", () => {
    expect(breaches('"Veuillez patienter pendant le chargement."', IMPERATIVE)).toHaveLength(1);
    expect(breaches("<p>Veuillez réessayer plus tard.</p>", IMPERATIVE)).toHaveLength(1);
    // The copy that replaces it names the action instead, and the rule has nothing to say about that.
    expect(breaches('"Patiente pendant le chargement."', IMPERATIVE)).toEqual([]);
  });

  it("does not flag « allez », which this team's app says as an interjection", () => {
    expect(breaches('"Allez, encore un effort : il reste dix minutes."', IMPERATIVE)).toEqual([]);
  });

  it("keeps a list long enough to be worth having", () => {
    // Vacuity guard, as above: an empty or gutted list makes every scan green. The count is a floor,
    // not the length — adding a verb is the expected edit and must not fail this.
    expect(IMPERATIVES.length).toBeGreaterThanOrEqual(45);
    expect(new Set(IMPERATIVES).size).toBe(IMPERATIVES.length);
    for (const verb of ["réessayez", "appuyez", "passez", "touchez", "faites"]) {
      expect(breaches(`"${verb} quelque chose"`, IMPERATIVE)).toHaveLength(1);
    }
  });
});
