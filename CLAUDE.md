# CLAUDE.md — how to work on this repository

This file is the entry point for any Claude session. Read it first, then `docs/`.
It exists because the owner works across many sessions that share no memory: **everything
needed to resume is in git.**

## What this project is

A mobile-first web app to manage an amateur **7-a-side** football team over a season:
calendar, availability, squad selection, compositions, a live match mode, statistics,
post-match player ratings, and training attendance.

**The UI is in French. The code is in English.** User-facing strings are French; identifiers,
comments, commit messages, docs and PR descriptions are English. Never mix the two.

## Read these, in order

1. `docs/PLAN.md` — the approved plan. The source of truth for scope and architecture.
2. `docs/DECISIONS.md` — every product and technical decision, with its rationale.
   **Do not silently contradict a decision here.** If you think one is wrong, say so and add
   a new entry superseding the old one.
3. `docs/DATA_MODEL.md` — tables, relationships, invariants.
4. `docs/ROADMAP.md` — what is done, what is in progress, what is next.
5. `docs/SESSIONS.md` — append-only log of what each session changed. Read the last entries
   to understand where the previous session stopped.
6. `instructions.md` — the owner's original notes, in French. Historical; `docs/` supersedes it.

## Stack

- Next.js (App Router) + TypeScript, React Server Components, Server Actions for mutations
- Neon Postgres in production; a local Docker Postgres in development
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
- Light and dark themes must both be checked for any new screen.

## Commands

```bash
npm run dev            # dev server
npm run db:up          # start the local Postgres container
npm run db:generate    # generate a migration from schema.ts changes
npm run db:migrate     # apply migrations
npm run db:seed        # reset + seed a fake team with players, matches and events
npm run test           # Vitest
npm run test:e2e       # Playwright
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
```

## Definition of done for any change

- `npm run typecheck`, `npm run lint` and `npm run test` all pass
- new behaviour has a test if it touches the reducer, the lineup diff, or permissions
- both light and dark mode verified on a mobile viewport
- `docs/ROADMAP.md` updated, `docs/SESSIONS.md` appended to, and `docs/DECISIONS.md`
  extended if a decision was made
- migrations committed alongside the schema change that produced them

## Git workflow

One branch per slice, named `feat/<slice>`. Open a PR describing what the slice does and how to
verify it. **Squash-merge** into `main`. Never commit directly to `main`.
