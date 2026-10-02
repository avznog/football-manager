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
the kick-off and after it, then `npm run db:reset` because tapping « Coup d’envoi » to see the second
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

### 2026-09-23 — « avec les disponibilités déclarées », over a sheet and two compositions

Third screen of the audit read-through this afternoon, and the first one where what the screen omits is
worth more than what it says.

`dark-coach-match-modifier.png`, Étoile du Parc. « Supprimer » — « Le match disparaît du calendrier,
avec les disponibilités déclarées. » — over a red « Supprimer ce match ». That match holds eleven
availability answers, an eleven-row `match_squad`, and two `lineups`, the second being « À partir de la
30ᵉ minute · Julien → Momo, Léo → Yanis ». `db/migrations/0000_*.sql` confirms all three cascade.

The point is not the missing nouns, it is where the sentence sits. The page's own comment says « A plain
form: no confirmation dialog to get wrong » — which is the right call, and it means **that sentence is
the confirmation dialog**. It described the loss a coach can absorb and skipped the two he cannot.

The same reading applied to the training twin, « avec les réponses déjà données », found the same hole
and a reachable one: `app/(app)/entrainements/[id]/page.tsx` guards `AvailabilityGrid` and
`ReminderCard` on `over` but renders `{isCoach ? <AttendanceList/> : <PresenceSummary/>}` unguarded, so
a coach can mark attendance before the séance — the one window where the button exists.
`training_attendance`
cascades. Not hypothetical, just unwritten.

`lib/calendar/deletion.ts` writes both from counted holds, fed by two scalar-subquery queries. Eleven
tests; 1022 with the suite. Decision 098, whose rule is that a destructive control states what it
destroys in numbers, and whose stated limitation is that nothing enforces it: a `cascade` added next
month will not appear in the two `…Holds` types by itself, and the suite will stay green.

Verified at 390 px in both themes against the demo season, four rows chosen for their four shapes:
Étoile du Parc (three parts), the retro-entered FC des Deux-Ponts — no event log at all, so it *is*
deletable, sheet and all (two parts) — AS Coteaux untouched (« Rien d'autre n'y est encore rattaché. »),
and the one future séance, 9 réponses, 0 pointés.

### 2026-09-23 — « Tout le monde est là », four days early, and « 3 séances pointées » out of two

`entrainement` was the screen I opened to prove the previous one, and it turned out to hold a worse
defect than the one it was helping prove.

`dark-coach-entrainement.png` is the 26 September training seen on the 22nd. The top of it is correct
and careful: « 9 réponses sur 13 joueurs », « Karim (toi) », and the tally adds up — 7 dispo, 1
peut-être, 1 pas dispo, 4 sans réponse, thirteen players. Then, at 1 800 px, « Présences · Personne
n'est encore pointé » over a « Tout le monde est là » button and thirteen Présent/Absent rows.

Decision 090 fixed exactly this confusion in *words* three screens over. `AttendanceList` is rendered
with no reference to `over`; `PresenceSummary`, the other half of the same ternary, reasons about it
explicitly and returns `null` before the session. Somebody thought hard about what a player should be
told, in that expression, and never turned the question around.

The part that made it worth a branch rather than a copy fix: `getAttendanceMarks` filters by team and
not by date. I inserted the thirteen rows one tap would have written and read `/stats`: « **3 séances
pointées** » in a season of two, Brice 1/3 where the truth is 0/2, Fabien with him. Then deleted them;
the two real sessions still hold 14 and 13 marks, checked.

`attendanceIsOpen` opens the pointage 30 minutes before kick-off and never closes it — decision 076's
« Présences pas encore pointées » depends on late marking staying possible. Both Server Actions refuse
outside the window, and I proved that rather than asserting it: forced `canMark` to `true`, clicked
« Tout le monde est là », then checked a Présent radio and submitted « Enregistrer les présences ».
`training_attendance` empty after both. The scratch edit is reverted.

Decision 099. Seven new tests, 1018. Verified at 390 px in both themes on the future séance, the
pointed 12 September one and the unpointed 19 September one.

What I did **not** do, stated because it is a judgement and not an oversight: no date filter on
`getAttendanceMarks`. With the write shut the table holds facts, and two definitions of « which
sessions count » is how two screens come to disagree.

### 2026-09-23 — The sort tab that moved the page out from under the reader

First of eight remarks the owner wrote up after using the deployed app himself, and the cheapest of
them: on `/stats`, scrolled down to « Joueurs », tapping « Buts » instead of « Minutes » sorted the list
and sent the viewport back to the title.

Nothing was wrong with the sort. Every control on that screen is a `<Link>` writing a search param —
deliberately, so `?tri=goals` is shareable, survives a reload and works with no JavaScript — and the
App Router scrolls to the top of the document on every navigation unless told otherwise. Both link
groups in `filters.tsx` now pass `scroll={false}`: the sort tabs the owner reported, and the
competition chips, which had exactly the same defect and only looked innocent because they sit near the
top of the page where the jump is invisible.

`/stats` turned out to be entirely server-rendered — no `"use client"`, no `useState`, no
`router.push` anywhere under `app/(app)/stats/` — so `filters.tsx` was the whole surface: two link
groups, not the three I expected to find. `leaderboard.tsx`, `keepers.tsx`, `attendance.tsx`,
`player-list.tsx` and `team-summary.tsx` have no interactive controls at all.

Decision 100. No test: this is a prop on a `<Link>` in `app/`, which Vitest does not collect, and the
behaviour is the framework's. Outstanding, and it is the only honest check — scroll and tap on a phone.

### 2026-09-23 — Every date in digits, and the formatter that ran in two time zones

Second of the owner's eight remarks: « les dates doivent absolument être en francais DD/MM/YYYY,
l'heure aussi sur un format de 24h ». The times were already right — `formatTime` has always been
`fr-FR` with an explicit `Europe/Paris` — so this was about dates, and about the fact that the
repository never said what a date looks like. Three screens had each decided separately.

The one worth the branch: `app/(app)/equipe/invite-manager.tsx` held its own
`Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" })` with no `timeZone`, in a `"use
client"` file. No zone means the host's zone, and the host is the server on the first render and the
phone afterwards — UTC on Vercel — so « expire le 30 septembre » could become « expire le 1er
octobre » between the HTML and the hydrated page, and said which year in neither. `lib/player/injury.ts`
spelled the month out for the injury history, and the calendar row printed « dim. 27 sept. » with no
year in a list that runs across 1 January.

`formatDate` now lives beside `formatTime`, so one file knows the shape. `2-digit` on day and month,
because `3/10` under `27/09` is a column that does not line up; `hour12: false` spelled out on the
time formatter even though the locale implies it. The words stay where a date is a sentence rather
than a record — « Blessé depuis le 13 septembre » is untouched, and so are `formatDay` and
`formatDayMonthFr`.

Decision 101. Four new tests, including a zero-padded `03/10/2026` that fails under `en-US` and a
loop over twenty-four hours against `/^([01]\d|2[0-3]):[0-5]\d$/`. 1032 unit tests.

Not done, and it matters here: **no 390 px pass.** The calendar row gained a third line and grew from
about 56 px to about 65 px, in the list on the busiest screen in the app and on the e2e happy path.
It wants a look in both themes before anybody calls this finished.

### 2026-09-23 — A name on the shirt, and the permission question hiding inside it

Fifth of the owner's eight remarks, and the only one that needed a migration: « fiche d'un joueur,
possibilité de mettre son nom sur le maillot en plus du numéro ».

The five-minute version is a second field in `JerseyForm`. That form posts to `updateMember`, which
is gated on `member:update`, which is a coach — so the five-minute version ships a screen where Momo
cannot change the word printed on Momo's own back, on the page whose subject is Momo. Decision 093 is
about that page and about exactly this kind of slip.

A number and a flocage look like one thing. A number has to agree with the twelve other numbers in
the squad, and `updateMember` has refused a number already worn since M0: it is inventory, and the
profile has always said so (« les numéros sont attribués par le coach »). A flocage agrees with
nothing; two players may both be floqués « JUNIOR » and neither is wrong. So `profile:editShirtName`
is a `SELF_ACTIONS` entry and `updateShirtName` is its own action, with the `assertCanActFor` shape
the preferred positions already use — self first, the coach's `member:update` as the fallback. Not a
wrapper around `updateMember`, which would have re-imposed the very check being avoided.

`shirt_name text`, `check (… is null or char_length(…) between 1 and 12)`, migration
`0002_daily_sharon_carter.sql`. The `1` rejects `''`, so « no flocage » has one representation and no
screen has to tell two empties apart. Uppercased at display time with `toLocaleUpperCase("fr-FR")`,
never on the way in. Three of fourteen demo players got one — Léo for the accent, « El Professor » at
exactly twelve characters — because a seed where everybody has one cannot show whether the empty case
reads correctly.

Decision 104. `lib/player/shirt.ts`, 21 tests, one of which greps `db/schema.ts` so the 12 in the
Zod schema cannot drift from the 12 in the column. 1054 unit tests.

Not done: **no 390 px pass**, and the migration has not been applied anywhere but a test database.
The flocage is deliberately absent from the pitch discs — a 44 px target already carrying a number
and a short name — which is a judgement rather than an omission.

### 2026-09-23 — The note nobody ever saw selected

Third of the owner's eight remarks, and the one where the fix was to remove a line rather than add a
feature: « il n'y a aucun effet visuel car on passe directement au joueur suivant ».

The pad in `rating-flow.tsx` has had a selected state since M6 — `peer-checked:bg-accent`,
`peer-checked:text-accent-ink` — and it was correct. `setScore` called `goNext()` two lines after
writing the draft, so the card carrying the highlighted number was hidden in the same render. The
state existed and was never displayed once, which is decision 097's lesson from the other side: a
screen can be right in the source and absent on the phone.

So: the tap selects, « Suivant » advances, and the advance is the only thing that button does. The
old flow had a second, invisible rule — it did *not* advance if a comment had been started — so the
same gesture behaved differently depending on a textarea, which is worse than either behaviour.

The selection got two cues that are not colour (a ring, and a bolder, larger digit) and one that is
not visual at all: « Note choisie : 8 / 10 » in an `aria-live` region. `gap-1.5` became `gap-2` on
the grid because two adjacent rings touched at 6 px. On a card with nothing selected the forward
button says « Passer sans noter » — a partial sheet is legal (decision 023) — and on the last card
there is no forward button at all rather than a greyed one.

One thing the second tap forced into the open: nothing is written card by card, so « chosen » and
« sent » are two different states, and the auto-advance made the first feel like the second. The
screen says so now, under the submit: « 3 notes choisies, pas encore envoyées. »

Decision 102. `lib/rating/flow.ts` is new and pure, 20 tests, 1049 in all. The happy path taps twice
per teammate and asserts the card did not move between the taps.

Not done: **no 390 px pass in either theme**, and the visual is most of this change. Also noted and
not touched, because it predates this and is a different argument: the submit button carries
`disabled` when nothing is selected, so with JavaScript off it is server-rendered disabled, which
contradicts the file's own claim to work without JavaScript.

### 2026-09-23 — Where the match is played, on every screen that names it

Fourth of the owner's eight remarks: « il n'y a pas de différence entre les matches "à domicile" ou
"à l'extérieur" ». Half the premise turned out to be wrong and the other half worse than reported.

Wrong half: `is_home` was not unused. The column is in the first migration, `match-form.tsx` has
always offered a `SegmentedControl` for it, `matchSideSchema` validates it in words rather than as a
checkbox, both `createMatch` and `updateMatch` write it, and the match page, the recap header and
game mode's scoreboard all badge it. `scoreLineFr` is documented and tested as ours-first whether or
not we are at home, and both scoreboards comply — **no screen assumes the team is at home.** So there
was nothing to add to the model and no migration.

Worse half: every screen that *names* the fixture printed the bare opponent. A season of calendar rows
read identically. `/stats`' form guide had the fact **only in a `title` attribute** — decision 072's
exact defect, invisible on a phone — and its sr-only text said « contre » about away matches. Game
mode's final whistle said « contre X » about a match at X's ground; `jeu/page.tsx` had an inline
`{isHome ? "contre" : "chez"}`, a third vocabulary nothing else used and nothing could test; the
availability legend said « Ta disponibilité contre X »; and the WhatsApp reminder — the message a
dozen players actually read — named the opponent, the competition and the kick-off but never the
ground.

The wording is a preposition, not a pill: « contre X », « à X ». Five characters instead of forty on
a truncating row, and it is what a coach says. `venuePhraseFr` keeps the side and the free-text venue
together, side first, so « Stade du Parc » never appears without saying whose it is. The « Terrain »
field gained a hint that follows the side chosen above it, via the same uncontrolled-input-plus-mirror
idiom the periods hint already uses, so the no-JS post is unaffected.

Decision 103. `lib/calendar/labels.ts` and `lib/stats/format.ts`, 1035 unit tests. Sixteen files, no
schema change.

Not done: **no 390 px pass.** The calendar row titles grew by a word, which is precisely where the
truncation argument lives, and `/calendrier` is the busiest screen in the app.

### 2026-09-23 — A drag with its two ends on different screens

Sixth of the owner's eight remarks, and the only one that is purely a layout: « les joueurs sur le
banc sortent de l'écran, donc c'est pas trop possible de les drag and drop ».

First thing checked was the gesture, because a layout change that breaks it is worse than the
complaint. It is hand-written pointer events with `setPointerCapture` — `components/pitch/usePitchDrag.ts`
over the pure `lib/pitch/drag.ts` — and the drop target is not a DOM hit-test but `nearestSlot(shape,
point)` in 0..1000 pitch coordinates, converted by `fromClientPoint` from a `getBoundingClientRect()`
read on **every** event. So scrolling mid-drag was already safe, and the two real constraints are
that the ref'd element must be exactly the turf rectangle and that no container between finger and
turf may claim the touch.

Hence the cap is on the measured element (`max-w-[280px]` on the `pitchRef` box, pitch still
`w-full` inside it) rather than on the height: capping the height would have left the ref box wider
than the turf and every drop would have landed left of the finger. And the bench strip's discs are
`touch-pan-x`, not `touch-none`, so a sideways swipe scrolls the strip and we get `pointercancel`,
while the lift onto the turf stays ours.

The arithmetic: 280 × 1580/1080 = 410 px of turf; the dock is at most ~196 px; 740 − 56 − 72 − 196 =
416. The floor on the cap is the one worth keeping — a 48 px disc is 185 pitch units at 280 px, under
`MIN_MARKER_DISTANCE`'s 195, so the discs still cannot touch; below 266 px they would, which is why
they stayed 48 px instead of shrinking.

Docking the save bar also fixed a defect nobody had reported: it was `sticky bottom-3`, i.e. under the
fixed tab bar — the second confirm button in this repo to sit off the edge of a phone.

Decision 105. `lib/composition/hints.ts`, 12 tests including a source-scan that the editor imports
them rather than hard-coding them; 1044 in all.

**Every number above is arithmetic, not an observation.** No browser was opened: the 390 px pass in
both themes is outstanding, and on this change it is the whole point. Also noted and not fixed, both
pre-existing: `PlayerDisc`/`SlotTarget` still carry meaning in `title` attributes (decision 072), and
`components/action-sheet/lineup-composer.tsx` still vouvoies (« Placez au moins un joueur »).

### 2026-09-23 — The second composition starts from the first

Seventh of the owner's eight remarks, and the one that was cut off mid-word: « quand on crée une
deuxième composition (par exemple pour la 10e minute), il faudrait qu… ». Asked, and he chose the
pre-fill from the composition in force at that minute.

The rule was already in the repo: `planInForceBefore(plans, minute)` — greatest `from_minute`
*strictly* below the new one — which is what picks the team « Changements déduits » measures against.
`lib/composition/prefill.ts` wraps it rather than deriving the same idea a second time, so the team
the pitch opens with and the team the card compares cannot disagree. Note that « in force » is not
« latest created »: plan the 20th, then add the 10th, and the 10th inherits the starting seven.

Placement is filtered through the sheet's starters and substitutes, so a player inherited from the 0th
minute who has since left the sheet is not placed — his post stays open, `findPlanIssues` keeps
blocking the save, and the notice names him. An applied composition is a legitimate source; copying it
is a read, and nothing here writes: `prefillFromPlans` is pure and returns `useState` initialisers, so
invariant 3 is untouched and opening the editor still leaves no row behind.

The part that needed thinking about was not the pre-fill but what the screen then says, because seven
pre-filled discs look exactly like a plan that exists. The footer used to read « À jour. » under a
composition that had never been written — decision 097's defect again, in the sentence a coach glances
at to decide whether he can walk away. `editorSaveStateFr` now answers « Rien n'est encore
enregistré. » for anything new, and `prefillNoticeFr` states the provenance above the form and
disappears as soon as he moves somebody.

Decision 106. 24 new cases in `prefill.test.ts`, three sentences added to `copy.test.ts`'s scan, 1096
unit tests. Landed on top of decision 105, whose dock this notice sits inside: the status line in the
dock is `editorSaveStateFr` rather than a ternary on `dirty`, and it is allowed to wrap.

Not done: **no 390 px pass.** Two screens' worth of new text at the top of an editor that decision 105
just spent its whole budget compacting.

### Competitions become the team's own list (decision 107)

The last of the owner's eight remarks, and the only one that was a question rather than a defect:
*qui définit les compétitions ?* Nobody did — they were four enum values compiled into the app. Now
they are a table the coach edits on `/equipe`: add, rename, reorder, archive, delete when nothing
holds it.

Every team that exists is backfilled with the four labels the enum used to print (« Championnat »,
« Coupe », « Amical », « Tournoi »), and every match is repointed at its own team's row by that label
before the column goes `NOT NULL` — so the migration cannot half-succeed and lose which competition a
match was played in. `on delete restrict` on `matches.competition_id`, archiving for the ones the team
stops playing, and the stats filter keys on the id so a rename does not orphan anything.

The migration was generated as `0003_boring_sunspot.sql` after the agent's draft collided with the
shirt-name `0002`: the journal and the snapshot were rebuilt by `db:generate` from the real 0002, then
the generated SQL was replaced by the hand-written eleven-step version, which the generator cannot
produce because the backfill is data. Conflicts with decision 103 (home/away) were resolved by hand:
`matchSubtitle` and `matchReminderTitleFr` keep their venue phrasing and now take
`match.competitionLabel` instead of the deleted map.

`package.json` goes to **0.2.0**, which is the release for the whole wave of eight remarks — dates,
ratings, home/away, shirt names, the compact composition editor, the pre-filled second composition,
the stats scroll and this. CI cuts `v0.2.0` on `main` (decision 081).

Still outstanding on all eight: the 390 px light/dark pass. Nothing in this wave was looked at in a
browser.

Tags now come with releases: the `tag` job publishes a GitHub release for the tag it cut, notes being
the squashed subjects since the previous tag (decision 108, superseding 081's one sentence that said
CI would not write release notes). Asked for by the owner, and cheap because the squash subjects are
already one line per slice.

Housekeeping: `docs/DECISIONS.md` entries 101–108 are back in ascending order. They had drifted out of
it because the eight remarks were merged in the order their CI went green rather than the order they
were numbered — 104 landed before 102 — and the file is read top to bottom by every session that
opens it. Whole blocks moved, nothing edited: `git diff --numstat` is 64 lines each way.

The 390 px pass the eight-remark wave was missing finally happened: eleven screens, light and dark,
22 screenshots, in a throwaway Playwright spec that was deleted afterwards. Two real defects, both
fixed here. Dates were still spelled out in every prose header — « Dimanche 27 septembre à 10:30 » in
the match header, above a calendar row reading « dim. 27/09/2026 », and « Blessé depuis le 13
septembre » under « Arrivé le 01/08/2026 ». Decision 101 had allowed that on purpose; decision 109
supersedes it, because the two shapes are never far enough apart for the argument to hold. Everything
is digits now, weekday kept, year always: `formatDay`, `formatShortDay`, `formatDayLabel`,
`formatWhen`, `injurySummaryFr`. `MONTHS_FR`, `formatDayMonthFr` and three `Intl` format constants are
deleted with their last callers. And the pre-fill notice stuttered — « Équipe reprise de la
composition « composition de départ » », because it interpolated `planTitleFr` into a sentence that
had already said the word; `planSourcePhraseFr` is that slot's phrase now, and the test that missed it
asserts exactly rather than with `toContain`.

Two things looked at and reported rather than changed, both waiting on the owner: on the composition
editor the goalkeeper's post sits under the sticky bench dock at the opening scroll position, and
`<input type="date">` renders in the browser's locale, so a phone set to English still offers
`MM/DD/YYYY` — no formatter of ours reaches it, and replacing the native control is a real change.

Version 0.2.1, so CI cuts `v0.2.1` and, since decision 108, publishes its release.

`1.0.0-beta.1`, asked for by the owner. The version string is the whole change: CI tags it and
publishes it, and the release step now passes `--prerelease` when the version has a hyphen in it, so
GitHub's « Latest » badge stays on the last stable version instead of moving to a beta (decision 110).
Why 1.0.0 rather than 0.3.0: what is left before this app is finished is not a feature but the
verification in `docs/DEPLOY.md` §6 — the app in a coach's hand at the pitch, outside, in daylight.

Also fixed along the way, in the owner's local stack rather than in the repository: the Docker `app`
image held a production build from before the competitions migration, so once the database reached
`0003` every query asking for `matches.competition` failed with `42703` and the browser showed the
generic React #441 with a digest. `docker compose up -d --build app` and it was clean. Worth knowing
because the image bakes a build: after pulling a migration, rebuild, or the code runs behind its own
schema. The seed also needed unpicking — a first run had died on the missing table *after* inserting
the demo team, and the idempotence guard then skipped the whole demo season, leaving one team and zero
users. Deleting that orphan row was enough; `db:reset` was not needed and was not used.

The beta on a real iPhone: « le tactile est hyper lent », about two seconds from a tap to anything.
The first thing inspected was the deployment rather than the code, and it was worth it — every function
was running in `iad1` while Neon is in `eu-west-2`, so each of the several sequential queries a render
makes crossed the Atlantic and back. `vercel.json` pins `lhr1` now, the same city as the database
(decision 111). That removes distance and nothing else: the app still acknowledges a tap with nothing at
all, and the pages still await their queries in sequence. Both were handed to the session on the other
machine, whose stop is lifted for this one task — the brief is at the top of `COORDINATION.md` and asks
for measurements before changes.

Production also needed two things fixed to be testable at all. The Vercel `DATABASE_URL` existed with
an **empty value** — the Neon marketplace integration creates the names, prefixed ones included, but the
plain variable the app reads had nothing in it, so every Server Action returned 500 and the browser
showed React #441 with a digest. Set for Production and verified by pulling it back. And the production
alias was four commits behind `main` despite green Vercel statuses on each, so `main` was deployed from
the CLI. The demo season is loaded in the Neon database at the owner's explicit request, for this test
only; he will drop the database and recreate it before it is real production.

## The production audit at iPhone 16 conditions

The owner asked for the live app to be looked at « everywhere », for visual problems and any bug there
might be, under iPhone 16 conditions, with the findings written into the plan. Three passes ran:
`npm run audit:screens` pointed at `7orteils.bgonzva.fr` (100 screens, both themes, coach and player),
and two new probes at the phone's real geometry — 393 × 852, DPR 3, touch — one walking the tabs and the
deep screens, one driving the composition editor. Four agents read the captures. Everything landed in a
new `docs/ROADMAP.md` section, roughly forty items; nothing was fixed in this pass, because the request
was to find and record.

**The mechanical checks were all clean on production**: no console output, no sideways scroll at 393 px,
no English framework string, no screen reachable by the wrong person, no page without an `h1`, nothing
permanently hidden under the tab bar at maximum scroll. That is worth stating plainly, because every
defect found needed eyes or a viewport shaped like a hand, and not one of them fails a test.

The worst is the composition editor: at 393 × 852 and the opening scroll position, **not one of the
seven posts is tappable**. The pitch box lands at 508–918 while the sticky dock holds 588–780 and the tab
bar 795–852, so eighty of four hundred and ten pixels of turf are visible — and on the create route,
zero, with the dock's top edge cutting the « Terrain » heading and the Joueurs/Postes control in half.
`elementFromPoint` at each post centre returns a tab-bar link, a bench disc, or nothing. The screen says
« Appuie sur un joueur puis sur un poste » while offering nothing to press. The header comment's own
budget — `740 − 56 − 72 − 196 = 416 px` for a 410 px pitch "with no scrolling" — counts the app header
and forgets the page header, the formation card and the pre-fill notice, so the real chrome above the
turf is 508 px. The pitch cap is not the problem.

Three screens state something untrue, the class the definition of done was written about: a match chipped
« En cours » shows « 1 – 0 » with a green **V** and announces « Victoire » to a screen reader; the recap
badges « entré en jeu » on two men its own « Temps de jeu » table calls « non entré », which is exactly
the bug `lib/rating/progress.ts:144-159` documents as fixed — the notation flow was corrected and the
recap is the copy that was missed; and « saisi après coup, sans composition : les temps de jeu viennent
de la saisie » is shown for a match nothing has been entered for, beside a button offering to enter it.

Two vouvoiements are shipped, which decision 074 forbids outright: « Renseignez-la » in
`lib/match/presenter.ts` and « Appuyez sur un poste » in a live region, where no screenshot could catch
it. « vous » and « votre » were clean, which is how both hid — the `-ez` imperative needs its own grep in
the review checklist. « À Les grosses courges » is the other language defect, on every away fixture whose
opponent opens with an article, on the one line in the calendar that does not truncate.

One finding is about the audit itself: the four `*-stats-coupe-buts.png` are **byte-identical** to
`*-stats.png`. `scripts/audit-screens.ts` asks for `?competition=cup&tri=buts`, but `competition` has
taken a UUID since decision 107 and `tri` takes English keys, so both are ignored and the page degrades
to « Toutes » / « Minutes ». The filtered screen has never been reviewed by anyone, and the tool that
exists to catch silent degradation was silently degrading. Its viewport is also still 390 × 844.

Honest timings, for the latency work the other machine holds: from a wired European connection a tab tap
reaches its heading in 283–339 ms and a deep match page loads in 1.0–1.4 s. So the owner's two seconds is
network and server, not layout — consistent with decision 111 — and the half that pinning `lhr1` cannot
fix is still the acknowledgement of the tap.

Caveat, stated in the roadmap too: the pass ran on **Chromium** with an iPhone 16 profile, not WebKit.
`npx playwright install webkit` wants system libraries that want `sudo`, so Safari's own handling of
`dvh`, `env(safe-area-inset-*)`, sticky positioning and the 300 ms tap delay was emulated rather than
exercised — and several findings live exactly there. A real Safari run is still owed, and it needs the
owner's hands for one command.

## The Safari half of the audit, and a defect that was the probe's own

The owner installed WebKit so the previous entry's caveat could be paid off, and the pass was repeated
on **WebKit 26.6** — both probes now take `PROBE_ENGINE=webkit`. The answer is that the audit's
findings are the app's, not Chromium's. Every geometry figure in the composition editor came back
identical to within one pixel of scroll rounding: pitch 508–918, dock 588–780, tab bar 795–852,
`innerHeight` 852, the same 80 px of the 410 px pitch reachable at the opening scroll. The finding
counts were equal to the unit — 27 tap targets, 153 tiny texts, 38 under-bar overlaps — and the HTTP
500 on `/match/nouveau/composition` reproduces on both engines. Nothing was added to the roadmap and
nothing removed.

The interesting part is a claim of this session's that turned out to be wrong, and is corrected rather
than quietly dropped. The first WebKit run reported **eleven console errors where Chromium had none**,
every one a `pageerror` reading « /joueur/<uuid>?_rsc=… due to access control checks », and it was
reported as a possible Safari-only production bug whose consequence would be that every tap becomes a
cold round trip. It is not a bug at all. A controlled comparison — log in, open one match page, dwell
six seconds **without navigating** — has both engines fetching 23 `?_rsc=` payloads, all `200`, with
zero page errors: webkit 26.6 and chromium 153.0.8010.12 alike, `fm_session` `sameSite=Lax`
`secure=true` on both. The eleven were prefetches the probe itself cancelled by navigating away, which
Safari surfaces as an unhandled rejection and Chromium swallows as `net::ERR_ABORTED`. Both probes now
filter that exact shape, with the experiment written into the comment, so the next session does not
spend an hour on its own footprints.

Two things WebKit did not establish, recorded so they are not read as results. Its timings were three
to ten times Chromium's — 3670 ms to log in against 379 ms, 495–1061 ms per tab against 283–339 ms —
which is the headless Linux build and says nothing about an iPhone; the honest latency numbers remain
the Chromium ones in the previous entry. And headless WebKit renders no browser chrome, so
`innerHeight` is the full 852 px in both engines, while a real iPhone spends 50–90 px of it on the URL
bar until the page scrolls. That makes the editor's reachable-turf finding an understatement on
device, not an artefact — the one thing still owed here is a pair of human eyes on a real phone,
`docs/DEPLOY.md` §6.

## Game mode, one screen instead of a page in a shell

Six things the owner asked for on the touchline screen, and the arithmetic that justified each of
them. The chrome above the pitch measured **325 px** at 393 × 852 — app header 59, `main` padding 16,
back-link row 44, scoreboard 98, gap 16, the « Sur le terrain » card header 68, card padding 8 — while
the pitch is drawn to a fixed 1080/1580 aspect ratio, so at `px-4` inside a card it was 481 px tall
with **318 of them in the clear band** between the chrome and the sticky ACTION bar. On a real iPhone,
where Safari's URL bar takes 50–90 px more, that is the « barely visible » the owner reported. It is
now 64 px above and ~73 below, and the pitch is 540 px against 715 available.

A nested layout cannot remove a parent layout's chrome, so the route moved into its own group:
`app/(app)/match/[id]/jeu/` → `app/(jeu)/match/[id]/jeu/`. Route groups do not affect the URL, so
`/match/<id>/jeu` is unchanged and the e2e happy path is the proof of that; `app/(jeu)/layout.tsx`
repeats `requireTeamContext()` verbatim, which keeps invariant 5, and costs nothing because that
function is `cache()`d. The scoreboard card, the back-link row and the pitch card's header collapsed
into one 56 px `MatchBar` holding the time, the live score, the « en cours » dot and the outbox's
pending count — the venue badge, the entry-mode badge and the phase line went, because nobody reads
them at 78′ and they are one tap away on the match page (decision 112).

The gap the owner saw between the ACTION bar and the tab bar was never a rendering glitch: the bar was
pinned at `bottom-[calc(4.5rem+…)]` = 72 px to clear a `min-h-14` = 56 px tab bar, and 72 − 56 = the
16 px of scrolling page showing through. In game mode the fix was free — there is no tab bar any more,
so the bar sits at `bottom-0`. `app/globals.css`'s `tabbar-pb` is a **third** number for the same bar
(4 rem), and the composition editor still has its own copy of this defect; both stay on the roadmap,
to be fixed with that screen rather than this one.

« Commentaire » is a real event, added end to end: the repo's first `ALTER TYPE … ADD VALUE`
(`0004_tricky_human_torch.sql`), a `noteSchema` of 280 characters with an optional `memberId`, and a
reducer branch that deliberately changes nothing — a note moves no score and no player, which is why
it needed `TimelineEntry.note` to be displayable at all. The menu is four tiles and an « Autre… »
that opens the same `ActionMenu` over a second list, `ActionChoice` having been made generic over its
key so there is one component rather than a copy. **« Faute » is no longer offered**, but `FOUL`
stays in the vocabulary: the log is append-only, so existing fouls must still render and still be
voidable (decision 114).

The owner's question — how a match can be resumed and have a summary at the same time — was a real
bug needing no race. « Après le match » and the recap both gated on `status !== "scheduled"`, so a
match 2–1 in the 20th minute offered a full summary, a man of the match, and a « Victoire » label.
Both now gate on `status === "finished"`. The subsidiary desync is genuine and is **not** fixed here:
`matches.status` is a cache of the `FINAL_WHISTLE` in the log, and when `finalizeMatchById` fails
after the event lands they disagree until somebody opens game mode. Adding the self-heal to the match
page would have cost `getLiveMatch`'s seven queries on every view, so the roadmap carries
`hasFinalWhistle(matchId)` — one existence query — and the residual lie is written down rather than
papered over (decision 113).

The pull request was reviewed, and everything it found was in the one class no test covers: a screen
saying less than the truth. Three things had been cut from the top bar that the reader cannot recover —
the « Nous » caption, without which an away « 0 – 2 » is a team two goals *up*; « saisi après le match »,
which is the one thing qualifying the largest minute in the app (decisions 013 and 048); and the
`aria-label`s meant to compensate, which sat on a `<span>` and a `<p>` where **ARIA 1.2 forbids a name**,
so a conforming screen reader read « 1 – 0 » and nothing else. All three are back, the labels on
`role="img"`. The comment action stored its 280 characters and no timeline printed them: both builders
described an event by its actors and neither knew about `note`, now fixed by one shared `noteDetailFr`
rather than a second branch in the recap. The clock's short label « Fin » failed WCAG 2.5.3 — a visible
label must appear in the accessible name as a **whole word**, and "Fin" is only the prefix of « final » —
so it is « Sifflet », swept by a test over every phase of a 1, 2 and 3-period match. And the move itself
had changed which `not-found.tsx` answers for the route, so `app/(jeu)/not-found.tsx` is a sibling of the
app group's copy and not a duplicate. Decisions 112 and 114 were amended where the review proved them
wrong, which is the point of decision 097: a claim in a decision entry is not evidence.

Measured rather than eyeballed, on both engines: **66 px** above the pitch, the whole 538 px pitch inside
a 730 px clear band at `scrollY = 0`, **0 px** gap under the bottom bar, and the three-button bar on one
line at 375 × 667 with every target over 44 px. Version bumped to `1.0.0-beta.2` — a migration and a new
user-facing action earn it, and a beta whose number did not move would make the §6 phone test ambiguous
about which build it tested.

**Next:** Part 2 of the approved plan, the preview/production split. It cannot merge before the owner
creates the Neon `preview` branch and points Vercel's production branch away from `main` — otherwise
`main` still deploys to production while `migrate-preview` points at a database that does not exist.
Still owed from before: the super admin password is the literal placeholder `choisis-en-un-vrai`, the
Neon `neondb_owner` password has been in a transcript and wants rotating, and `docs/DEPLOY.md` §6
wants a real phone outside in daylight.

## L'équipe type, and a prior strength nobody had to choose

**2026-09-30** · `feat/best-seven`

The owner asked for a pitch in the statistics section naming the best possible seven for a chosen
measure, the worst by the same measures, positions respected, and the team figure recomputing when a
player is swapped live. Then, asked how to handle a player with one rating, he refused every option
offered and answered that the figures should be **weighted by matches played**, leaving the statistics
to be designed. That answer is the whole shape of this slice.

The design is empirical-Bayes shrinkage, and the part worth remembering is that **the prior strength is
measured rather than chosen**: within-player noise over between-player spread, by method of moments,
clamped per criterion and printed on screen — « à hauteur de 2 notes ». A uniform squad gets a sceptical
screen, a squad with real gulfs gets a trusting one, and when the spread is not measurable at all the
sentence carries no digit, because an unmeasured number printed as measured is the same lie with a
decimal point. Three properties then come out of the arithmetic instead of a `null` branch: no-data
lands exactly on the squad mean and heads neither ranking, the worst seven is protected from the man who
played twenty minutes, and nothing jumps as a threshold is crossed. Positions are an exact bitmask
assignment, not a greedy pass — greediest-first is wrong the moment two slots want the same man — and
the tests assert the greedy answer is *worse* rather than just asserting a number.

**Inventorying before designing changed the feature three times**, which is the argument for doing it in
that order. There are no per-post minutes anywhere: `gkMinutes` is the only positional figure in the
database and the reducer's `positionSpells` never reach the freeze path, so a post can only mean what a
player declared, and the card says so. A ratings seven is viewer-relative and not optionally — decision
021's gate means two teammates see two different sevens. And « invincibilité » already named two figures
(decision 011), which turned out to need two *fitted models*, not one scoring rule: shrinking a keeper
toward an all-pitch mean would mix two populations, so keepers are only compared with keepers. None of
the three would have been found by writing the screen first. No migration and no new table: the only
new query counts which formation the team has actually played.

**Measuring at 390 px found five defects a green suite could not.** The keeper's caption was clipped
14 px by the pitch's own `overflow-hidden`; moving it above the disc overlapped the centre-back's by
18 px, because those two share the 500‰ column — his figures sit beside him now. Every raw caption
truncated on assists, needing 120 px in 96. Under « La pire équipe » the explanatory sentence still read
« qui est le meilleur sur le critère choisi », the screen saying the opposite of the seven above it. And
**one real touch tap silently swapped two players**: the picker opened on `pointerup` and the
synthesised `click` landed on the sheet's first row.

Also landed, from two sessions' worth of the same accident: `.prettierrc` and `.prettierignore`.
Prettier has now twice reformatted the whole of `docs/DECISIONS.md` — `*emphasis*` to `_emphasis_` on
every line, a blank line before every `---`, several hundred lines burying the paragraph actually added
— and both times the file had to be rebuilt from `HEAD` by hand. The config pins 100 columns and ignores
Markdown outright, while saying at length what it deliberately does **not** do: 106 of 274 source files
differ from what Prettier would emit, so this repository is hand-formatted and `--check` is not a gate.

**Next:** Part 2 of the approved plan, the preview/production split, still blocked on the owner creating
the Neon `preview` branch and pointing Vercel's production branch away from `main` — the second of which
was done later the same day, on `vercel-production-placeholder`. Owed from before and
still owed: the super admin password is the literal placeholder `choisis-en-un-vrai`, the Neon
`neondb_owner` password has been in a transcript and wants rotating, and `docs/DEPLOY.md` §6 wants a real
phone outside in daylight. The natural follow-up to this slice is on the roadmap rather than half-built:
per-post minutes, which would make « meilleur milieu droit » a measurement, and saving a seven as a real
composition.

## Eight defects and two words, from a thumb on a real phone

**2026-09-30** · `feat/match-bar-composition-filters`

The owner used the app on his iPhone and came back with **nine** items. This slice is the eight defects
and the two words he asked to be changed; the ninth and the rest of the batch are two further pull
requests, designed and approved and not started — **the ratings redesign**, and **icons for the ACTION
menu plus a « remarques » category**. So a session picking this up should read that as the queue rather
than looking for new work.

**« L'équipe type »'s filters were 216 px of question above the first answer.** Four rows of `min-h-11`
chips in the page header, on a 393 px phone whose pitch then began below the fold. They are four labelled
native `<select>`s in a two-column grid **below** the pitch now: 160 px, and a 48 px tap target where a
chip was 44. The type size is untouched on purpose — `components/ui/input.tsx` sets `text-base` because
anything under 16 px makes iOS Safari zoom the page the moment a picker opens, so « smaller » had to come
out of the layout. Decision 100's two properties survive, by two paths to the same query string: with
JavaScript, `onChange` pushes `equipeTypeHref(next)`; without it, a `<form method="get">` submits the four
selects. **The second path is what taught us something**, because it sends `?critere=` for anything left
at its default and `equipeTypeHref` never writes an empty value — so the parsers had never been handed
one, and two of them were inline in `page.tsx` where Vitest could not reach them at all.
`parseCompetitionId` and `resolveFormationOverride` are in `lib/stats/best-seven-copy.ts` now, and all
four have a test for `""`. Moving the controls also turned one sentence from misplaced into **false**:
`NO_FORMATION_FR` ended « ou choisis une forme toi-même ci-dessus », and the state it appears in is
exactly the state with no formation control on screen. The clause is gone (decision 116).

**The game-mode clock was overlapping the score, and the bar had been overflowing before kickoff.** The
clock was the only child flex was allowed to squeeze — `min-w-0`, no `shrink-0`, beside a score and an
action both `shrink-0` — so the row gave way at the one thing a coach reads at arm's length, and `MM:SS`
in 30 px digits spilled under the score. It is `shrink-0`, and the **action** is the child that yields and
clips. Measured in a headless browser against the compiled CSS rather than estimated, inside the 369 px
the row has at 393: the typical row wanted 355 and wants 321. **The word « Nous » was 34 px of that**, and
with it « 00:00 » and « 0 – 0 » beside « Composition » wanted 370 of 369 — the bar overflowed in the state
every match begins in, which is why a thumb found it and no test in this repository ever would. The
review of #104 was right to put that caption back after decision 112 first cut it, so the fact is kept
and only the word is gone: **our own figure is underlined**, an underline and not a colour, because
`--color-accent` on one of two numerals reads as a state and a score has no state.
`SCORE_SEPARATOR_FR` is exported from
`lib/calendar/labels.ts` so the app still has one scoreline (decision 064). Two rows cannot fit at any
font metric — « 10 – 10 » with a stoppage span, and a match printing « 120:00 » — and they are on the
roadmap with what would actually fix them.

**« Envoi » → « Début » broke WCAG 2.5.3 in the same breath as fixing the word.** The clock button
announces its label and « Début » is not a word of « Coup d’envoi », so voice control saying the visible
word would have hit nothing. The final whistle's fix — change the *short* label, « Sifflet » rather than
« Fin » — was unavailable, because « Début » is the word that had to be visible. So the **accessible name
is what gave way**: `clockActionFr` returns a third string, `name`, which is `label` everywhere except the
two kick-off branches, where it is « Début : coup d’envoi [2ᵉ période] ». Three strings for one action,
still in one function so they cannot drift, with `presenter.test.ts` walking every reachable phase of a
1, 2 and 3-period match asserting the containment (decision 117).

**Three defects in the composition editor, and the third is the one worth remembering.** The **minute
field could not be emptied**: it was the only controlled `type="number"` in the app whose state was a
`number`, and `clampMinute` turned `""` into `NaN` into `0`, so it snapped back the instant it was empty
and reaching 10 meant typing `010` then deleting from the left. It holds the typed string now, like
`MinuteInput` in `retro-form.tsx` — `""` is legal to be in and invalid to submit, and `parseMinute`
returns `null` and never 0, because `z.coerce.number("")` is 0 server-side and a silent 0 would overwrite
the starting composition. The **dock floated 16 px above the tab bar**: the dock said 4.5rem = 72,
`BottomNav` is 56, `tabbar-pb` said 64, three places that had to agree about one height and did not — and
that is precisely why fixing the identical subtraction in game mode (decision 112) did not travel, because
that route has no tab bar, so the number was made irrelevant rather than corrected. `--tabbar-h` is the
one source now and all three read it; 788 against 787 at 390 px in both themes, the 1 px being the bar's
own border (decision 118). And **dragging a player onto the bench put him in a defender's slot**: the
bench was a drag *source* only, and the dock is `sticky z-20` over a `z-auto` pitch, so a finger on the
bench is still inside the pitch's bounding box — `pointOf` answered with a valid point near the goal line
and `nearestSlot` took over. `usePitchDrag` hands the raw **client** point to `onDrop`/`onMove` beside the
pitch point, and the editor tests the dock's rect *before* anything reads the pitch point: the dock is
painted in front, so it wins on overlap, and the pitch's 12 px of forgiveness is deliberately not extended
to it. The lifted disc is still clipped by the pitch's `overflow-hidden` — that is what keeps markers on
the turf — so what replaces it is feedback driven from the same containment test, and the ring and the
drop cannot disagree.

**The bench defect shipped because the e2e suite placed every player by tapping.** `usePitchDrag`'s whole
pointer path had no browser-level coverage at all, on any screen. There is a drag test now, in
`e2e/happy-path.spec.ts`, and it was verified to fail against the unfixed code. Its subtlety is worth
carrying forward: `usePitchDrag`'s `end` closes over the `drag` state of the render its handler was
attached to, so a `pointerup` in the same task as the `pointermove` still sees `moved: false`, calls
`onTap`, and the test passes for the wrong reason. The assertion between the two is the render tick that
defeats it. **That closure has now produced a false negative twice in this repository.** The other two
callers of the gesture — TERRAIN and « l'équipe type »'s pitch — still have no drag test, and both have
something painted in front of the pitch that the new client-point check would have to be right about;
that is on the roadmap.

Gate, all of it on the whole tree: `npm run typecheck` clean, `npm test` **1298 passed across 64 files**,
`npx eslint` silent on the repo's sources, `npm run test:e2e` **4 passed**.

**Next:** the two approved pull requests above — the ratings redesign, then the ACTION icons with a
« remarques » category. Still owed from before and still owed: Part 2 of the approved plan, the
preview/production split, blocked on the owner creating the Neon `preview` branch and pointing Vercel's
production branch away from `main` — that second one is since **done**, and no longer load-bearing either;
the super admin password is the literal placeholder
`choisis-en-un-vrai`; the Neon `neondb_owner` password has been in a transcript and wants rotating; and
`docs/DEPLOY.md` §6 wants a real phone outside in daylight — which is, after this slice, exactly the
instrument that found all eight of these.

## Merging and shipping, pulled apart

**2026-09-30** · `ci/production-on-a-tag`

Part 2 of the approved plan, which had been blocked since #104 on the owner creating the Neon `preview`
branch and pointing Vercel's production branch away from `main`. The second is **done** — the production
branch is parked on `vercel-production-placeholder`, which the owner set today — and the first is
*claimed* by the `PREVIEW_DATABASE_URL` secret existing, which no session can read. On that basis the
split landed: a push to `main` runs the checks, migrates the **preview** database and deploys the preview,
and cuts no tag; a tag `v*` pushed **by hand** gates, re-tests, migrates production, deploys production
with the Vercel CLI and publishes the release. Nothing else deploys anywhere. Decision **119**.

This entry said, in its first version, that the parked branch meant « a `main` push has been a Preview
deployment all along ». **That was false, and the next entry is what came of it** — it is left here as a
correction rather than deleted, because the sentence is the whole lesson.

**The interesting part is that this reverses 081 and 078 without contradicting either's reasoning.** 081
said a convention a human has to remember is one the next session will not know about, and it is right —
so the argument had to be answered rather than ignored. It was about the *failure*, not about who acts:
the failure is a tag that names a version nothing verified, and that property is now a gate with three
guards (the tag equals `v$(package.json version)` **at the commit it points at**, the commit is reachable
from `origin/main`, the same checks pass on it) instead of a generator. The gate also names, in its error,
the command that deletes a bad tag. What is honestly given up is stated in the entry rather than
smoothed over: forgetting to tag is now possible, and it costs an untagged version sitting tested on the
preview while production serves the last tag — a safe failure, unlike the published false claim 081
feared. And 078 rejected a repository `VERCEL_TOKEN` against « a window of seconds » *while `main` was
production*; deploying from CI now buys a guarantee rather than seconds, since the deploy job `needs` the
migration job. 078 named « a dropped column, a narrowed type » as its own trigger to revisit, and PR 3 of
the plan does both, so that trigger was about to fire anyway.

`checks.yml` is new and holds the two jobs verbatim, `workflow_call` only, called by `ci.yml` and by
`release.yml` — one copy, because two copies of forty lines of `postgres:17` service configuration is how
two callers quietly start testing different things. Worth knowing before editing it: inside a reusable
workflow `github.event_name` is the *caller's* event, and it declares no `concurrency` group on purpose,
because a group declared in a reusable workflow is shared by every caller and a tag run would cancel the
`main` run that produced it.

The documentation half was the larger half, and it is the reason this entry exists: `CLAUDE.md` still
said « **Never create a release tag by hand** », which is the sentence every future session reads and was
now the exact opposite of the truth. `docs/DEPLOY.md` said a push to `main` was a production deploy, that
`DATABASE_URL` was one variable with the same value on Production and Preview, and that « Squash-merge
the pull request. That is the whole procedure … Nothing to run by hand ». It now carries a numbered
« Shipping a version » — bump, merge, look at the preview, tag and push — plus what to do when the gate
refuses a tag, and the variable table names `PREVIEW_DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID`. 080's `vercel.json` mechanism is untouched; two of its *sentences* are not, and 119
says which.

**One thing nobody in a session can check, and it is the sharpest risk here.** Whether the
`PREVIEW_DATABASE_URL` secret actually holds the Neon preview branch's string is unverifiable from this
side — a GitHub secret is write-only and the Vercel values are sensitive. If it holds the **production**
string, every merge to `main` now migrates production, and the job would print `migrations applied` and
go green while doing it. That is a « still to verify » in `docs/DEPLOY.md` §2 and an open roadmap item
worded as a question to the owner, because it is his to answer and not ours to assume.

**Next:** PR 3 of the approved plan, which drops a column and narrows a type — the first migration that
is not safe in both directions, and therefore the first one to ship through the new flow deliberately,
with the preview looked at between the merge and the tag. Still owed from before: the super admin
password is the literal placeholder `choisis-en-un-vrai`, the Neon `neondb_owner` password has been in a
transcript and wants rotating, and `docs/DEPLOY.md` §6 wants a real phone outside in daylight.

## The premise of the entry above was false, and six documents said it

**2026-09-30** · `ci/production-on-a-tag`

A review of the branch asked the one question nobody had asked: *is* a push to `main` a Preview
deployment? The Vercel and GitHub APIs were checked, and the answer was no, twice over.

- The last three deployments Vercel's Git integration ever made were the `main` squash-merges of #104,
  #105 and #106, and **all three were `target=production`** — the newest at 11:23 UTC. So right up to
  today, merging a pull request deployed production. That is the thing decision 119 was written to stop
  and the thing the document described as already handled by dashboard state.
- The owner parked the project's production branch on `vercel-production-placeholder` later the same day —
  that part is true and verified through `GET /v9/projects/…`. But the merge of `1e6ec71` at 14:46 UTC,
  the first after the parking, has **zero** Vercel commit statuses, zero GitHub deployments and no Vercel
  deployment record. A `main` push went from deploying production to deploying nothing at all, and the
  claimed Preview never existed on either side of the change.

So the sentence « a push to `main` moves the Preview deployment at `dev.7orteils.bgonzva.fr` » was wrong
in both directions, and it was in `CLAUDE.md`, `docs/DEPLOY.md`, `docs/DECISIONS.md` 119,
`docs/ROADMAP.md`, `docs/SESSIONS.md` and both workflow headers. **Nothing in the repository could have
caught it**, which is the actual finding: it was a dashboard setting, and a paragraph asserting one is a
paragraph nothing checks.

**The fix is to stop depending on the dashboard.** `vercel.json` sets `git.deploymentEnabled` to `false`
for **every** pattern including `main`, so the Git integration issues nothing ever, and CI issues both
deployments itself with the Vercel CLI: a new `deploy-preview` job in `ci.yml` (`vercel pull
--environment=preview`, `vercel build`, `vercel deploy --prebuilt`, **no** `--prod`) ordered
`needs: [migrate-preview]`, and the existing `deploy-production` in `release.yml` ordered after
`migrate-production`. Three consequences worth having in words. « No deployment for anything but `main` or
a tag » is now true by construction — nothing outside a workflow can deploy, `pull_request` reaches no
deploy job, `release.yml` fires only on `refs/tags/v*`. The seconds-wide race between schema and code that
decision 078 documented is **gone for the preview too**, not merely survivable there. And parking the
production branch stops being load-bearing: it is defence in depth now, worth keeping and no longer a
blocker.

**Two more corrections from the same review, both of which the docs had stated as procedure.**
Re-pushing an unchanged tag is **not** a retry — `git push` of a tag the remote already has at the same
commit prints `Everything up-to-date` and emits no push event, so `release.yml` never starts; the retry is
`gh run rerun --failed <run-id>`. And **rolling back by tagging an older commit cannot work**, for two
independent reasons: a `push` event resolves `uses: ./…` from the pushed ref's own commit, and every
commit older than this branch has no `release.yml`, so such a tag runs nothing silently; and
`npm run db:migrate` is forward-only, so production would serve older code against the newer schema. A
rollback is a forward fix — revert, bump, merge, look at the preview, tag.

**What is still not known, said as questions rather than as facts.** All three secrets and both variables
exist (checked through the GitHub API), so a `main` push will not go red for want of a credential — but
**what is inside `PREVIEW_DATABASE_URL` is unverifiable from any session**, because the API returns a
secret's name and never its value and the Vercel copy is sensitive on purpose. If it holds the production
string, every merge migrates production, green and silent. Whether the Neon `preview` branch exists at all
is unverified for the same reason. And one piece of dashboard state the design does still depend on, which
unlike the production-branch setting is *readable*, and is how it was found:
**`dev.7orteils.bgonzva.fr` is pinned to the git branch `main`** (`gitBranch=main`). A git-pinned domain
cannot be re-pointed with `vercel alias set`, so `deploy-preview` sets `VERCEL_GIT_COMMIT_REF: main` to
make its deployment claim the branch. That is **expected to work and has not been observed**; the first
`main` push after this merges is the test, and if `dev.` does not move the owner removes the pin and CI
aliases the domain explicitly. `7orteils.bgonzva.fr`, by contrast, has no git pin and is attached to the
Production environment, so a `--prod` deploy takes it — verified.

**Next:** unchanged — PR 3 of the approved plan, the first migration that is not safe in both directions.
Before that, the first `main` push wants watching for the two things it is the only test of: that
`deploy-preview` actually deploys, and that `dev.7orteils.bgonzva.fr` serves what it deployed.

## One rule for when a pointage opens, and a browser check that lied

**2026-09-30.** One defect, one file of production code, twelve lines changed — and a verification that
took longer than the fix and was worth every minute of it.

**The defect.** Decision 099 (#88) gave the training pointage a window: it opens half an hour before the
séance, and `markTrainingAttendance` and `markEveryonePresent` both refuse to write outside it. It left
the third place that decides whether the list is *offered*, the inline card on `/entrainements`, still
asking « is the séance today? ». So at 08:00 on the day of a 19:00 séance that page rendered « Tout le
monde est là » and thirteen présent/absent rows, and every tap on them wrote nothing at all — the action
returned early, correctly, and the screen said not a word. 099 existed to replace an untruth with a
refusal; this call site turned the refusal into a dead button, which is worse, because a wrong number at
least looks wrong. `attendanceIsOpen` is now the only thing in the repository that answers the question,
with three callers and no fourth (decision 120).

Found by `tsc`, not by reading: a later branch touched that page's imports and the wrong predicate
was two lines away. Nothing in the suite could have caught it — the predicate itself is in `lib/` and
well tested, it was a call site that was wrong, and Vitest collects `lib/**` and `db/**` only.

**The verification, and why its first run was worthless.** Three cases at 390 px in both themes,
driven by a throwaway Playwright script: a séance three days out (must not offer the list), a séance
**today at 23:30** — the case that discriminates the old rule from the new — and a séance eighteen
minutes away (must offer it). The first run reported « ×0, ×0, ×0 » for all three, which is the
expected answer for two of them, including both cases meant to prove the fix. It was **void**. The
local database was three migrations behind `main`, `getCalendar`'s join onto `competitions` (#97)
threw, and `/entrainements` rendered the error boundary every time. What gave it away was not the
numbers, it was six screenshots with byte-identical sizes across three different cases. **A check
that counts the absence of a string must first assert the page rendered**, and that assertion is now
the first thing in any script of this kind.
After `npm run db:reset`: 0 / 0 / 1 across light and dark, which is the fix. Second, smaller: a direct
`UPDATE` on `trainings` calls no `revalidatePath`, so the séance has to be moved before the page is
opened, not between two shots of it.

`npm run typecheck`, `npm run lint` and `npm test` pass — 64 files, 1310 tests. The demo season is back
as the seed leaves it, and the throwaway script is deleted.

**Next:** the iPhone tap-latency brief in `COORDINATION.md`, the one task whose STOP the owner lifted —
measure first and write the numbers down, then the sequential awaits in `lib/queries/`, then tap
acknowledgement, then the iOS suspects, one pull request per concern. And the départed-marks slice
(« 11 présents sur 14 pointés » over ten green badges), whose local commit deliberately does not
typecheck and enumerates its five errors.

## The two unobserved things in the entry above, observed

**2026-09-30.** The entry two above this one ended with a list of what decision 119's design was
*expected* to do and had never been seen doing. Two of those are now facts, so the list should not
keep claiming otherwise.

**`deploy-preview` deploys.** It has now succeeded on three pushes to `main` — the two at 16:08 and
16:26 and the merge of #109 at 22:17 — each after `preview-migrations`, which also succeeded. So
neither the `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` route nor the migration step is missing a credential.

**`dev.7orteils.bgonzva.fr` serves what that job built,** which was the open question, because a
git-pinned domain cannot be re-pointed with `vercel alias set` and the workaround was to have the
job claim the branch with `VERCEL_GIT_COMMIT_REF: main`. Verified by comparing the HTML the domain
returns for `/connexion` against the HTML the run's own deployment URL returns for the same path:
identical (`md5 7d4e4b13…`), served from `lhr1` as decision 111 pinned it. The pin can stay; CI does
not need to alias the domain explicitly.

**Still unverified, and still unverifiable from any session:** what `PREVIEW_DATABASE_URL` actually
points at. The GitHub API returns a secret's name and never its value, so if it holds the production
string then every merge to `main` migrates production, green and silent. Nothing in this session's
merge would have shown it either way — #109 adds no migration, so `preview-migrations` had nothing
to apply that was not applied already. That check remains the owner's, from a place that can read
the value.

## Where the two seconds on the iPhone actually are

**2026-09-30.** Step 1 of the tap-latency brief in `COORDINATION.md`: measure, and write the numbers
down before changing anything. No production code changed in this entry. The short version is that
the owner's instinct about *what* is slow and the brief's guess about *why* point at two different
things, and the numbers back the first and not the second.

**Method.** A throwaway Playwright script at 390 × 844, logged in as `karim`, tapping each tab from a
neighbouring screen five times and taking the median of two numbers per tap: how long the server took
to answer the navigation's RSC request, and how long from the click until the target screen's own `h1`
is on screen. Two profiles: this laptop unthrottled against a warm `next dev`, and the same with CDP
CPU throttling ×4 and 100 ms RTT / 10 Mbps, which is an optimistic 4G. Production numbers separately,
with `curl` against `dev.7orteils.bgonzva.fr` from a wired European connection.

| tab tap | server RSC | tap → heading, no throttle | tap → heading, CPU ×4 + 100 ms RTT |
| --- | --- | --- | --- |
| Calendrier | 35 ms | 216 ms | 342 ms |
| Équipe | 34 ms | 216 ms | 356 ms |
| Stats | 33 ms | 217 ms | 844 ms |
| Moi | 31 ms | 126 ms | 367 ms |

Production path, `/connexion` (a screen that queries nothing), `cdg1::lhr1`, every response
`x-vercel-cache: MISS` because every render is dynamic:

| | TTFB |
| --- | --- |
| first request after an idle period | **1.54 s** |
| the five that followed it | 118 · 148 · 328 · 118 · 152 ms |
| warm, a second run | 155 · 203 · 161 ms |

**1. The server is not the bottleneck, and neither are sequential awaits.** 31–35 ms of server think
time for a whole screen. Step 2 of the brief asks for `Promise.all` over sequential awaits in
`lib/queries/` and the page components — and that work is, with one exception, already done: 17 of the
21 pages under `app/(app)/` already wrap their queries in `Promise.all`, and almost every function in
`lib/queries` is a single `SELECT`. The exception is the one chain that runs before **every** page:
`requireTeamContext` → `requireActor` → `getCurrentUser` → `readSession` is four *dependent* database
round trips (session, then user, then memberships, then team) before a page's own first query starts.
Two of the four can be collapsed into joins. In-region that is worth single-digit milliseconds, so it
is a tidiness fix and it will not be shipped as a latency fix or described as one.

**2. A cold function start is 1.54 s, on a page that reads nothing.** That is the two seconds, and it
is the one number in this entry of the right order of magnitude. It also explains why the owner feels
it and a synthetic run does not: a benchmark loops and stays warm, whereas a coach opens this app on
a Sunday morning, having not touched it since the previous Sunday, and pays the cold start on the
first tap of every session. Every render here is dynamic (`x-vercel-cache: MISS` on all of them),
because every screen is behind a cookie — so there is no cached HTML to answer from while it boots.

**3. Nothing acknowledges the tap, so the whole wait is indistinguishable from a dead phone.** There
are **zero** `loading.tsx` files in this repository, no `useLinkStatus`, no `<Suspense>` and no
`useTransition` anywhere in `app/` or `components/`. `components/nav/bottom-nav.tsx:32` is a bare
`<Link>`: it has a `text-accent` colour for the tab you are *on* and no pressed state at all, so
between the tap and the new screen the only feedback is Safari's own grey flash, which is over in
100 ms whether the answer takes 200 ms or two seconds. This is the finding worth acting on. It does
not make anything faster and it is the difference between « c'est lent » and « ça n'a pas marché ».

**4. `/stats` is the one screen that costs real server work** — 844 ms throttled against 342–367 ms
for its neighbours, and 314 ms against 109 ms as a cold local load. Its own aggregation, not the
shared prefix, and the one place where a `<Suspense>` boundary would pay for itself twice.

**5. A tap that lands before hydration becomes a full document load.** Under CPU ×4, tapping the
instant the previous screen's heading appeared produced a native link navigation rather than a router
navigation in 5 of 5 samples on Calendrier and 1 of 5 on Stats — the slowest possible path, since it
re-downloads and re-executes everything. This was found by accident: the first version of the script
timed with `performance.now()` inside the page and reported **negative** durations, which is only
possible if the document was replaced and the time origin reset. Timing from Node's clock and leaving
a marker on `window` to detect the swap is what turned a broken measurement into a finding.

**The four iOS suspects the brief lists are all clean**, each with the file that clears it:
`width=device-width` and `initialScale: 1` are set in `app/layout.tsx:22`, so there is no legacy
300 ms tap delay; there is no `-webkit-tap-highlight-color` override anywhere, so Safari's own
highlight is intact; `touch-action` appears only where a drag needs it — `touch-none` on the pitch
discs and the terrain sheet, `touch-pan-x` on the bench strip, each with a comment saying why — and
never on the tab bar or a chip row; and there is not a single `onTouchStart` or `onTouchEnd` in the
codebase, so nothing is bound to `touchend` instead of `click`.

**Next, one pull request per concern, in this order:** acknowledge the tap (finding 3, and finding 5
belongs to it — a pressed state renders before hydration, a router pending state does not);
`<Suspense>` on `/stats` (finding 4); and the auth prefix joins (finding 1) described as what they
are. The cold start (finding 2) is the largest number here and the least code: it is
infrastructure — the owner's lane — so it is written down and not touched.

## Typing up a match that was played without the phone

The owner asked for one thing: mark a game as over at any time, and then edit it, because backfilling
the season currently forces him through game mode for afternoons that finished weeks ago. Tracing it
found a genuine deadlock rather than a missing button. `/match/[id]/saisie` — the retro-entry screen,
shipped in M7 and working — is reachable only from a card gated on `status === "finished"`;
`finalizeMatch` was the only writer of that column and refuses without a `FINAL_WHISTLE` in the log;
and the only thing that appends one is game mode. The single match in the repository in the wanted
state is the seed's J6, which exists only because the seed writes the column by hand.

Four product answers shaped it: two entry points (« Saisir le match » finishes *and* opens the form,
« Marquer comme terminé » finishes and stays), no chronology gate at all, the retro form exactly as it
is, and a « Rouvrir le match » undo. Decision **121** records the whole thing, and the part worth
repeating here is the mechanism *not* used: a bare `FINAL_WHISTLE` would have been one line and is
wrong, because `getMatchScores` counts `match_events` rows — so one whistle turns « nobody recorded
this » into « 0 – 0 » on the calendar, the wave-3 untruth `CLAUDE.md` names, and makes
`submitRetroMatch` refuse the whole-match form. Setting the column and leaving the log empty is the
J6 state every screen already renders correctly.

Both actions refuse once the log is non-empty, which is where the scope line falls honestly: a match
with a déroulé is `live` or `finished` already, and a `live` one has a correct ending in game mode's
own whistle, which derives the minute from the reducer. Reimplementing that outside the reducer to
save a tap would trade invariant 2 for nothing.

**Three ripple effects of « any time, including a future date », two of which were only visible by
looking.** `lib/calendar/timeline.ts` split past from future on `endsAt` with `isLiveEvent` the only
status override, so a match dated next Sunday and declared over sat under « À venir » while its own
page called it finished — one screen contradicting another. It has the mirror now, `isFinishedEvent`,
and a match ended early leaves « À venir » at the whistle rather than at `endsAt`. Game mode drew a
0-0 scoreboard and a « Coup d'envoi » button for a finished match with an empty log, because the
reducer reads an empty log as « not started »; that state used to be seed-only and unlinked, and is
now one tap away, so the page redirects. And the first draft put the new card ~1 500 px down the match
page, below the availability grid and the « relancer » message — a screenshot at 390 px is what caught
it, and the fix was a component rendered in one of two slots: leading for a match already played,
because that is the only reason the coach is on the page, and low for a fixture still to come.

**Two things about the checks.** The e2e test passed alone and failed in the full suite, reporting
« rien saisi » on a recap after a successful submission. It looked exactly like a revalidation race
and was not one: a probe that visited the recap *before* entry to poison the tab's cache, then
navigated four different ways afterwards, found all four correct. The real cause was the test's own
`page.goto` to the recap fired in the same tick as the save — `submitRetroMatch` redirects there
itself, so the `goto` was redundant, and it cancelled the POST still in flight. Waiting for the
action's own navigation is shorter and actually asserts the submission landed. The lesson generalises:
**after clicking a Server Action's submit, never navigate — wait for where it takes you.** Second,
`toHaveCount` re-queries a locator but never reloads the document, so a genuinely stale page burns the
full timeout instead of settling; an assertion that polls for twenty seconds and never changes is
evidence about the page, not about timing.

Left as a roadmap line rather than fixed, because it is a product call: a match in the past that
nobody has declared over still shows « Ta réponse » with « Tu peux changer d'avis jusqu'au coup
d'envoi », and still offers the coach a « relancer » message. Both gate on `status === "scheduled"`,
which was a fair proxy for « still to come » until this change; the untruth is older than the change
and merely easier to reach now.

## Six words a coach says out loud, and one event type to hold them

The owner wanted to tap « bon retour » or « mauvaise passe » about a player while the match is
running, and he listed six of them. The whole of the design question was whether that is six event
types or one, and the answer is **one**: a `REMARK` whose payload carries `{ kind, memberId }`, with
`kind` drawn from `REMARK_KINDS`. Six enum values would have been six `ALTER TYPE … ADD VALUE`
statements, six payload schemas, six label rows and six branches in two formatters, and the seventh
remark the owner thinks of next Sunday would have been a migration on a production database for one
word. Decision **122** records it, including the trade it accepts: the database no longer says which
kinds exist, so an unknown one is a runtime concern — refused at ingestion by the strict payload
schema, and read by the reducer as a remark naming no kind and nobody, because the reducer may never
refuse a log Postgres has accepted. `tsc` covers the ordinary mistake instead: `REMARK_LABELS_FR` and
`REMARK_ICONS` are `Record<RemarkKind, …>`, so a seventh kind without its French or without a drawing
does not compile.

Four things fell out of it that are worth knowing before touching the area. `memberId` is
**required**, which is the only difference from decision 114's `COMMENT` — « bel effort » about nobody
is a note, not a remark — so the sheet opens with no player chosen and the button disabled under a
hint saying why. The reducer computes **nothing** from a remark, and that is asserted as whole-state
equality against the same log without it rather than field by field, so no figure can quietly start
depending on one. **One** formatter, `remarkDetailFr` in `lib/match/presenter.ts`, serves game mode's
timeline and the rating recap, which is 114's lesson applied before it cost anything — two screens
formatting the same event is how one of them drops it. And remarks do reach the shared match summary,
which the owner asked for: it works because `HIDDEN_EVENT_TYPES` in `lib/rating/recap.ts` holds only
`PAUSE`, `RESUME` and `VOID`, which is a property of a set three screens away, so a test pins it.

The minute a remark carries is **the minute the ACTION menu was opened**, not the minute the coach
finished picking a name out of a `<select>` — decision 031 already decided a tap is stamped when it is
made, and the two-step sheet does not change that.

The other half of the branch is that the action tiles are now **drawn** as well as named, the ACTION
menu and the six remarks alike. Hand-rolled inline SVG on `components/theme/theme-toggle.tsx`'s
pattern: one shared `<Icon>` frame, `stroke="currentColor"` with no fill so a tile's tone tints its
drawing and light and dark are free, and `aria-hidden="true"` so a tile's accessible name stays its
French label alone. There is no icon dependency in this repository and the comment at the top of
`components/action-sheet/action-icons.tsx` says there is not to be one. They were rasterised at 16 px
and looked at rather than trusted, and four were redrawn after the first pass turned to mud — a
24-unit grid stroked at 1.75 units holds about four strokes, so each drawing is a ball, a box, an
arrow, a shield or a star and nothing more. **`ACTION_ICONS` is keyed by tile and `REMARK_ICONS` by
`RemarkKind`**; the second is a total record on purpose, which is what makes a new kind fail the
typecheck rather than ship a blank tile.

**Next**, and both are written down in `docs/ROADMAP.md` rather than started: there are **no
per-remark statistics** — counting « mauvaise passe » per player is a different feature, and since a
remark is an opinion rather than an observation it needs a product answer about what the count is for
before a column exists for it — and a remark is **tapped live only**, because `RETRO_FACT_TYPES` in
`lib/retro/log.ts` is untouched, so a match typed up after the fact cannot carry one.

## Acknowledging the tap, which is CSS before it is JavaScript

**2026-10-01.** Step 2 of the tap-latency brief, and the first of #111's findings to turn into
production code — finding 3 (nothing acknowledges a tap) with finding 5 folded into it, because the two
are one problem seen from either side. #111's fifth finding is the whole reason the order matters: a tap
landing before the tab bar has hydrated does not route at all, it becomes a cold native document
navigation, 5 of 5 samples on Calendrier under CPU ×4. So the acknowledgement the owner is missing has
to exist in a window where no JavaScript has run, and `useLinkStatus` cannot reach it. The pressed state
is therefore plain CSS and comes first — `active:bg-surface-2` on the tab itself, with no
`transition-colors` so the fill lands in the same frame as the touch, and the tab bar was the one
tappable surface in the app carrying no `active:` class at all. The hairline from `useLinkStatus` is the
second half and says something else: the router took the tap. It is `aria-hidden` and wordless, which is
**decision 122** applied rather than relearned — the action tiles' SVGs are `aria-hidden` so a drawing
added for the eye stays out of the control's name — and `.fm-pending` holds it invisible for 180 ms
because a tab navigation measured 126–217 ms unthrottled and an indicator that appears and vanishes
inside that is noise. `/moi` combines its two independent queries; `/stats` deliberately does not,
because `getSeasonStats` consumes the id `parseCompetitionId` has just validated against
`getTeamCompetitions`.

**The thing this session got wrong and then removed is the more useful half of the entry.** `/stats` was
given two `<Suspense>` boundaries with a content-free skeleton, and they are **gone**: a streaming
boundary puts the *fallback* in the HTML and swaps the content in with an inline script, so with
JavaScript off the reader sits on the skeleton for good while the figures sit finished and hidden in the
same document — and decisions 100 and 116 made those chips `<Link>`s precisely so this screen reads and
filters without JavaScript. It also only engages when the query outruns the shell flush, so the fast
case keeps the no-JS path and the slow case, which is the phone case, loses it: the normal case was the
broken one. Two further defects left with it rather than being patched — the skeleton promised three
cards where a new team's true answer is often zero, and `e2e/first-run.spec.ts`'s fresh-bootstrap reader
would have met three pulsing outlines on the way to « Pas encore de statistiques ». A skeleton standing
in for an empty state is an untruth with an excuse built in.

What the boundary left behind is the measurement that says why there is no third acknowledgement to be
had. With the boundaries in place the router committed the `/stats` shell before the 180 ms elapsed:
**0 hairlines at 100 ms on `/stats` with its query slowed by 2.5 s**, against **1 at 300 ms on
`/calendrier` with the response itself held**. That was read at the time as « the two compose rather
than stack », which was true and was the wrong thing to be pleased about — a boundary that commits the
shell early is a boundary that takes the in-flight acknowledgement away and replaces it with a shape
stating more than it knows. Decision **123** has it as evidence for the two-and-only-two split: CSS for
the tap that lands before any JavaScript, `useLinkStatus` for the tap the router is still working on,
and nothing in between for a third to occupy.

**The verification was Playwright at 390 × 844, in both themes, against the local Docker Postgres.** The
pressed fill was measured rather than eyeballed: `rgb(233, 236, 240)` under the thumb in light, which is
`--color-surface-2`, and `rgb(32, 38, 44)` in dark, which is the same token on the other side. The
accessible names of the four tabs read `["Calendrier", "Équipe", "Stats", "Moi"]` both at rest and in the
middle of a navigation, which is the assertion that matters for the hairline — **decision 122** is about
exactly that regression, a mark added for the eye leaking into a control's name. Two negatives were
checked rather than assumed: there is no `-webkit-tap-highlight-color` anywhere in `app/` or
`components/`, because Tailwind v4's preflight already sets it to `transparent` on `html`
(`node_modules/tailwindcss/preflight.css:50`) and it inherits — which is *why* the pressed state had to
be hand-written, the framework having removed the platform's free one — and no `touch-manipulation`
either, the only `touch-action` in the tree being `touch-none`/`touch-pan-x` on drag surfaces.

**An earlier draft of this entry, and of the decision, cited « decisions 116/117 » for the
accessible-name rule. That was wrong and was caught by another session's reviewer.** 116 is the filter
`<select>`; 117 is Label in Name and runs the opposite way, saying the accessible name is what gives way
when it disagrees with visible text. The rule actually reused is 122. The cause is worth recording
because `CLAUDE.md` names it over decision 119: the citation was written from memory instead of from the
file.

`npm run typecheck`, `npm run lint` and the 1324 unit tests pass. **`npm run test:e2e` was not run.** With
the `/stats` boundary gone, the one assertion that had needed thinking about —
`e2e/first-run.spec.ts:109`'s `getByText("0 match terminé")`, which would have sat behind a fallback —
is back to reading a server-rendered string, and `:104`'s per-tab `h1` waits were never affected.
**Expected is not observed**: the browser suite still has to run on the pull request, and this entry does
not claim it passed.

**One thing went wrong and is worth not repeating.** A cleanup `pkill -f "next dev"` at the end of the
browser checks killed a dev server on port 3000 that belonged to **another session**, not to this one.
This worktree is one of several on the machine and the pattern matched all of them. Kill by the pid this
session started, never by a pattern that names the framework.

**Next**, unchanged from #111's own list: the auth prefix joins (finding 1), described as the tidiness
item it is and not as a latency fix; and the cold function start (finding 2), which is the largest number
in that entry, the least code, and the owner's lane. Two device-only checks are now in
`docs/ROADMAP.md` instead of being guessed at here — iOS Safari's own toolbar possibly eating the first
tap under `viewportFit: "cover"`, and `html { overflow-x: hidden }` against a `fixed` bar — because
neither can be settled from Linux.

## The side padding that was never applied

`/connexion` and `/rejoindre` had no side padding. Measured at 375 × 667, both themes, the form card
ran **0 → 375 of the viewport** — flush against both bezels, on the first two screens any new user
sees. `app/not-found.tsx` was worse at 0 → 390, having no `max-w` to accidentally save it. All three
carried `safe-px px-5`, and the `px-5` was dead: `safe-px` sets the longhands `padding-left` /
`padding-right`, `px-5` compiles to the `padding-inline` shorthand, and a longhand after a shorthand
wins unconditionally. Tailwind v4 sorts `@layer utilities` **by property**, interleaving custom
`@utility` rules among the built-ins rather than appending them after, so reordering `globals.css` —
the first thing anyone tries — cannot help. Nor is the new utility immune: `gutter-px safe-px` on one
element measures `0px` / `0px`, the original defect in full, because `.gutter-px` lands at 36008 and
`.safe-px` at 36192. An earlier draft of the decision entry claimed the longhands made that
unexpressible; the reviewer measured it and it does not.

Fixed with one new utility, `gutter-px`, on the three page shells. After: 20px/20px, card 20 → 355 at
375 and 20 → 370 at 390. The decision entry records the fix that was **rejected**, which is the part
worth reading: redefining `safe-px` itself looked smaller, but its one remaining user is `BottomNav`, a
`fixed inset-x-0` bar meant to run bezel to bezel, and a base gutter there would have taken four tap
targets from 97.5 to 87.5 px with nothing clipping, nothing under 44 px and every check green.

**Why this survived this long is the useful finding.** At 390 px the card is capped by `max-w-sm` at
384 and leaves 3 px, so the bug is invisible at the width we test and visible at the width the phone
is. Eyeballing at 390 could never have found it; the measurement was the whole of the work.

Also this session: **the deployment-skew theory died**, killed by the owner's own test — a force-quit
is a document navigation and always comes from the newest deployment, so a stale action id cannot
survive one, and his positions crash recurred after a force-quit. The crash was then **reproduced**
locally: `updatePlayerPositions` has no `try/catch`, so a thrown Postgres error is a 500 into
`app/(app)/error.tsx`, the transaction rolls back and nothing is written — which is why production's
`player_positions` is empty. The leading explanation is a foreign-key violation on `positions.code`,
because **nothing in a migration seeds `positions`**: `seedReference()` is reachable only by hand and
no workflow runs it, while `ci.yml` and `release.yml` both run `db:migrate` and stop. Two owner-side
facts would settle it, and a third needs no query at all — `seedReference()` writes the positions and
the built-in formations in one call, so an unseeded table shows up as a composition editor offering no
formations.

**Merged:** #117, the outbox drain before the happy path's two reloads, found because a docs-only
branch failed the e2e job — the one branch whose diff could not be the cause. #115, the
`COORDINATION.md` NOW rewrite. **Held and then cleared:** #114 arrived with a `<Suspense>` boundary on
`/stats` that removed the no-JavaScript path decisions 100 and 116 both defend — the fallback markup is
what ships in the HTML and the swap to real content is an inline `$RC()` script, so with JS off the
reader sits on a skeleton announcing « Chargement… » for ever while the figures sit hidden in the same
document, and the boundary only engages when the query outruns the shell flush, which is the premise of
the change. The peer's answer was not to patch it but to **revert the boundary entirely** — `/stats`
restored byte-identical to `main` — so what #114 ships is the tab-tap half alone, and the hairline it
adds now paints on `/stats` precisely because there is no boundary to let the route commit early. It
merged as decision 123; the gutter is 124.

## 2026-10-01 — a UX audit of the deployed preview, and what it cost to do it honestly

**What ran.** Eight parallel audits against `dev.7orteils.bgonzva.fr` — not a local dev server — at
390×844 and 320 px, light and dark, Chromium and WebKit, as the coach `karim` and as the player `hugo`.
Lanes: authentication and arrival · calendar and availability · trainings and attendance · match hub,
sheet and composition · team, roster, profiles and invites · statistics · game mode, ratings, recap and
retroactive entry · and one cross-cutting pass over the whole set, because consistency is a property of
the set and no single lane can see it. **Result: `docs/UX_AUDIT_2026-10-01.md`** (#122), 52 defects ranked
by harm, 11 scope questions, 8 absences, 24 properties worth protecting, 13 stated limits. Folded into
`docs/PLAN.md` § Amendments as ten slices, and into `docs/ROADMAP.md` as the matching checklist.

**The owner's « deux secondes avant que quelque chose se passe » on iPhone is diagnosed, and it was not
speed.** TTFB is 3–27 ms across twelve routes; the `iad1`→`lhr1` pin (decision 111) genuinely worked and
genuinely did not help. Instrumented with a `MutationObserver` started at `pointerdown`, **"first DOM
change after tap" and "new screen content" are the same number in all eighteen throttled samples** — the
first thing that changes on screen after a tap *is* the arrival of the next screen. Walking every
`cssRules` in every same-origin stylesheet, stripping `:active`/`:hover` from each selector and testing
`matches()`, found **no `:active` rule anywhere outside a `pointer-events` utility block**. Tailwind v4's
preflight zeroes `-webkit-tap-highlight-color` globally, so the app opted out of the one acknowledgement
iOS gives for free and put something back only where a developer happened to reach for the shared
`components/ui` button: **survivors, not coverage.** #114 is therefore the first acknowledged surface in
the app rather than the last unacknowledged one.

**The worst defect is on a documented happy path and fails no existing test.** `D1`: « Tout le monde est
là » writes 13 présent rows and says so, leaves all 13 radios reading « — », and the next save deletes
eleven of them. Uncontrolled `defaultChecked` in a Server Component is not reset by reconciliation after
`revalidatePath`, so the next submit posts `unset` and `markTrainingAttendance` DELETEs those rows — it
cannot tell « the coach cleared this » from « the DOM is stale ». Three more defects have that exact
shape, which is why the amendment to « Verification » is its own slice: nothing in the suite submits a
form twice after the server has re-rendered it.

**Writes on the preview were authorised, and they earned their keep.** Seven of the defects — `D1`, `D3`,
`D12`, `D14`, `D15`, `D19`, `D42` — are invisible to a read-only audit. The cost: the audit polluted the
data it was auditing. A test member was created and removed through the UI (and running the removal is
what produced the evidence for `D29`, `D32` and `D33`); team colours and name were recorded before being
changed and restored; created trainings and one composition were deleted and the four seeded sessions
verified byte-identical to the first read. **Two residues need the owner and a manual `DELETE`:** an
orphaned `users` row for `auditg`, and three matches named « UX Audit H »/« retro »/« retro 2 ». Those
matches cannot be removed through the UI and should not be — `deleteMatch` refuses once an event log
exists — which is invariant 1 working, and is now `S11`: **a match played in the app can never be
deleted, and nobody chose that explicitly.**

**Five findings were raised and then disproved, and they are in the report on purpose.** `/equipe`
appeared 69 px taller in dark than in light and was being written up as theme drift — re-measured with
both arms in the *same pass*, the delta is zero; seven browsers shared one preview database and a
concurrent write looks exactly like a layout bug. An arithmetic contradiction on `/stats/equipe-type`
turned out to be a documented shrinkage estimator with a 1.6-hour prior, explained on the page itself.
A literal `<button>` string in a text node was a `<noscript>` fallback, invisible and 0×0 — evidence of
*good* no-JS support. And two contrast blockers reported by a lane were rejected and withdrawn: the
helper compared text against `oklab(… / 0.15)` as though opaque instead of compositing 15 % alpha,
producing 1.00:1 and 1.02:1 for elements plainly legible in the screenshots. **The method that produced
those five is the same method that produced the other 52**, so a reader needs to see where it failed.
One method lesson is worth keeping: a vouvoiement sweep matching only `vous|votre|vos|veuillez` is blind
to « Réessayez » and « passez » — a second-person-plural imperative *is* the vouvoiement, with no pronoun
in the sentence. That hole in the audit's own harness is why decision 074's one surviving violation had
been live the whole time, and why slice 10 asks for a unit test rather than a convention.

**Cross-session.** The report was handed to the session holding #114 rather than filed over it, and two
of its corrections were checked against `origin` before being accepted — both held, and one of them
struck a caveat this session had written (`/stats` would supposedly stop reproducing after #114; the
`<Suspense>` boundary was withdrawn, so it reproduces exactly as measured). The login-button pressed
state was deliberately *not* filed as its own defect and remains that session's work. `docs/ROADMAP.md`
and `docs/SESSIONS.md` were being edited concurrently in another worktree; both appends here are at the
very end of each file, by agreement, because two appends at the end conflict cleanly whereas an insertion
above someone else's insertion point silently drops a paragraph.

**Addendum, same day: the audit produced one process change rather than only defects.** Four of the
findings — the positions chip and the secondary-positions summary from the positions slice, `D25` and
`S8` from the audit — are one missing review step, not four bugs: a screen that branches on role was
read one role at a time, by people who had seen both. The definition of done in `CLAUDE.md` now asks
for both roles **side by side in one pass**, alongside the existing both-themes-at-390 px rule, and
the reasoning is a decision entry. The owner approved the wording; two sessions agreeing with each
other is not authority to edit a project instruction, and neither of us did until he chose it.

## The same bug, one axis over, on the screen that matters most

Decision 124 had barely merged when its reviewer pointed at a second instance, and the second one is on
the screen a coach stares at for ninety minutes: the sticky ActionBar in game mode carried
`safe-pb py-2`, so the 8 px under « Coup d'envoi » and « TERRAIN » resolved to the bare safe-area inset.
Measured in a browser at 390 px, **`pb 0px`** before and `pb 8px` after. A phone with a home indicator
hides it, because the inset there is larger than the padding that went missing — so the device anyone
would reach for to check is the one device where the bug is invisible, which is the second time in two
slices that the thing we test on is the thing that conceals the defect.

The repair was not the obvious one and that is the part worth remembering. `safe-pb pb-2` fails
identically, because `.pb-2` is emitted before `.safe-pb` as well. And unlike 124 — where the inset and
the gutter are *alternatives* and `max()` is the answer — here they are a **sum**: the buttons should
clear the home indicator, not sit on it. Two utilities cannot express a sum of one property under any
ordering, since the second declaration can only replace the first. So it is one functional `safe-pb-*`,
following `tabbar-pb`'s precedent, which composes exactly this shape; the bar carries `safe-pb-2`, « the
inset plus 2 spacing units ». The inline arbitrary value was **not** rejected for being inexpressible,
whatever the first draft of the entry said: `components/ui/sheet.tsx:149` already ships that shape, with
spaces inserted by Tailwind and no `_` escape anywhere, and with a comment giving the same reasoning. It
was rejected for where it lands — an arbitrary bracketed `pb-*` goes in the built-in `padding-bottom`
block, which is emitted *before* `.safe-pb`, so a stray `safe-pb` beside it takes the sum back down to
the bare inset; the named utility is emitted *after* `.safe-pb` and survives one.

**The sweep is the deliverable, not the one-line fix.** All five `safe-*` users were checked against the
same shape, and four are clean for one reason: a lone longhand with no shorthand competing for the same
property. `sheet.tsx:153`, `match-bar.tsx:105`, `app-shell.tsx:76`, `bottom-nav.tsx:53`. So 124 and 126
found **two patterns across four call sites** between them — three screens with `safe-px px-5`, one bar
with `safe-pb py-2` — and there is no fifth, which is a better thing to have written down than either
fix, because the next session's question will be « is this everywhere ».

One honest note recorded in the entry rather than quietly enjoyed: `safe-pb-2 safe-pb` measures
`pb 8px`, so the new utility happens to beat a stray `safe-pb` where `gutter-px` loses to one. Same
mechanism, opposite outcome, decided by where two names land in a property group. It is luck about these
two strings today and not a property of the design, and the entry says so — the alternative is a future
session reading it as a rule and combining them.

Also this session, and the reason the above was possible: **#114 merged as decision 123 and #119 as
124.** Before merging #114 its two line citations were re-derived — the commit that fixed its citations
had added nineteen comment lines to the file it was citing and orphaned the two numbers it did not
touch, so `:55` had become a `<ul>` and `:81` a closing brace. The peer's narrower lesson is the one to
keep: **a commit that adds lines to a file it cites must re-resolve every citation in that file**, not
only the ones it edits.

And #119 shipped with a correction to itself. Its first draft claimed the longhands made
`gutter-px safe-px` unexpressible; the reviewer measured it and got `padding-left: 0px;
padding-right: 0px`, the original defect in full. The stated mechanism was wrong too — Tailwind v4 sorts
`@layer utilities` **by property** and interleaves custom `@utility` rules among the built-ins rather
than appending them after, which is why `safe-px` is declared *above* `gutter-px` and emitted *below*
it. The conclusion survived, but the wrong reason is what a reader reasons from, and the peer found the
same false sentence in a third place neither of us had grepped for: a source comment in
`components/errors/error-screen.tsx`, not prose in `docs/`. Byte offsets have been dropped from the
documentation entirely, by agreement: they move the next time anyone adds a utility, and mine had
already been wrong twice in one write-up. The ordering and the computed value are the durable facts.

**Not shipped:** `main` is now five commits past `v1.0.0-beta.6` with `package.json` still reading
`1.0.0-beta.6`, so the gate would refuse a tag and production is serving beta.6. That is deliberate.
The one change production actually needs is the peer's positions slice — a migration seeding the eleven
`positions` rows, because `db:migrate` creates the foreign key and nothing was keeping it — and a
release now would ship a gutter and a tab bar while leaving the crash and the unseeded table exactly as
they are. One bump to `1.0.0-beta.7` after that slice lands, and the tag is the owner's to cut.

## The error screen's two instructions were the two things that cannot work

**2026-10-01** · `fix/error-screen-offers-a-reload`

« Cet écran n'a pas pu s'afficher. Réessayez ; si cela se reproduit, passez par un autre écran et
revenez. » Decision 058 built that screen and the copy went unexamined until a crash report sent
somebody to read it. Both sentences are `vous` in an app that tutoies (decision 074) — a third shipped
vouvoiement, hiding behind the same `-ez` imperative as the two `docs/ROADMAP.md` already lists, which
is why a `grep` for « vous » never found any of them — and both describe a recovery that, for a whole
class of failure, provably does nothing. `reset()` is `this.setState({ error: null })` and nothing else
(Next 16.3.6, `dist/client/components/error-boundary.js:16-19`), so it re-renders the segment from the
same JavaScript bundle; « passez par un autre écran et revenez » is a client navigation, so it is the
same bundle wearing a longer path; and `retry`, the boundary's third prop this repository had never
destructured (`error-boundary.js:20-24`, passed at `:114`), does `router.refresh()` then `reset()`,
which asks a new deployment for an RSC payload using the old bundle's format. The one recovery that
exists — a document reload — was the one thing the screen did not offer.

So **« Recharger la page » is now the primary button, unconditionally, on every error this screen
shows**, with « Réessayer » second for the cold-Neon case a re-render really does fix, and « Retour au
calendrier » as a ghost on the root boundary. The design argument is in decision **127** and is worth
reading before touching the file, because it is the reason the branch survived its own premise being
refuted: a reload is never *wrong* advice for « this screen could not display », whereas retrying is
wrong specifically, so the screen does not have to classify the failure in order to be correct.
`isDeploymentSkew` (`components/errors/error-screen.tsx:78`) therefore changes only a sentence and never
whether the button appears.

**The premise, and why it is not the owner's bug.** The failure that made the old copy's wrongness
concrete is deployment skew: a stale page posts a Server Action id the live deployment no longer has,
Next answers 404 « Failed to find Server Action … older or newer deployment », and the client throws
`UnrecognizedActionError`. It was reproduced end to end and it is real, on every deploy that moves an
action, with no host-level protection available — Skew Protection is Pro and Enterprise only and the
owner is on the free plan, and `deploymentId` alone only adds a `?dpl=` cache-buster without routing
anything. But it is **not** the crash the owner reported: he has since confirmed a force-quit did not
fix it, a force-quit is a document navigation, and a document navigation is always served by the latest
deployment, so skew cannot survive one. That crash is still unexplained and another session has it. The
claim this branch makes is the smaller one — the screen's advice is true now, and a real exposure has a
recovery.

**The correction most likely to save the next person an afternoon: two production builds differing by
one comment in an `actions.ts` produce byte-identical sets of action ids.** Turbopack in 16.3.6 does not
hash the module body into the id, so all 41 ids in `server-reference-manifest.json` matched and the stale
page logged in happily against the new server. The obvious minimal experiment therefore returns a **false
negative** and would have had this branch concluding skew does not exist. The ids only moved when an
exported action was **renamed** — and with a rename it reproduced exactly: `POST /connexion` 404, the skew
sentence fired on `error.name` with no `digest` present, and the reload recovered the login screen fully.

**Blast radius, recorded as an argument and not as trivia.** This one component is the recovery surface
for all **42 `useActionState` call sites**, because React cancels the queued action and shows the nearest
boundary when a dispatch throws. Game mode is the single part of the app structurally immune:
`lib/match/outbox.ts` posts to a Route Handler at a path-based URL that exists identically on every
deployment, and ingestion is idempotent on `client_event_id`. Built for offline, skew-immune as a side
effect — so a future proposal to replace that Route Handler with a Server Action would be trading the
live match's immunity for less code.

Two smaller findings. `digest` is a **ten-digit decimal** in a production build (`3004583682`), not a
hash, so it reads aloud over a phone: the code line stays and now says « Si tu nous le signales, donne ce
code : … », and prints nothing when the digest is absent, which it is for every client-side throw. And
`unstable_isUnrecognizedActionError` does exist in `next/navigation` in 16.3.6 and was deliberately not
imported — `unstable_` is outside semver, and the predicate is an `instanceof` against a class identity a
stale bundle is not guaranteed to share with the one that threw, which is exactly the situation it would
be asked about. `error.name === "UnrecognizedActionError"` survives both.

**`app/error.tsx`'s `px-5` is dead, and this branch's attempt to fix it was wrong and was withdrawn.**
`safe-px` sets the *longhands* `padding-left`/`padding-right` (`app/globals.css:158-161`) while `px-5`
compiles to the `padding-inline` shorthand, so a longhand after a shorthand wins unconditionally and the
gutter on a phone held upright is **zero**: measured with the new two-button row, the pair ran 4 → 386 of
390 px — the « confirm button 8 px off the right edge » defect class arriving by a new route. Two
corrections to the first telling of it, both from another session's measurements. It is not a specificity
coin-flip and **reordering the block in `globals.css` cannot help**, because Tailwind v4 sorts the
utilities layer **by property** and interleaves custom `@utility` rules among its own built-ins, so a
custom utility is emitted after one it was declared above — which is the first thing anyone would try.
And the count is **three** sites, not « roughly a dozen »: `app/error.tsx:27`,
`app/not-found.tsx:21` and `app/(auth)/layout.tsx:9`.

`ErrorScreen` was given its own `px-5` and then had it taken away again, which is the useful part.
`app/(app)/error.tsx` renders that same component inside `app-shell`'s own `px-4`, so padding it in the
component double-pads one parent and still leaves the other three bare — padding that is right for one
parent and wrong for another belongs to neither, and this one belongs to the page shells. The fix is a
new `gutter-px` utility holding `max(env(safe-area-inset-*, 0px), …)`, which keeps what the broken pair
was *trying* to say, and emphatically **not** a `max()` folded into `safe-px` itself:
`components/nav/bottom-nav.tsx:25` is the single `safe-px`-with-no-`px` site in the tree, i.e. the one
place the utility is used correctly, and insetting a deliberately edge-to-edge bar would take four tap
targets from 97.5 px to 87.5 px with nothing clipped and every check green — a design change smuggled in
by a bug fix. It is another session's slice. `tabbar-pb` is closed rather than owned: it already reads
`3.5rem`, so the `4rem` claim was stale, and it has zero `.tsx` occurrences.

The reordering of urgency is worth recording too. This error screen was the **least** important of the
four and only the one I happened to be standing in; `/connexion` and `/rejoindre` measure `0px/0px` with
the card running 0.0 → 375.0 at 375 px, in both themes, and they are the first two screens any new user
sees.

**Verified**: typecheck, lint, 1324 unit tests, and — unlike the previous two slices — **the full
Playwright suite, 5/5 in 1.2 min**, because the change touches a Server Action's failure path. Both
themes looked at at 390 × 844 across all **five** states of the screen: generic and skew copy, with and
without a `digest`, and with and without the home link. The tone was modelled on
`app/(jeu)/match/[id]/jeu/error.tsx`, which decision 058 already got right and which was left untouched.

## The convention that was obeyed in review and decayed anyway

Decision 074 — the French tutoies, always — has been in `CLAUDE.md` for months, with the examples
spelled out and « never « votre », never « vous » » in bold. It was quoted in review. Sessions adopted
it without being asked. And it was broken in **eight live places** when somebody finally counted:
`components/action-sheet/terrain-sheet.tsx` at `:176`, `:206` and `:301`,
`components/action-sheet/lineup-composer.tsx:102`, and `lib/match/presenter.ts` at `:569`, `:570`,
`:868` and `:882`. The terrain-sheet three are the pitch sheet, which is copy a coach reads mid-match
with the clock running; `:206` is a live-region announcement, so it exists in no screenshot and the
hundred captures of `npm run audit:screens` could not have held it.

**What caught them was not a sharper reviewer.** It was `tutoiement.test.ts`, a `node:fs` walk of
`app/`, `components/`, `lib/` and `db/` that reads every non-comment line as text and fails on « vous »,
« votre », « vos » and a curated list of `vous` imperatives. The reason it can exist is a distinction
that is easy to get backwards: `vitest.config.ts`'s `include` — `lib/**/*.test.ts`,
`db/**/*.test.ts`, `*.test.ts` — decides which files are *collected as tests*, and decides nothing at all
about which files a test may *read*. So the file sits at the repository root, where it is collected, and
reads two directories Vitest collects nothing out of. Being text rather than a module, it also reaches
the shape no import can: JSX text, `<p>Réessayez</p>`, in no string literal and the return value of
nothing. Decision 097 had already made this move once, for `lib/composition/copy.test.ts`.

**The most uncomfortable finding is that a test was holding one of the breaches in place.** Five tests
already asserted the word's absence — `lib/composition/hints.test.ts:59`,
`lib/match/presenter.test.ts:762`, `lib/player/shirt.test.ts:78`,
`lib/stats/best-seven-copy.test.ts:741`, `lib/team/membership.test.ts:76` — all five under `lib/`, each
asserting about the return value of a function it imports. **One of those five files was also the one
pinning a breach.** In the same `lib/match/presenter.test.ts` whose `:762` checks a description for
« votre », line `:428` asserted « Touchez un joueur pour le faire entrer. » **verbatim**, with `toBe`.
The suite was therefore not merely silent about that breach: it was pinning it, and a session
that had fixed the sentence would have been shown a red test and told it had broken something. A rule
about every string cannot be checked one string at a time, because the author of such a test picks the
string he was already thinking about.

Two things stated out loud rather than left to be discovered. The imperative rule is a **curated list**
of verb forms and not a `-ez` pattern — the pattern was written and thrown away, because « assurez » in a
quotation and half the vocabulary of a form label end in those letters without addressing anybody, and a
check that cries wolf weekly is a check somebody turns off; `allez` is off the list on the same ground,
being this team's interjection before it is an imperative. And `\b` is unusable for this: it is ASCII, so
`/\bfaites\b/` matches inside « **Dé**faites », the label over the losses on `/stats`, which was the very
first thing the rule flagged. Every rule goes through `wholeWords` and a `\p{L}` lookaround instead.

Two breaches were **baselined rather than fixed**: `components/errors/error-screen.tsx:50`–`:51`, « Cet
écran n'a pas pu s'afficher. Réessayez ; si cela se reproduit, passez par un autre écran et revenez. »,
which another session has already rewritten on #118. The alternative was to hold the guard until that
merges — no guard during precisely the days when sentences are being rewritten. The baseline is keyed on
the **trimmed, comment-stripped line text and never on a line number**, because a line number goes stale
on the first edit above it and then excuses a line nobody chose, which is worse than a wrong failure
because it is a silence. And a third test fails, naming the entry to delete, the moment one of those two
sentences changes, so the list shrinks under pressure or not at all. The guard's own review caught that
this left the *other* direction open: an allow-list with no ceiling is defeated by the same edit that
would appease it, since appending an entry excuses a new breach and reads in a diff exactly like deleting
one. The length is asserted, and the assertion is now `0`: **#118 merged first**, as decision 127, so
rebasing on it made both entries match nothing, the staleness test went red naming them, and they were
deleted with the cap in the same commit — the baseline never reached `main` with anything in it, and the
test that forced that is the only reason writing one was defensible. The same review found the file floor
loose in the same
way — the scan sees 232 files and asserted only « more than 200 », so one string added to the skip list
could have hidden `(jeu)`, the whole of game mode, or `[id]`, 32 files, with every test still green. It is
counted per root now.

**Next**, written up in `docs/ROADMAP.md` rather than done here: **16 assertions elsewhere in the suite
are incidental verbatim tripwires on French copy**, `toBe` on a whole sentence, so any future copy fix
breaks a test that was never about copy — `presenter.test.ts:428` is only the one that happened to
collide with this slice. All sixteen were checked against the source, and three of the paths first
written down were wrong: the timeline pair is `lib/calendar/timeline.test.ts`, the plan four are
`lib/composition/plan.test.ts` (there is no `lib/match/plan.test.ts`), and the terrain pair is
`lib/match/terrain.test.ts`. The fix is mechanical — `toContain` on the one discriminating fragment —
and it is a separate concern from the guard, which is why it is a roadmap line.

**Verified**: typecheck clean, `npx eslint app components lib e2e db tutoiement.test.ts` clean, **1347**
unit tests green including the guard's own 23, and both CI jobs green on the pull request. `npm run lint`
is not usable here and that is not this branch's fault: it reports ~1500 errors, every one of them under
`.claude/worktrees/`, from stale agent worktrees' generated `.next/types/`. No `e2e/` selector or
assertion names any of the eight rewritten strings — checked, rather than assumed, because that is the
one thing a copy change can break silently.

**Four corrections, all found by review and all after the merge, which is why they are a second pull
request rather than a fixup.** Every one is prose, and three are the species this repository keeps
producing — a true conclusion carried by a false mechanism. The decision entry said the two baseline
entries « went in the same commit as this file's rebase »: they did not, the deletion is its own later
commit, and the three rebased commits in between are red on the staleness test by construction, which is
a better fact than the one it replaced. The roadmap's `e2e/` figures, « roughly 160 … about 54 », were a
`getByRole` count relabelled as a count of copy; measured, it is 171 argument positions naming French
copy, of which **13** are assertion-shaped, because 54 of the 67 `toHaveText` calls assert a clock or a
score. The guard's own JSDoc still described a populated baseline in the present tense, next to a `//`
note ten lines below saying it was empty. And `lib/match/presenter.ts:868` was quoted with the breach
text at a line that now holds the fix. The fifth change is not a correction: the `db/` file floor goes
from 8 to 5, because nine files with `db/migrations/` skipped left no room, and a floor that fails when
somebody deletes two files reports a hidden directory that nobody hid.

## The owner says no three times, and that is the end of a loop

**2026-10-01** · `docs/the-owner-closes-three-live-items`

Three items had been carried in every session report for weeks — wipe the preview and production
databases, reset the super admin's password, rotate the Neon `neondb_owner` password. The owner has
decided against all three. Decision **132** records it, and the point of recording it is narrow and worth
being explicit about: none of the three was waiting on information. Every fact behind them is true and is
**rediscoverable from the repository**, which is why each new session found them again, correctly, and
raised them again. Writing « not doing this » where decisions live is the only thing that stops a session
with no memory from restarting the loop in good faith. A `## NOW` line would have rotted; a roadmap item
would have read as pending.

What the entry does not do is soften what follows. The transcript-exposed database password stays valid,
the super-admin credential keeps its reach over every team, and production keeps its rows — so the
standing prohibitions are no longer belt-and-braces, they are the whole of the protection, and they are
restated in the entry for that reason. Two items that had travelled alongside the wipe are **not** closed
by it and are still open: the `check (username = btrim(lower(username)))` constraint, which exists only in
Zod and is how a trailing TAB once reached the `username` column, and the owner's confirmation that
Preview and Production `DATABASE_URL` are two different strings. Neither needs a wipe. And one genuinely
separate production defect is untouched by any of this: `formations` and `formation_slots` are empty on
production, so no composition can be planned there at all.

The number is **132**, not 129. The other machine said it is taking 129, 130 and 131 for PR #125's three
placeholders on its own rebase, so skipping them leaves a gap rather than risking a collision — which
cost a renumbering across four files earlier the same day.

**Verified**: typecheck clean, 1347 unit tests green, no source file touched — `docs/DECISIONS.md`,
`docs/ROADMAP.md`, `docs/SESSIONS.md` and `COORDINATION.md` only.

## The positions crash, which was a promise the schema was not keeping

The previous session's leading explanation was right, and this session confirmed it the cheap way:
**on a fresh database after `db:migrate` alone, `positions` held 0 rows.**
`player_positions.position_code` has referenced `positions.code` since the first migration
(`db/migrations/0000_wealthy_radioactive_man.sql:264`), nothing in any migration has ever inserted
those eleven rows, and `seedReference()` — the only thing that writes them — is reachable by hand and
by no workflow, while `ci.yml` and `release.yml` both run `db:migrate` and stop. So the constraint
shipped without its targets, every save raised `23503 foreign_key_violation`, and the reason it read
as a mystery is that **reads work perfectly**: a player with no rows renders « Aucun poste préféré
indiqué » and the screen is correct and complete right up until he taps. `db/migrations/0006_seed_positions.sql`
inserts them with `ON CONFLICT ("code") DO NOTHING`, so `seedReference()` keeps owning every later
label, line and coordinate — this migration's only job is that the rows exist at all, and it must
never overwrite what the seeder has since refined. The framing in the decision entry is attributed to
the session that was scoping the deployment split, because it is better than anything in these
commits: a table with no rows is not an empty table, it is a broken constraint.

**`formations` and `formation_slots` are 0 either way, and that half is deliberately not fixed.**
`formation_slots.position_code` has its own foreign key at `0000_wealthy_radioactive_man.sql:239` and
both tables come from the same hand-run seeder, so the same database can plan no composition at all —
which is exactly the third symptom the previous session predicted without needing a query. The seven
templates are editable content with a product decision behind them (decision 005), so a migration
writing them would be a migration quietly taking that decision. It is a `[ ]` under « Deployment »
with the measurement attached, not a patch.

**The second defect was a coach who could edit a teammate's wishes, and `can()` had been saying no the
whole time.** `profile:editPositions` is in `SELF_ACTIONS` (`lib/auth/can.ts:112`) and the self branch
(`:142-147`) refuses a foreign `targetMemberId` — but the action went through `assertCanActFor`
(`lib/player/actions.ts:53`), which tries the self action and then falls back to the coach's
`member:update`. Invariant 4 was satisfied to the letter: a helper that succeeds on either of two
actions is not an ad-hoc check, which is why nobody caught it. `:116` is now a bare `assertCan`, and
`assertCanActFor` has one caller left — `:227`, the flocage, which **keeps** its fallback because a
shirt name is printed on a garment somebody orders by a deadline and a wish about where you like to
play is an account of yourself. **Decision 104 cited the positions as the precedent for that shape**,
so the new entry supersedes that one clause by name rather than leaving 104 pointing at a defect; its
rule — two owners means two forms and two actions — is what this change applies.

**The picker now offers eight codes, and the test recomputes the eight rather than listing them.** It
is the union of the slots of `1-3-2-1` and `1-2-3-1`, eight distinct codes across seven-a-side twice
over, and `db/reference.test.ts:188` derives that union from `BUILTIN_FORMATIONS` so the stated rule
and the shipped constant cannot drift. `POSITION_CODES` stays at eleven on purpose: narrowing a wish
list judges what to ask a player, narrowing the vocabulary judges what the team may field. **The
consequence is real and is in the entry rather than buried**: `MOC` is a slot in the built-in
`1-3-3-0` and `AG`/`AD` in `1-2-1-3`, both still shippable, so a player can no longer wish for three
positions two of the team's own formations still field. Nothing matches wishes to slots, so nothing
breaks functionally — hence the copy says « Ces postes ne sont plus proposés. » and never
« n'existent plus », which would be false. A chip row derived from `value` lets a player remove a
stored `MOC`, one way only, because the eight-marker turf would otherwise leave such a code invisible
*and* unremovable; removing one that was the primary leaves no primary rather than promoting a
secondary, which would invent a wish nobody expressed. `positionCodeSchema` keeps all eleven for the
same reason the picker cannot: the form posts back what is already stored, and a narrowed enum would
lock that player out of saving anything ever again.

**Two type-level things, both of which turned out to be about what a list of call sites cannot find.**
`POSITION_BY_CODE` was an `Object.fromEntries` **cast** to a total `Record`, which is why an unguarded
`.labelFr` type-checked and why one bad row could 500 a profile, `/moi`, `/equipe` and the composition
editor at once. `Partial<Record<PositionCode, …>>` — not `Record<string, … | undefined>`, which would
let `POSITION_BY_CODE["LIBERO"]` type-check — produced **16 errors across 5 files**, and the fifth
file was `db/reference.ts` itself (`positionLabelFr`), which nobody hand-listing the callers would
have reached. And the sentinel is `Number.MAX_SAFE_INTEGER`, reusing `orderShape`'s choice
(`lib/formation/shape.ts:114`) rather than inventing a second one: `Infinity - Infinity` is `NaN`, a
`NaN` comparator leaves the order implementation-defined, and that would make `positionsSignature`
unstable — it is the React `key` the profile editor is mounted on, so profiles would remount at
random. The repro fixture has **three** rows, because `Array.prototype.sort` never calls the
comparator for a one-element array and a one-row test would have proved nothing while looking like
proof.

**The field errors the form had been building and not showing.** Zod reports the offending array
*element*, so `toFormState` keys it `secondary.1` while the form read `fieldErrors.secondary` and
rendered nothing. `fieldErrorsUnder` in `lib/auth/validation.ts` strips the trailing index, and it was
fixed in the consumer rather than in the `toFormState` every other form in the app shares. Every
message on that path is French now; one of the English Zod defaults had been leaking the internal
position codes to the player.

**Two things this session did not do, said plainly.** `npm run test:e2e`, `npm run typecheck`, `npm run
lint` and the unit suite were not run from this docs session — they belong to the branch's own checks
and to CI on the pull request, and this entry does not claim they passed. And **nothing tests the
positions editor at all**: no unit test and no Playwright spec names `updatePlayerPositions`,
`PositionsEditor`, `PositionPicker` or any string the card prints. The permission change rests entirely
on `can()`'s own assertions, which are narrower than they look — `lib/auth/can.test.ts:79` pins a
*player* out of somebody else's positions, `:126` a *non-playing* coach out of his own, and the
`playerCoach` fixture at `:27`, which is precisely the actor the old fallback let through, is used for
three self-scoped assertions and never once with a foreign `targetMemberId`. The case the decision
turns on is true by construction and asserted nowhere. That is the first `[ ]` added under M1, and it
is the real finding of the slice: a 500 on the most ordinary save in the app shipped because the most
ordinary save in the app is untested.

**`docs/DATA_MODEL.md` was checked and left alone.** It does not claim the picker offers eleven — line
57's list of eleven describes the `positions` *table*, which is still eleven, and the formation-matching
sentence under it is still true. The `player_positions` line already read « Set by the player on their
profile by tapping a pitch diagram », which was the invariant this branch enforced rather than one it
changed: the document has been describing the intended ownership all along, and the code had drifted
away from it.

## The five pickers the app's own formatter could never reach

**2026-10-01** · `feat/echo-native-date-values`

The owner, from his iPhone: every date `DD/MM/YYYY`, every clock 24-hour. The first thing done was the
audit rather than the fix, and it found the remark much narrower than it sounds — **decision 109 had
already done it**. `lib/calendar/time.ts` and `lib/player/injury.ts` are the only two formatters in the
repository, every screen goes through one of them, the 24-hour clock is pinned twice (the `fr-FR` locale
*and* an explicit `hour12: false`), and the unit tests hold the literal French strings instead of
re-deriving them. Nothing of that was changed. Anybody arriving here with the same report should re-run
that audit before believing there is a formatter to fix.

What a formatter cannot reach is the five native pickers — the match form, the séance form, the two dates
of an injury declaration and « Guéri le » — because `<input type="date">` and
`<input type="datetime-local">` render in the **browser's** locale. On a phone set to English the owner
picks a kick-off in `MM/DD/YYYY` off an AM/PM clock, in the one place the app has no say. Decision 109 saw
this, offered him a control of our own, and he declined; he has come back to it with a third answer, and
it is better than either option that was on the table then. **Keep the native control — it is still the
best thing under a thumb — and print underneath it the date the app would have printed.**
`components/ui/date-input.tsx` wraps all five and renders one quiet line: « 14/03/2026 », or
« 14/03/2026 à 20:05 » with the « à » `formatWhen` already uses. An empty or unreadable value renders **no
element at all** rather than a placeholder, because « --/--/---- » is a screen stating something and this
one has nothing to state. The new decision entry (left as `## NNN`, see below) records the whole of it,
including that it supersedes 109's carve-out.

Two things to know before touching it. **The echo never builds a `Date`**: `formatIsoDay` reads the parts
of the `YYYY-MM-DD` string, because `new Date("2026-03-14")` is UTC midnight and a formatter west of
Greenwich would render the 13th — an off-by-one-day echo would be worse than no echo, since the reader
would have no way to tell which of the two lines held the day he picked. And **`lib/player/injury.ts` was
a settled file, touched for exactly one reason**: it already owned this arithmetic, and the fix for a
wrong date format must not become a third way to format a date, so `formatDateFr` delegates to
`formatIsoDay` and a test asserts the echo and `formatDate` agree on the same calendar day. The echo is
`aria-hidden` and deliberately **not** in `aria-describedby`: the defect is what the eye sees, a screen
reader already speaks the control's value, and appending the French digits to the control's description
would make it announce one date twice in two formats — decisions 116 and 117 arriving from the other
direction.

**Verified at 390×844 in both themes with the browser forced to `en-US` and `America/New_York`**, which
reproduces the owner's phone: the picker reads `10/01/2026` and the line underneath reads `01/10/2026`.
The echo is present in the server-rendered HTML, and with `javaScriptEnabled: false` the five forms still
post their original fields — without hydration the echo is simply the one the server rendered from
`defaultValue` and stops following the picker. `npm run typecheck`, `npm run lint` and `npm test` pass:
**1329 unit tests, five of them new** in `lib/calendar/time.test.ts`, every assertion about a string with
no timezone in it.

**`npm run test:e2e` was read and not run.** The only contact the suite has with these inputs is four
`getByLabel("Coup d’envoi").fill(...)` calls — `e2e/happy-path.spec.ts:162`, `:733`, `:795` and
`e2e/offline.spec.ts:83` — which resolve through the `<label for>` / `id` pairing `Field` emits and which
this change does not touch; no spec creates a séance or declares an injury. That is a reading of the
locators, not a green run, and it is written down as such rather than claimed as a pass.

**Two things deliberately left alone**, so the next session does not read them as oversights.
`formatDateFr` still returns a non-ISO value **untouched** and still accepts `2026-02-30` as a calendar
day: tightening either would change a test that pins the current behaviour, the callers genuinely want a
column holding prose to show the prose, and a native picker cannot produce 30 February in the first
place — so the validation would be paid for and never used. And
`app/(app)/entrainements/nouveau/page.tsx` still opens with an **empty** picker rather than a plausible
next slot (the coming Tuesday at 19:00, say), which would be a real convenience on a phone but is a
product change about what the app assumes a séance is, not a date-format fix.

**Next:** nothing is blocked. The decision entry is deliberately headed `## NNN` — 123 is spoken for by a
decision already written on `perf/acknowledge-tab-taps`, so the merging session assigns the number, as
`COORDINATION.md` asks.

## The owner's fourth batch, and the migration that was missing eleven rows

**2026-10-01** · `feat/retro-one-action-list`, and the three branches before it

Four remarks, after the owner installed the beta and used it as a coach would. **Three are on `main`**:
the tab-bar tap acknowledgement as #114 (decision 123), the preferred positions as #125 (decisions 129,
130 and 131), and the native-picker echo as #116 (decision 133). The fourth is the retro-entry redesign,
PR #127, which is this branch and the reason for this entry. Two of the four turned out to be narrower
than the words — the dates were already right everywhere the app formats one, and « we must not be able
to edit the score » did not describe a score input, because there has never been one — and in both cases
the audit came before the diff. A remark acted on literally, when the literal reading is already
satisfied, produces a diff that changes nothing and a session that believes it shipped something.

**The retro sheet is one list of actions, with the button underneath.** « Changements » and « Actions du
match » were a distinction `buildRetroLog` never made: it has emitted a substitution as an ordinary
`SUBSTITUTION` event since screen 8 was written. They are one `RetroAction` discriminated union now, one
`actions` array, one `<ul>` in the order the coach typed it, and one « + Ajouter une action » passed as a
**child after the list** rather than through `Card`'s `action` prop, which renders inside the header. The
list is never sorted by minute — rows would jump under the thumb, and the undated row is the common case
(decision 048). The score card keeps its two one-tap goal shortcuts, which were never score editing,
and `retroScoreLineFr` now returns `null` for a sheet holding no scoring row, so an untouched sheet no
longer prints « 0 – 0 ». **`POSITION_CHANGE` is not built, by the owner's decision**, and has been taken
out of `RETRO_ACTION_TYPES` and out of `readActionFields` rather than left as a claim nothing could
honour: its slot labels are not unique within a formation, `retroPitch`'s slot bookkeeping would go
stale, an unstamped position change states nothing, and it is the action least likely to be reconstructed
a week later. So game mode keeps one action the sheet does not, and `FOUL` goes the other way. All of it
is decision 134, whose « why two constants » paragraph is the one to read before tidying anything in
`lib/retro/log.ts`: `isAmendableEventType` reads `RETRO_FACT_TYPES`, so merging the two near-identical
lists would grant a « Corriger » button nobody decided to grant.

**The positions crash, and its actual cause.** Saving a player's preferred positions raised `23503` on a
database that had been migrated and never seeded: **no migration ever inserted the `positions` rows.**
The foreign key `player_positions.position_code → positions.code` existed from `0000` with none of its
targets, so every read worked perfectly — the picker rendered its eleven codes, which come from a
TypeScript constant and not from the table — and every write failed. That is why the screen is correct
right up until a tap, and why nothing in the repository could have caught it: the vocabulary lived in two
places and only one of them was in version control. `db/migrations/0006_seed_positions.sql` inserts the
eleven rows idempotently. **A peer session independently confirmed from its own machine that
production's `positions` table is empty while dev's holds all eleven codes, in rows belonging to real
players** — that observation is theirs, not ours, and it is what turned a narrowing question into a
migration question.

**`formations` and `formation_slots` are also empty on a migrated database, so no composition can be
planned on production at all — and that was deliberately left alone.** The eleven `positions` rows are
**vocabulary**: a closed set the code already names, which the database merely has to agree with, so a
migration is the right instrument and there is no decision to make. A formation is **editable content**
with a product decision behind it — which formations, with which slots, at which coordinates, and whether
a team may add its own — so seeding it from a migration would be a session choosing the product. It is
the owner's call, and it is named here rather than fixed.

**A trap for the next session on this machine: `npm run test:e2e` must be given `E2E_PORT`.**
`playwright.config.ts` falls back to port 3000 and reuses an existing server, and on this machine port
3000 is **another session's dev server from a different checkout** — it has already produced a screenshot
of a failure in code that was already fixed. A green or a red run on the default port means nothing. This
session's dev server is on 3451 from this worktree, so every run here was `E2E_PORT=3451 npm run
test:e2e`, and the browser review went through `http://localhost:3451` (never `127.0.0.1`, decision 043).

**One mistake worth logging, because it cost hours.** Three pull requests — #114, #116 and #118 — were
attributed to another session and recorded as « not mine to merge », and that attribution survived two
context compactions before it was questioned. Every session pushes under the same git identity, so the
committer and the author prove nothing about which session produced a branch. **The per-worktree `HEAD`
reflog is what settles it**, and it showed all three branched and left from this worktree. The method,
for next time: when ownership of a branch is in doubt, read `git reflog show HEAD` in each worktree
before reading any commit metadata.

**Checks.** `npm run typecheck`, `npm run lint` and `npm test` green — **1414 unit tests across 65
files**, which includes `tutoiement.test.ts` (23 tests, decision 128) now that it is collected from the
repository root. `E2E_PORT=3451 npm run test:e2e` green, 5 tests in 53 s.

**Two things still open and named as open.** A half-filled substitution is reported well in the browser
and badly without it: `findRetroIssues` has `missing-substitute-out` / `missing-substitute-in`, but
`retroChangeSchema` requires two uuids on that arm, so a no-JS or crafted POST is answered « Ce joueur
n'est pas valide. » before the issue finder is asked. The fix is the order of operations in
`submitRetroMatch`, not this slice. And the audit's `D18` reproduces, untouched by this work.

## The composition dock, down to the players and the buttons

The owner's instruction was one sentence — *« The banner on the bottom is too big … Basically, I only want
the players, the buttons »* — and the three sentences named in it are now off that screen: the bench count
with its tap instruction, the save state, and « Il reste N postes à pourvoir. » **Decision 135** has the
reasoning, including why « Personne n'est dans les buts. » stays and the drag hint stays for exactly as
long as a finger is over the dock.

**No French was deleted.** `benchHintFr`, `editorSaveStateFr` and `findPlanIssues`' `incomplete` message
are untouched in `lib/composition/`, still unit-tested branch by branch — all three moved to `sr-only`
with `aria-live`, and the bench count became the strip's `aria-describedby` rather than a line in the flow.
That is the only reason this was a twenty-line change and not a negotiation with sixteen verbatim-`toBe`
copy tests: **the strings are rendered somewhere else now, and `lib/composition/plan.test.ts` asserts the
functions, not the layout.** 1414 unit tests green, unchanged in number.

One e2e assertion had to move rather than be deleted. `e2e/happy-path.spec.ts` checked that a pre-filled
editor does not claim to be saved by looking for « Rien n'est encore enregistré. » and calling it visible.
That claim is now made by the button, so the step asserts the button offers to **create** and that
« Enregistrer » is absent, and keeps the sentence as `toBeAttached` — deliberately not `toBeVisible`, which
Tailwind's `sr-only` would have satisfied by accident with a 1×1 box and left the step passing while
testing nothing.

**Checks.** `npm run typecheck`, `npx eslint` on both touched files, `npm test` (1414 across 65 files) and
`npm run test:e2e` (5 tests, 1.1 min) green — and the last of those was **green once before it meant
anything**. The previous entry in this file says to pass `E2E_PORT=3451` because port 3000 belongs to
another session; on this machine it is the other way round. **3000 is this checkout and 3451 is the peer's
worktree**, `playwright.config.ts` reuses an existing server outside CI, and so the first full run — plus
the first pair of screenshots, which showed all three removed sentences still on screen — exercised the
peer's code. `ls -l /proc/<pid>/cwd` on what `ss -ltnp` lists is what settles it, and `COORDINATION.md`
now says so, because a port number is not a fact about a machine.

**Looked at, at 390 px, in both themes**, which on this screen is the whole point: the dock is the five
discs plus the two buttons, and the turf grows by about 44 px — enough that the attacker's poste is on
screen with the pitch at rest, where before it was under the banner.
## A trace sink for the owner's iPhone, which ships nothing to the owner's iPhone

**2026-10-01** · `feat/iphone-trace-sink`

Three open items in `docs/ROADMAP.md` say the same thing in different words: it cannot be settled from
here. The two tab-bar suspicions, the geometry of an iPhone 16 against an audit that walks 390 × 844, and
— until its cause was found by reading — the crash on saving preferred positions. The common factor is
not difficulty; it is that the evidence is on a phone which is not the machine running the session, and
iOS Safari offers no console a session can read. This branch builds the instrument and settles none of
them.

**What it is.** A **bookmarklet**, plus a thin endpoint. `scripts/iphone-trace/capture.js` (624 lines) is
built by `scripts/iphone-trace/build-bookmarklet.mjs` into a `javascript:` URL written to the already
gitignored `audit/`. It hooks `window.onerror` and `unhandledrejection`, wraps the five `console` methods
while always calling through to the original, records a device block (user agent, DPR, `screen`,
`innerWidth`/`innerHeight`, the visual viewport, the theme as `<html>` carries it, standalone, and the
**resolved** `env(safe-area-inset-bottom)`), and runs the tab-bar hit test the roadmap prescribed:
`document.elementFromPoint` at the centre of each of Calendrier · Équipe · Stats · Moi, with the rect, the
element found, and `scrollY` / `innerHeight` / the visual viewport's height and `offsetTop` recorded per
pass, so a collapsed Safari toolbar can be told from an expanded one afterwards. A small French overlay
gives it « Test » and « Envoyer », because there is no console under a thumb; it sits **above** the bar
rather than across it and excludes itself from its own hit-test results. `lib/dev/trace.ts` is the pure
half — the gate, the French `TRACE_ERRORS`, the Zod contract, `formatTraceLines` —
and `app/api/dev/trace/route.ts` prints one `[iphone-trace] <single-line JSON>` per entry. One line in
`proxy.ts`'s `PUBLIC_PATHS`. **No table and no migration**, which is decision 136's first paragraph and
not an omission: a preview-only table is not expressible under decision 119, and the cost is that a
trace lives exactly as long as the log stream.

**How it is used, in four steps.** `node scripts/iphone-trace/build-bookmarklet.mjs`; install the printed
URL as the *address* of a Safari bookmark on the phone — Safari strips the `javascript:` scheme from
anything typed into the address bar, so a bookmark is the only way in; open
`https://dev.7orteils.bgonzva.fr`, go to the screen in question and tap the bookmark; read
`vercel logs dev.7orteils.bgonzva.fr --project football-manager`. The full version, including the Safari
menu names in French and what each hit-test reading means, is `scripts/iphone-trace/README.md`.

**What was verified.** `npm run typecheck` clean, `npm run lint` clean, `npm test` green at
**1451 unit tests across 66 files** — 37 of them new, for `lib/dev/trace.ts`, including the ones that
matter most: `isTraceSinkEnabled` must return `false` for `VERCEL_ENV === "production"`, and the secret
comparison must treat `undefined`, `""` and whitespace alike as absent, because an empty field in the
Vercel UI is the realistic misconfiguration rather than a theoretical one. Six of those 37 exist because a
reviewing session found that claim false when I made it: `traceSecretMatches(" ", " ")` returned **true**,
so a whitespace-only `TRACE_SECRET` was a live secret and no test said otherwise. Both sides are trimmed
now. The exposure was nil — you still had to know the value — but the diagnosability was not, and that is
the real defect: with off, unconfigured and wrong-key deliberately collapsed into one identical 404, a
trailing newline pasted into the dashboard field is indistinguishable from a disabled sink, so the owner
would have had no way at all to tell a typo from a switched-off endpoint. The 12 tests in
`proxy.test.ts` still pass, which is the cover for the `PUBLIC_PATHS` change — additive, one entry.
`npm run build` succeeds and lists `ƒ /api/dev/trace` alongside `ƒ /api/match-events`.

**An operational trap found while getting that build to run, which will cost the next session an hour
if it is not written down.** `npm run build` first failed here with « Could not find the Next.js package
(next/package.json) », resolved from the worktree root. The cause is that **a fresh worktree's
`node_modules` is an empty directory**, and Node's resolution walks *up* the tree to the main checkout's
`node_modules` — so `typecheck`, `lint` and `vitest` all pass from a worktree that has no dependencies
installed, silently using another checkout's. Turbopack refuses to, by design: « files outside of the
workspace root are not compiled ». So a green `npm test` in a worktree does **not** imply the worktree is
installed, and the fix is `npm ci` inside it. Worth knowing because this repository is worked from
thirteen worktrees and the three cheap gates are exactly the ones that hide it.

**What was not verified, and will not be papered over.** Three things.

- **`npm run test:e2e` was not run**, deliberately, and the honest reason is the dev server rather than
  the database. `e2e/fixtures/seed.ts` creates a run-scoped team and prunes the previous run's, and
  decision 044 keeps it off the demo season, so two sessions running it concurrently is survivable by
  design. What is not survivable is a server this session did not start: `playwright.config.ts` has
  `reuseExistingServer: !process.env.CI`, ports 3000 and 3451 belong to other sessions on this machine,
  and reusing one has **already** produced a green run against another checkout's code — the item under
  « The tooling this batch broke its nose on » is exactly that. A pass under those conditions is not
  evidence, so none was claimed. The change this branch makes to anything the suite walks is one additive
  `PUBLIC_PATHS` entry, covered by `proxy.test.ts`; CI runs the browser suite on its own `postgres:17`
  service with `E2E_WEB_SERVER` and `CI` both set, and that is where this gets its real run.
- **Whether iOS Safari accepts a long bookmark address has not been observed**, and the answer now
  matters much less than it did an hour ago. The install the README leads with is a **423-character**
  loader that sets `window.__fmTraceKey` and appends a `<script>` pointing at `GET /api/dev/trace`, so the
  probe arrives over the network and the bookmark stays short enough that the question is moot. The inline
  form is kept as a fallback and is **15 090 characters** — it grew rather than shrank, because the secret
  and the key plumbing are now in it. **Both figures were measured with a 32-character key, and both move
  with the length of the secret**, so the build script prints the exact one and that is what to quote. The
  basis is given because a number without one is what let the previous figure in this paragraph go stale
  unnoticed. If that paste truncates it will look like it worked, which is why
  the README says to scroll to the end of the field; and the repair is to use the loader.
- **Nothing in this branch has run on the iPhone at all**, so the two tab-bar suspicions are exactly as
  open as they were this morning and no roadmap box moved to `[x]`.

**What the owner should be told rather than find.** Three things, in the order they bite.

**The route is in `PUBLIC_PATHS`, and public is not open.** It has to be: the middleware 307s any
extension-less path without a session cookie, which would swallow the captures worth having most —
`/connexion`, `/rejoindre`, and anything taken after an error killed the session. What stands in for the
session is a shared secret in `TRACE_SECRET`, compared with `crypto.timingSafeEqual` behind a
byte-length guard, and **unset, empty or whitespace all mean a dead endpoint**. Off, unconfigured and
wrong-key are one answer — `404`, with no body distinguishing them — so the route is indistinguishable
from one that was never deployed, which is also exactly what production gets.
**So nothing works until the owner sets `TRACE_SECRET` in Vercel's preview environment**, and that is
his to do: infrastructure is not this session's to touch.

**The loader puts the secret in a query string**, `?k=…` on the `GET`, because a bookmarklet cannot send
a header for its own script tag. Query strings are the part of a URL that ends up in access logs, so that
key should be treated as logged, rotated when the owner is done, and never reused for anything else. One
consequence to expect rather than be alarmed by: the access log it lands in is **the same stream the owner
is tailing to read his traces**, so he will watch his own key scroll past in `vercel logs` output. That is
where it was always going to appear — not a leak, and not a reason for the next session reading this to go
looking for one. The `POST`s that follow use the `x-trace-secret` header instead.

**What it actually logs is wider than « tab coordinates ».** It forwards console output from five
methods, `window.onerror` messages with stacks, unhandled rejections, the four tab labels it hit-tests,
and a label the owner types into the overlay. On a preview whose database holds real-looking data, a
console line or an error message can carry a real player's name into the Vercel log stream. That is a
deliberate trade for being able to see anything at all from the phone, not an oversight, and it is
bounded by the same 200-entry cap and the preview-only gate — but it is the reason the endpoint should go
back to dead the moment the two tab-bar questions are answered.

**A citation audit nobody asked for, which found three comments citing a decision that does not say what
they claim.** Reconciling the decision entry meant reading every number it cites, bodies and not headings.
Six of eight held. Two did not. « Decision 123 set the precedent of instrumentation that changes no
production code » was loose — **PR #111** set it, 123 is only where it is written down, and 123 itself does
ship production code; stated the right way round now. Worse, three comments in `lib/dev/trace.ts` and
`app/api/dev/trace/route.ts` cited **decision 114** for the claim that some code cannot be unit-tested. 114
says nothing of the kind: it is about the `COMMENT` event type, its 280 characters, and the four-tile action
menu, and it never mentions Vitest. The claim itself is true and now cites what actually supports it —
`vitest.config.ts` for the `include` list, decision 090 for « a claim no test can read », decision 096 for
« untestable where it sat, because Vitest collects `lib/**` and nothing under `app/` ». The part worth
recording is the failure mode, because **two sessions in a row mischaracterised 114, differently, without
either one opening it** — one from a heading, one from the other's summary. It is the same error as asserting
a security primitive's shape from memory of the intention rather than from the function, which happened in
this same batch and was caught by the same reviewer. A citation is a claim; `grep` the entry.
