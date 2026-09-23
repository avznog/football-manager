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
