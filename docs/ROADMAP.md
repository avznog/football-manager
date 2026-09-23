# Roadmap

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

## M0 — Foundations
- [x] Next.js + TypeScript + Tailwind scaffold, mobile-first shell, light/dark theming
- [x] PWA manifest (installable, no push)
- [x] `docs/` + `CLAUDE.md`
- [x] Local Postgres via Homebrew (`npm run db:start`), Drizzle config, `DATABASE_URL` only
      — Docker was abandoned, see decision 016
- [x] Full schema in `db/schema.ts` + first migration committed
- [x] Auth: argon2id password hashing, sessions table, httpOnly cookie, login/logout
- [x] Teams, `team_members`, invite codes, join-by-code, coach appointment
- [x] `lib/auth/can.ts` with unit tests
- [x] "No team" layout guard (`app/(app)/layout.tsx` + optimistic `proxy.ts`)
- [x] `db/seed.ts` — reference data (prod-safe) + a demo season of 13 players, 4 matches,
      3 trainings, an event log with a voided goal, ratings
- [x] Playwright end-to-end happy path (`e2e/happy-path.spec.ts`, `npm run test:e2e`) — the whole
      PLAN scenario driven through the UI on a 390×844 viewport, with a run-scoped fixture team
      instead of the demo season (decision 044), plus CI in `.github/workflows/ci.yml`
- [x] Playwright first run (`e2e/first-run.spec.ts`) — the state a fresh deployment is in: a super
      admin with no team creates one from `/rejoindre`, lands in the app, sees an empty squad that
      says what to do next, and renames the team. Mutation-tested against the four bugs it covers

## M1 — Squad & profiles
- [x] Squad list with jersey numbers, injury badges and preferred positions, each row linking
      to the profile
- [x] Player profile (`/joueur/[id]`): position picker on a pitch diagram (primary / secondary),
      jersey number, personal details, injury history — `lib/player/`
- [x] Injuries: declared by the player for themselves or by a coach for anyone, with an expected
      return date, and resolvable
- [x] Invite management and coach appointment UI
- [x] The team's last coach is told why he cannot be demoted or removed, instead of being offered
      two buttons the server refuses in silence — and the squad row wraps so his name still fits

## M2 — Calendar
- [x] Matches CRUD (opponent, kick-off, home/away, venue, competition, periods)
- [x] Trainings CRUD
- [x] Unified chronological calendar, next event pinned
- [x] Availability declaration for matches and trainings
- [x] Coach view of non-responders, copyable list
- [x] Training attendance marking

## M3 — Compositions
- [x] `positions` reference data + built-in 7-a-side formation templates (`db/reference.ts`)
- [x] Turf pitch component (light/dark, mobile + desktop) — `components/pitch/`
- [x] Drag-and-drop composition editor, swap on drop
- [x] Custom formation creation (dragging the slots)
- [x] Match sheet selection: titulaire / remplaçant / supporter
- [x] Planned compositions from minute X, with the deduced-changes diff
- [x] `lib/match/lineup.ts` + unit tests (including chained position changes)

## M4 — Game mode
- [x] `lib/match/clock.ts` — continuous minutes with pauses
- [x] `lib/match/reducer.ts` — pure reducer + extensive unit tests
- [x] Event ingestion API, idempotent on `client_event_id`
- [x] `lib/match/outbox.ts` — IndexedDB queue with retry and pending badge
- [x] Game mode screen: clock, pitch, bench, ACTION sheet
- [x] TERRAIN fast-change inside game mode (`lib/match/terrain.ts`,
      `components/action-sheet/terrain-sheet.tsx`): drag, tap-then-tap or keyboard, one
      `LINEUP_APPLIED` per confirmation, and « Ajuster sur le terrain » on the planned-composition
      prompt — see decision 045, which amends 032
- [x] Planned composition prompts, pre-filled and confirmed
- [x] Event timeline with per-event "annuler" (VOID)
- [x] Final whistle → freeze `match_player_stats`

## M5 — Stats
- [x] Player stats: matches, minutes, goals, assists, own goals, fouls
- [x] GK clean sheets + clean minutes for every player
- [x] Appearance counts by role (starter / substitute / GK / supporter)
- [x] Training attendance rate
- [x] Team stats: results, form, top scorers, top rated
- [x] Competition filter across all stats

## M6 — Ratings & recap
- [x] Rating flow: one teammate per card, 0–10, optional comment
- [x] Results hidden until you have submitted your own
- [x] Window closes at the next kick-off
- [x] Derived man of the match
- [x] Celebratory post-match recap screen

## M7 — Retro-entry & amendments
- [x] "Saisie rétroactive" screen synthesising a full event log from a filled-in sheet
      (`lib/retro/log.ts`, `app/(app)/match/[id]/saisie/`) — minutes are optional and stamped,
      see decision 048
- [x] Amend a finished match by appending corrections (`lib/retro/amend.ts`,
      `amendMatchEvents`) — a `VOID` plus a replacement, keeping the target's minute (decision 049)
- [x] Recompute frozen stats after an amendment — `amendMatchEvents` re-freezes
      `match_player_stats` through `finalizeMatchById` whenever the match is or becomes finished

## Deployment
- [x] First-run bootstrap — `npm run db:bootstrap` writes the reference data and the one
      super-admin account an invite-only app cannot otherwise have (decision 052). Verified
      against an empty database: the guards refuse a short password and the demo default, and a
      second run resets the password instead of failing
- [x] The first team can be created from the application — `createTeam` had no UI at all, and
      invariant 5 sends a user with no team to `/rejoindre` and nowhere else, so the form lives
      there for a super admin. Walked in a browser at 390 px, light and dark: bootstrap → login →
      create → all five tabs reachable, no console errors
- [x] The club colours can be changed after creation — « Réglages de l'équipe » on `/equipe`
      (`updateTeam` had no UI either)
- [x] Every tab checked in the state a brand-new instance is actually in — zero matches, zero
      players, zero trainings. The demo seed always had a season in it, so this state had never
      been looked at; `/equipe` was an empty bordered box and now says what to do next
- [x] `docs/DEPLOY.md` — the runbook: Neon, migrations, bootstrap, Vercel, first run, upgrades,
      and every environment variable with where it belongs
- [ ] **Blocked:** needs a Neon `DATABASE_URL` from the owner (interactive signup).
      Everything else is ready — the Vercel CLI is authenticated as `avznog` and
      `docs/DEPLOY.md` is step by step from there
- [ ] `vercel link`, env vars, production deploy — `docs/DEPLOY.md` §4
- [ ] Verify on a real iPhone and Android in daylight — `docs/DEPLOY.md` §6
