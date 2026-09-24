/**
 * A throwaway probe for the one screen both audit passes missed: the **composition editor** in its
 * editable state — the tap-a-post-then-tap-a-player pitch editor.
 *
 * Same iPhone 16 geometry and the same DOM probes as `scripts/probe-iphone16.mjs`, but this one
 * drives a single screen through its states instead of walking the tabs:
 *
 *   - the editor at the opening scroll position, at a few offsets, and at maximum scroll;
 *   - after tapping a free post, and after tapping a bench player;
 *   - the goalkeeper post's rect against the sticky dock's and the tab bar's, which is the open
 *     question: the pitch has a fixed 1080:1580 aspect ratio, so its bottom edge may land under
 *     the dock at the opening scroll position.
 *
 * READ-ONLY against production. It never clicks anything matching
 * /Enregistrer|Supprimer|Valider|Confirmer|Créer|Démarrer|Terminer|Se déconnecter/ and never
 * submits a form. Posts and bench discs are tapped because that only changes React state in the
 * browser; nothing is written until a submit that never happens.
 *
 * Plain `.mjs` for the same reason as its sibling: `tsx`'s esbuild `keepNames` rewrites named
 * functions into calls to an injected `__name` helper, and a function serialised into the page
 * leaves that helper behind, so every `page.evaluate` throws `__name is not defined`.
 *
 *   PROBE_BASE_URL=… PROBE_USER=karim PROBE_PASSWORD=… node scripts/probe-composition.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";

import { chromium, devices } from "@playwright/test";

const BASE = process.env.PROBE_BASE_URL ?? "https://7orteils.bgonzva.fr";
const USER = process.env.PROBE_USER ?? "karim";
const PASSWORD = process.env.PROBE_PASSWORD ?? "motdepasse";
const OUT = process.env.PROBE_OUT ?? "probe-composition";

/** iPhone 16: 393 × 852 CSS px at 3×, touch, and iOS Safari's user agent. */
const IPHONE_16 = {
  ...devices["iPhone 15 Pro"],
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/** Apple Human Interface Guidelines: 44 × 44 pt, and it is not advice. */
const MIN_TAP = 44;

/** Nothing in here is ever clicked: it writes. */
const WRITES = /Enregistrer|Supprimer|Valider|Confirmer|Créer|Démarrer|Terminer|Se déconnecter/i;

function measure(page, screen) {
  return page.evaluate(
    ({ screen, MIN_TAP }) => {
      const findings = [];
      const vw = window.innerWidth;

      function describe(el) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        const label = el.getAttribute("aria-label") ?? "";
        return "<" + el.tagName.toLowerCase() + "> " + (text || label || "(sans texte)");
      }

      const interactive = document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="radio"]',
      );
      const small = new Set();
      for (const el of interactive) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (r.height < MIN_TAP || r.width < MIN_TAP) {
          const key = Math.round(r.width) + "×" + Math.round(r.height) + " " + describe(el);
          if (!small.has(key)) {
            small.add(key);
            findings.push({ screen, kind: "tap-target", detail: key });
          }
        }
      }

      if (document.documentElement.scrollWidth > vw + 1) {
        findings.push({
          screen,
          kind: "h-overflow",
          detail: "document scrollWidth " + document.documentElement.scrollWidth + " > " + vw,
        });
      }
      const outside = new Set();
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= vw + 1 && r.left >= -1) continue;

        let p = el.parentElement;
        let scroller = false;
        while (p) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") {
            scroller = true;
            break;
          }
          p = p.parentElement;
        }
        if (scroller) continue;

        const key =
          "left " + Math.round(r.left) + " right " + Math.round(r.right) + " " + describe(el);
        if (!outside.has(key)) {
          outside.add(key);
          findings.push({ screen, kind: "outside-viewport", detail: key });
        }
      }

      const tiny = new Set();
      for (const el of document.querySelectorAll("p, span, li, td, th, label, div, a, button")) {
        if (!el.firstChild || el.firstChild.nodeType !== Node.TEXT_NODE) continue;
        const text = (el.textContent ?? "").trim();
        if (text.length < 3) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size > 0 && size < 12) {
          const key = size + 'px "' + text.slice(0, 40) + '"';
          if (!tiny.has(key)) {
            tiny.add(key);
            findings.push({ screen, kind: "tiny-text", detail: key });
          }
        }
      }

      return findings;
    },
    { screen, MIN_TAP },
  );
}

/** What a fixed or sticky bar covers — which is where a confirm button goes to hide. */
function coveredByBar(page, screen) {
  return page.evaluate(
    ({ screen }) => {
      const findings = [];
      const bars = [];
      for (const el of document.querySelectorAll("body *")) {
        const position = getComputedStyle(el).position;
        if (position !== "fixed" && position !== "sticky") continue;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) bars.push({ el, r });
      }

      const seen = new Set();
      for (const el of document.querySelectorAll('a[href], button, [role="tab"], input, select')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top > window.innerHeight || r.bottom < 0) continue;

        for (const bar of bars) {
          if (bar.el === el || bar.el.contains(el)) continue;
          const f = bar.r;
          const overlaps =
            r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top;
          if (!overlaps) continue;

          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
          const key =
            (text || el.tagName) +
            " at " +
            Math.round(r.top) +
            "–" +
            Math.round(r.bottom) +
            " under a bar at " +
            Math.round(f.top) +
            "–" +
            Math.round(f.bottom);
          if (!seen.has(key)) {
            seen.add(key);
            findings.push({ screen, kind: "under-fixed-bar", detail: key });
          }
          break;
        }
      }
      return findings;
    },
    { screen },
  );
}

/**
 * The geometry the open question is about: the pitch box, every post on it (the keeper first), the
 * bars that could cover them, and where the page can scroll to.
 */
function geometry(page, state) {
  return page.evaluate(
    ({ state }) => {
      function rect(el) {
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      }

      const posts = [];
      for (const el of document.querySelectorAll("button[aria-label]")) {
        const label = el.getAttribute("aria-label") ?? "";
        if (!/gardien|défenseur|milieu|attaquant|latéral|libre|poste/i.test(label)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        posts.push({ label, rect: rect(el) });
      }

      const bars = [];
      for (const el of document.querySelectorAll("body *")) {
        const position = getComputedStyle(el).position;
        if (position !== "fixed" && position !== "sticky") continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) continue;
        bars.push({
          position,
          tag: el.tagName.toLowerCase(),
          className: (el.className ?? "").toString().slice(0, 80),
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
          rect: rect(el),
        });
      }

      // The pitch is the biggest `svg` on the page — `main svg` alone picks up a header icon.
      let biggest = null;
      for (const candidate of document.querySelectorAll("svg")) {
        const r = candidate.getBoundingClientRect();
        const area = r.width * r.height;
        if (!biggest || area > biggest.area) biggest = { el: candidate, area };
      }
      const svg = biggest?.el ?? null;
      const pitch = svg ? rect(svg.parentElement ?? svg) : null;

      const bench = document.querySelector("ul[aria-label^='Banc']");

      return {
        state,
        scrollY: Math.round(window.scrollY),
        maxScrollY: Math.round(document.documentElement.scrollHeight - window.innerHeight),
        innerHeight: window.innerHeight,
        pitchBox: pitch,
        pitchSvg: svg ? rect(svg) : null,
        posts,
        bars,
        bench: bench ? rect(bench) : null,
      };
    },
    { state },
  );
}

async function shoot(page, name) {
  await page.screenshot({ path: OUT + "/" + name + ".png" });
}

/**
 * What is on top of every post's centre, and of the confirm row's — the honest version of the
 * question « can a thumb reach this? ». `elementFromPoint` is viewport-relative, so this is asked at
 * whatever scroll position the page is at.
 */
function whatIsOnTop(page, state) {
  return page.evaluate(
    ({ state }) => {
      const out = [];
      for (const el of document.querySelectorAll(
        "main button[aria-label], ul[aria-label^='Banc'] button",
      )) {
        const label = el.getAttribute("aria-label") ?? "";
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const inView = cy >= 0 && cy <= window.innerHeight;
        const top = inView ? document.elementFromPoint(cx, cy) : null;
        const reachable = top ? el === top || el.contains(top) : false;
        out.push({
          state,
          label: label.slice(0, 48),
          rect: {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            left: Math.round(r.left),
            right: Math.round(r.right),
          },
          inView,
          reachable,
          blockedBy:
            reachable || !top
              ? null
              : top.tagName.toLowerCase() + "." + (top.className ?? "").toString().slice(0, 60),
        });
      }
      return out;
    },
    { state },
  );
}

/**
 * Scroll so an element's centre sits in the clear band between the sticky app header and the sticky
 * dock, then tap it. Returns what happened, rather than throwing: « this control cannot be reached at
 * any scroll position » is the finding, not a crash.
 */
async function tapInClear(page, locator, label) {
  if ((await locator.count()) === 0) return { label, ok: false, why: "not found" };
  const plan = await locator.evaluate((el) => {
    const bars = [];
    for (const node of document.querySelectorAll("body *")) {
      const position = getComputedStyle(node).position;
      if (position !== "fixed" && position !== "sticky") continue;
      const r = node.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      if (node.contains(el)) continue;
      bars.push({ top: r.top, bottom: r.bottom });
    }
    const vh = window.innerHeight;
    // The clear band: below every bar anchored at the top, above every bar anchored at the bottom.
    let bandTop = 0;
    let bandBottom = vh;
    for (const b of bars) {
      if (b.top <= 1) bandTop = Math.max(bandTop, b.bottom);
      if (b.bottom >= vh - 1) bandBottom = Math.min(bandBottom, b.top);
      else if (b.top > vh / 2) bandBottom = Math.min(bandBottom, b.top);
    }
    const r = el.getBoundingClientRect();
    const absCenter = window.scrollY + r.top + r.height / 2;
    const max = document.documentElement.scrollHeight - vh;
    const wanted = absCenter - (bandTop + bandBottom) / 2;
    return {
      bandTop: Math.round(bandTop),
      bandBottom: Math.round(bandBottom),
      bandHeight: Math.round(bandBottom - bandTop),
      absCenter: Math.round(absCenter),
      maxScroll: Math.round(max),
      target: Math.round(Math.min(max, Math.max(0, wanted))),
      elHeight: Math.round(r.height),
    };
  });
  await page.evaluate((y) => window.scrollTo(0, y), plan.target);
  await page.waitForTimeout(350);
  try {
    await locator.tap({ timeout: 4000 });
    return { label, ok: true, plan };
  } catch (error) {
    return {
      label,
      ok: false,
      why: String(error).split("\n")[0].slice(0, 200),
      plan,
    };
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext(IPHONE_16);
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(page.url() + " :: " + m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(page.url() + " :: pageerror " + e.message));

  const findings = [];
  const geo = [];
  const notes = [];

  await page.goto(BASE + "/connexion", { waitUntil: "networkidle" });
  await page.getByLabel(/utilisateur/i).fill(USER);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("connexion"), {
    timeout: 30_000,
  });

  /* --- 1. find a match whose compositions are still editable --------------- */

  await page.goto(BASE + "/calendrier", { waitUntil: "networkidle" });
  await shoot(page, "00-calendrier");
  const matchHrefs = await page
    .locator("main a[href]")
    .evaluateAll((els) => [
      ...new Set(
        els.map((el) => el.getAttribute("href")).filter((h) => h && /^\/match\/[^/]+$/.test(h)),
      ),
    ]);
  notes.push("matches linked from /calendrier: " + JSON.stringify(matchHrefs));

  let editorUrl = null;
  const tried = [];
  for (const href of matchHrefs) {
    const list = BASE + href + "/composition";
    await page.goto(list, { waitUntil: "networkidle" });
    const heading = (
      await page
        .locator("main h1")
        .first()
        .innerText()
        .catch(() => "")
    ).trim();
    // « Le match est joué » / a frozen list means nothing here is editable.
    const body = (
      await page
        .locator("main")
        .innerText()
        .catch(() => "")
    ).replace(/\s+/g, " ");
    const links = await page
      .locator("main a[href]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")).filter(Boolean));
    const editable = links.filter((h) => /\/composition\/(nouvelle|[0-9a-f-]{8,})/.test(h));
    tried.push({
      list,
      heading,
      editable,
      frozen: /joué|ne se modifie plus|verrouill/i.test(body),
    });
    if (editable.length > 0) {
      // Prefer editing an existing one, then the create route.
      const existing = editable.find((h) => !h.includes("nouvelle"));
      editorUrl = BASE + (existing ?? editable[0]);
      await shoot(page, "01-composition-list");
      break;
    }
  }
  notes.push("composition lists tried: " + JSON.stringify(tried, null, 1));

  if (!editorUrl) {
    notes.push("FATAL: no editable composition reachable without writing.");
    await writeFile(OUT + "/report.json", JSON.stringify({ notes, consoleErrors }, null, 2));
    console.log(notes.join("\n"));
    await browser.close();
    return;
  }
  notes.push("editor: " + editorUrl);

  /* --- 2. the editor, at the opening scroll position ----------------------- */

  await page.goto(editorUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Guard: if this is a dead end rather than the editor, say so and stop.
  const hasPitch = (await page.locator("main svg").count()) > 0;
  const hasSubmit =
    (await page.getByRole("button", { name: /Enregistrer|Créer la composition/ }).count()) > 0;
  notes.push("pitch present: " + hasPitch + ", submit present: " + hasSubmit);
  if (!hasPitch) {
    notes.push("FATAL: reached " + editorUrl + " but it renders no pitch — a dead-end state.");
    await shoot(page, "02-dead-end");
    await writeFile(OUT + "/report.json", JSON.stringify({ notes, consoleErrors }, null, 2));
    console.log(notes.join("\n"));
    await browser.close();
    return;
  }

  const reach = [];

  async function state(name, label) {
    await page.waitForTimeout(350);
    await shoot(page, name);
    geo.push(await geometry(page, label));
    findings.push(...(await measure(page, label)));
    findings.push(...(await coveredByBar(page, label)));
    reach.push(...(await whatIsOnTop(page, label)));
  }

  await state("02-editor-open", "editor (opening scroll, y=0)");

  // A few offsets, then maximum scroll — only the last one's coverage is a real defect.
  for (const y of [200, 400, 600]) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(300);
    await shoot(page, "03-editor-scroll-" + y);
    geo.push(await geometry(page, "editor (scrollY " + y + ")"));
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await shoot(page, "04-editor-max-scroll");
  geo.push(await geometry(page, "editor (max scroll)"));
  findings.push(...(await coveredByBar(page, "editor (max scroll)")));
  findings.push(...(await measure(page, "editor (max scroll)")));

  /* --- 3. tap a post, then tap a player ----------------------------------- */

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // The goalkeeper's post specifically: it is the one the open question is about, and it only moves
  // React state in the browser.
  const keeperLabels = await page
    .locator("main button[aria-label]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")).filter(Boolean));
  notes.push("post labels: " + JSON.stringify(keeperLabels));
  const keeperLabel = keeperLabels.find((l) => /gardien/i.test(l));
  const taps = [];
  if (keeperLabel) {
    const keeper = page.locator('main button[aria-label="' + keeperLabel + '"]').first();
    taps.push(await tapInClear(page, keeper, "keeper post « " + keeperLabel + " »"));
    await state("05-after-tap-post", "after tapping the keeper post");
  } else {
    notes.push("no goalkeeper post label found.");
  }

  // Then a bench player, which is the other half of the gesture.
  const benchDisc = page.locator("ul[aria-label^='Banc'] button").nth(1);
  let tappedPlayer = null;
  if ((await benchDisc.count()) > 0) {
    tappedPlayer = (await benchDisc.getAttribute("aria-label")) ?? "bench disc";
    taps.push(await tapInClear(page, benchDisc, "bench disc « " + tappedPlayer + " »"));
    await state("06-after-tap-bench", "after tapping a bench player");
  } else {
    notes.push("bench strip empty — no bench player to tap.");
  }

  // And a post again, which is what actually places him (still nothing written).
  if (tappedPlayer) {
    const free2 = page.locator("button[aria-label^='Poste libre']").first();
    const target =
      (await free2.count()) > 0
        ? free2
        : keeperLabel
          ? page
              .locator(
                'main button[aria-label*="' +
                  (keeperLabel.split(",")[1] ?? "gardien").trim() +
                  '"]',
              )
              .first()
          : null;
    if (target) {
      taps.push(await tapInClear(page, target, "post to place the selected player on"));
      await state("07-after-place", "after placing the player on a post");
    }
  }

  /* --- 4. the « Postes » mode, where the arrow keys move a slot ------------ */

  // The visible control is the `<label>`: `SegmentedControl`'s `role="radio"` input is a 1 × 1
  // sr-only box, so `getByRole("radio")` times out on a hit-target check that is not a defect.
  const postesTab = page
    .locator("label")
    .filter({ hasText: /^Postes$/ })
    .first();
  if ((await postesTab.count()) > 0) {
    taps.push(await tapInClear(page, postesTab, "« Postes » segment (its label)"));
    await state("08-postes-mode", "« Postes » mode");
    // The keyboard path: arrow keys nudge the focused slot around the pitch.
    const keeper = page.locator("main button[aria-label*='gardien']").first();
    if ((await keeper.count()) > 0) {
      await keeper.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowUp");
      await state("09-postes-after-nudge", "« Postes » mode, keeper slot nudged");
    }
  } else {
    notes.push("no « Postes » segment found.");
  }
  notes.push("taps: " + JSON.stringify(taps, null, 1));

  /* --- 4b. the *other* editable state: creating a composition -------------- */

  const create = tried.flatMap((t) => t.editable).find((h) => h.includes("nouvelle"));
  if (create) {
    await page.goto(BASE + create, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await shoot(page, "10-nouvelle-open");
    geo.push(await geometry(page, "nouvelle (opening scroll, y=0)"));
    findings.push(...(await measure(page, "nouvelle (opening scroll)")));
    findings.push(...(await coveredByBar(page, "nouvelle (opening scroll)")));
    reach.push(...(await whatIsOnTop(page, "nouvelle (opening scroll)")));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await shoot(page, "11-nouvelle-max-scroll");
    geo.push(await geometry(page, "nouvelle (max scroll)"));
    findings.push(...(await coveredByBar(page, "nouvelle (max scroll)")));
  } else {
    notes.push("no « nouvelle » route offered by the list.");
  }

  /* --- 5. the same thing in the dark theme -------------------------------- */

  await context.addInitScript(() => {
    try {
      localStorage.setItem("theme", "dark");
    } catch {}
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(editorUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const isDark = await page.evaluate(
    () =>
      document.documentElement.classList.contains("dark") ||
      getComputedStyle(document.body).backgroundColor,
  );
  notes.push("dark theme signal: " + JSON.stringify(isDark));
  await state("12-editor-dark", "editor (dark)");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await shoot(page, "13-editor-dark-max-scroll");
  geo.push(await geometry(page, "editor dark (max scroll)"));

  /* --- report ------------------------------------------------------------- */

  await writeFile(
    OUT + "/report.json",
    JSON.stringify(
      {
        base: BASE,
        user: USER,
        editorUrl,
        notes,
        consoleErrors,
        geo,
        reach,
        findings,
      },
      null,
      2,
    ),
  );

  console.log("\n" + editorUrl + " under iPhone 16 (393×852, 3×, touch)\n");
  for (const n of notes) console.log("  " + n);
  const byKind = new Map();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  console.log("");
  for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log("  " + String(n).padStart(3) + " × " + kind);
  }
  console.log("\n  " + consoleErrors.length + " console error(s)");
  console.log("\nDetail in " + OUT + "/report.json, screenshots beside it.");

  await browser.close();
}

await main();

// Kept honest: nothing above may ever click a control whose label writes.
void WRITES;
