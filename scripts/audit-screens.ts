/**
 * `npm run audit:screens` — walks every screen of the demo season at 390 px, in both themes, as a
 * coach and as a player, and asks the DOM the questions a screenshot cannot answer.
 *
 * ## Why this is a script and not a test
 *
 * `CLAUDE.md` calls this walk the cheapest review tool in the repo, and it is right: every defect
 * found in waves 3 and 4 was a screen stating something untrue, and **not one of them failed a
 * test**. « 0 – 0 » for a match nobody recorded, « 7 changements » for the starting seven, a confirm
 * button 8 px off the right edge. So the point of this file is not to replace a human looking at the
 * screenshots — it is to make the looking cheap, and to fail on the handful of defects that *are*
 * mechanical:
 *
 * - anything the console says, on any screen;
 * - a page that scrolls sideways, or a box clipped by the 390 px viewport that no scroll container
 *   owns (a real one of those was a « Valider » measured at `left: 382`);
 * - a framework string in **English**, in an app whose first rule is that the UI is French. Fifteen
 *   pages used to answer « This page could not be found. » and no test saw it (decision 058);
 * - a screen reachable by somebody it is not for, or answering 404 to somebody it is for;
 * - a page with no level-one heading. Two of them had none — game mode, and the composition editor
 *   in each of its four dead ends — and the second was a bare panel saying « Cette composition a été
 *   appliquée » about no match in particular.
 *
 * It is not part of `npm run test:e2e` on purpose. That suite owns a run-scoped fixture team and
 * never touches the demo season (decision 044), whereas this needs a *full* season to have anything
 * to look at: a played match, a match typed up afterwards, one still to come, ratings, trainings. Run
 * `npm run db:reset` first, walk the output, then look at the PNGs it points you at.
 *
 * ## Why the ids are discovered and not written down
 *
 * The first version of this script hardcoded the demo match ids. `npm run db:reset` regenerates them,
 * so the next run walked thirteen 404s and reported them as a clean sweep. Everything below is read
 * out of the database, and the script refuses to run rather than guess.
 */

import "../db/load-env";

import { chromium, type ConsoleMessage, type Page } from "@playwright/test";
import { sql } from "../db/client";

/** The seed's password for every demo account (`DEMO_PASSWORD` in `db/seed.ts`). */
const PASSWORD = process.env.AUDIT_PASSWORD ?? "motdepasse";
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const SHOTS = "audit";

/** iPhone-ish, and the width `CLAUDE.md` asks every screen to be looked at. */
const VIEWPORT = { width: 390, height: 844 };

/**
 * Strings that mean a framework has answered instead of the app. Each one was, or would be, a screen
 * speaking English to a French-speaking coach.
 */
const ENGLISH_LEAKS = [
  "This page could not be found",
  "Internal Server Error",
  "Application error",
  "Unhandled Runtime Error",
  "Server Components render",
];

/**
 * Console errors that are not defects, each with the reason it is not one. This list is short on
 * purpose: the value of the check is that it fails on *anything* the console says, and every entry
 * here is a hole in it. Nothing goes in without having been read and understood first.
 */
const BENIGN_CONSOLE = [
  // A screen that legitimately answers 404 makes the browser log its own document's status. The
  // French dead end being *correct* is the assertion above; the log line is the proof, not a bug.
  /Failed to load resource: the server responded with a status of 404/,
  // React telling us the root layout's `themeScript` was re-rendered on the client. It has already
  // run from the SSR'd HTML — running twice is what we are avoiding, so the warning is the design.
  /Encountered a script tag while rendering React component/,
];

type Audience = "everyone" | "coach";

type Target = {
  name: string;
  path: string;
  /** Who the screen is for. A `coach` screen must answer the French 404 to a player. */
  audience: Audience;
};

type Finding = { theme: string; who: string; target: string; problem: string };

/* -------------------------------------------------------------------------- */
/* What to walk                                                              */
/* -------------------------------------------------------------------------- */

async function one<T extends Record<string, unknown>>(
  what: string,
  rows: readonly T[],
): Promise<T> {
  const row = rows[0];
  if (!row) {
    throw new Error(
      `Rien à auditer : ${what} introuvable dans la base. Lance « npm run db:reset » d'abord.`,
    );
  }
  return row;
}

async function discover(): Promise<{ coach: string; player: string; targets: Target[] }> {
  // The team with the most active members: the demo season, and not a fixture team an interrupted
  // e2e run left lying around.
  const team = await one(
    "une équipe",
    await sql<{ id: string }[]>`
      select t.id, count(m.id) as members
      from teams t join team_members m on m.team_id = t.id and m.left_at is null
      group by t.id order by members desc limit 1`,
  );

  const coach = await one(
    "un coach",
    await sql<{ username: string }[]>`
      select u.username from team_members m join users u on u.id = m.user_id
      where m.team_id = ${team.id} and m.left_at is null and m.role = 'coach'
      order by m.is_player desc limit 1`,
  );
  const player = await one(
    "un joueur non-coach",
    await sql<{ username: string; membership: string }[]>`
      select u.username, m.id as membership from team_members m join users u on u.id = m.user_id
      where m.team_id = ${team.id} and m.left_at is null and m.role <> 'coach' and m.is_player
      order by u.username limit 1`,
  );

  const pick = async (what: string, where: string, order: "asc" | "desc" = "desc") =>
    one(
      what,
      await sql<{ id: string }[]>`
        select id from matches where team_id = ${team.id} and ${sql.unsafe(where)}
        order by kickoff_at ${sql.unsafe(order)} limit 1`,
    );

  const scheduled = await pick("un match à venir", "status = 'scheduled'", "asc");
  const played = await pick("un match joué en direct", "status = 'finished' and entry_mode = 'live'");
  const retro = await pick("un match saisi après coup", "status = 'finished' and entry_mode = 'retro'");

  const lineup = await one(
    "une composition",
    await sql<{ id: string }[]>`
      select l.id from lineups l where l.match_id = ${played.id} order by l.from_minute limit 1`,
  );
  const training = await one(
    "un entraînement",
    await sql<{ id: string }[]>`
      select id from trainings where team_id = ${team.id} order by starts_at desc limit 1`,
  );

  return {
    coach: coach.username,
    player: player.username,
    targets: [
      { name: "calendrier", path: "/calendrier", audience: "everyone" },
      { name: "equipe", path: "/equipe", audience: "everyone" },
      { name: "stats", path: "/stats", audience: "everyone" },
      // The filter and the sort are the two bits of `/stats` that change the numbers on screen.
      { name: "stats-coupe-buts", path: "/stats?competition=cup&tri=buts", audience: "everyone" },
      { name: "entrainements", path: "/entrainements", audience: "everyone" },
      { name: "entrainement", path: `/entrainements/${training.id}`, audience: "everyone" },
      { name: "entrainement-nouveau", path: "/entrainements/nouveau", audience: "coach" },
      { name: "entrainement-modifier", path: `/entrainements/${training.id}/modifier`, audience: "coach" },
      { name: "moi", path: "/moi", audience: "everyone" },
      { name: "joueur", path: `/joueur/${player.membership}`, audience: "everyone" },
      { name: "match-a-venir", path: `/match/${scheduled.id}`, audience: "everyone" },
      { name: "match-joue", path: `/match/${played.id}`, audience: "everyone" },
      { name: "match-saisi-apres", path: `/match/${retro.id}`, audience: "everyone" },
      { name: "match-nouveau", path: "/match/nouveau", audience: "coach" },
      { name: "match-modifier", path: `/match/${scheduled.id}/modifier`, audience: "coach" },
      { name: "feuille", path: `/match/${scheduled.id}/feuille`, audience: "coach" },
      { name: "compositions", path: `/match/${played.id}/composition`, audience: "coach" },
      { name: "composition", path: `/match/${played.id}/composition/${lineup.id}`, audience: "coach" },
      { name: "composition-nouvelle", path: `/match/${scheduled.id}/composition/nouvelle`, audience: "coach" },
      // Game mode is *readable* by the whole squad — a substitute following the score on the bench
      // is the point. What a non-operator does not get is the buttons.
      { name: "jeu", path: `/match/${scheduled.id}/jeu`, audience: "everyone" },
      { name: "notation", path: `/match/${played.id}/notation`, audience: "everyone" },
      { name: "recap", path: `/match/${played.id}/recap`, audience: "everyone" },
      { name: "saisie", path: `/match/${retro.id}/saisie`, audience: "coach" },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* The questions asked of every screen                                       */
/* -------------------------------------------------------------------------- */

/**
 * Boxes that stick out of the viewport, ignoring anything inside a scroll container: the competition
 * filter on `/stats` is a deliberate sideways scroller (`w-max` in `overflow-x-auto`) and its content
 * is *supposed* to be wider than the screen. The first version of this check reported it as a defect,
 * which is how a probe teaches you to distrust it.
 */
async function measure(page: Page, width: number) {
  // Nothing inside this callback may be a *named* function: `tsx` compiles with esbuild's
  // `keepNames`, which wraps `const f = () => …` in a `__name(…)` helper that exists in Node and not
  // in the page, and the only symptom is « ReferenceError: __name is not defined » from deep inside
  // `page.evaluate`. So the overflow test is written out longhand instead of in a helper.
  return page.evaluate((limit) => {
    const clipped: string[] = [];
    const root = document.documentElement;
    for (const el of document.querySelectorAll("body *")) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // The skip link lives off-screen on purpose until it is focused.
      if (el.classList.contains("sr-only") || el.closest(".sr-only")) continue;
      let owned = false;
      for (let p: Element | null = el.parentElement; p; p = p.parentElement) {
        const overflowX = getComputedStyle(p).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          owned = true;
          break;
        }
      }
      if (owned) continue;
      if (box.right > limit + 0.5 || box.left < -0.5) {
        clipped.push(
          `<${el.tagName.toLowerCase()} class="${String(el.className).split(" ")[0]}"> ` +
            `${Math.round(box.left)}…${Math.round(box.right)} « ${(el.textContent ?? "").trim().slice(0, 40)} »`,
        );
      }
    }
    return {
      sideways: root.scrollWidth > root.clientWidth ? root.scrollWidth : 0,
      clipped: clipped.slice(0, 3),
      text: document.body.innerText,
      heading: document.querySelector("h1")?.textContent?.trim() ?? null,
    };
  }, width);
}

async function login(page: Page, username: string): Promise<void> {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel(/nom d.utilisateur/i).fill(username);
  await page.getByLabel(/mot de passe/i).fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 20_000 });
}

/* -------------------------------------------------------------------------- */
/* The walk                                                                  */
/* -------------------------------------------------------------------------- */

async function walk(
  theme: "light" | "dark",
  who: { label: string; username: string; isCoach: boolean },
  targets: readonly Target[],
  findings: Finding[],
): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: theme,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const page = await context.newPage();

  let current = "connexion";
  const noted = (problem: string) =>
    findings.push({ theme, who: who.label, target: current, problem });
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (BENIGN_CONSOLE.some((pattern) => pattern.test(text))) return;
    noted(`console : ${text}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", (error) => noted(`exception : ${error.message}`));

  await login(page, who.username);

  for (const target of targets) {
    current = target.name;
    await page.goto(`${BASE}${target.path}`);
    await page.waitForLoadState("networkidle");

    const seen = await measure(page, VIEWPORT.width);
    const refused = seen.heading === "Page introuvable";
    const mayNotSee = target.audience === "coach" && !who.isCoach;

    if (mayNotSee && !refused) {
      noted(`accessible à un joueur alors que l'écran est réservé aux coachs (h1 « ${seen.heading} »)`);
    }
    if (!mayNotSee && refused) {
      noted("répond « Page introuvable » à quelqu'un qui a le droit de le voir");
    }
    // A screen that refuses is allowed its own `h1`; what is not allowed is none at all.
    if (!seen.heading) noted("aucun titre de niveau 1 : l'écran n'a pas de nom");
    if (seen.sideways) noted(`la page défile latéralement : ${seen.sideways} px`);
    for (const box of seen.clipped) noted(`hors de l'écran : ${box}`);
    for (const leak of ENGLISH_LEAKS) {
      if (seen.text.includes(leak)) noted(`texte en anglais : « ${leak} »`);
    }

    await page.screenshot({
      path: `${SHOTS}/${theme}-${who.label}-${target.name}.png`,
      fullPage: true,
    });
    process.stdout.write(
      `  ${theme.padEnd(5)} ${who.label.padEnd(6)} ${target.name.padEnd(22)} ` +
        `${refused ? "404" : "   "} ${JSON.stringify(seen.heading)}\n`,
    );
  }

  page.off("console", onConsole);
  await browser.close();
}

async function main(): Promise<void> {
  const { coach, player, targets } = await discover();
  const findings: Finding[] = [];

  console.log(
    `Audit de ${targets.length} écrans à ${VIEWPORT.width} px, clair et sombre, ` +
      `en tant que ${coach} (coach) et ${player} (joueur).\n`,
  );

  for (const theme of ["light", "dark"] as const) {
    for (const who of [
      { label: "coach", username: coach, isCoach: true },
      { label: "joueur", username: player, isCoach: false },
    ]) {
      await walk(theme, who, targets, findings);
    }
  }

  await sql.end();

  console.log(`\n${targets.length * 4} écrans visités. Captures dans ./${SHOTS}/.`);
  if (findings.length === 0) {
    console.log(
      "Aucun défaut mécanique.\n" +
        "Ce qui reste — un écran qui affirme quelque chose de faux — ne se voit qu'en regardant les\n" +
        "captures. C'est le but de ce script de rendre ça bon marché, pas de le remplacer.",
    );
    return;
  }

  console.log(`\n${findings.length} défaut(s) :`);
  for (const finding of findings) {
    console.log(`  ${finding.theme}/${finding.who} · ${finding.target} — ${finding.problem}`);
  }
  process.exitCode = 1;
}

// Not a top-level `await`: `tsx` transpiles this to CommonJS, which has none. Same shape as
// `db/seed.ts`, and the exit code is what makes the command usable in a pre-merge check.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
