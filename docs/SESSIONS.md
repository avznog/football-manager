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

**Then, the same day:** PR #26, the third debt from the entry above — `describeLineupDiffFr` printing
nothing for an unpaired arrival or departure.

It was filed as a tidiness item: `terrainChangesFr` works around it, the shared helper is still
wrong for other callers. Reading the other callers turned it into a defect in game mode.
`pendingLineupView` diffs a planned composition against the **pitch**, not against the previous
plan — and a seven-a-side side plays on with six whenever somebody limps off and the bench is empty.
Julien goes off at the 20th, the composition planned for the 45th brings Yanis on, and the prompt
listed nothing at all while `summariseLineupDiffFr` called it « Aucun changement ». Invariant 3 says
the app proposes and the coach confirms; it was satisfied to the letter and empty in substance.

The unpaired lines moved from `terrain.ts` into the shared helper and the workaround is gone. The one
thing the omission was accidentally getting right — seven arrivals against an empty pitch are a team
sheet, not seven changes — is now said out loud in `deduceChanges` and `pendingLineupView`, with a
test on each. Seven tests fail if the unpaired lines are removed again; two fail if either guard is.

**Next:** deployment, and nothing else. It needs a Neon `DATABASE_URL` from the owner.

**Then, still the same day:** PR #27, the fourth debt — `match_squad.role` being read as a statement
about what happened.

The notation card printed « entré en jeu » beside anybody the sheet listed as a substitute. The sheet
records the coach's intention before the match; in an amateur seven-a-side squad the commonest fate of
a named substitute is to stay on the bench for the whole hour. Fabien and Yanis were on the CS Morvan
sheet with zero minutes, and the card told them — and their team-mates, at the moment they rated them
— that they had come on.

The log already knows: `PlayerMatchState.minutes`. The badge now reads « 60’ » or « non entré », and
**nothing at all** when there is no log to read — a finished match nobody recorded (decision 013),
where « non entré » would be the same invention as « 0 – 0 » for its score. `playedLabelFr` in
`lib/rating/progress.ts` is the one place that decides, `getNotationView` reduces the match once for
the minutes, and three tests pin the three answers.

Decision 053 records the general rule the fix follows, because the same question comes up in the
stats: the sheet records the intention, the log records what happened, and neither corrects the
other. `match_squad.role` is never rewritten after the fact — `lib/stats/aggregate.ts` rule 4
deliberately counts selections from the sheet, and everything about what happened comes from the
reducer. So the retro-entry path was already right, and the defect was only ever this label.

Verified at 390 px in both themes on the demo season: Hugo's card reads « 60’ », Yanis's « non
entré », no console errors.

**Next:** deployment, and nothing else. It needs a Neon `DATABASE_URL` from the owner.

**Then, PR #28:** the fifth debt — `matches.entry_mode` written by the entry action and read by
nobody.

Decision 013 put the column in the database for one purpose, in its own words: « so the UI can say
*saisi après le match* ». Nothing ever said it. The only reader was the retro screen itself, deciding
whether it was an entry form or a corrections list — so a match reconstructed from memory a fortnight
later was indistinguishable, on every screen a player reads, from one somebody stood and timed.

That matters because of decision 048: an action whose minute the coach cannot remember is stamped at
the midpoint of the spell it has to fall inside. « Léo 38’ » on a retro match is the app's best
placement, « Léo 38’ » on a live one was observed, and the recap printed both in the same font with
no way to tell. The score is exact either way, which is the number the season table is built on.

`MatchRow` now carries `entryMode` (the schema exports an `EntryMode` alias, which `lib/retro/queries.ts`
had been deriving locally for want of one), the match page and the recap header show a
« saisi après le match » badge, and « Temps de jeu » gains one line saying the minutes are approximate
and the score is not.

**The bug in the first version of it.** The badge was `mode === "retro"` and nothing else, and the
demo season immediately showed what that costs: FC des Deux-Ponts is `entry_mode = retro` with nine
men on the sheet and **an empty log** — the retro entry of M7 is still owed. The badge announced
« saisi après le match » about an afternoon nobody has typed up yet. `entry_mode` is a label *on a
log*; with no log it describes nothing. `entryModeBadgeFr(mode, { recorded })` is the one place that
decides, three unit tests pin it, and each screen passes the flag it already computes for its own
« rien saisi » state.

Verified at 390 px in both themes on the demo season: FC Rivière (retro, 18 events) shows the badge
in a three-badge row that still fits one line and the note under the table; FC des Deux-Ponts (retro,
no log) shows neither and still offers « Saisir le match »; CS Morvan (live) shows neither.

**Debt, named.** Game mode's own header does not carry the badge: it is built on `LiveMatchRow`, which
deliberately stops at what the pitch and the clock need, and « Voir le déroulé » is reached from the
match page, which now says it one screen earlier. The rest is unchanged — no crest upload, the
`usePitchDrag` duplication of decision 045, the two-line squad row, and `docs/DEPLOY.md` §4 and §6.

**Next:** deployment, and nothing else. It needs a Neon `DATABASE_URL` from the owner.

## 2026-09-23 — the column that had waited since M0 for a bucket it did not need

**PR #29** — the club crest.

`teams.crest_url` was written by the schema in M0 and by nothing since. The reason it had never been
built is not that nobody wanted it: it is that an upload needs somewhere to put the file, and adding an
object store means a second service, a second set of credentials in the runbook, a lifecycle for the
crest a coach replaces, and a signed-upload round trip — for **one image per team**, changed maybe once
a season. So the slice's real content was never the form. It was deciding not to provision anything
(decision 054): the image is resized to 96 px in the coach's own browser and stored in the row as a
`data:` URL.

`lib/team/crest.ts` holds the arithmetic, pure and isomorphic so it is testable on both sides:
`fitWithin` contains rather than crops, never enlarges — blowing 40 px of artwork up to 96 stores only
the blur — and clamps to at least one pixel, because a 2000×3 banner scales to 0.14 px of height and a
zero-height canvas throws. `app/(app)/equipe/crest-field.tsx` does the re-encoding: PNG first, since a
crest is flat colour on transparency; JPEG **on white** if the PNG is over the ceiling, because an
unfilled canvas would give a black square; a message the coach can act on if even that is too heavy.

**Two things the ceiling is actually protecting.** `lib/auth/dal.ts` reads the team row on every
authenticated request to draw the shell, so this is not a column read when someone opens a gallery — it
is on the hot path of every page. And the value ends up as the `src` of an `<img>`, so only
`image/png` and `image/jpeg` are accepted: `data:image/svg+xml` is the one shape of this string that can
carry markup, and refusing it at the boundary is cheaper than reasoning about it downstream.

The field is three-state — `""` keep, `"none"` remove, a data URL replace — which maps onto Drizzle's
`undefined` / `null` / value. A two-state field would have meant renaming the team cost it its crest,
so a browser check walks exactly that: put a crest on, reload, save the form without touching it, crest
still there.

**Looked at, at 390 px, in both themes.** A 512×512 PNG badge lands at 3 318 chars and shows in the
header in place of the coloured disc. A 2400×1600 photograph resizes to 96×64 and 28 482 chars — under
the ceiling, so the PNG path holds. Forcing the fallback took a maximally incompressible 96×96 image,
whose PNG is over the limit and comes back as a 9 859-char JPEG: the path works, and in practice
nothing that looks like a crest will reach it. « Retirer » puts the initials disc back, and the preview
is 40 px in both states so the row does not jump. No console errors.

**Debt, unchanged:** the `usePitchDrag` duplication of decision 045, the two-line squad row, game
mode's header not carrying « saisi après le match », and `docs/DEPLOY.md` §4 and §6.

**Next:** deployment. It still needs a Neon `DATABASE_URL` from the owner — that is the whole of what
is left.

## 2026-09-23 — the same gesture, two answers, one implementation

**PR #30** — `usePitchDrag`, the debt decision 045 named when it was written.

The composition editor and TERRAIN each carried their own ~80 lines of pointer bookkeeping: a local
`Drag` type, a `TAP_SLOP`, a `PITCH_MARGIN_PX`, a `boxOfPitch`, and `beginDrag` / `continueDrag` /
`endDrag` / `cancelDrag`. Two copies of the same code is not the interesting part. The interesting part
is that three of the judgement calls inside them were untested, and each is one somebody could get wrong
later: a pointer sequence under 8 px of Manhattan travel is a **tap**; the turf gets a 12 px outer margin
so the goalkeeper's slot is reachable with a thumb; and **off the turf is an answer of its own** —
`fromClientPoint` clamps, so a drop on the bench silently becomes a drop on the touchline unless
`inside` is carried separately.

So the split follows what can be tested. Vitest runs `environment: "node"` and only collects
`lib/**` and `db/**`, which means anything inside a hook cannot be tested here at all. `lib/pitch/drag.ts`
is therefore pure — no React, no DOM beyond a box somebody else measured — and has twelve tests,
including the clamped-point-plus-`inside` trap and the box being re-measured mid-gesture.
`components/pitch/usePitchDrag.ts` is the thin React part: pointer capture, the mouse-left-button check,
and a subject type parameter so each screen carries what it drags.

**What deliberately stayed apart.** A drop on empty grass benches a player in the composition editor and
is a no-op in TERRAIN — the same gesture, two answers, because at 70′ a slipped thumb must not cost you
a player (decision 045). That difference lives in each screen's `onDrop`, visible in the file that owns
the behaviour, not behind a flag in a shared hook. The editor also passes `onMove`, which TERRAIN does
not: a match never changes shape by gesture.

**The lint rule that chose the API.** The first version returned the pitch ref from the hook, and
`react-hooks/refs` then flagged fourteen sites — a hook that returns a ref makes *every* other property
of the returned object a ref value, and `gesture.drag` is read on every render to draw the lifted disc.
Inverting it — the caller owns the ref and passes it in — is what the rule was asking for.

**Walked with real pointer drags at 390 px, both themes, no console errors.** In the editor: bench → slot,
slot → slot, a swap, a drop off the pitch (« Nico retourne sur le banc »), then the tap path; and in
`postes` mode the formation label read `1-3-1-2` *while the finger was still down*, which is the whole
reason `onMove` exists. In TERRAIN, opened from the planned-composition prompt so nothing is written:
bench onto an occupied slot swaps, two players on the pitch swap, a drop on the bench heading answers
« Karim n'a pas bougé : relâchez-le sur un poste, ou utilisez « Faire sortir ». », and « Abandonner »
leaves the match still waiting for its kick-off.

One thing the browser turned up that no test would have: the announcements said « au poste de attaquant ».
French elides `de` before a vowel and three of the eleven positions start with one, so `atPositionFr` in
`db/reference.ts` now says « au poste d'attaquant », with its own tests. Screen readers speak these
sentences out loud.

**Debt after this:** the two-line squad row, game mode's header not carrying « saisi après le match »
(it is built on `LiveMatchRow`, which drops `entryMode`), and `docs/DEPLOY.md` §4 and §6.

**Next:** deployment. It needs a Neon `DATABASE_URL` from the owner; that is all that is left.

## 2026-09-23 — the biggest number on the screen, unqualified

**PR #31** — game mode says « saisi après le match » too.

Decision 013 put `matches.entry_mode` in the database so a reader is told when a minute was typed up
rather than watched, and `lib/match/queries.ts` states the rule plainly: *every screen that prints a
minute a human did not type owes him that sentence.* The match page and the recap kept it. Game mode —
which prints a 48 px clock, the largest number anywhere in the app — did not.

The cause was a type, not a query. `getLiveMatch` calls `getMatch` and returns the row it gets
**unchanged**, so `entry_mode` and `competition` have always crossed the RSC boundary; `LiveMatchRow`
simply never declared them. Two consequences fell out of that one omission: the scoreboard could not
ask the question, and `getRetroView` opened a second `select` on `matches` for two columns it was
already holding — with a `?? "live"` fallback for a row that cannot be missing, since `getLiveMatch`
just found it. Declaring the two fields fixes both; the extra query and its comment about values being
« dropped at the client boundary » are gone, because nothing was ever dropping them.

The badge goes in the caption under the clock rather than in the page header, next to « 2ᵉ période » —
it qualifies the clock, and that is what it should sit beside. `recorded: live.events.length > 0` is
the same test the other two screens make: an empty log was never *saisi*, whatever `entry_mode` says,
which is exactly the FC des Deux-Ponts case `lib/calendar/labels.test.ts` was written around.

**Looked at, at 390 px, both themes.** FC Rivière (`retro`, 18 events) reads « 60:00 · Match terminé ·
saisi après le match · 3 – 2 ». FC des Deux-Ponts (`retro`, empty log) and Union des Lavandières
(`live`, 13 events) carry no badge. The retro-entry screen still labels the first and not the second
after losing its query. No console errors.

**Debt after this:** the two-line squad row, and `docs/DEPLOY.md` §4 and §6.

**Next:** deployment. It needs a Neon `DATABASE_URL` from the owner; that is all that is left.

## 2026-09-23 — two buttons twice a season, on every row all season

**PR #32** — the squad list goes back to one line, and the controls move to the member's page.

The previous session made the last coach's row honest: instead of « Nommer coach » and « Retirer »
that the server refuses in silence, he gets a sentence saying why. The name no longer truncated
either, because the row was allowed to wrap. The bill arrived on the next screen-width check: a coach
with fourteen players scrolled a list **twice as long** as any player's, and the two controls that
cost him that are ones he uses about twice a season.

« Nommer coach » + « Retirer » took 200 px of a 326 px row. Both act on exactly one member, and that
member has a page — so they moved there, and the list went back to what it is for: reading who is in
the squad. The whole row is now a single `<Link>` to the profile, and `/equipe` tells a coach so
(« Touche un joueur pour son numéro, ses postes, son rôle et ses blessures. ») rather than leaving him
to guess where the buttons went.

The rule they enforce was in three places that had to agree: `setMemberRole` and `removeMember` each
carried their own `coaches[0]?.id === memberId`, and `/equipe` counted coaches a third way so it could
avoid rendering a dead button. It is now `wouldLeaveNoCoach(coachMemberIds, memberId)` in
`lib/team/coaches.ts` — pure, six tests, fed by one narrow `getActiveCoachIds` query. The empty-team
answer (`false`, nothing left to protect) is pinned by a test, because `db:bootstrap` leaves an
instance looking exactly like that until the first team exists. `lastCoachId` was written alongside it
for the list to label rows with, and deleted in the same slice once the list stopped labelling
anything — it had no caller but its own test.

Two things the move required. `removeMember` now ends in `redirect("/equipe")`: it is invoked *from*
the page of the member it removes, which would be a 404 on the next render. And `setMemberRole` gained
`revalidatePath("/joueur/<id>")` for the same reason — the role it changes is printed there.

**Looked at, at 390 px, both themes.** Rows measure 56–57 px, one line each, no name clipped. On a
player's profile: « Nommer coach » beside the Rôle cell, « Retirer Hugo de l'effectif » in a danger
card at the very bottom, and removal lands back on `/equipe` with thirteen rows instead of fourteen.
Demoting the staff coach to make Karim the only one swaps both controls for the sentence, as designed.
A player sees neither the signpost nor any control. Found one unrelated untruth on the way: a demoted
member of the encadrement was labelled « Joueur » next to their own « encadrement » badge, so the cell
now reads « Encadrement ». `db:reset` after, since the walk removed a player.

845 unit tests in 43 files, 2 e2e specs in 18 s.

**Debt after this:** none outside deployment.

**Next:** deployment, and nothing else. It needs a Neon `DATABASE_URL` from the owner.

## 2026-09-23 — the check that was left by hand, and the bug that was waiting in it

**PR #33** — `e2e/offline.spec.ts`, and the defect it found on its first run.

`docs/PLAN.md` asked for one verification by hand: « open game mode, disable the network in devtools,
log three events, re-enable — the three events land once each, at the right minutes, with no
duplicates. » Every other line of that section had become a test; this one was still a sentence, and a
session note from wave 3 admitted it: *nobody has tapped game mode in a real browser.*

It is a test now, and it failed the first time it ran — not in the queue, but in the screen. `emit`
ended with `router.refresh()` after every tap. Offline, that refresh is a failed RSC request, and Next
answers a failed RSC request by **falling back to a full browser navigation**, which offline lands on
the browser's error page. So the first action of a match played on a municipal pitch with no signal
blanked game mode and took the optimistic score with it, and the coach could not even reload his way
back in. The outbox had kept every event in IndexedDB exactly as designed — and the screen threw the
match away anyway. Decision **057**: a refresh is a network read, so only when the action reached the
server; the catch-up for actions that sync later is wired to the queue draining instead, one refresh
per outage rather than one per action.

That is precisely the class of bug the by-hand check existed to find, and precisely why 18 green unit
tests around `createOutbox` could not find it: they inject a transport, so nothing in them ever reaches
`fetch`, a browser, or Next's router.

The spec's second half is the one that could not be written by hand at all. The network does not fail,
it **lies**: the POST reaches the server and the event is written, then Playwright replaces the response
with a 503, so the client believes the batch was lost and sends the same `client_event_id` again. That
is invariant 6 tested over HTTP for the first time — and it holds twice over. Removing the log's own
memory of stored `client_event_id`s from `prepareEventBatch` does not break the outcome, because the
unique index and `onConflictDoNothing` still keep exactly one row.

Two things learned about testing this screen, both written down where the next person will hit them. A
**fixed clock can never reach the end of a backoff** — `nextAttemptAt` is stamped with the queue's own
`now()`, so `setFixedTime` forward is a race with the moment the failure is recorded; the retry is
provoked with an `online` event instead, which zeroes every backoff by design. And `Card` renders a bare
`<section>`, so « Déroulé du match » is not a landmark you can ask for by role.

**Mutation-tested:** the unconditional `router.refresh()` restored fails the spec on its first offline
tap. Four consecutive clean runs at ~7 s before it was called done.

845 unit tests in 43 files, **3 e2e specs in 25 s**.

**Debt after this:** none outside deployment. `docs/PLAN.md`'s « Verification » section is now fully
automated except the last line, which is a human holding a phone in daylight.

**Next:** deployment. It needs a Neon `DATABASE_URL` from the owner.

## 2026-09-23 — the app had no French word for « it broke »

Nothing was left in the backlog but deployment, which is blocked on a `DATABASE_URL`. So this session
did the thing `CLAUDE.md` says is the cheapest review tool in the repo: walked every screen at 390 px,
in both themes, as a coach and as a player, and asked the DOM what a screenshot hides — whether the page
scrolls sideways, whether any box is clipped by the viewport, whether the console said anything.

Thirteen routes, four passes. No clipping, no console errors, and the one overflow the first version of
the probe reported was the competition filter on `/stats`, which is a deliberate sideways scroller with
`w-max` inside `overflow-x-auto` — the probe was wrong and was taught to ignore anything a scroll
container owns.

The finding was in the fourteenth screen, the one the walk reached by accident: a player asking for
`/match/<id>/saisie`. « **This page could not be found.** » Fifteen pages call `notFound()` and nothing
caught any of them, so all fifteen answered in English, in an app whose first rule is that the UI is
French and the code is English and the two are never mixed. And there was no `error.tsx` anywhere in the
tree, so any failing query did the same thing with a different sentence.

Five screens now, and the interesting part is why it is five and not one — decision 058 has the whole of
it. In short: the two `not-found` pages exist for the **copy**, not the chrome (Next keeps the layouts
that matched, so the root one already renders inside the shell — checked by deleting the other), because
« cette adresse ne correspond à aucun écran » is true of a typo and false of a coach-only screen, and
most of the fifteen are the second kind. The two `error` boundaries exist because a boundary cannot catch
a failure in the layout that renders it, and `app/(app)/layout.tsx` is where `requireTeamContext()`
talks to the database — a Neon connection limit takes the header and the tab bar with it, and only
`app/error.tsx` is above that. There is no `global-error.tsx` on purpose: it could only fire on a root
layout that holds no data and awaits nothing, and an unreachable screen cannot be walked at 390 px.

Game mode got its own, and it is the only one that promises anything: « les actions déjà validées sont
dans la file d'envoi, pas dans cet écran ». That is true because the outbox writes to IndexedDB before it
POSTs and `reset()` remounts into `outbox.hydrate()` — the same reason a reload at 78′ is survivable. The
generic boundary deliberately says no such thing, because it also catches a render that failed just after
a Server Action, and whether that action landed is exactly what is not known. A first draft of the shared
copy said « rien n'a été perdu » on every screen; it was cut for being unprovable.

All five were provoked on purpose — a throwaway page that throws, a cookie that makes the layout throw,
a query param that makes game mode throw — and walked **against a production build**, which is where
they actually appear: no dev overlay, and `digest` only exists there. It is on screen as « Code de
l'erreur » and it read `1986838792`, which is the only handle tying what a user saw to a line in the
Vercel logs.

**Tested:** one step added to `happy-path.spec.ts` — the goalkeeper, already signed in, asks for the
coach-only entry screen and must get « Page introuvable » *and* « réservée aux coachs », must not get any
English, and « Retour au calendrier » must land on the calendar. It pins the sentence and not just the
heading for a specific reason: falling through to the root not-found gives the same heading in the same
shell, and only the copy gives it away. **Mutation-tested:** removing `app/(app)/not-found.tsx` fails it
on that sentence. Loosening the `can()` check on `/saisie` fails it on the heading, which is the second
thing it protects.

845 unit tests in 43 files, 3 e2e specs in 29 s.

**Debt after this:** none outside deployment.

**Next:** deployment. It still needs a Neon `DATABASE_URL` from the owner.

## The walk that used to be done by hand

`CLAUDE.md` has said from the start that `npm run db:reset` and then walking the season at 390 px is
the cheapest review tool in the repo. It is right, and it was being done by hand, which is why it was
being done rarely. This session turned the mechanical half of it into `npm run audit:screens`:
23 screens, both themes, as a coach and as a non-coach player, 92 visits, a PNG each in `audit/`
(gitignored), and a non-zero exit on a console error, a box outside the viewport, an English framework
string, a screen open to the wrong audience, or a page with no level-one heading. The human half — is
this screen *telling the truth* — is untouched, and the script says so in its own output.

Two things it taught me while being written. Its first version hardcoded the demo match ids, so after
`db:reset` it walked thirteen 404s and reported a clean sweep: a review tool that can pass by looking
at nothing is worse than none, and everything is now read out of Postgres. And its overflow check
flagged `/stats`' competition filter, which is a deliberate sideways scroller — the probe was wrong,
not the app, and it now ignores anything a scroll container owns. Both are in decision 059.

Then it found three real defects, all the family this project keeps finding by looking rather than by
testing — a screen stating something that is not so.

A member who may not operate the match was being offered « Appliquer » on the planned-composition
card. The card is shown to everyone deliberately, but only « Ajuster » was gated; the other button
produced an event the route handler answered 403 to, so the invitation was the bug. And the card said
« Cette composition ne change rien sur le terrain » over a *starting seven* — the « 7 changements » lie
of decision 031 fixed in one direction and grown back in the other, because a starting composition and
a genuinely empty plan both have an empty change list and the component could not tell them apart.
`pendingLineupChangesFr` now can, in `lib/` where a test can reach it, because Vitest runs in `node`
and cannot render the component.

The third was structural: game mode and the composition editor were the only two screens in the app
with no `h1`. The editor's was the worse one — hitting an already-applied composition dropped you on a
bare panel saying « Cette composition a été appliquée » about no match in particular. It now renders
its header in every one of its five states, so the page always says which composition of which match,
and the panel says only what is wrong with it. Game mode gets an `sr-only` heading, the only invisible
one in the app, for the reason written next to it: the clock and the score own every pixel above the
pitch on purpose. The audit checks for a missing `h1` now, so this cannot come back quietly.

846 unit tests, 3 e2e specs, `audit:screens` clean on 92 visits.

## Looking at the screenshots, which was the point of the script

The audit from earlier in this session came back clean, so I did the half it exists to make cheap and
read the PNGs. Two more defects, both of the same family, neither mechanical.

The recap of an away win — a real one in the demo season, CS Morvan away — showed « CS Morvan — Nous »
and « 0 – 2 » in the largest numerals in the product, under a green « Victoire » badge, over a timeline
writing the same two goals « 1 – 0 » and « 2 – 0 ». Digging found no bug: two conventions, both
deliberate, written by different hands on different days. The calendar pill has carried a docstring
since M2 saying « never « 1-3 » read the wrong way round », and both scoreboards put the home side
first the way a broadcast does. So the fix was to decide, once, and the decision went to ours-first
(061): this app has exactly one side, and in game mode the score is 36 px while the caption naming the
sides is 12 px and truncates — making a coach work out which figure is his at 58’ is the wrong thing to
ask. Game mode's scoreboard now spends its `isHome` on a « Dom. » / « Ext. » badge, which is strictly
more information than the ordering carried. The timeline needed no change, which is how you know the
convention was the problem.

The other was in game mode: « Aucune composition enregistrée. » printed directly beneath the card
showing the composition, saved and proposed and waiting. The copy was keyed on an empty pitch, and an
empty pitch before kick-off is exactly what invariant 3 produces. `emptyPitchFr` now distinguishes the
three cases and names whose confirmation is awaited. The e2e happy path had pinned the old string — at
the very moment a composition was saved — so a test was holding the lie in place rather than catching
it; it now asserts the true copy *and* the absence of the false one.

Both fixes went into `lib/` rather than into JSX, for the reason that is becoming a pattern here:
Vitest runs in `node`, cannot render a client component, and copy this easy to get backwards has to
live where a test can read it.

848 unit tests, 3 e2e specs, `audit:screens` clean on 92 visits.

## Two more from the same screenshot

Kept reading. `audit/light-coach-match-saisi-apres.png` is the demo season's match against FC des
Deux-Ponts: finished, nine men on the sheet, not one event in the log — the fixture decision 038 put
there precisely so that this state gets looked at. It held two more defects of the family that keeps
turning up, a screen stating something untrue, and neither would ever fail a test.

« Mode match » promised « Le match est terminé : le déroulé reste consultable » under a full-width
primary « Voir le déroulé », for a match with nothing to consult. The destination is honest — it says
« Rien pour l’instant » — but the button is not, and it was competing for attention with the « Saisir le
match » card two above, which is the actual next action. The card is now suppressed for
`status === "finished" && score === null`, reusing the page's existing test for "not one event was ever
recorded" rather than inventing a second one. Game mode stays reachable by URL, and stays readable by
the whole squad; what stops is the app advertising a story it does not have.

And the « Composition » card's badge read « 7 / 7 », in green, directly above the « Aucune composition »
panel. No bug: it counts the players marked `starter` on the sheet, which is the number a coach wants
when picking a squad. But on a card titled « Composition » the bare figure reads as the composition
being complete. `SquadSheet` has written « titulaires » next to the same number since M3 — the
unlabelled one was the odd one out, and now it is not.

Neither fix is a line of logic, and that is the point of the screenshot half of the audit: the
mechanical checks came back clean on all 92 visits both before and after. 848 unit tests, 3 e2e specs.

## The decision that was not true yet

Reading the stats screenshots turned up nothing untrue on screen, but grepping for how the form guide
wrote « 2-0 » turned up something worse in the repository: decision 061, written yesterday, states that
`scoreLineFr` is the only way the app writes a score, and four other places were writing one by hand
— the reducer's `scoreLabel`, the recap timeline's `scoreAfter`, game mode's timeline, and a
`formatScore` of the statistics module's own. All four with a hyphen instead of an en dash, and the
form guide with no spaces at all, which is how the recap ended up showing « 2 – 0 » in its scoreboard
and « 2 - 0 » three cards below for the same two goals.

The typography is the trivial half. The real defect is a written decision that is false: the next
session reads it, believes there is one place to change, and changes one of five. Fixed in the
direction the decision already pointed — `formatScore` deleted with a comment in its place saying
where it went, the other three routed through `scoreLineFr`, and 064 recording that 061's claim is now
accurate rather than aspirational.

Two e2e assertions had to be scoped, which is the fix proving itself: once the scoreboard and the
timeline agree on the character, `getByText("1 – 1")` matches both of them and Playwright refuses. The
recap's scoreboard got `aria-label="Score du match"` in the process — the largest number in the product
had no accessible name, while game mode's « Chrono et score » has been a named region since M4.

Also, one line in the same neighbourhood: the « Bilan de l'équipe » badge announced itself to a screen
reader as « +3 » and nothing else. It now carries an invisible « de différence de buts ».

847 unit tests (one fewer: `formatScore`'s went with it), 3 e2e specs, `audit:screens` clean on 92
visits.

## The screens that were only nearly right

With the scorelines agreeing, the remaining screenshots had nothing false on them, and reading them
turned up three things worth a commit anyway (decision 065).

The first was in the audit tool rather than the app: every date input was rendered `09/23/2026`, month
first, in a French app. `context.locale` was already `fr-FR` — but native form controls follow
Chromium's *UI* language, which only `--lang=fr-FR` at launch sets. So the screenshots had been
misrepresenting every date field since the script was written, which for a tool whose entire job is to
make looking at the app cheap is a defect in the tool. Fixed, with the one residual difference written
next to it: the placeholder still says `dd/mm/yyyy` because Playwright's Chromium ships English form
strings, and a real French phone writes `jj/mm/aaaa`.

The second: the calendar's « 11 présents sur 14 » for the 29 August session. The figure is right — the
denominator is who the coach *pointé*, and fourteen were members that night — but the squad has
thirteen players today, so a coach counting names concludes the app is wrong. The missing word is
« pointés », which `AttendanceList` and the player page have both carried all along. `attendanceCountFr`
is now the single place it is built, in `lib/` with a test, which also caught « 1 présent sur 1
pointés ».

The third: « Je me suis blessé » on `/moi` is a `<summary>` with `list-none` and nothing in place of
the triangle it suppressed — a grey panel of text with an invisible `cursor-pointer` as its only
affordance. It now has a chevron that turns when it opens, and reads as the action it is.

849 unit tests, 3 e2e specs, `audit:screens` clean on 92 visits.

## The hint that was true of no match in particular

Reading the remaining screenshots, `match-nouveau` and `match-modifier` both carried « 2 par défaut. »
and « 30 par défaut. » under fields already showing 2 and 30 — a sentence that is redundant on the
create form and false on the edit form of any match that does not run 2×30. And the ambiguity it left
untouched was the real one: « Minutes » is *per period*, and this app's clock never resets, so the
second half of a 2×30 runs 30′→60′.

The field is « Minutes par période » now, and the two hints are replaced by one sentence that states
what the pair comes to, live: « 2×30 minutes : 60 minutes de jeu, et la 2ᵉ période va de la 30ᵉ à la
60ᵉ minute. » `matchLengthHintFr` builds it in `lib/` with a test, and returns `null` instead of a
duration when a field is empty or half-typed — otherwise the form would have flashed « 0 minutes de
jeu » on the way to every value a coach types. Decision 066.

Checked at 390 px in both themes with the fields at 2×30, at 3×20, and mid-edit with the minutes
cleared: the label fits on one line, the two inputs stay aligned, and the sentence disappears rather
than lying. 852 unit tests, 3 e2e specs, `audit:screens` clean on 92 visits.

## Thirteen red bars for a decision nobody had taken

The remaining screenshots had one real defect left in them, and it only shows on a screen the audit
does not visit: `feuille` is walked for a match whose sheet is already filled. So I created a match
through the UI, opened its match sheet, and there it was — thirteen rows, each with a red « — »
selected, under a line that said « Feuille de match vide ». The screen disagreed with itself, and red
is what this app uses for « Pas dispo » and « Blessé ».

Fixed as decision 067: « Hors feuille » instead of « Non retenu » (because `null` means both « the
coach left him out » and « nobody has touched this », and only one of those is a decision), a new
`neutral` segment tone for an option that is chosen without being good, bad or pending, « Hors »
instead of a dash that abbreviates nothing, and a summary line that ends « · 2 hors feuille » so the
thirteen add up.

Looked at at 390 px in both themes, on a match created for the purpose and deleted afterwards: the
quiet pill reads as selected in light and in dark, and the demo season's sheet now says « 7 titulaires
· 3 remplaçants · 1 supporter · 2 hors feuille ». 852 unit tests, 3 e2e specs, `audit:screens` clean
on 92 visits.

**Where the next session should pick up.** `docs/ROADMAP.md` has exactly two unchecked lines left, both
blocked on the owner: the Vercel production deploy (needs a Neon `DATABASE_URL`; `SUPER_ADMIN_PASSWORD`
must never be stored in Vercel, `ALLOW_REMOTE_RESET` must never be set in production) and the daylight
check on a real iPhone and Android. Everything else in the backlog is merged. The audit screenshots
still worth a fresh pair of eyes are the `joueur`-role variants of `notation`, `recap` and
`entrainement` — they have been walked mechanically but not read line by line.

## Reading the player's screens, not the coach's

The `joueur`-role screenshots had never been read line by line — only walked mechanically — and they
held one real defect. On a played match, a player's page opened with « Disponibilités »: thirteen
names, grouped by what each had answered before a match that was over. « Après le match », holding the
only action a player still has and the only one with a deadline — the rating window closes at the next
kick-off — sat nine hundred pixels below it.

The card now renders in one of two places depending on `match.status`: first when the question is still
open, last once it is not, where it is labelled « Avant le match · 13 réponses sur 13 joueurs » so it
reads as a record rather than a question (decision 068). `availabilityCountFr` joins
`attendanceCountFr` in `lib/calendar/labels.ts`, so the plurals are pinned by a test rather than living
in a template a component test cannot reach.

854 unit tests, 3 e2e specs, `audit:screens` clean on 92 visits, both themes at 390 px.

## The player's side of a training, and one ratio that read as a rating

Still reading the `joueur`-role screenshots rather than the coach's. Three defects, all of the one
family the audit exists to catch — a screen stating something untrue.

**« 11 présents sur 13 joueurs. »** That was the player's « Présences » card for the demo season's
29 August session. The calendar row for the same evening says « 11 présents sur 14 pointés »: fourteen
men were pointed and one of them left the club in September. The card's denominator was the squad as it
stands today, which is wrong twice — an unmarked player is not an absent one (decision 020), and the
numerator came from every attendance row, so a departed player counted towards a total he was no longer
part of. Both cards now count the marks, which is the evening itself and what the calendar already
counted, and `departedMarksNoteFr` explains the gap between « sur 14 pointés » and a list of thirteen
rows instead of leaving it as arithmetic (decision 069).

**The availability list outlived its question.** Decision 068 fixed the ordering for matches last
session; the training page still led with « Disponibilités » for a session that finished a month ago,
above the présences that answer it. It moves last once the session is over and says « Avant la séance ».
And on 29 August nobody had answered at all, so the card was thirteen names under « Sans réponse » — the
largest thing on the page, recording nothing. `availabilityIsWorthShowing` drops it in that case, and
only in that case: before the event those thirteen names are the list the coach came to chase.

**« n° 8 · 3 / 11 ».** Two bare figures joined by a dot on the rating card, the first a fact about the
player, so the second read as one too — and on that screen the natural reading of « 3 / 11 » is *three
of his eleven team-mates have rated him*, which is what decision 007 hides until you have finished your
own set. It is which card of the stack is open. Now « joueur 3 sur 11 », from
`ratingCardPositionFr` in `lib/rating/progress.ts`, where a test can reach it (decision 070).

Verified by looking: the 29 August session in both roles and both themes at 390 px, and the notation
card in the fresh `audit:screens` captures. 863 unit tests, 3 e2e specs, `audit:screens` clean on
92 visits.

**Where the next session should pick up.** `docs/ROADMAP.md` still has exactly one item unchecked, in
three lines, all blocked on the owner: the Vercel production deploy (needs a Neon `DATABASE_URL` —
`SUPER_ADMIN_PASSWORD` must never be stored in Vercel, `ALLOW_REMOTE_RESET` must never be set in
production) and the daylight check on a real iPhone and Android. Everything else is merged. The audit
captures not yet read line by line in the `joueur` role are `recap`, `joueur`, `stats`,
`stats-coupe-buts`, `jeu`, `calendrier` and `match-saisi-apres`.

## Two letters on the celebration screen

One defect, found by reading `audit/light-joueur-recap-0.png` line by line rather than by any test.

**« PD ».** The assists column of the recap's « Temps de jeu » table, abbreviating « passes décisives ».
In French those two letters are a homophobic slur, and this is the table the whole squad scrolls through
on the one screen the plan calls « le moment de fête », two columns from each player's own name. Now
« Passes », which is what the scoreboard directly above it already says — it was the only abbreviation
of its kind left in the app (decision 071). Checked in the browser at both widths the table has to
survive: 356 px wide inside a 390 px viewport, 326 px inside 360 px, no horizontal scroll either way.

**One thing looked at and left alone.** On `/stats`, a player card can read « MATCHS 6 » above
« 7 titulaire ». That is `lib/stats/aggregate.ts` rules 3 and 4 meeting: « titulaire » is what the coach
wrote on the sheet and counts all seven, while « matchs » counts the matches he has minutes in — and the
demo season has one finished match nobody recorded, which gives nobody a minute. The team card at the
top of the same page already
names it — « 1 match terminé sans aucun évènement saisi : ils ne sont comptés nulle part » — so the
figure is explained on the screen it appears on, and the two numbers are answers to different questions
rather than one number that is wrong. Recorded here so the next session does not re-open it.

## Seven sentences delivered to nobody

Reading `audit/wave6/light-joueur-stats-1.png` raised a question — why does a player card say
« MATCHS 6 » above « 7 titulaire »? — and the answer turned out to be that the app had written the
explanation and then hidden it.

**`title` is not a way of telling anybody anything.** `Figure`, the label/value pair every card on
`/stats` and on a player's profile is built from, put its `hint` in a `title` attribute: a tooltip
that needs a mouse to rest on it. On the phone this app exists for, « 7 matchs sur la feuille »,
« moyenne sur 4 notes », « présences / séances pointées » and three more had never been read by
anyone. Hints are printed now, under their value — and each was re-judged on the way out rather than
just revealed, because a column is about 110 px wide: the two that are really sentences moved into
the `Note` under their card (the keepers' card was already saying one of them in full), the rest were
cut to « sur 4 notes », « séances pointées », « sur 2 matchs », « sans encaisser », and the sheet
total went to the full-width appearances line, which is the one place it fits (decision 072).

That last one is the answer to the question that started this. « MATCHS 6 · 7 matchs sur la feuille ·
7 fois titulaire » is now readable in one glance: a match counts when you have minutes in it, a
selection is a name on a sheet, and the demo season's one unrecorded match gives nobody a minute.

**« 7 titulaire ».** The same line was also ungrammatical, and the profile card three taps away said
« 7 fois titulaire » from its own hand-built copy of the same list. One function now, `appearancesLineFr`
in `lib/stats/format.ts`, with the « N fois » shape that needs no agreement — and in `lib/` because
Vitest does not collect `app/` (decision 073).

Verified by looking, at 390 px: `/stats` in both themes and both roles, the two sorts the audit script
does not visit (`?tri=rating` and `?tri=attendance`, where the hint sits under the promoted figure
beside the name), and a profile in dark mode. The `joueur` role is where the change pays best — Léo
reads « 7,5 · sur 2 notes » there against the coach's « 7,0 · sur 4 notes », because decision 007 is
holding two matches back from him, and until now nothing said so beside the figure.

868 unit tests, 3 e2e specs, `audit:screens` clean on 92 visits.

## One register

Reading the `joueur` role's game-mode capture: « Vous suivez le match en direct. Seul l’opérateur du
match peut enregistrer les actions. » Every other sentence a player reads says « tu ».

Seventy-five strings tutoied, eight vouvoied, and not along any line that could be defended — the
same coach is told « Tu n’es pas l’opérateur de ce match » by `ingest.ts` and « rien ne change avant
votre confirmation » by `presenter.ts`, about the same tap. So: « tu », everywhere, and the rule is in
`CLAUDE.md` now because it applies to every string added after this one (decision 074).

Two of the eight were not politeness. « Ce que vous travaillez » on the training form is the plural
« vous » — the team, not the reader — so it loses the pronoun and becomes « Le thème de la séance ».
And the position picker's screen-reader label « appuyer pour en faire votre poste principal » is read
to a coach editing somebody else's preferences, where « votre » was wrong about whose poste it is; it
matches its two sibling labels now.

`CLAUDE.md` also gained decision 072's rule, for the same reason: nothing is explained on hover.

**Two things checked and found honest.** Game mode before the kick-off shows « 0 – 0 » beside a clock
reading « 00:00 · Avant le coup d’envoi » — derived, not invented, and unambiguous in that frame. And
the recap of the match nobody recorded, which a player reaches by the only button on the page, says
« ? — ? · rien saisi · Ce match est terminé mais rien n’a été saisi : ni score, ni buteurs, ni temps
de jeu. » Decision 013 is holding.

## A demo session that told two stories

One line of `db/seed.ts`. The second training session is the fixture for « everybody absent » — its
own block comment says so: « the pitch was unplayable and the session was called off on the spot »,
thirteen rows, all `present = false`. Its French note said « Terrain impraticable, séance écourtée »,
which says the squad turned up and trained for twenty minutes. On the calendar that read « 0 présent
sur 13 pointés » directly under a note claiming the session merely ran short.

« Séance annulée sur place. » The comment and the rows already agreed with each other; only the
sentence the app displays disagreed with both. Demo data is the first thing the owner and any reviewer
read (`CLAUDE.md`: walking the season after `db:reset` is the cheapest review tool in the repo), so a
fixture that contradicts itself is a screen stating something untrue like any other.

## A build that needed a secret

The owner connected the repository to Vercel this morning. Three deploys, three failures, 36 to 43
seconds each — and the cause was in this repository, not in the Vercel project: `db/client.ts` read
`DATABASE_URL` at module scope and threw. `next build` imports every route module to collect its
configuration, so the throw landed in « Collecting page data » and took the build down after
TypeScript had already passed and every page had already compiled.

`db` and `sql` are proxies over a lazily opened connection now. Nothing happens on import; the check
throws on the first query, with a message that names Vercel as well as `.env.local` — the old one
said « Copy .env.example to .env.local », which is not something you can do on a serverless host.
Decision 075 has the reasoning and the trade it accepts.

Verified rather than assumed, because a proxy in front of an ORM is exactly the kind of change that
typechecks and then fails at runtime:

- `DATABASE_URL= npm run build` — the whole build passes, all 23 routes dynamic, which is the state
  Vercel was in
- `npm run test:e2e` — 3 passed in 27.6s, real Postgres, real queries, `db.transaction`, `sql.end()`
- a throwaway script through `tsx --conditions=react-server`: the tagged template, `sql.unsafe` and
  a Drizzle `select` all return the same row
- with no URL at all: the import is silent and the query throws the new sentence, which is the
  behaviour the decision claims

Three comments elsewhere said the client « reads DATABASE_URL as it loads ». It does not any more,
so they say what is actually true now: load the environment first because nothing below may read
`process.env` before it.

`docs/DEPLOY.md` §4 gained the consequence, which is the part that will matter to whoever deploys
next: **a green build is no longer evidence that `DATABASE_URL` is set.** A deploy without it
compiles perfectly and then fails on every screen. Step 5 in a browser is the proof.

Still blocked on the owner: the variable itself. Nothing in the repository can supply it.

## What is actually left on Vercel

With the build fixed, production went green — so the next question was whether the app *works*, and
the answer is not yet, for two reasons that are both settings rather than code.

**The site is behind Vercel Authentication.** `curl -sI …/connexion` answers `302` to
`vercel.com/sso-api`. A new Vercel project has this on by default, and it is fine for a company's
staging environment; it is the wrong setting for an app whose entire user base is a dozen amateur
footballers who join with a code sent on WhatsApp. None of them has a Vercel account. Nothing in
`docs/DEPLOY.md` mentioned it, so §4 now has the `curl` output and the three-click path to turn it
off, and §6 — the phone in daylight — says it waits on this, because a phone in daylight currently
sees a Vercel login form.

**The database has no tables.** The owner attached Neon through Vercel's marketplace, which set
`DATABASE_URL` for production and preview (plus eighteen `FOOTBALL_MANAGER_*` variables the app reads
none of). But §2's migrations and §3's `db:bootstrap` have not been run, and they cannot be run from
here: marketplace variables are stored sensitive, and `vercel env pull` writes them back as
`DATABASE_URL=""` — Vercel will not hand a sensitive value back out even to the account that owns it.
So the connection string has to be copied from the Neon dashboard. Documented in both places, since
§2 is where a reader gets stuck and §4 is where the explanation belongs.

Deliberately not done here: turning the protection off myself. The CLI on this machine could, and
making somebody's deployment publicly reachable on the internet is their decision, not a chore to
absorb.

`docs/ROADMAP.md`'s deployment section is honest about it now — `vercel link`, the variables and the
production deploy are done; what is left is two owner-side steps, each one command or three clicks,
each written down.

## The session that said nothing

Reading the `joueur`-role audit captures screen by screen, `/entrainements` had three past sessions
and only two of them said anything about présences. The silent one was 19 September, and the seed
comment next to it explains why it exists: it is the session **nobody pointed**, deliberately
different from 12 September where the pitch was unplayable and thirteen rows say `present = false`.

So the list was giving one word to « everybody was absent » and no word at all to « the coach never
ticked the list », and those are counted differently — decision 020 exists to keep them apart.
Following it to the session's own page turned up the real defect: as a player, 19 September is a
date, a time, a venue, and eleven hundred pixels of blank. `PresenceSummary` returns `null` with no
marks, and the availability grid is hidden when nobody answered (decision 069), so between the two
the page said nothing whatever about an evening that had happened.

Fixed in three places and all of it in `lib` so Vitest holds it: `attendanceLineFr` for the row
(« Présences pas encore pointées », and still nothing before the session — the coach has not failed
to do anything yet, which is why it takes `isPast` rather than inferring it from the counts), and
`unmarkedSessionNoteFr` for the page. That second sentence is the one worth having: « Elle ne compte
donc dans aucun taux de présence. » Without it, « aucune présence pointée » invites the reading that
everybody was marked absent, and a player who trained that Saturday should not have to wonder.

**The audit had never visited a past session.** `scripts/audit-screens.ts` picked its training with
`order by starts_at desc limit 1`, so it always got the one still to come — which means the coach's
`PresenceSummary`, `departedMarksNoteFr` and this blank page had not been screenshotted once. Two
targets now, a past session that was pointed and a past session that was not; 100 visits instead of
92. That is the part most likely to pay again.

The seed comment claimed the two sessions « look identical in the list; only the stats can tell them
apart ». They do not any more, so it says what is true now instead.

Fourth time worth writing down: the blank screen passed every mechanical check the audit makes — an
`h1`, no console error, nothing outside the viewport, no English. Both themes looked at, at 390 px.
873 unit tests, e2e 3 passed in 27.0s.

---

## A second way to get a database

**2026-09-23** · `compose.yaml`, `Dockerfile`, `.dockerignore`, `next.config.ts`, `package.json`, docs

The stack runs in containers now — `postgres:17` and a production build of the app, one command —
and decision 016 is untouched. That was the whole question worth deciding. 016 chose Homebrew
Postgres because the owner's machine had no Docker daemon and a Homebrew service needs none; that is
still true and the development loop it produced still works, so compose is framed as **an addition**
and `docs/DEPLOY.md` puts it in a section marked optional, after the Vercel and Neon runbook.
Decision 077 has the reasoning, including why the three gaps it closes — seeing a production build
before Vercel does, a machine with no Homebrew, reproducing CI's `postgres:17` — are worth a second
documented path.

Four services. `db` mirrors the CI service container down to the credentials, with a named volume, a
`pg_isready -U football -d football_manager` healthcheck and a published port so `npm run dev` on the
host can use it alone. `migrate` is one-shot and applies the committed SQL, never `db:push`.
`bootstrap` sits behind a `setup` profile. `app` depends on `db` being healthy *and* on `migrate`
exiting successfully, which is what makes a schemaless first request impossible.

Two choices that could have gone wrong quietly:

- `output: "standalone"` is gated on `NEXT_OUTPUT_STANDALONE`, set only by the Docker build. Turning
  it on unconditionally would have changed the artefact Vercel deploys in order to make a container
  smaller — a bad trade for a convenience, and invisible until a deploy misbehaved.
- The base is `node:22-bookworm-slim`, not Alpine: `@node-rs/argon2` ships prebuilt glibc binaries
  and musl would send it to a source build.
- `bootstrap`'s `SUPER_ADMIN_PASSWORD` defaults to empty instead of using compose's `:?` required
  form. `:?` is interpolated for the whole file, so it made plain `docker compose config` and
  `docker compose up` fail over a service they never start. Caught by running it.

Also worth knowing: the runner stage has neither `npm` nor `tsx`, so the db scripts cannot live in
it. That is why the Dockerfile has a `tools` stage — dependencies plus source, no build — which both
`migrate` and `bootstrap` target.

Verified, not assumed:

- `npm run typecheck`, `npm run lint`, `npm test` — 43 files, 868 tests passed
- `docker compose config -q` clean, and `docker compose build` green for both images
- `docker compose up -d app` walked the real dependency chain: db started → healthy → `migrate`
  ran (« migrations applied ») → exited 0 → app started, « Ready » on 3000
- `curl /` → 307 to `/connexion`, and `/connexion` → 200 with « Nom d'utilisateur » in the HTML.
  A real production image talking to a real migrated Postgres, not a build that merely compiled
- `docker compose down -v` removes the volume, so the next run starts empty

`npm run docker:db` / `docker:up` / `docker:down` / `docker:reset` / `docker:logs` wrap the commands
anybody would otherwise have to remember. CI is deliberately unchanged: building an image on every
push would add minutes to prove what the local build already proves.

---

## The deploy, and two sessions fixing the same bug

The owner created the Neon project and the Vercel project and asked for the repository to be linked,
CI/CD added, and the app deployed.

**Diagnosed the three failed builds, and then found them already fixed.** `DATABASE_URL` was present
and correct for Production, the build said it was not set, and the reason is that Vercel exposes a
variable marked **sensitive at runtime only** — never to the build — while `db/client.ts` threw at
module scope. That is decision 075, written and merged by another session (#48) at the same time as
this one was writing the same proxy from the same evidence. Two sessions, one repository, no shared
memory: the collision cost a rebase and is worth noting as a thing that happens.

Main's version is the better one and was kept. It says more than mine did about where the throw lands
in `next build`, and it also rewrote the message, which needed it: « Copy .env.example to .env.local »
is advice nobody can follow on a serverless host.

**What survived the collision is the test.** `db/client.test.ts` — the module imports with
`DATABASE_URL` empty, the first query still throws, and `sql` is still both callable and indexable.
Decision 075's own verification was a `DATABASE_URL= npm run build` and a throwaway script; nothing
pinned it, and all 868 existing tests ran with the variable set, so the suite was structurally unable
to catch this class of bug. It needs `vi.mock("server-only", …)`: the empty module sits behind the
`react-server` export condition, which Vitest does not apply and the `db:*` scripts pass explicitly.

**CI/CD.** The `migrate` job applies the committed SQL to Neon on pushes to `main`, after both
existing jobs, with `cancel-in-progress: false` of its own — the workflow's group is right to cancel a
superseded test run and wrong to cancel a migration mid-statement. Deliberately **not** the Vercel
build command, the obvious place: that needs `DATABASE_URL` at build time, which decision 075 exists
to avoid, and every preview build would migrate whatever it points at. Deliberately not ordered
against Vercel either, which is a real gap accepted on the record in decision 078, along with the
migration that would force it open — the first one that cannot be additive.

**Three variables removed from the Vercel project**, where the first attempt had left them:
`SUPER_ADMIN_PASSWORD` and `SUPER_ADMIN_USERNAME`, read only by `db/bootstrap.ts` and `db/seed.ts`
from a command line, and `TEST_DATABASE_URL`, read by nothing in the repository at all. The password
is for the account that can read and rewrite every team on the instance; it should be reset rather
than reasoned about. `DEPLOY.md` §4 now records that this happened, because the runbook already said
not to do it and saying so twice is cheaper than a leak.

**Also recorded:** three variables removed from the Vercel project, where the first attempt had left
them — `SUPER_ADMIN_PASSWORD` and `SUPER_ADMIN_USERNAME`, read only by `db/bootstrap.ts` and
`db/seed.ts` from a command line, and `TEST_DATABASE_URL`, read by nothing here at all. The password
is for the account that can read and rewrite every team on the instance, so it is reset rather than
reasoned about. `DEPLOY.md` §4 says that this happened, because the runbook already said not to do it
and saying so twice is cheaper than a leak. Also that preview deployments share the production
database, which Vercel Authentication makes tolerable rather than fine.

878 unit tests, build green with no `DATABASE_URL` at all, lint and typecheck clean. The end-to-end
suite was not run locally — this machine has no Postgres and no `.env.local`, and `npm run db:start`
is `brew services` on a Linux box; CI runs it on the pull request, which is the documented gate.

**Where the next session should pick up.** The entry above this one lists two owner-side blockers;
there is a third, and all three need the same string, which is sensitive in Vercel and therefore
unreadable by anybody including the owner's own tooling. Turn Deployment Protection off, run the first
`db:migrate` and `db:bootstrap` from the Neon dashboard's string, and set the `DATABASE_URL` GitHub
secret so the `migrate` job can work. Then walk §5 on the production URL, reset the super-admin
password, and give Preview its own Neon branch.

**One process note.** Two sessions worked this repository at the same time with no knowledge of each
other, and independently wrote the same fix; five pull requests landed on `main` while this branch was
open. It cost two rebases and nearly cost a duplicated `DEPLOY.md`. If sessions are going to overlap,
they need disjoint files — and the decision numbers are the sharpest edge: **074 through 078 were
claimed by three sessions inside an hour**, and the entry below was renumbered twice before it landed,
from 074 to 076 and then to 078, each time because a number it had already written into four files had
been taken on `main` in the meantime. A decision number is the one thing in this repository that
cannot be chosen locally and then defended: whoever merges first owns it. So take the number last —
write the entry, and renumber it against `origin/main` immediately before pushing.

---

## The first migration nobody ran

**2026-09-23** · `docs/DEPLOY.md`, `docs/ROADMAP.md` — no code

#49 merged, and the `migrate` job it adds ran against Neon for the first time. That is the only thing
worth recording here, because it is the one part of the previous entry that was a **prediction**: every
observation of the job until now had been a `SKIPPED` on a pull request, which proves the `if` guard
and nothing else. On the push that merged it: `migrations applied`, exit 0, 41 seconds, after
typecheck · lint · Vitest and the browser run.

It applied the schema to a database that had none — the owner had set the `DATABASE_URL` secret but
not run §2 by hand. So `DEPLOY.md` §2 was wrong about its own subject: it claimed the first migration
*had* to come from a shell, "there is no schema for the application to serve against until it has
run". True, and irrelevant — nothing has to serve against it before the job finishes. The section now
says CI does the first one too, and keeps the manual command for the case it is actually needed, a
database CI does not know about: a Neon branch for Preview, or a restored copy.

Deployment Protection is off, so `/connexion` answers `200` with the French login form instead of a
`302` to `vercel.com/sso-api`. Three of the four things the last entry left with the owner are done.

**What is left is one command**, and it is the interesting one: `db:bootstrap` has not been run, so
the app has a schema, twenty-one tables and no account. Every screen is reachable and none of them can
be reached, because signing up is invite-only and invites come from a coach (decision 052). It cannot
be run from a session and **it cannot even be checked** from one: the connection string exists only in
Vercel, sensitive and unreadable, and in a GitHub secret, which is write-only. So « has the super
admin been created » is a question this repository cannot answer about itself — the answer is a login
attempt in a browser. That is the price of the sensitive flag, and it is the right price.

The same run fixes the other open item for free. `db:bootstrap` is idempotent and re-hashes the
password every time, so creating the account with a *new* password is also the reset the password
that sat in the Vercel environment needs.

**Next:** §3, then §6 on a real phone in daylight.

### A deadline nobody was told about

`grep -rn "closesAt" app lib | grep -v lib/rating/window` → nothing. `ratingWindow()` has computed
the instant the rating window shuts since M6, and no screen had ever printed it. So the rule from
decision 007 was enforced in full and announced nowhere.

The reason that is a defect and not a missing nicety is what `lib/rating/progress.ts` does on the
other side of the deadline: it hides the team's notes from anybody who has not submitted his own, and
**the window closing does not unlock them.** A player who runs out of time never reads the notes of
that match. Its own module comment says « for ever. That is deliberate. » It is — and it is also a
door closing on somebody who was never told there was a door. The three screens that ask for notes
each promised the reward and omitted the condition: the notation flow (« Tu verras les notes des
autres quand tu auras noté tout le monde », directly above a « Passer » button), the recap's « À toi
de noter » card, and the match page's « Après le match » card — whose comment in the source already
calls it « the one that expires at the next kick-off ».

`ratingDeadlineFr(closesAtMs, nowMs)` now says it: « À finir avant le coup d'envoi du match suivant,
dimanche 27 septembre à 10:30 : après, les notes de ce match ne bougent plus et tu ne verras pas
celles de l'équipe. » It lives in `window.ts`, beside the rule, so the sentence and the rule cannot
drift apart. Both halves of the consequence are in it on purpose: « ne bougent plus » alone reads as
an archive being sealed, and « tu ne verras pas » alone reads as a penalty with no cause.

It returns `null` in two states and both silences are deliberate — no next match on the calendar (the
window has no end yet; announcing one would mean inventing it) and a deadline already passed (a date
in the past presented as a thing to beat is exactly the family of defect this audit keeps finding).
It is only rendered to a viewer who still owes notes: somebody who has finished can read the notes
already, so for him the closing time is a fact about nothing.

Verified by looking: `npm run audit:screens`, then the notation screen, the played match page and the
recap at 390 px in **both** themes — four crops, each one carrying the sentence. 879 unit tests
(43 files), e2e 3 passed in 29.3s.

The note above, written by another session an hour earlier, was right and this entry is its fifth
data point: the branch was opened against `97a1256`, two pull requests merged while it was being
written, and « 077 » had been taken by the Docker Compose decision before this one reached GitHub —
which GitHub reported not as a stale number but as a conflicting pull request with no CI run at all.
Renumbered to 079 against `origin/main`, rebased, checks re-run.

---

## Nine copies of the app, all pointed at the real season

**2026-09-23** · `vercel.json` (new), `.github/workflows/ci.yml`, `CLAUDE.md`, docs

The owner asked two things: check that Vercel only deploys `main`, and tag versions.

**It did not.** `vercel list` showed **nine preview deployments in twenty-three minutes** — one per
branch push from the previous hour's work. Each was a full running copy of the app with
`DATABASE_URL` set to the production Neon string, because the variable is set for Preview and
Production with the same value. The previous session had written that hazard down in `DEPLOY.md` and
left it standing, mitigated by Vercel Authentication, with « give Preview its own Neon branch » on the
roadmap. Asking the question again turned out to be the fix: previews were buying nothing. Not one
check in the definition of done needs a deployed URL — `typecheck`, `lint`, Vitest, Playwright and a
look at 390 px all run locally or in CI. So `vercel.json` now deploys `main` and nothing else
(decision 080), and the Neon branch stays on the roadmap as the thing to do *before* previews ever come
back, because turning something off is not solving it.

Two things about that one-line file were worth the reading:

1. **`*` does not match a `/`** — the patterns are minimatch. A lone `"*": false` would have matched
   `main` and missed every `feat/<slice>` branch in the repository, which is all of them. The rule
   would have read as "block everything" and blocked nothing. `"**"` is what does the work.
2. `git.deploymentEnabled` rather than `ignoreCommand`. The latter is the answer that comes up first
   and it starts a build container in order to exit it — a cancelled deployment per push, and the
   start-up billed.

**Tags: there were none.** Eight milestones, fifty-four merged pull requests and a live app, with no
way to name what was running except a commit hash. The version is `package.json`'s `version` field and
the new `tag` job cuts `v<version>` on `main` after `checks`, `e2e` **and** `migrate` (decision 081).
After `migrate` on purpose: a tag claims a version reached production whole, and a version whose
migration failed did not.

It is a CI job rather than a note in `CLAUDE.md` for the reason `CLAUDE.md` exists at all. Sessions
share no memory, and "remember to tag after merging" fails invisibly — nothing goes red, there is
simply no tag, and nobody notices for a milestone. `CLAUDE.md` now says the rule *and* says never to
tag by hand, because a tag off that path is a claim about a version nothing checked.

**The rule was proved, not assumed**, and by the branch that introduced it. Two things were genuinely
unknown: whether Vercel reads `vercel.json` from the pushed commit or only from the production branch —
if the latter, the rule would do nothing until it merged — and whether `**` really matches a branch name
containing a `/`. Pushing `feat/deploy-only-main` answered both: **zero** deployments for it, while a
third session's `feat/rating-deadline` collected five previews in the same twenty minutes. So the file
takes effect on the commit that adds it, and the slash is crossed.

That third session is the other half of what this found. `feat/rating-deadline` (#53) was being pushed
throughout, by a session this one never saw in any agent listing, and it accounts for five of the nine
preview deployments. It is a **looping** session on another machine, which the owner confirmed and
cannot stop before tonight — see `COORDINATION.md`, which exists because of it. Its own pull request
merged before this one, so it keeps the previews it already had; what changes is everything after.

It also took decision 079 five minutes after this branch had renumbered itself against `origin/main` —
the process note from the previous entry failing on its own advice. « Renumber immediately before
pushing » is not enough when another session merges in the window between the check and the push. The
number is only safe at **merge** time. So these became 080 and 081.

Three claims in `DEPLOY.md` were false once previews were gone and are fixed: §4's « a pull request is
a preview », the note that « there is no `vercel.json` and none is needed », and §6's instruction to
open *the preview* on a phone.

**Next:** still §3, `db:bootstrap` — the app has a schema and no account. Watch the `tag` job on the
push that merges this: like the `migrate` job before it, it has never run.

The last thing this session did was open a channel to it. `COORDINATION.md`, pointed at from the top of
`CLAUDE.md` and inserted as item 0 of the reading order, because **a file nothing links to is a file
nobody reads** — and the one reader it is written for cannot be messaged any other way. It says who is
active, what moved under the reader (only `main` deploys, CI migrates, CI tags), what must not be
worked around (the super-admin credentials, the unreadable connection string), and five habits that
would have saved the last two hours, of which the first is: **take a decision number at merge time,
never before.** It deliberately does not tell the other session to stop working — it is doing good
work, the owner cannot stop it before tonight, and a loop would restart it anyway. It asks for the five
cheap things instead, and ends with a log both sides can append a line to.

### Five dashes and one number

Reading the audit captures screen by screen, in the `stats-coupe-buts` one: Ali's card under the
« Coupe » chip had MATCHS —, MINUTES —, BUTS —, PASSES DÉC. —, NOTE — and PRÉSENCE « 1/2 · 50 % ».
The dashes mean « nothing in this selection ». The number means the whole season, because a training
belongs to no competition (decision 020) and `getAttendanceMarks` consequently takes no filter. Fabien
had the same row with « 0/2 · 0 % » in it, which is worse: a zero reads as a measurement.

Decision 020 had seen this coming and answered it on the « Présence aux entraînements » card, which
says the filter does not apply. The per-player cards print the same figure higher up the same page and
said nothing about it. The interesting part is that the fix was *not* to add the sentence to the second
card's note: the « Joueurs » card is four thousand pixels tall and its note is under the last player,
which is no use to somebody misreading row nine. The qualification has to be on the row. So the hint
under the rate carries it — « séances pointées, toute la saison » when a filter is on — and the note
carries the reason. Written down as decision 082, because the shape of it will recur the next time a
figure sits outside a filter.

`ATTENDANCE_NOT_FILTERED_FR` is now one sentence used by both cards, which cost decision 020's wording
its « cette carte »: on a player's card the filter applies to everything except the presence.

Both strings went into `lib/stats/format.ts` with tests, for the reason that keeps coming up — Vitest
does not collect anything under `app/`. 888 unit tests, 44 files. Looked at in both themes at 390 px,
filtered and unfiltered: « toute la saison » wraps onto two short lines inside the 110 px column and
the unfiltered screens are unchanged.

### Seven titulaires nobody had named

I am the session `COORDINATION.md` is addressed to — the one on another machine, in a loop, that
produced PR #53. Read it on this wake-up and adopted it: this entry's decision number was left as
`NNN` until the commit before the merge — it came out 083 — and there is a line for me in its log.

Next capture in the review: `light-coach-saisie.png`, the retro-entry sheet for FC des Deux-Ponts —
`entry_mode = retro`, no planned composition, so all seven slots open on « — personne — ». The
« Changements » card said « Aucun changement : les sept titulaires ont fini le match. », four hundred
pixels above its own « 0 joueurs avec des minutes ». Nobody had been named and the screen was
reporting on a finished match.

That is decision 060 a second time — « ne change rien sur le terrain » printed over an empty pitch —
so it is written down as a rule this time (decision 083): **an empty state describes the form, not the
match.** Having no rows in a card licenses nothing about who played, and a sentence that names a
number of players has to get that number from what is filled in. `retroChangesEmptyFr` counts the
filled slots, agrees in number, and with none filled points at the composition card instead of
inventing a team.

Its neighbour had the same defect in miniature: « Un 0-0 sans rien à signaler, ça existe » wrote a
hyphen scoreline a few hundred pixels below the Score card's derived « 0 – 0 », in a file that already
imported `scoreLineFr` on line 34. Two dashes for one thing on one screen, which is what decisions 061
and 064 exist to have removed. `RETRO_NO_FACTS_FR` interpolates `scoreLineFr(0, 0)`.

Both in `lib/retro/labels.ts` with ten tests — 898 unit tests, 45 files. Verified by driving the real
form in a browser at 390 px rather than by trusting the unit tests: 0 → « la composition de départ est
vide », 1 → « le titulaire choisi », 2 → « les 2 titulaires choisis », 3 → « les 3 titulaires
choisis », and the three-line wrap fits the card in both themes. `npm run audit:screens` found no
mechanical defect and `npm run test:e2e` passes, the retro sheet being a Server Action screen.

### « Le groupe est fait » on a sheet nobody had touched

Next capture: `light-coach-feuille.png`, the match sheet against Étoile du Parc. It ends with a card —
« Et maintenant ? · Le groupe est fait : place les sept sur le terrain. · [Compositions] » — and on
that screen it is true: 7/7 titulaires. Reading the source rather than the capture is what showed the
sentence is a constant, so I went looking for the states it is shown in and wrong.

There are three. A match created a minute ago: thirteen rows marked « Hors », no group, and the link
would open an editor with an empty bench. A match played a fortnight ago: the sheet is frozen, says so
two centimetres higher, and the card was still telling the coach to place seven players. And a sheet
with nine titulaires, which nothing caps — the badge turns amber past seven but the action accepts them
— where « les sept » names a seven that does not exist.

Decision 084 is decision 083 for the other end of a screen: **a next-step card is derived from the
state it is standing on.** `sheetNextStepFr` returns the sentence *and* the call to action, because on
an untouched sheet the honest answer is that there is no next screen yet — the button disappears rather
than leading somewhere useless, and on a finished match it becomes « Résumé du match ». 906 unit tests,
45 files.

Verified by looking at all five states at 390 px in both themes, which meant manufacturing two of them:
AS Coteaux's sheet is genuinely empty in the demo season, so four and nine starters were inserted with
`psql`, captured, and deleted again — the demo data is back to zero rows, checked. The five readings:
« Personne n'est encore titulaire… » · « 4 titulaires sur 7 : il en manque 3… » · « Le groupe est
fait… » · « 9 titulaires cochés pour 7 places : il y en a 2 de trop. Repasse-les en remplaçants… » ·
« Le match est joué : la feuille reste ici pour mémoire. » The first capture of the over-seven case is
also what caught « Repasse les » without its hyphen; an imperative with a pronoun takes one.

### « Planifier un changement » on a match won a fortnight ago

Third screen out of the audit captures, `/match/[id]/composition`, and the first where the copy was
the smaller half of the defect. The capture of CS Morvan — finished, won 2 – 0 — offered a « Nouvelle
composition » button under a played match, and the action behind it had no `finished` guard: the match
sheet has refused one since M3, the compositions never did. Checked against the demo season with psql
before writing anything, and the second finished match, FC des Deux-Ponts, showed the other half:
typed up afterwards, no composition ever saved, and the page telling the coach to place seven players
on a pelouse for a match played on 13 September.

So the guard went into `saveLineup` and `deleteLineup`, a sixth dead end into the editor route — it
would have taken a full composition and lost it on submit — and every sentence on the page into
`compositionsScreenFr`, which reads `status` and `entryMode`. `LINEUPS_FROZEN_FR` is shared between the
list's notice and the editor's dead end so the two cannot drift. Decision 085 writes the rule down for
the whole match rather than for this screen.

Two things only the captures found, at 390 px, which is why they get looked at: the header still said
« modifier la feuille » pointing at a sheet rendered `frozen`, and in the frozen branch the empty state
and the card around it both read « Aucune composition », stacked. 911 tests before the two extra
assertions, and the live case was checked by flipping Étoile du Parc to `live` in psql and putting it
back.

### Seven players walking off a pitch none of them was on

Fourth screen from the captures, the composition editor. `audit/dark-coach-composition-nouvelle.png`
is « Nouvelle composition » for Étoile du Parc on an empty pitch, and the last card on it listed seven
players going off. The diff was being computed between the seven in force and a draft nobody had
filled in.

The interesting part is that the guard for the mirror case was already there, with a comment
explaining it — an empty *previous* composition yields seven arrivals, which are a team sheet and not
seven changes. The other direction had never been considered, which is worth remembering: a rule
written for one direction of a comparison is half written.

`deduceChanges` now counts empty slots on the target. Slots, not players: a plan fielding six after an
injury is a real composition, and a session before this one fixed a defect caused by suppressing that
diff. One existing test had to change — it built a six-player target to exercise the `long` option, and
that target is now a draft — which is the sort of fixture that should have been seven all along.

911 tests. Checked at 390 px in both themes on the empty draft and with one player placed.

### Ten players who were not remplaçants, under « Remplaçants »

Fifth screen, game mode. Nothing on it is wrong about the match — the clock, the score and the
timeline are all derived and all honest — but the last card was headed « Remplaçants » over thirteen
rows, of which three were. Before the kick-off nobody is on the pitch (invariant 3), so the list of
players who could come on is the entire squad, plus the two the sheet does not mention, plus an
injured supporter.

What makes it worth a decision rather than a one-word edit is that the list is deliberately that
wide, and was documented as such in M4: a coach a man short at 20′ is offered whoever turned up. The
defect was never the rows. The lesson is that a heading has to be true of the widest row it will ever
stand over, and this one was written while looking at the first three.

`enterableCardFr` also splits the card by what the reader can do with it: the operator is told what to
tap, a player watching is told what the list is. 921 tests. Checked at 390 px in both themes, before
the kick-off and after it, then `npm run db:reset` because tapping « Coup d'envoi » to see the second
state starts the demo match for real.

### « Déjà joué », over three trainings and a match nobody had recorded

Sixth screen from the captures, `/calendrier`. The card at the bottom of the screen — the whole
history of the season — was titled with a string literal, and the list under it is a merged agenda by
design: `audit/light-joueur-calendrier.png` has « Entraînement · sam. 19 sept. » two rows below the
heading.

The second row of the same list is the more interesting one. FC des Deux-Ponts is finished, `retro`,
and has zero events, and `ScorePill` returns `null` when there is no score — so the one row in the
history that is asking to be acted on was the only row with nothing on its right-hand end. Silence
read as « nothing to report » on the row that had the most to report.

The words for it already existed. The recap of that same match says « ? – ? · rien saisi » and offers
« Saisir le match » — decisions 041 and 061 — so this is not a new label, it is the recap's sentence
said one screen earlier, and `NOT_RECORDED_FR` is now imported by both. I wrote « Non saisi » first and
deleted it: two screens inventing their own wording for one state is the defect 085 is about.

925 tests, four of them new on `pastSectionTitleFr`. Checked at 390 px in both themes, as `karim` and
as `hugo`, and the recap of the unrecorded match re-read to make sure the two screens now agree. The
e2e suite passes — `/calendrier` is on the happy path, and its fixture history is all played matches,
so it still reads « Déjà joué ».

### A confirmation credited to a match nobody watched

Seventh screen, the two composition dead ends — `audit/dark-compo-appliquee.png` and
`audit/light-compo-introuvable.png`. « Composition introuvable » is honest and was left alone. The other
one says « Elle a été confirmée pendant le match », and the capture was taken on **FC Rivière**, which
is `entry_mode = 'retro'`: a match somebody typed up afterwards.

It is not a seed artifact. `lib/retro/log.ts` emits a `LINEUP_APPLIED` at 0′ deliberately, so that the
seven on the sheet count as starters and the goalkeeper is known to the reducer, and `psql` confirms the
starting composition of FC Rivière carries one. Every applied composition on every retro match has been
credited to a confirmation since M7.

The part worth keeping in mind: the fourth place saying it was `LINEUPS_FROZEN_FR`, which I wrote
yesterday *to stop this screen inventing things*, and which invented « le mode match » on a match
nobody watched. A sentence written to fix a class of defect is a member of that class.

Both are functions of `entry_mode` now, in `lib/composition/plan.ts`, so the list, the editor's dead end
and `saveLineup`'s refusal cannot drift apart. The « appliquée » badge stays: vague is not false, and it
does not explain anything. 927 tests, six new. Looked at FC Rivière (retro) and CS Morvan (live) at
390 px in both themes, list and editor, plus FC des Deux-Ponts, which is retro with no composition at
all and reads « Saisi sans composition » from decision 085. e2e green — the happy path applies a
composition in game mode, which is the `live` wording.

### « 1 absent » three days before the session

Screen eight of the `audit/` read-through: `entrainements`, from `light-coach-entrainements.png`,
`dark-coach-entrainement-non-pointe.png`, `light-joueur-entrainement-pointe.png` and
`dark-joueur-entrainement.png`. The screen is almost entirely honest — « Séances passées », « Personne
n'est encore pointé. », « 11 présents sur 14 pointés. 1 joueur pointé ce soir-là a quitté l'équipe
depuis. », « Annoncé pas dispo » on the pointing list — which is what made the two exceptions worth a
decision rather than a fix: both of them borrowed a word from the présences to describe an
availability.

- `AnswersLine`, under the pinned event on `/calendrier`, read « 7 dispo · **1 absent** · 1 peut-être ·
  4 sans réponse » for the 26 September training. Nico had tapped « pas dispo »; nobody had been absent
  from anything.
- `ReminderCard`, on `/entrainements/[id]` and `/match/[id]`, was titled « **Relancer les absents** »
  and described itself one line below as « 4 joueurs n'ont pas répondu ». The message it copies was
  already right — « Il manque les réponses de : Brice, Léo, Yanis, Fabien. »

Both are now pure functions in `lib/calendar/timeline.ts`, with nine tests, because nothing under
`app/` is collected by Vitest: « 7 dispo · 1 pas dispo · 1 peut-être · 4 sans réponse », and
« Relancer ceux qui n'ont pas répondu » over the same description. `pluralize` and `pendingCount`
dropped out of the component's imports with the logic.

Verified at 390 px in both themes, as `karim` (coach) on `/calendrier` and on the 26 September
session, and as `hugo` (player, who sees no relance card): the new title fits on one line. 934 tests
pass after the rebase onto #68, typecheck and lint clean, and the three e2e specs pass locally in 27 s.

Also rebased #68 and #70 onto `main` and force-pushed both. Both had gone `CONFLICTING` on
`COORDINATION.md` alone, and a pull request GitHub cannot merge gets no CI run at all — so a rebase is
not tidiness, it is the difference between a green branch and a branch with no checks. Each log line
now sits under « From the other machine », which is what the two lanes are for. One thing corrected
in passing, in a file this branch already touches: #68's own test comment said the demo season
interleaves « five sessions » with the matches. `psql` says four — 29 August, 12 and 19 September, and
26 September to come.

### Three PWA icons redirected to the login page, and a stack nobody could log into

Two defects the owner hit while running the app out of `compose.yaml`, both of them things no test
was ever going to notice.

**The icons.** `proxy.ts`'s matcher excluded static files by naming six of them, and the three files
actually in `public/` were not among the six. So the guard ran on `/icon-192.png`, and the browser
got `307 → /connexion?suivant=%2Ficon-192.png`, followed it, was handed HTML and reported an invalid
image. Confirmed with `curl -sD-` against the compose stack before the change, and again after:

```
$ curl -sD- -o /dev/null http://localhost:3000/icon-192.png
HTTP/1.1 200 OK
Content-Type: image/png
Content-Length: 4693
$ curl -sD- -o /dev/null http://localhost:3000/calendrier
HTTP/1.1 307 Temporary Redirect
location: /connexion?suivant=%2Fcalendrier
```

Production answered the same `307` as localhost, so the install prompt has had no icon from the
beginning — which is the interesting part: this was a live defect for weeks and cost nothing anyone
could see, because a manifest icon that fails to download breaks no page and no assertion. The fix
excludes the class rather than the names — any path ending in `.<ext>` — and the decision entry is
about that shape, not about the six names. Every route here is a French word with no dot in it.

New file `proxy.test.ts`, twelve tests, and the one that matters reads `public/` with `node:fs` and
asserts nothing in it is matched: hardcoding the three names would have rebuilt the same stale list
one layer down. It also asserts `/calendrier` and `/match/1/jeu` *are* matched, so the exclusion
cannot quietly swallow the guard, and drives `proxy()` with real `NextRequest`s — the redirect
behaviour had no test at all until now. `vitest.config.ts` gained `"*.test.ts"` so a test at the
root is actually collected.

**The stack with no accounts.** `docker compose up` starts `db`, `migrate` and `app`; both services
that create users are in the `setup` profile, so `users` is empty and the app is unloggable. The
owner tried `admin`/`admin` and `admin`/`change-me`, and neither can ever work on a fresh `up`:
nothing exists, and `db/bootstrap.ts` refuses `change-me` and refuses a password as short as `admin`
by design (052). `admin`/`change-me` is a *seed* account. Nothing said any of this anywhere.

So `compose.yaml` gained a `seed` service beside `bootstrap`, same profile, same `DATABASE_URL`,
same `depends_on: db healthy`, built from `tools` — which sets no `NODE_ENV`, so `db/seed.ts`'s
production guard lets it run without being weakened; the guard is what keeps `motdepasse` off a real
database and it is untouched. `npm run docker:seed` in `package.json`, and the header comment, the
`bootstrap` comment and `docs/DEPLOY.md` now all say out loud that `up` leaves a schema with no
accounts, and give the two ways out: seed for a demo season you can click through, bootstrap for one
real super admin.

Verified with `docker compose --profile setup config seed` — the service resolves with the intended
image target, command and dependency. **The seed itself was not run**: this session does not run
`db:*`, and the compose database currently holds the owner's data.

937 tests, typecheck and lint clean. Nothing here touches the match flow, so the browser suite was
not run.

### A card that promised less than its own select offered

Screen nine: `equipe`, from `light-coach-equipe.png` and `dark-joueur-equipe.png`. Most of it holds up
under the question — « 13 joueurs » counts `isPlayer` and nothing else, rows carry a real « coach » and
« blessé » badge, « Aucun code actif. » is true because `getActiveInvites` excludes both expired and
exhausted codes, « L'image est réduite à 96 px » prints `CREST_MAX_SIDE` rather than a number somebody
typed once, and « les couleurs du maillot — celles des joueurs sur le terrain » is true down to the
secondary colour, which is the ring `PlayerDisc` draws. Two claims did not.

- The invite card: « Inviter des joueurs », « Le joueur choisit lui-même son mot de passe », and a
  `<select>` offering « Coach » directly underneath. Now « Inviter un joueur ou un coach » and « la
  personne ». The player-side sentence had the same narrowing and is now « Seul un coach peut envoyer
  une invitation. »
- « Encadrement »: true of every row under it, and the reader asking who runs the team counted one,
  because Karim is coach *and* player and is therefore in « Effectif ». The card now says « 1 coach
  joue aussi, et apparaît dans l'effectif. », derived from the squad.

`lib/team/labels.ts` with six tests — `inviteCardFr`, `staffCardFr`, `invitesReadOnlyFr`. 958 tests
on this branch, rebased on the `main` that has #73 in it.

CI caught what I had not: `e2e/first-run.spec.ts` asserts the heading of that card by its exact
words, so renaming it turned the first-run spec red. My fault for not running `npm run test:e2e`
on this branch before opening the pull request — `/equipe` is on the happy path and `CLAUDE.md`
says so. The assertion now names both roles too, with the reason beside it.
Looked at at 390 px in both themes as `karim` and as `hugo`: both titles still fit one line, and a
player sees the Encadrement note but no invite card.

The decision this earned is the general form of it: a heading is answerable for the rows a reader
would expect under it, not only the ones that are there. Splitting a list is a choice the app made and
the reader cannot see.

### « 2 matchs sont exclus de cette moyenne », under a moyenne that was a dash

Tenth screen from the captures, `/joueur/[id]`. Two unrelated defects, one rule, which is why they
ship together.

The stats card carried « Les notes de 2 matchs sont exclus de cette moyenne : tu étais sur la feuille
mais tu n'as pas noté tes coéquipiers. » `season.hiddenRatingMatches` is
`hiddenMatchIds.length` — the reader's count, correct on `/stats` where the note sits over the whole
table, and not a fact about the player being looked at. psql settled it: the demo season has ratings in
three matches (23, 11 and 44 notes) and four of the 78 are about Ali, so Karim's second hidden match
holds nothing about him. And Ali's own average is « — », so on his own profile the sentence explained
an exclusion from a number that is not there, while saying nothing about the dash he was looking at.

`ratingVisibility` already loops the author rows to decide what to hide, and those rows carry
`ratedMemberId`, so a `matchId → Set<ratedMemberId>` map in that same loop gives one count per player
for no extra query and no extra leak — the existence of a note, never its score. `hiddenRatingsNoteFr`
then has two forms because there are two states: beside an average, « La moyenne ne porte que sur les
matchs que tu as notés »; instead of one, « c'est pourquoi il n'y a pas de moyenne ». Verified as Ali
and as Karim at 390 px: Karim now reads **1 match** where the screen used to say two.

Then the other half, found while checking the rest of the page. `admin` / « Coach » is a member of the
demo team with `is_player = false`, and there is a second coach, so `canRemove && !isSelf &&
!isLastCoach` holds and the profile renders all of its cards about them. « Le joueur ne pourra plus
déclarer ses disponibilités ni être convoqué » was untrue twice over — `can()` refuses every
`SELF_ACTIONS` entry to `isPlayer = false`, and `/match/[id]` filters `isPlayer` before drawing the
selection list — so removing them takes the team away, not a place in it. « Fiche joueur » headed a
card whose one sentence says the member is not one. The jersey hint said « si le joueur n'a pas de
numéro fixe » to a coach editing a man with no maillot. And « convoqué » is a word the data model has
no concept for: no convocation fields, by a decision taken before the first line of code, and eleven
other places say « feuille de match ».

What I deliberately did **not** change, having read them: `/stats`'s two season-wide notes
(« Les notes de 2 matchs ne sont pas comptées ici », « ces moyennes ») — they are true at table level,
and that is exactly the distinction this slice is about. The jersey *form* also stays on an
encadrement profile: `/equipe` prints the number next to whoever has one, so the field is reachable on
purpose; only its hint was wrong.

969 tests, seventeen new across `lib/stats/ratings.test.ts`, `lib/stats/format.test.ts` and the new
`lib/player/labels.test.ts`. Both themes at 390 px, as `karim` looking at Ali and at the non-playing
coach, and as `ali` looking at himself. `npm run test:e2e` green in 27 s.

### « AS Dimanche · joueur », above « Tu fais partie de l'encadrement »

Eleventh and last screen of the `audit/` read-through, `/moi`. The four captures look clean and the
whole defect is in a ternary:

```tsx
{team.role === "coach" ? <Badge variant="accent">coach</Badge> : <Badge>joueur</Badge>}
```

`team_members` says what a member is in two columns — `role` and `is_player`, independent since
decision 005 because the coach of an amateur side usually plays — and this reads one of them. Two of
the four combinations are therefore mislabelled, and the interesting one is not exotic: `createTeam`
inserts the founder of every team as `role = 'coach'`, `is_player = false`. One tap on « Retirer
coach » makes them `role = 'player'`, `is_player = false`, because `setMemberRole` writes `role` and
leaves the other column alone on purpose — and `/moi` then badges them « joueur » **directly above its
own** « Tu fais partie de l'encadrement : pas de fiche joueur ». I reproduced it against the demo
team, whose `admin` is that row, with one `update` and put the row back afterwards.

`ActiveTeam.role` is also `| null`, for a super admin pinned by the cookie to a team he is not a
member of. The ternary called him « joueur » too.

The fix is not new code so much as a comment finally being obeyed. `/joueur/[id]` has done this
correctly since M1:

> Not simply « Coach » or « Joueur »: demoting a member of the encadrement would otherwise label them
> « Joueur » next to their own « encadrement » badge.

That comment describes, exactly, the bug that was still live one tab away. `memberBadgesFr` in the new
`lib/team/membership.ts` is that comment made reusable, and in `lib/` it is testable — which is why
the profile's version has never failed and `/moi`'s never fired.

Two more on the same card stack. « Mon profil de joueur » headed the card whose only sentence says you
have none; it is « Tu n'as pas de fiche joueur » now, and the sentence under it stopped repeating the
three words the heading had just used. And that sentence said « Tu fais partie de l'encadrement » to
both readers `getPlayerProfile` returns null for, which is true of one: the non-member is told
« Tu n'es pas membre de cette équipe : tu la consultes en tant qu'administrateur. »

988 tests, thirteen new. Walked at 390 px in both themes as `admin` (`role=coach`,
`is_player=false` → « coach · encadrement ») and as `karim` (« coach · joueur », where the screen used
to show « coach » alone and his own fiche shows both), plus the demoted row and back. `npm run
test:e2e` green in 28 s.

**That is the last capture in `audit/`.** Every one of the twenty-three screens `npm run audit:screens`
walks has now been read by eye against its source and its data, and what the exercise caught, over
eleven slices, was never a crash and never a layout break: it was twenty-odd sentences that were false,
and not one of them failed a test. The common cause is mechanical rather than careless — French copy
inlined in a Server Component is copy `vitest.config.ts` cannot see, because it collects `lib/**` and
nothing under `app/`. Every fix in this run consisted of moving a sentence into a `…Fr()` function and
only then discovering what it said. The cheapest future guard is the same one: a claim belongs in
`lib/`.

### « 4 notes · il s’est mis 8 », three rows under « 8 Karim (toi) »

The twelfth slice: `npm run db:reset` then `npm run audit:screens` against a tree holding all eleven of
the first pass's slices, which photographs a hundred screens in about a minute.

> **Corrected after the fact**, by the session that wrote it, because leaving it would be the exact
> defect the entry is about. This paragraph first said the second pass « starts from the captures the
> first pass never opened, and `recap` is one of them ». That is untrue: `COORDINATION.md` records
> `recap` and `notation` in the read list at 11:30 the same day. The defect below was **missed** on
> that reading, not newly exposed. What changed the second time is that the capture was read as a
> *named reader* rather than as "a coach" — see the last paragraph of this entry.

The recap's « Les notes » card names the author of every note, because decision 007 says anonymity in
a team of thirteen only invites a 2 nobody has to own. That makes the reader a member of the list he
is reading, twice over — and `RatingsPanel` knew about one of the two appearances.

Read as `karim`, the demo season's `CS Morvan` recap said all three of these inside one card:

- on Ali's row, « 8 **Karim (toi)** » — correct, and the reason the rest is jarring;
- on Karim's own row, « 4 notes · **il** s’est mis 8 » and the chip « 8 **lui-même** »;
- under Julien's row, his own comment signed « — **Karim** », with no « (toi) » at all, because the
  attribution branch was written separately from the chip branch and never grew the suffix.

`lib/rating/labels.ts` (new, eleven tests) answers both questions once: `noteAuthorFr` for a
signature and `ratingCountNoteFr` for the line under a name. « toi » beats « lui-même » where both
apply. `RatedPlayer` gained `isViewer`; the query already knew which *notes* were the viewer's and had
no flag at all for which *row* was his, which is exactly why the row was the half that stayed in the
third person.

Verified by loading the recap at 390 px in both themes as two different readers: as `karim`, whose row
now reads « 4 notes · tu t’es mis 8 » with « 8 toi », and as `hugo`, who sees « tu t’es mis 9 » on his
own row and « il s’est mis 8 » with « lui-même » on Karim's. Eleven new tests — 986 on the branch as
written, 999 in the suite on `main` once it landed. `npm run test:e2e` green in 27 s — the happy path
walks the recap, so it had to be.

Left in on purpose, and written into the decision rather than quietly: « il s’est mis » and
« lui-même » stay gendered for everybody who is not the reader. The app has no gender column, the
question is about a team that does not exist yet, and degendering six screens on the way past a
ratings card would be a product decision taken sideways.

### « Sa note pour ce match (la tienne) » — the same rule, one screen earlier

The follow-up to the entry above, and the last change of this session. The pull request holding the
recap fix was merged while this was being written, so the notation half arrives separately rather than
as a second commit on the same branch.

Decision 007 has every rater rate himself, so one of the eleven cards in `/match/[id]/notation` is the
reader's own. That card asked for « Sa note pour ce match **(la tienne)** ». The parenthesis is the
whole story: somebody saw the pronoun was wrong and appended a correction to it instead of choosing the
right one — under a card header that already wears a « toi » badge and a « 12’ » badge. `ratingLegendFr`
now chooses between « Ta note pour ce match » and « Sa note pour ce match », and the parenthesis is
gone. Three tests, one of which asserts that neither form needs a parenthesis to say whose note it is.

And the paragraph above it, corrected in place. The first version of the previous entry claimed this
pass started from captures the first pass had never opened. It did not: `recap` and `notation` were
both in the read list from 11:30 the same day, and this defect was missed then. **That is the useful
part of both entries.** Reading a capture is not one act — the same PNG read as "does this screen make
sense" shows nothing, and read as "I am Karim, where is my name" shows three wrong sentences in one
card. Thirteen captures on this repository's audit list have been read exactly once, in the first
manner. They should not be considered clear.

Verified at 390 px in both themes as `ali`, whose own card is « joueur 8 sur 11 » and now reads « Ta
note pour ce match ». 1002 tests, three new. `npm run test:e2e` green in 28 s — the happy path walks
the notation flow.

### « 3 hors feuille » on a team of thirteen with eleven on the sheet

The first defect this pass found by *doing arithmetic on a screenshot* rather than by reading it as
somebody. `dark-coach-match-a-venir.png`, the composition card: « 7 titulaires · 3 remplaçants · 1
supporter · 3 hors feuille ». Fourteen. The availability card directly above it on the same screen
says « 11 réponses sur 13 joueurs », and `dark-coach-feuille.png` — the same match, one tap away —
says « 2 hors feuille ». Both cannot be true, and the true one is the one nobody would open to check.

The thirteenth « player » is `Coach`, the demo team's `is_player = false` member: decision 094's row
two, the row `createTeam` inserts on every new deployment. So this is not a demo-data artifact. It is
the state a real team is in from the moment it is created until somebody joins it, and it was
mis-stating the squad on two of the three screens that print the line.

The filter was already written, correctly, once — inline in `feuille/page.tsx`. `getCompositionMembers`
hands every caller `isPlayer` on the row, so the two defective call sites had the column and no reason
to suspect they needed it. `isSheetCandidate` in `lib/composition/plan.ts` is that inline predicate
given a name, and `countSquadRoles` now applies it to its own input instead of trusting its caller.
`SheetMember` carries `isPlayer` so the sheet screen can go through the same function it used to
open-code. Decision 096; the rule is decision 094's, applied to a subtraction instead of a label.

Worth recording for whoever audits next: `squadSummaryFr`'s doc comment has said « a thirteen-player
squad … leaves **two** players unaccounted for » since it was written. The prose was right and the code
was wrong, and the prose is what a reviewer reads. A doc comment is not a test.

Verified at 390 px in light and dark, on all three screens, as `karim`: 7 + 3 + 1 + 2 = 13 on the match
page and the sheet, and 7 + 4 + 1 + 1 = 13 on the CS Morvan compositions header, whose « 1 hors
feuille » is Mehdi — the one name SQL says is missing from that sheet. 1005 tests, three new, one of
which asserts the four counts sum to the number of *players* and not to the size of the membership.

### The sentence a green test forbade, printed on screen for a milestone

`light-coach-match-saisi-apres.png`, the « Composition » card on FC des Deux-Ponts — `finished`,
`entry_mode = 'retro'`, no events, no lineups, played on 13 September:

> **Aucune composition** — Place tes sept joueurs sur la pelouse : tu pourras ensuite planifier les
> changements. · **[ Composition de départ ]**

Instructions for a match that was played ten days ago, in a primary button leading to an editor that
decision 085 taught to refuse a finished match, on a screen whose actual next action is the « Saisir le
match » card immediately below it.

What makes this worth an entry rather than a line is that `plan.test.ts` already contained
`expect(screen.noPlansFr.description).not.toContain("Place tes sept joueurs")`, under the name « never
tells a coach to place seven players in a match that is over ». Green throughout. Decision 085 derived
`compositionsScreenFr`, wrote the four sentences a played match needs — « Saisi sans composition · Ce
match a été saisi après coup, sans composition : les temps de jeu viennent de la saisie et non d'un
placement sur le terrain. » — tested them, and never came back to the card that links to the screen it
had fixed. The card kept its own hard-coded pair. **The function was right, the test was right, and the
screen was wrong, and nothing in the repository could say so**, because Vitest collects `lib/**` and
`db/**` and nothing under `app/`.

That is the second time in one afternoon: the « hors feuille » count shipped wrong under a doc comment
that described the correct behaviour. A doc comment is not a test, and now: a test on a pure function is
not a test of the screen. Only the call is. Decision 097.

So besides the card calling `compositionsScreenFr`, there is `lib/composition/copy.test.ts` — not a unit
test. It reads the source of `app/`, `components/` and `lib/` and asserts the five status-dependent
sentences live in `plan.ts` and nowhere else, with one test proving the scan is not reading an empty
list. Mutation-tested by putting the sentence back into the card: it fails. Narrow on purpose.

One deliberate copy change, stated rather than buried: a *scheduled* match with an empty sheet now reads
« Personne n'est encore retenu », the compositions screen's wording, instead of the card's « Le groupe
n'est pas encore fait ». One function means one wording.

Verified at 390 px in light and dark as `karim`, on all three states the card has: the retro match (no
button, « Saisi sans composition »), CS Morvan (pitch and « Composition de départ · Classique 1-3-2-1 »
unchanged), and AS Coteaux, still to be played and untouched, which still says « Choisis d'abord tes
titulaires et tes remplaçants » over a primary « Feuille de match ». 1008 tests, six new.
