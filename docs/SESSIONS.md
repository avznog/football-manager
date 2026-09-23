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
