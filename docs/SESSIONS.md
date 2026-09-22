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
