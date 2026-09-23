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
- [ ] Playwright end-to-end happy path — deferred to its own slice

## M1 — Squad & profiles
- [x] Squad list with jersey numbers, injury badges and preferred positions, each row linking
      to the profile
- [x] Player profile (`/joueur/[id]`): position picker on a pitch diagram (primary / secondary),
      jersey number, personal details, injury history — `lib/player/`
- [x] Injuries: declared by the player for themselves or by a coach for anyone, with an expected
      return date, and resolvable
- [x] Invite management and coach appointment UI

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
- [ ] Drag-and-drop composition editor, swap on drop
- [ ] Custom formation creation (dragging the slots)
- [ ] Match sheet selection: titulaire / remplaçant / supporter
- [ ] Planned compositions from minute X, with the deduced-changes diff
- [x] `lib/match/lineup.ts` + unit tests (including chained position changes)

## M4 — Game mode
- [x] `lib/match/clock.ts` — continuous minutes with pauses
- [x] `lib/match/reducer.ts` — pure reducer + extensive unit tests
- [ ] Event ingestion API, idempotent on `client_event_id`
- [ ] `lib/match/outbox.ts` — IndexedDB queue with retry and pending badge
- [ ] Game mode screen: clock, pitch, bench, ACTION sheet, TERRAIN fast-change
- [ ] Planned composition prompts, pre-filled and confirmed
- [ ] Event timeline with per-event "annuler" (VOID)
- [ ] Final whistle → freeze `match_player_stats`

## M5 — Stats
- [x] Player stats: matches, minutes, goals, assists, own goals, fouls
- [x] GK clean sheets + clean minutes for every player
- [x] Appearance counts by role (starter / substitute / GK / supporter)
- [x] Training attendance rate
- [x] Team stats: results, form, top scorers, top rated
- [x] Competition filter across all stats

## M6 — Ratings & recap
- [ ] Rating flow: one teammate per card, 0–10, optional comment
- [ ] Results hidden until you have submitted your own
- [ ] Window closes at the next kick-off
- [ ] Derived man of the match
- [ ] Celebratory post-match recap screen

## M7 — Retro-entry & amendments
- [ ] "Saisie rétroactive" screen synthesising events
- [ ] Amend a finished match by appending corrections
- [ ] Recompute frozen stats after an amendment

## Deployment
- [ ] **Blocked:** needs a Neon `DATABASE_URL` from the owner (interactive signup).
      Everything else for deployment is ready — Vercel CLI is authenticated.
- [ ] `vercel link`, env vars, production deploy
- [ ] Verify on a real iPhone and Android in daylight
