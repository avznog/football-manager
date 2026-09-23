# Roadmap

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

## M0 — Foundations
- [x] Next.js + TypeScript + Tailwind scaffold, mobile-first shell, light/dark theming
- [x] PWA manifest (installable, no push)
- [x] `docs/` + `CLAUDE.md`
- [x] The app owns its dead ends — `not-found` and `error` boundaries at the root and inside the
      shell, plus one for game mode that can truthfully say the queued actions are safe
      (decision 058). Fifteen pages called `notFound()` and every one of them landed on Next's
      built-in « This page could not be found. », in English, in a French app; there was no error
      boundary of any kind, so one failing query took the whole screen. All five walked at 390 px
      in both themes against a production build
- [x] `npm run audit:screens` — 23 screens of the demo season walked at 390 px in both themes, as a
      coach and as a non-coach player, screenshotted, with the mechanical defects failing the command:
      a console error, a box outside the viewport no scroll container owns, an English framework
      string, a screen open to somebody it is not for, a page with no level-one heading (decision 059)
- [x] The three defects its first pass found: « Appliquer » offered to a member who may not operate
      the match (the server answered 403), « ne change rien sur le terrain » printed over a starting
      seven about to walk onto an empty pitch, and two screens with no `h1` at all — game mode, and
      the composition editor in each of its four dead ends (decision 060)
- [x] One scoreline convention — ours first, on all five screens that print one, with the venue said
      in words. The recap of an away win showed « 0 – 2 » in 60 px numerals under « Victoire », over a
      timeline writing the same goals « 2 – 0 » (decision 061)
- [x] « Aucune composition enregistrée » no longer printed twenty pixels under the composition it
      denied: an empty pitch before kick-off is what invariant 3 *produces* (decision 062)
- [x] …and `scoreLineFr` really is the only function that writes one now: the reducer, the recap
      timeline, game mode's timeline and `lib/stats/format.ts` each built their own with a hyphen, so
      a recap showed « 2 – 0 » and « 2 - 0 » three cards apart. `formatScore` deleted, decision 061
      amended by 064 rather than left standing as a claim that was not true
- [x] A played match leads with what can still be done, not with the pre-match availability
      roll-call — « Après le match » was nine hundred pixels down a phone, and it is the one card
      with a deadline (decision 068)
- [x] A brand-new match sheet no longer shows thirteen red « — » — nobody has been left out of a
      sheet nobody has filled. « Hors feuille », a `neutral` segment tone, and a summary that
      accounts for every player (decision 067)
- [x] The match form says what its two numbers come to — « 2×30 minutes : 60 minutes de jeu, et la
      2ᵉ période va de la 30ᵉ à la 60ᵉ minute » — instead of hinting « 2 par défaut. » under a field
      already holding 2, which was false on the edit form of any match that runs something else
      (decision 066)
- [x] The audit browser speaks French to its *form controls* too — `--lang=fr-FR`, because
      `context.locale` does not reach the native date picker, so every date field had been
      screenshotted `mm/dd/yyyy` in a French app (decision 065)
- [x] « 11 présents sur 14 pointés » on a calendar row: the denominator was always who the coach
      marked, and without the word a coach with thirteen players reads « sur 14 » as a bug
- [x] « Je me suis blessé » on `/moi` looks tappable — a `<summary>` with `list-none` and no marker
      is a grey panel of text on a phone
- [x] A finished match with an empty log is no longer offered « Voir le déroulé » in a full-width
      primary button promising « le déroulé reste consultable », and the « Composition » card's badge
      says which seven it is counting — it read « 7 / 7 » directly above « Aucune composition »
      (decision 063)
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
- [x] …and then the two controls left the list for the member's own page, which is what the
      wrapping was paying for: a coach's squad was two lines per player, twice the scroll of
      everyone else's, for two buttons he presses twice a season. The row is one line again and the
      whole of it is the link. « A team keeps one coach » is now one tested function,
      `wouldLeaveNoCoach` in `lib/team/coaches.ts`, instead of three copies that had to agree

## M2 — Calendar
- [x] Matches CRUD (opponent, kick-off, home/away, venue, competition, periods)
- [x] Trainings CRUD
- [x] Unified chronological calendar, next event pinned
- [x] Availability declaration for matches and trainings
- [x] Coach view of non-responders, copyable list
- [x] Training attendance marking
- [x] A session's présences are counted over that evening and not over today's squad, so the training
      page and the calendar row agree about it — and the page says why the denominator can be larger
      than the list under it. The availability list moves below the présences once the session is over,
      and disappears when nobody had answered at all (decision 069)
- [x] A session nobody pointed says so, instead of nothing. On a list row « Présences pas encore
      pointées », so it cannot be mistaken for the 12 September session where everybody was absent;
      and on its own page, where a player used to get a date, a venue and eleven hundred pixels of
      blank, the sentence that matters — it counts in nobody's attendance rate (decision 076)
- [x] …and the audit looks at a past session at all now. It picked its training with
      `order by starts_at desc`, so it always visited the one still to come: `PresenceSummary`,
      `departedMarksNoteFr` and the blank page had never been screenshotted. 100 visits, not 92

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
- [x] The offline walk `docs/PLAN.md` left by hand, automated (`e2e/offline.spec.ts`): three actions
      tapped with the network cut land once each at the minute they were tapped, and a POST that
      succeeds but answers 503 does not count its event twice. It found a real defect on its first
      run — `router.refresh()` after every tap blanked game mode offline, because Next answers a
      failed RSC request with a full browser navigation (decision 057)
- [x] Game mode screen: clock, pitch, bench, ACTION sheet
- [x] TERRAIN fast-change inside game mode (`lib/match/terrain.ts`,
      `components/action-sheet/terrain-sheet.tsx`): drag, tap-then-tap or keyboard, one
      `LINEUP_APPLIED` per confirmation, and « Ajuster sur le terrain » on the planned-composition
      prompt — see decision 045, which amends 032
- [x] The drag gesture the editor and TERRAIN shared is one implementation now: the rules in
      `lib/pitch/drag.ts` (tap under 8 px, the 12 px turf margin, « off the turf » as an answer of
      its own) with unit tests, the React part in `components/pitch/usePitchDrag.ts`, and what a
      drop *means* still per screen — it benches a player in the editor and is a no-op in TERRAIN,
      on purpose (decisions 045 and 055). Both screens re-walked at 390 px in both themes
- [x] Planned composition prompts, pre-filled and confirmed — including against a pitch that is a
      player short, where the prompt used to list nothing at all while a man walked on
- [x] Event timeline with per-event "annuler" (VOID)
- [x] Final whistle → freeze `match_player_stats`

## M5 — Stats
- [x] Player stats: matches, minutes, goals, assists, own goals, fouls
- [x] GK clean sheets + clean minutes for every player
- [x] Appearance counts by role (starter / substitute / GK / supporter)
- [x] Training attendance rate
- [x] Team stats: results, form, top scorers, top rated
- [x] Competition filter across all stats
- [x] Nothing on the stats screens is explained on hover: `Figure`'s hints used to live in a `title`
      attribute, which on a phone is nowhere, so « 7 matchs sur la feuille » — the figure that
      reconciles « Matchs 6 » with « 7 fois titulaire » — had never been read by anyone (decision 072)
- [x] One wording for a player's appearances, shared by `/stats` and the profile card, and French:
      « 7 fois titulaire », not « 7 titulaire » (decision 073)

- [x] One register in the French: the app tutoies everywhere. Eight strings vouvoied, including the
      banner a player reads in game mode, with the same coach addressed both ways on one screen
      (decision 074, and the rule is in `CLAUDE.md`)

## M6 — Ratings & recap
- [x] Rating flow: one teammate per card, 0–10, optional comment
- [x] Results hidden until you have submitted your own
- [x] Window closes at the next kick-off
- [x] Derived man of the match
- [x] Celebratory post-match recap screen
- [x] The rating card states what a player did, not what the coach planned — « 60’ » or
      « non entré », read from the log, and nothing at all for a match nobody recorded. It used to
      read « entré en jeu » off `match_squad.role`, so a named substitute who spent the whole hour
      on the bench was announced as having come on, to the team, as they rated him (decision 053)
- [x] …and says which card of the stack is open in words: « joueur 3 sur 11 ». An unlabelled « 3 / 11 »
      beside a shirt number read as a fact about the man being rated, most plausibly as a tally of who
      had already rated him — which decision 007 exists to hide (decision 070)
- [x] The recap's minutes table spells out « Passes ». Its header was « PD », two letters that are a
      slur in French, on the one screen the whole squad reads (decision 071)

## M7 — Retro-entry & amendments
- [x] "Saisie rétroactive" screen synthesising a full event log from a filled-in sheet
      (`lib/retro/log.ts`, `app/(app)/match/[id]/saisie/`) — minutes are optional and stamped,
      see decision 048
- [x] Amend a finished match by appending corrections (`lib/retro/amend.ts`,
      `amendMatchEvents`) — a `VOID` plus a replacement, keeping the target's minute (decision 049)
- [x] Recompute frozen stats after an amendment — `amendMatchEvents` re-freezes
      `match_player_stats` through `finalizeMatchById` whenever the match is or becomes finished
- [x] A match typed up afterwards says so where it is read: « saisi après le match » on the match
      page and the recap, and a note under « Temps de jeu » explaining that the minutes are the
      app's best placement and the score is exact (decisions 013 and 048). `matches.entry_mode` was
      written by the entry action and read by nothing but the entry screen itself
- [x] …including game mode, the last screen that printed a minute without saying where it came from.
      `LiveMatchRow` did not *declare* `entry_mode` and `competition`, though `getLiveMatch` had
      always passed them through, so the scoreboard could not ask and `getRetroView` re-queried
      `matches` for values it was already holding. The type now says what the row carries: the badge
      sits under the clock, and that query is gone

## Deployment
- [x] First-run bootstrap — `npm run db:bootstrap` writes the reference data and the one
      super-admin account an invite-only app cannot otherwise have (decision 052). Verified
      against an empty database: the guards refuse a short password and the demo default, and a
      second run resets the password instead of failing
- [x] The first team can be created from the application — `createTeam` had no UI at all, and
      invariant 5 sends a user with no team to `/rejoindre` and nowhere else, so the form lives
      there for a super admin. Walked in a browser at 390 px, light and dark: bootstrap → login →
      create → all five tabs reachable, no console errors
- [x] The club colours can be changed after creation — « Réglages de l’équipe » on `/equipe`
      (`updateTeam` had no UI either)
- [x] The club crest can be set — `teams.crest_url` had existed since M0 with nothing able to write
      it, for want of an object store. The image is resized to 96 px in the browser and stored in the
      row as a `data:` URL (decision 054), which is why there is still no object store to provision
- [x] Every tab checked in the state a brand-new instance is actually in — zero matches, zero
      players, zero trainings. The demo seed always had a season in it, so this state had never
      been looked at; `/equipe` was an empty bordered box and now says what to do next
- [x] `docs/DEPLOY.md` — the runbook: Neon, migrations, bootstrap, Vercel, first run, upgrades,
      and every environment variable with where it belongs
- [x] The app builds without a database. The first three Vercel deploys failed in 40 seconds at
      `db/client.ts:21` — `DATABASE_URL` was read at module scope, and `next build` imports every
      route to collect its configuration, so a missing production secret killed the build itself.
      The connection opens on the first query now, and the message it throws names Vercel as well as
      `.env.local` (decision 075)
- [x] `vercel link`, env vars, production deploy — `docs/DEPLOY.md` §4. The owner connected the
      repository and attached Neon through the marketplace; `DATABASE_URL` is set for production and
      preview, and production builds and deploys green since the fix above
- [ ] **Blocked on the owner, two settings, both documented in `docs/DEPLOY.md` §4:**
      1. **Deployment Protection is on**, so the site answers every request with a `302` to
         `vercel.com/sso-api` — the squad joins with a code sent on WhatsApp and none of them has a
         Vercel account, so nobody can open the app. Settings → Deployment Protection → Vercel
         Authentication → Disabled.
      2. **The migrations have not been run against Neon**, and `db:bootstrap` has not created the
         super admin. Neither can be done from here: the marketplace integration stores its variables
         sensitive, so `vercel env pull` returns `DATABASE_URL=""` and the string has to come from the
         Neon dashboard. §2 and §3, one command each.
- [ ] Verify on a real iPhone and Android in daylight — `docs/DEPLOY.md` §6. Waits on the two above:
      a phone in daylight currently sees the Vercel login page
