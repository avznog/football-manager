# CLAUDE.md — how to work on this repository

This file is the entry point for any Claude session. Read it first, then `docs/`.
It exists because the owner works across many sessions that share no memory: **everything
needed to resume is in git.**

> **Read [`COORDINATION.md`](COORDINATION.md) before anything else, on every wake-up.** More than one
> session works this repository at once, sometimes on different machines where they cannot see each
> other at all, and that file is the only channel they share. It says who is active, what changed
> under you, and how to avoid the collisions that have already cost hours. It is short.

## What this project is

A mobile-first web app to manage an amateur **7-a-side** football team over a season:
calendar, availability, squad selection, compositions, a live match mode, statistics,
post-match player ratings, and training attendance.

**The UI is in French. The code is in English.** User-facing strings are French; identifiers,
comments, commit messages, docs and PR descriptions are English. Never mix the two.

**The French tutoies, always.** « Ta réponse », « Appuie sur un poste », « Tu suis le match en
direct » — never « votre », never « vous ». A dozen people who play football together on a Sunday, in
one team's own tool (decision 074). When a sentence would need the plural « vous » for the team
rather than for one reader, name the subject instead: « Le thème de la séance », not « Ce que vous
travaillez ».

## Read these, in order

0. `COORDINATION.md` — who else is working right now, and what moved under you. Re-read it every
   wake-up; unlike the rest of this list, it is written to go stale.
1. `docs/PLAN.md` — the approved plan. The source of truth for scope and architecture.
2. `docs/DECISIONS.md` — every product and technical decision, with its rationale.
   **Do not silently contradict a decision here.** If you think one is wrong, say so and add
   a new entry superseding the old one.
3. `docs/DATA_MODEL.md` — tables, relationships, invariants.
4. `docs/ROADMAP.md` — what is done, what is in progress, what is next.
5. `docs/SESSIONS.md` — append-only log of what each session changed. Read the last entries
   to understand where the previous session stopped.
6. `docs/DEPLOY.md` — the deployment runbook: Neon, migrations, `db:bootstrap`, Vercel, and the
   first run in the browser. Read it before touching anything about deployment or the first account.
7. `instructions.md` — the owner's original notes, in French. Historical; `docs/` supersedes it.

## Stack

- Next.js (App Router) + TypeScript, React Server Components, Server Actions for mutations
- Neon Postgres in production; a local Homebrew Postgres in development (decision 016)
- Drizzle ORM — schema in `db/schema.ts`, generated SQL in `db/migrations/` (**always committed**)
- Tailwind CSS, hand-rolled components (no heavy UI kit)
- Self-written auth: username + password (argon2id), opaque session cookie, `sessions` table
- Vitest for unit tests, Playwright for end-to-end
- Deployed on Vercel

## Non-negotiable invariants

1. **`match_events` is append-only.** Never `UPDATE`, never `DELETE`. A mistake is corrected by
   appending a `VOID` event that points at it. The reducer skips voided events.
2. **All live match state is derived**, never stored: score, who is on the pitch, minutes played,
   clean-sheet minutes. `lib/match/reducer.ts` is the only place that computes it, and it is a
   **pure function** — no database access, no `Date.now()`, no randomness. This is what makes it
   testable, and it is the most important file in the repo.
3. **A planned composition is never applied automatically.** In game mode the app proposes it,
   pre-filled, and waits for the coach to confirm.
4. **Every mutation goes through `can()`** in `lib/auth/can.ts`. No ad-hoc permission checks
   scattered in route handlers or actions.
5. **A user with no team sees nothing** but the "join a team" screen. Enforced in the layout guard.
6. **Event ingestion is idempotent**, keyed on `client_event_id`. Retrying a POST must never
   create a duplicate event.

## Conventions

- Server Actions live next to the route that uses them, in `actions.ts`.
- Queries live in `lib/queries/` and return plain serialisable objects, never Drizzle rows with
  Date objects crossing the RSC boundary unformatted.
- Dates are stored as `timestamptz` and always handled in `Europe/Paris` for display.
- Match minutes are **continuous**: with 2×30, the second half runs 30'→60'. Never display a
  reset clock.
- Tailwind only, with the design tokens in `app/globals.css`. No inline hex colours.
- **The code is hand-formatted and Prettier is not the formatter.** It is not a dependency and runs in
  no CI job; 106 of 274 source files differ from what it would emit, so `--check` is not a gate and
  making it one would be a thousand-line diff. Use it on one file you are already editing, never on a
  whole directory, and **never on anything in `docs/`** — it turns `*emphasis*` into `_emphasis_` across
  the entire file and buries the paragraph you added. `.prettierrc` and `.prettierignore` exist to make
  that safe; read the comment at the top of the second one before overriding either.
- Light and dark themes must both be checked for any new screen.
- Nothing is explained on hover. A `title` is at most a duplicate of something already
  visible or announced: there is no hover on a phone (decision 072).

## Commands

```bash
npm run dev            # dev server
npm run db:start       # start the local Postgres (Homebrew — see decision 016)
npm run db:generate    # generate a migration from schema.ts changes
npm run db:migrate     # apply migrations
npm run db:seed        # reference data + the demo season (idempotent)
npm run db:reset       # drop everything, remigrate, reseed — local only
npm run db:bootstrap   # an empty database: reference data + the one super admin (docs/DEPLOY.md)
npm test               # Vitest — unit only, and it stays that way
npm run test:e2e       # Playwright: the season loop, the first run, and the offline queue (~25s)
npm run test:e2e:install   # Chromium, once per machine
npm run lint           # eslint
npm run typecheck      # next typegen && tsc --noEmit
npm run build          # production build
npm run peer           # what the other sessions changed on origin since last run (COORDINATION.md)
```

`npm run test:e2e` reuses a dev server if one is already up, so it is cheap. It drives
**`localhost`, never `127.0.0.1`** — see decision 043: Next treats the latter as a foreign origin,
the page never hydrates, and the suite silently tests the no-JavaScript fallbacks instead. It owns
its own fixture team and never touches the demo season (decision 044).

`.github/workflows/checks.yml` holds those checks — one job for typecheck · lint · vitest, and one for
the browser run on a `postgres:17` service with the committed migrations and a production build. It is
`workflow_call` only and never runs on its own: `ci.yml` calls it for every pull request and every push
to `main`, and `release.yml` calls it again for a tag, so a tag is tested exactly as the pull request
was. `ci.yml` then migrates the **preview** database on a `main` push and deploys the preview, and creates
no tag; `release.yml` is the only workflow that touches production (decision 119).

`next typegen` has to run before `tsc`, so always go through `npm run typecheck` rather than
calling `tsc` directly: `PageProps<"/route">` does not exist until the route types are generated.

## Definition of done for any change

- `npm run typecheck`, `npm run lint` and `npm run test` all pass
- `npm run test:e2e` passes if the change touches the match flow, a Server Action or a screen the
  happy path walks through — and CI must be green on the PR before it is merged
- new behaviour has a test if it touches the reducer, the lineup diff, or permissions
- both light and dark mode verified on a mobile viewport — **actually looked at, at 390 px**. Every
  defect found in waves 3 and 4 was a screen stating something untrue, and not one of them failed a
  test: « 0 – 0 » for a match nobody recorded, « 7 changements » for the starting seven, a confirm
  button 8 px off the right edge. `npm run db:reset` then walking the season is the cheapest review
  tool in the repo
- **every screen with a role-dependent branch looked at in both roles, side by side in one pass.**
  The defect is in the comparison: a coach's card spelling out « Ailier gauche » next to a player's
  bare position code, or a coach reading « postes secondaires : Défenseur central, Milieu droit » in
  prose while the player gets the instruction « Appuie sur un poste… » in the same slot, is invisible
  to a reader who sees one screen at a time. Four findings got through people who had read both code
  paths — just never together: the positions chip, the secondary-positions summary, `D25` (a player
  can never find out whether he was marked present) and `S8` (a player sees the lineup on `/jeu` and
  a 404 on `/composition`). « In one pass » is the whole rule, for the same reason « actually looked
  at » is: the audit's own `/equipe` theme-drift finding was false precisely because it measured the
  two arms sequentially, and the same method applied in a single pass gave the right answer
- `docs/ROADMAP.md` updated, `docs/SESSIONS.md` appended to, and `docs/DECISIONS.md`
  extended if a decision was made
- migrations committed alongside the schema change that produced them
- **the work is committed and pushed to `origin`** — see below

## Git workflow

One branch per slice, named `feat/<slice>`. Open a PR describing what the slice does and how to
verify it. **Squash-merge** into `main`. Never commit directly to `main`.

**Nothing deploys from git any more.** `vercel.json` sets `git.deploymentEnabled` to `false` for
**every** branch including `main`, so Vercel's Git integration issues no deployment at all, ever, and
both deployments this project has are issued by a workflow with the Vercel CLI: `deploy-preview` in
`ci.yml` after `migrate-preview` on a push to `main`, and `deploy-production` in `release.yml` after
`migrate-production` on a tag (decision 119, which supersedes 080's reliance on the Git integration).
So « a branch that is neither `main` nor a tag deploys nowhere » is now true by construction, and the
way to look at a branch is still a local `npm run build`.

Do not restate this from memory: an earlier draft of decision 119 said a `main` push produced a
*Preview* deployment from the Git integration, and that was checked against the Vercel API and found
untrue — a `main` push was producing a **production** deployment until the owner parked the project's
production branch, and after that it produced nothing at all. That branch is parked
(`vercel-production-placeholder`, verified), and it is now defence in depth rather than the thing the
split rests on.

One piece of dashboard state the design does still depend on: **`dev.7orteils.bgonzva.fr` is pinned to
the git branch `main`**, so the CLI preview deployment only takes that domain if it carries `main` as
its git-branch metadata — which is why `deploy-preview` sets `VERCEL_GIT_COMMIT_REF: main` itself. **The
domain is observed to take a CLI preview deployment; that the variable is what wins it is inferred.**
`vercel inspect https://dev.7orteils.bgonzva.fr` prints a `target preview` deployment holding the alias,
which is the first claim; the second would need a preview deploy carrying a different ref to fail to take
the domain, and that experiment points the owner's only review surface at the wrong commit, so nobody
runs it. Keep setting the variable, do not promote the reason, and see `docs/DEPLOY.md` §4 for the
fallback and for how to re-check without reading the log for an alias line it never prints.

**Versions are the `version` field in `package.json`, and a tag is the act that ships.** Bump the number
in the pull request that earns it; then, when the owner decides to ship, the annotated tag is cut **by
hand** on `main` — and pushing it is what migrates the production database and deploys production
(decision 119, superseding 081). The `gate` job in `.github/workflows/release.yml` refuses any tag that
does not equal `v$(package.json version)` **at the commit it points at**, or whose commit is not
reachable from `origin/main`, and names in its error the command that deletes it. So a hand-cut tag is
checked before it is believed rather than forbidden — but nothing cuts it for you, and an untagged
version on `main` means production keeps serving the previous one. `docs/DEPLOY.md` « Shipping a
version » is the four steps. Two things that are **not** how this works, both of which the docs claimed
until they were checked: re-pushing an unchanged tag is not a retry — it prints `Everything up-to-date`
and fires nothing, so the retry is `gh run rerun --failed <run-id>` — and a rollback is never a tag on an
older commit, because that commit has no `release.yml` to run and `db:migrate` has no way back.

**Nothing is done until it is on `origin`.** The whole reason this project keeps its spec, its
decisions and its migrations in git is that sessions share no memory: work that exists only in a
local working tree is work the next session cannot find. So, without being asked:

- commit as you go, in logical commits — one concern per commit, message in English explaining
  *why*, not just *what*;
- `git push` the branch as soon as the first commit exists, and again after every commit, so a
  crashed machine costs nothing;
- open the PR, squash-merge it, then `git push` / pull `main` so the remote and the local `main`
  agree;
- **never end a working session with a dirty working tree or an unpushed commit.** If something
  is half-finished, commit it on its branch with a message saying so and push it anyway.

Run `git status -sb` before you stop. `## main...origin/main` with nothing after it, and no
listed files, is the only acceptable final state.

Subagents do not run git. They report what they changed and the session that launched them
commits, pushes and merges — that keeps one hand on the history instead of several racing.
