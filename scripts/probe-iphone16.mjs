/**
 * A throwaway probe: the live app under iPhone 16 geometry, asking the questions a PNG cannot.
 *
 * `npm run audit:screens` already walks every screen at 390 px and fails on the mechanical defects
 * it can see from the DOM. This one is narrower, and about a *phone* rather than a viewport:
 *
 * - **Tap targets under 44 × 44 pt**, Apple's own minimum. A 24 px chip is not a defect in a
 *   screenshot and is a defect in a hand.
 * - **Horizontal overflow at 393 px** rather than 390 — three pixels is exactly the margin a
 *   `w-[390px]` assumption hides in.
 * - **What sits under a fixed or sticky bar**, which on a phone is where a confirm button dies.
 * - **How long a tap actually takes**, end to end, against the deployment the owner is holding.
 *
 * Plain `.mjs` on purpose: `tsx` compiles with esbuild's `keepNames`, which rewrites named
 * functions into calls to an injected `__name` helper — and a function serialised into the page
 * leaves that helper behind, so every `page.evaluate` throws `__name is not defined`. Untransformed
 * JavaScript has no such ancestry. Not part of any suite; it hits production and is meant to be
 * deleted.
 *
 *   PROBE_BASE_URL=… PROBE_USER=karim PROBE_PASSWORD=… node scripts/probe-iphone16.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";

import { chromium, devices } from "@playwright/test";

const BASE = process.env.PROBE_BASE_URL ?? "https://7orteils.bgonzva.fr";
const USER = process.env.PROBE_USER ?? "karim";
const PASSWORD = process.env.PROBE_PASSWORD ?? "motdepasse";
const OUT = process.env.PROBE_OUT ?? "probe-iphone16";

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

      // 1. Tap targets — only what is visible and actually interactive.
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

      // 2. The page scrolling sideways, and anything sticking out of it.
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

        // Ignore anything inside a container that scrolls horizontally on purpose.
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

      // 3. Text too small to read outdoors. 12 px is the floor this app's tokens imply.
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

  await page.goto(BASE + "/connexion", { waitUntil: "networkidle" });
  await page.getByLabel(/utilisateur/i).fill(USER);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);

  const findings = [];
  findings.push(...(await measure(page, "connexion")));
  await page.screenshot({ path: OUT + "/connexion.png" });

  const loginStart = Date.now();
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("connexion"), {
    timeout: 30_000,
  });
  const timings = ["connexion → " + (Date.now() - loginStart) + " ms"];

  // The four tabs (`components/nav/nav-items.tsx`), timed the way a thumb experiences them:
  // from the tap to the heading of the screen it asked for.
  //
  // `waitForLoadState("networkidle")` is not that wait and must not be used here. A client-side RSC
  // navigation often has an idle network *before* the new route commits, so it returns while the old
  // page is still on screen — the first run of this probe measured five screens one page behind
  // itself, and reported the squad list's rows as defects of `/stats`. The URL plus the new heading
  // are the only honest signal that the screen changed.
  const tabs = [
    { label: "Calendrier", path: "/calendrier" },
    { label: "Équipe", path: "/equipe" },
    { label: "Stats", path: "/stats" },
    { label: "Moi", path: "/moi" },
  ];
  for (const tab of tabs) {
    // `:visible` matters: the same four destinations exist twice in the DOM — the bottom tab bar and
    // the desktop sidebar — and at 393 px the sidebar one is the hidden one.
    const link = page.locator('nav a[href="' + tab.path + '"]:visible').first();
    if ((await link.count()) === 0) {
      findings.push({
        screen: "tabbar",
        kind: "missing-tab",
        detail: tab.label,
      });
      continue;
    }

    const started = Date.now();
    await link.click();
    await page.waitForURL((u) => u.pathname === tab.path, { timeout: 30_000 });
    const heading = page.locator("main h1").first();
    await heading.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(
      (path) =>
        location.pathname === path &&
        (document.querySelector("main h1")?.textContent ?? "").trim().length > 0,
      tab.path,
      { timeout: 30_000 },
    );
    timings.push(
      "tab " +
        tab.label +
        " → " +
        (Date.now() - started) +
        " ms to « " +
        (await heading.innerText()).replace(/\s+/g, " ").trim() +
        " »",
    );
    await page.waitForLoadState("networkidle");

    const name = tab.label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z]/g, "");
    await page.screenshot({ path: OUT + "/" + name + "-top.png" });
    findings.push(...(await measure(page, name)));
    findings.push(...(await coveredByBar(page, name)));

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + "/" + name + "-bottom.png" });
    findings.push(...(await coveredByBar(page, name + " (scrolled to the bottom)")));
  }

  // The deep screens no tab reaches, taken from whatever the calendar and the trainings list link
  // to. `/entrainements` is not a tab — it hangs off a button on the calendar — so it is walked here.
  const deep = new Set();
  for (const listing of ["/calendrier", "/entrainements"]) {
    await page.goto(BASE + listing, { waitUntil: "networkidle" });
    const found = await page
      .locator("main a[href]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")).filter(Boolean));
    for (const href of found) {
      if (/\/(match|entrainements|compositions)\/[^/]+$/.test(href)) deep.add(href);
    }
  }
  const hrefs = [...deep].slice(0, 8);
  for (const href of hrefs) {
    const started = Date.now();
    await page.goto(BASE + href, { waitUntil: "networkidle" });
    timings.push(href + " → " + (Date.now() - started) + " ms");
    const name = href
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    await page.screenshot({ path: OUT + "/" + name + ".png", fullPage: true });
    findings.push(...(await measure(page, href)));
    findings.push(...(await coveredByBar(page, href)));
  }

  await writeFile(
    OUT + "/report.json",
    JSON.stringify({ base: BASE, user: USER, timings, consoleErrors, findings }, null, 2),
  );

  const byKind = new Map();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);

  console.log("\n" + BASE + " as " + USER + ", iPhone 16 (393×852, 3×, touch)\n");
  for (const t of timings) console.log("  " + t);
  console.log("");
  for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log("  " + String(n).padStart(3) + " × " + kind);
  }
  console.log("\n  " + consoleErrors.length + " console error(s)");
  console.log("\nDetail in " + OUT + "/report.json, screenshots beside it.");

  await browser.close();
}

await main();
