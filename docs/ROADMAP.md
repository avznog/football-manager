# Roadmap

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

## M0 — Foundations
- [ ] Next.js + TypeScript + Tailwind scaffold, mobile-first shell, light/dark theming
- [ ] PWA manifest (installable, no push)
- [ ] `docs/` + `CLAUDE.md`
- [ ] Local Postgres via Docker (`npm run db:up`), Drizzle config, `DATABASE_URL` only
- [ ] Full schema in `db/schema.ts` + first migration committed
- [ ] Auth: argon2id password hashing, sessions table, httpOnly cookie, login/logout
- [ ] Teams, `team_members`, invite codes, join-by-code, coach appointment
- [ ] `lib/auth/can.ts` with unit tests
- [ ] "No team" layout guard
- [ ] `db/seed.ts` — a fake team with 13 players, formations, matches, events

## M1 — Squad & profiles
- [ ] Squad list with jersey numbers, preferred positions, injury badges
- [ ] Player profile: position picker on a pitch diagram (primary / secondary)
- [ ] Injuries: declared by the player or the coach, with expected return
- [ ] Invite management and coach appointment UI

## M2 — Calendar
- [ ] Matches CRUD (opponent, kick-off, home/away, venue, competition, periods)
- [ ] Trainings CRUD
- [ ] Unified chronological calendar, next event pinned
- [ ] Availability declaration for matches and trainings
- [ ] Coach view of non-responders, copyable list
- [ ] Training attendance marking

## M3 — Compositions
- [ ] `positions` reference data + built-in 7-a-side formation templates
- [ ] Turf pitch component (light/dark, mobile + desktop)
- [ ] Drag-and-drop composition editor, swap on drop
- [ ] Custom formation creation (dragging the slots)
- [ ] Match sheet selection: titulaire / remplaçant / supporter
- [ ] Planned compositions from minute X, with the deduced-changes diff
- [ ] `lib/match/lineup.ts` + unit tests (including chained position changes)

## M4 — Game mode
- [ ] `lib/match/clock.ts` — continuous minutes with pauses
- [ ] `lib/match/reducer.ts` — pure reducer + extensive unit tests
- [ ] Event ingestion API, idempotent on `client_event_id`
- [ ] `lib/match/outbox.ts` — IndexedDB queue with retry and pending badge
- [ ] Game mode screen: clock, pitch, bench, ACTION sheet, TERRAIN fast-change
- [ ] Planned composition prompts, pre-filled and confirmed
- [ ] Event timeline with per-event "annuler" (VOID)
- [ ] Final whistle → freeze `match_player_stats`

## M5 — Stats
- [ ] Player stats: matches, minutes, goals, assists, own goals, fouls
- [ ] GK clean sheets + clean minutes for every player
- [ ] Appearance counts by role (starter / substitute / GK / supporter)
- [ ] Training attendance rate
- [ ] Team stats: results, form, top scorers, top rated
- [ ] Competition filter across all stats

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
