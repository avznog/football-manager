# Session log

Append-only. Newest last. One entry per working session: what changed, what was decided, and
where the next session should pick up.

---

## 2026-09-22 — Planning

Read `instructions.md` and turned it into an approved plan (`docs/PLAN.md`) through a round of
challenges and clarifying questions. No code written.

Decisions 001–015 recorded in `docs/DECISIONS.md`. The notable push-backs the owner accepted:
the "everything in git" requirement was reframed as spec-in-git (001), the live match got an
offline outbox on top of the requested database logging (004), and planned compositions became
suggestions requiring confirmation rather than automatic substitutions (006). The owner
knowingly kept visible-authorship ratings against advice (007), mitigated by hiding results
until you have voted.

**Next:** M0 foundations.

---

## 2026-09-23 — M0 foundations

Repository bootstrapped: `CLAUDE.md`, `docs/` (plan, decisions, data model, roadmap, this log).
Local Postgres chosen for development because provisioning Neon needs an interactive browser
flow (decision 016). Docker was the first choice and was abandoned: the machine's colima
install is broken (`vz: CanRequestStop is not supported`, and `colima start` hangs indefinitely
with no instance ever registered), so Postgres 17 came from Homebrew instead. Vercel CLI is
already authenticated as `avznog`, so deployment is unblocked as soon as a `DATABASE_URL`
exists.

Then M0 itself, shipped whole:

- **Schema** — all 21 tables in `db/schema.ts`, migration `0000` generated and applied.
- **Auth** — argon2id hashing, opaque session tokens (only their SHA-256 is stored), the
  `can()` permission function, the identity DAL, and the login / join-by-invite screens.
- **Teams** — invite codes on an unambiguous 24-character alphabet, atomic invite consumption,
  coach appointment, soft member removal, coach-driven password reset.
- **Shell** — design tokens with light/dark, the app shell with a bottom tab bar, the PWA
  manifest, and the turf pitch component set with its reference formations.
- **Seed** — reference data (safe to run in production) plus a deterministic demo season.

Two subagents worked in parallel on disjoint file sets: the design system and app shell, and
the pitch component plus reference data. Both landed clean.

Three things worth knowing, all of which cost time to find:

1. `server-only` throws under plain Node, so scripts that import the database client run as
   `tsx --conditions=react-server`.
2. `db/reset.ts` has to drop the `drizzle` schema as well as `public`, otherwise the migration
   journal survives and `db:migrate` believes there is nothing to do.
3. `npm run typecheck` runs `next typegen` first: `PageProps<"/route">` does not exist until
   the route types are generated.

104 unit tests pass. `npm run build` is clean. Pages verified against the running dev server.

**Next:** M1 (player profiles, position picker, injuries) and M2 (calendar). See
`docs/ROADMAP.md`.

---

## 2026-09-23 — wave 2: the match logic core, M1 and M2

Three slices landed, each as its own PR, squash-merged: **#3** the pure match logic core,
**#4** M1 squad & profiles, **#5** M2 calendar. `main` is green on
`typecheck` / `lint` / `test` / `build`, with **391 unit tests** in 19 files (104 before this
session).

Written by three subagents on disjoint file sets, committed and merged by the session that
launched them — subagents never run git, which keeps one hand on the history instead of several
racing. The working tree was backed up off-machine between reports with plumbing only
(`commit-tree` + a push to a `wip/` ref, then `git reset`), because a `checkout` would have
yanked half-written files out from under a running agent. That ref is deleted now.

### What exists that did not before

- `lib/match/{events,clock,lineup,reducer}.ts` — the append-only log reduced by a pure
  function: score, who is on the pitch, minutes, clean sheets, anomalies. 143 tests. Reducing
  the seeded log agrees with the fixture exactly: 3-2, minutes summing to 420 = 7×60, no
  anomalies. **Read `reducer.test.ts` before touching any of it** — the test names are the
  specification.
- `/joueur/[id]` and `lib/player/` — the position picker on the turf, the jersey number,
  injury declaration and history.
- `/calendrier`, `/match/*`, `/entrainements/*` and `lib/{calendar,training}/` — one
  chronological timeline with the next event pinned, availability, the coach's non-responder
  list, training attendance.

### Decisions added

017 (`GOAL_FOR.scorerId` optional), 018 (goalkeeper clean sheets get their own columns,
migration `0001`), 019 (jersey numbers are coach-assigned), 020 (three attendance states, and
« non jugé » stores nothing). 016 was rewritten: development Postgres comes from Homebrew, not
Docker, since there is no Docker daemon on the owner's machine.

### Worth knowing before the next session

1. **Two things claimed by `docs/` turned out to be untrue** and were found only because the
   reducer needed them: a required `GOAL_FOR` scorer, and a `match_player_stats` with nowhere
   to put a keeper's clean sheet. Reading the doc is not the same as checking the schema.
2. `SegmentedControl` documented that it worked from a Server Component but attached an
   `onChange` closure unconditionally, so it threw. Fixed in #5. A prop that is *sometimes* a
   function is a prop a Server Component cannot be given unconditionally.
3. The calendar computes a score with a **SQL aggregate** over `match_events`, not a second
   reducer. Two implementations of "what is the score" would be exactly the drift invariant 2
   exists to prevent — this one answers a narrower question (count goal rows, skip voided) and
   its output is asserted to agree with the reducer on the seeded match.
4. `db/seed.ts` is now the weak point: both finished matches share the same 18-event log, so
   there is no defeat, no draw, no clean sheet, no goalkeeper change and no pending planned
   composition anywhere in the database. M4 and M5 will want all five.
5. `training_availability` has no `note` column while `match_availability` does, so a player
   can explain missing a match but not a training. Left alone deliberately; it needs a
   migration if the owner wants parity.

**Next:** M3 (drag-and-drop composition editor, custom formations, match-sheet selection,
planned compositions with the diff) and M4 (game mode: clock, ACTION sheet, TERRAIN mode,
idempotent ingestion, the IndexedDB outbox, the timeline with VOID, final whistle freezing
`match_player_stats`). Both build on `lib/match/`, which is why it landed first. Deployment is
still blocked on a Neon `DATABASE_URL` from the owner.

---

## 2026-09-23 — wave 3: M3, M4, and the leak the gate had

Five PRs, each squash-merged: **#9** the rating gate unified, **#10** M3 compositions, **#11** a
`Card` type fix, **#12** M4 game mode, **#13** the recap and rating flow wired into the app. `main`
is green on `typecheck` / `lint` / `test` / `build`, with **704 unit tests** in 35 files (391 before
this session).

Two subagents wrote M3 and M4 concurrently on disjoint file sets while this session landed the
slices; as in wave 2 they ran no git at all. The tree was snapshotted off-machine between reports
with `commit-tree` plumbing rather than a commit, and each slice was verified in a **detached
worktree at its own commit** — `git worktree add` plus a hardlinked `node_modules` (`cp -al`; a
symlink makes Turbopack panic with *"points out of the filesystem root"*). That matters more than it
sounds: another agent's half-written file in the shared tree can both mask a real failure and invent
a fake one, and twice it did.

### What exists that did not before

- **M3.** `/match/[id]/feuille` (the sheet), `/match/[id]/composition*` (the list and the editor).
  Three pure modules carry the rules — `lib/formation/shape.ts`, `lib/composition/plan.ts`,
  `lib/composition/editor.ts` — and the components are thin over them. Drag is hand-rolled pointer
  events composing the existing turf pitch, with a tap-then-tap fallback and arrow-key nudging.
- **M4.** `/match/[id]/jeu` and `POST /api/match-events`. `lib/match/ingest.ts` is the pure half of
  ingestion, `lib/match/append.ts` is the **only** writer of `match_events`, `lib/match/presenter.ts`
  is everything the screen shows (pure), `lib/match/outbox.ts` is the FIFO IndexedDB queue, and
  `lib/match/finalize.ts` freezes `match_player_stats`.
- The recap and the rating flow are now reachable: an « Après le match » card on the match page, and
  a past calendar row that opens the recap rather than the organising page.

### Decisions added

026–028 (M3: coach-only screens, a dragged slot is retyped, only an unfinished lineup blocks a save)
and 029–036 (M4: a route handler rather than a Server Action, FIFO with an isolated refusal, stamped
at the tap that opened it, no drag-and-drop in game mode, open to everybody read-only, a stale status
self-heals, injury flags merge the roster outside the reducer, a goal may have no scorer).

### Worth knowing before the next session

1. **The gate had a real leak, and duplication is what caused it.** `lib/stats/ratings.ts` had its own
   copy of decision 007's rule and treated *"has submitted at least one rating"* as having submitted.
   That was equivalent until decision 023 chose to keep partial sets — after which one note earned a
   player every season average. Fixed in #9 by deleting the copy and delegating to
   `lib/rating/progress.ts`. The gate now also runs **in the query**: `getRatingAuthors` selects no
   `score` column at all, and scores are read in a second round trip naming only the opened matches.
   If you find yourself restating a rule that already exists, that is the bug, not the boilerplate.
2. **Invariant 2 nearly lost its purity to an injury.** `reduceMatch` only sees this match's log, so
   an injury declared on Tuesday is invisible to it — and that is the common case for a Thursday plan.
   The fix was to merge the roster in the *presenter* (decision 035), not to let the reducer read the
   database. Any future "the reducer just needs one more input" should get the same treatment.
3. `Card`'s `title` was typed `ReactNode` intersected with the intrinsic `section` props, which
   include `title?: string` — so it was `string`. Every element has a `title` attribute; `Omit` it
   before redeclaring (#11).
4. **The seed is still the weak point**, now more visibly: the notation window of the older finished
   match is legitimately closed (the next match has kicked off), so exercising the rating CTA needs
   the newer one. There is still no defeat, no draw, no keeper change, no supporter on a sheet, no
   empty-log finished match and no unmarked training. A wave-4 agent is fixing exactly this.
5. **Nobody has tapped game mode in a real browser.** The outbox is proven by 18 unit tests against an
   in-memory fake and the four SSR states were fetched over HTTP, but the Playwright happy path and
   the by-hand offline check from `docs/PLAN.md` are still open.

**Next:** wave 4 is four agents — M7 (retro-entry and amendments), TERRAIN fast-change inside game
mode composing M3's editor, the seed fixtures above, and the Playwright happy path. Deployment is
still blocked on a Neon `DATABASE_URL` from the owner; the Vercel CLI is already authenticated.

---

## 2026-09-23 — wave 4, part 1: the demo season, and the four lies it found

Wave 4 is four parallel agents: M7 (retro-entry and amendments), TERRAIN fast-change inside game
mode, the seed fixtures, and the Playwright happy path. The seed landed first, and reading the season
it builds is what the rest of this entry is about. **Three agents are still in flight** as this is
written; their work is not in `main` yet.

### Shipped

- **#15 — a demo season that contains the cases that break things.** Seven played matches, each
  carrying one edge case on purpose (decision 037): a defeat, a draw, a keeper change, a voided goal,
  a goal with no scorer, a supporter on the sheet, a player who has since left the team, and one
  match that is *finished with an empty log* (decision 038). Four trainings cover marked, all-absent
  and never-marked. Every played match is written as an append-only log and then frozen through
  `finalizeMatchById`, so the fixtures exercise the real freeze path rather than inserting cache rows.
- **#16 — say what was recorded instead of inventing a 0-0.** The empty-log match rendered « 0 – 0 »
  under a red « en cours » badge while `/stats` correctly reported it as « 1 match terminé sans aucun
  évènement saisi ». `MatchRecap.recorded` and a `status` prop on `Scoreboard` give the recap three
  honest states (decision 041), and three gaps now state themselves rather than rendering blanks
  (decision 042): « buteur non renseigné », « Tu étais supporter sur ce match », and a « supporter »
  badge in the minutes table instead of « non entré ».
- **#17 — keep a departed player on the sheet he actually played on.** `getLiveMatch` built its
  roster from `getSquad`, which hides members with `left_at` set, and `reduceLive` takes the reducer's
  squad from that roster — so re-freezing a match a since-departed player had *started* wrote his
  cached row with `squad_role = null`. Verified by re-freezing the seeded match: null → `starter`,
  every other row identical.

### Worth knowing before the next session

1. **Fixtures are only worth what you read from them.** All four defects above came from opening the
   seeded season in a browser, not from a failing test — and each one was a screen stating something
   untrue rather than crashing. `npm run db:reset` then walking `/calendrier` end to end is now the
   cheapest review tool in the repo.
2. **The « empty log » fixture is consumable.** The M7 agent backfilled *FC des Deux-Ponts* while
   testing its retro-entry screen, which is exactly what that fixture is for — but it means the
   unrecorded-recap state is only reproducible after a `db:reset`. Its three states were verified as
   rendered HTML; the light/dark screenshots at 390 px were taken on the other recaps.
3. **`match_player_stats` must equal a recomputation of the log, always.** That is the whole contract
   of the cache, and #17 was a drift of exactly one column that nothing currently reads. M7's
   amendments re-freeze finished matches by design, so anything that feeds the reducer from a
   *current-squad* query rather than from the match's own sheet is the same bug waiting to happen.
4. **No prettier config in this repo.** `npx prettier --write` reformats a file to 80 columns and
   produces a diff three times the size of the change; the house style is 100. Edit by hand.

**Next:** land the three agents still running (M7, TERRAIN, Playwright), each with its own PR after an
isolated worktree verification, then `db:reset` and re-walk the season. Deployment is still blocked on
a Neon `DATABASE_URL` from the owner; the Vercel CLI is authenticated as `avznog`.

## 2026-09-23 — wave 4, part 2: M7, TERRAIN, and the browser that finally runs the season

The three agents left running at the end of part 1 all landed. **Every milestone M0–M7 is now
ticked**; the only unticked lines in `docs/ROADMAP.md` are the deployment ones, still blocked on a
Neon `DATABASE_URL` from the owner.

### Shipped

- **#19 — the end-to-end happy path** (`e2e/happy-path.spec.ts`). The whole PLAN scenario driven
  through the UI on a 390×844 viewport: the coach creates a match, two players answer for themselves,
  the sheet is picked, two compositions are drawn, both halves are played, two players rate the squad,
  the recap crowns a man of the match. Real logins, no forged cookie. The assertions that justify it
  are minutes played after the whistle, the second-half clock reading `30:00`, and **invariant 3
  twice** — the pitch empty while a composition sits there as a proposal, and the replaced midfielder
  still on at the 30th minute with the plan on screen. The suite provisions its own team rather than
  reading `db/seed.ts` (decision 044), and `.github/workflows/ci.yml` now runs both gates on every
  push. Decision 043 is the one to remember: `127.0.0.1` silently disables hydration in `next dev`.
- **#20 — TERRAIN** (`lib/match/terrain.ts`, 39 tests). One sheet to rearrange the whole pitch, one
  `LINEUP_APPLIED` per confirmation (decision 046). Decision 045 amends 032: drag is allowed here and
  only here, because the gesture writes nothing. The planned-composition prompt gained « Ajuster sur
  le terrain », which pre-fills and waits exactly as « Appliquer » does.
- **#21 — M7, retro-entry and amendments** (`lib/retro/`, 52 tests). A match typed up afterwards is an
  ordinary event log (decision 047); minutes are optional and stamped where they cannot contradict the
  log (decision 048); a correction is a `VOID` plus a replacement carrying its target's minute, and
  the frame of the log cannot be annulled at all (decision 049). `amendMatchEvents` shares the single
  insert path with `appendMatchEvents` and re-freezes `match_player_stats`.

### Worth knowing before the next session

1. **The end-to-end suite is now the cheapest honest check in the repo**, and it has already earned
   it: it passed on every one of the three merges, including the two that changed game mode. Run
   `npm run test:e2e` before believing anything about the match flow. It reuses a dev server if one is
   up, so it costs about 25 seconds.
2. **CI exists, and it caught up with the definition of done.** Both jobs passed first time on all
   three PRs, and the e2e job builds the app — so `npm run build` is covered on every PR now.
3. **Verifying a slice while other agents write the same tree**: stage only that slice's paths,
   `git commit-tree` a snapshot, `git worktree add` it detached, hardlink `node_modules` with
   `cp -al`, copy `.env.local`. That is what made three independent PRs possible out of one working
   tree, and each one's gates are therefore about that slice alone.
4. **Reading a screen is still what finds the lies.** Three more this wave, all found by screenshotting
   at 390 px rather than by a failing test: « 7 changements » for the starting seven (seven
   substitutions in the first second — the same lie the recap already refuses about a `LINEUP_APPLIED`
   at 0′), « un match 0-0 sans carton » naming a thing this app deliberately never records, and
   « saisi après le match » badged on a match whose log was still empty, on the page where it was
   about to be entered.
5. **A real mobile bug came out of it too.** `Button` carried `shrink-0`, so the repo-wide idiom of two
   `fullWidth` buttons in a `flex` row overflowed a 390 px viewport — measured `scrollWidth 740` with
   the confirm button at `left: 382`, off-screen and unreachable with a thumb, on a sheet that had
   been in `main` for two waves. `fullWidth` now carries `min-w-0 shrink`.
6. **The demo season is back to exactly what `db/seed.ts` describes** (`npm run db:reset` after the
   by-hand retro entry), so the unrecorded-recap state part 1 could not screenshot is now verified in
   both themes — and so is what the entry form makes of it: « 1 – 2 · Victoire », 60′ each for seven
   starters, Hugo « 30′ sans encaisser », and « But · buteur non renseigné » in the timeline.

### Debt named, not paid

- ~80 lines of pointer-drag handling are duplicated between the composition editor and TERRAIN; the
  fix is a `usePitchDrag` hook in `components/pitch/` (named in decision 045).
- `describeLineupDiffFr` in `lib/match/lineup.ts` prints nothing for an unpaired arrival or departure.
  `terrainChangesFr` works around it; the shared helper is still wrong for other callers.
- `lib/match/queries.ts` does not expose `matches.entry_mode`, so `lib/retro/queries.ts` pays an extra
  `select`; `db/schema.ts` exports no `EntryMode` alias.
- A retro entry does not rewrite `match_squad` roles, so a listed substitute who actually started keeps
  `squad_role = 'substitute'`. Game mode behaves identically and no count is wrong, but whether the
  sheet should follow the log is one decision to take for both paths.

**Next:** deployment, and nothing else — `vercel link`, the environment variables, a production deploy
and a run through a real match on an iPhone and an Android in daylight. It needs a Neon
`DATABASE_URL` from the owner (interactive signup); the Vercel CLI is authenticated as `avznog`.

## 2026-09-23 — the deployment nobody could have logged into

**Shipped.** PR #23 (CLAUDE.md knows about the e2e suite and CI), PR #24 (first-run bootstrap).

The backlog was M0–M7 all ticked, with only three Deployment lines left, all marked blocked on the
owner's Neon URL. Checking that claim rather than repeating it is what this session was:
`grep process.env` over the repo, to see what a production instance would actually need. Two of the
three lines were indeed blocked. The section above them was not, and it was wrong.

**A fresh production database could not be logged into, by anybody, including its owner.** Signing up
is invite-only (decision 008); invites are issued by a coach; an empty database has no coach. The
super admin was created inside `seedDemo()`, and `main()` refuses to run it when
`NODE_ENV=production` — correctly, since a fake team of fourteen would land in the real season's
statistics. So the loop was closed: no coach → no code → no account → no coach.

`npm run db:bootstrap` (`db/bootstrap.ts`) opens it, and does nothing else: reference data, one
super-admin account, stop. Proving it meant creating an empty database and walking the first run in a
browser at 390 px, which turned up two more holes behind the same door:

- **`createTeam` had no UI at all.** It has existed since M0, unreferenced by any `.tsx`. Since
  invariant 5 sends a user with no team to `/rejoindre` and nowhere else, a super admin on a new
  instance was in a dead end: the one screen he could reach asked for a code from a coach who did not
  exist. The form now lives on that screen.
- **`createTeam` did not redirect.** Submitting it created the team, set the cookie, and re-rendered
  the same form — the join actions in `lib/auth/actions.ts` both `redirect("/")` and this one
  returned `undefined`. Found by a `waitForURL` that timed out while the database showed the team had
  been created perfectly.
- **`updateTeam` had no UI either**, so the two club colours the kit discs are drawn in (decision 011)
  could be set at creation and never again. `/equipe` now carries « Réglages de l'équipe ».

**Worth knowing.**

- The state a brand-new instance is in — zero players, zero matches, zero trainings — had never been
  looked at, because the demo seed always has a season in it. Every tab was checked in it, both
  themes. Four of the five read honestly already (« Rien de prévu », « 0 match terminé »); `/equipe`
  showed an empty bordered box under « Effectif » and now says to generate an invite code.
- Reference seeding had to move to `db/seed-reference.ts`. `db/seed.ts` calls `main()` as it loads, so
  importing it to reuse one function seeds a demo season as a side effect of asking for the positions
  table.
- `db:bootstrap` needs `tsx --conditions=react-server`, like `db:seed`: `lib/auth/password.ts` is
  `server-only`.
- The last-coach guard was checked and is already there in both `updateMember` and `removeMember` —
  a one-person team cannot remove its own coach. It returns silently, which is safe but says nothing;
  left alone as pre-existing behaviour.
- `CLAUDE.md` said development used Docker Postgres. It has been Homebrew since decision 016.

**Debt, named.**

- `removeMember` and `updateMember` refuse the last-coach case by returning `undefined`, so the button
  appears to do nothing. It should say why.
- No crest upload: `teams.crest_url` is read by the header and set by nothing.
- `docs/DEPLOY.md` §4 and §6 are the only steps in this repo never executed. They need the owner's
  Vercel account and the owner's phone.
- The e2e suite covers the season loop, not the first run. The bootstrap path was verified by hand
  against a scratch database; a regression in `/rejoindre`'s super-admin branch would not fail a test.

## 2026-09-23 — the two debts the previous entry named, and a row with no name in it

**Shipped.** PR #25: the first run is now covered by a test, and the last coach is told why he
cannot be demoted.

The previous entry ended with four named debts. Two of them were mine to pay, and both are paid.

- **`e2e/first-run.spec.ts`.** Every one of the four bugs the previous session fixed by hand on the
  first-run path would have shipped again unnoticed, because the suite only ever walked the season
  loop, which starts from a seeded team with a squad in it. The spec needs no empty database — it
  tests the state `db/bootstrap.ts` *leaves behind*, which is just a super admin with no membership,
  so `e2e/fixtures/seed.ts` grew one and this runs against the same shared database as everything
  else (decision 044). It was mutation-tested: removing the `redirect`, hiding the create form,
  restoring the empty box and deleting « Réglages de l'équipe » each make it fail.
- **The silent last-coach refusal.** `setMemberRole` and `removeMember` both keep a team from losing
  its only coach, and both are plain `void` form actions so the page works with no JavaScript —
  which is exactly why they refused by returning, and the buttons appeared to do nothing. Rather
  than invent an error channel for a no-JS form, the row stops offering taps the server will refuse
  and says « seul coach : nomme quelqu'un d'autre d'abord ».

**And then looking at it at 390 px, which is the point of that rule.**

The note was 261 px wide in a row with 326 px of usable width, and it overflowed to within 4 px of
the card border — the « confirm button 8 px off the right edge » failure mode, again. Fixing it by
letting the row wrap exposed the defect underneath, on the demo season, on the coach's own view of
his squad: « Nommer coach » and « Retirer » take 200 px of that row, and the name block was the only
thing that could shrink. It did, to nothing. First names read « Tho… », « Ya… », « Fa… », the
username and position codes were cut to « @hugo · … », and Brice — the one injured player — had a
jersey number, a « blessé » badge and **no name at all**. Fourteen rows of a screen a coach uses
constantly, unreadable, and no test failed.

The name now keeps a floor of `basis-44`, so for a coach the two controls drop onto a second line
and for everybody else the row is the same single line it was.

**Worth knowing.**

- A failed `npm run test:e2e` used to break `npm run lint`. `playwright-report/` embeds a bundled
  copy of its own HTML viewer, so the gate reported 3054 problems in vendored JavaScript.
  `.gitignore` is not read by ESLint; both output directories are now in `globalIgnores`.
- `scrollIntoViewIfNeeded` parks an element under the fixed tab bar, and an element screenshot then
  captures the tab bar on top of it. `scrollIntoView({ block: "center" })` is what to use when
  reviewing a card by screenshot.
- Measuring beats squinting: printing the bounding box of the text against the bounding box of its
  card is what turned « looks a bit tight » into « overflows the padding by 12 px ».

**Debt, named.** Unchanged from the previous entry apart from the two paid above:

- No crest upload: `teams.crest_url` is read by the header and set by nothing.
- `docs/DEPLOY.md` §4 and §6 are the only steps in this repo never executed. They need the owner's
  Vercel account and the owner's phone.
- A coach's squad list is now two lines per player, so fourteen players is a long scroll. Legible
  beats compact, but the right answer is probably to move the two controls onto the player's profile
  page and leave the list to reading.

**Next:** deployment, and nothing else. It needs a Neon `DATABASE_URL` from the owner.
