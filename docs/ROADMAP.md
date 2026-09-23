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
- [x] What a member *is* comes from `role` **and** `is_player`, on `/moi` as on the profile.
      « Mon équipe » badged the founder of a team — `role = 'coach'`, `is_player = false`, which is
      what `createTeam` inserts — « joueur » the moment anybody demoted him, directly above the same
      page's « Tu fais partie de l'encadrement ». `memberBadgesFr` in `lib/team/membership.ts`
      (decision 094)
- [x] The invite card stops promising less than its own form offers. It was « Inviter des joueurs »
      over a select whose second option is « Coach »; and « Encadrement », true of every row under it,
      did not mention the coach who is in the effectif instead. `lib/team/labels.ts`, six tests
      (decision 092)
- [x] …and the profile speaks about the member whose profile it is. The demo team's own non-playing
      coach was told he would « ne plus pouvoir déclarer ses disponibilités ni être convoqué », under
      a card headed « Fiche joueur » saying he is not one, beside a jersey hint about « le joueur ».
      `lib/player/labels.ts` decides all three now, and Vitest can read them (decision 093)

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
- [x] The history section is headed by what is in it. « Déjà joué » stood over three trainings and a
      match nobody had recorded; `pastSectionTitleFr` keeps the narrow word for the list that earns it
      and widens it to « Déjà passé » otherwise. A past match with no score says « rien saisi » where
      the score pill rendered nothing at all — the recap's own words, shared from
      `lib/calendar/labels.ts` (decision 088)
- [x] Availability stops borrowing the présences vocabulary. The pinned card counted « 1 absent »
      about a player who had tapped « pas dispo » on a session three days away, and the relance card
      was titled « Relancer les absents » above its own « 4 joueurs n'ont pas répondu ». Both
      sentences are `answersLineFr` / `reminderCardFr` in `lib/calendar/timeline.ts` now, where a test
      can read them (decision 090)

## M3 — Compositions
- [x] `positions` reference data + built-in 7-a-side formation templates (`db/reference.ts`)
- [x] Turf pitch component (light/dark, mobile + desktop) — `components/pitch/`
- [x] Drag-and-drop composition editor, swap on drop
- [x] Custom formation creation (dragging the slots)
- [x] Match sheet selection: titulaire / remplaçant / supporter
- [x] Planned compositions from minute X, with the deduced-changes diff
- [x] `lib/match/lineup.ts` + unit tests (including chained position changes)
- [x] « Et maintenant ? » at the bottom of the match sheet is derived, not written once. It said
      « Le groupe est fait : place les sept sur le terrain. » on an untouched sheet, on a match played
      a fortnight ago, and on a sheet with nine titulaires ticked. `sheetNextStepFr` returns the
      sentence and the call to action together, so the button can disappear when there is nowhere
      useful to go (decision 084)
- [x] The compositions screen stops offering to plan the 30ᵉ minute of a match played a fortnight ago.
      `saveLineup` and `deleteLineup` now refuse a finished match like `setMatchSquad` always has, the
      editor gained a sixth dead end, and the header, the notice and both empty states are derived from
      the match's status and entry mode (decision 085)
- [x] The composition editor deduces nothing while the pitch is unfinished. It opened on an empty one
      and reported seven departures under « Changements déduits »; `deduceChanges` now counts the slots
      nobody is standing in and the card says what is still missing (decision 086)

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
- [x] Game mode's list of who can come on is no longer headed « Remplaçants ». Before the kick-off it
      held the whole squad — three substitutes, seven titulaires, two players off the sheet and an
      injured supporter — and the heading claimed all thirteen were substitutes (decision 087)

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
- [x] …and the one figure the competition filter cannot reach says so on the row that prints it.
      Under « Coupe », Ali's card was five dashes and « PRÉSENCE 1/2 · 50 % » — a season figure beside
      five « rien dans cette sélection ». The hint now reads « séances pointées, toute la saison »
      whenever a filter is on, and the reason is one sentence shared with the présence card
      (decision 082)

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
- [x] …and the window says when it shuts: « À finir avant le coup d’envoi du match suivant, dimanche
      27 septembre à 10:30 ». `closesAtMs` had been computed since M6 and read by nobody, so three
      screens promised « tu verras les notes des autres quand tu auras fini » without mentioning that
      finishing has a closing time — and `progress.ts` makes missing it permanent (decision 079)
- [x] …and the recap's rating list calls the reader « toi » wherever he appears in it. He appears
      twice — as the author of the notes he gave and as the subject of his own row — and only the
      first had a rule, so his own row said « il s'est mis 8 » and « lui-même » three rows under
      « 8 Karim (toi) », and his comment was signed a third way again. `lib/rating/labels.ts`
      (decision 095)
- [x] …and the rating flow asks him for « ta » note on his own card. It asked for « Sa note pour ce
      match (la tienne) » — a parenthesis patching the pronoun instead of choosing it, under a card
      already badged « toi ». `ratingLegendFr`, decision 095 again
- [x] …and a player's average is explained with the matches that hold a note about **him**. The
      profile printed the reader's own season-wide count of unfinished matches — « Les notes de
      2 matchs sont exclus de cette moyenne » where one of the two held no note about that player at
      all, and under a « — » where nothing was excluded from anything (decision 093)

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
- [x] The sheet's empty states no longer describe a match nobody has entered. « Changements » said
      « les sept titulaires ont fini le match » over seven `— personne —` selects, and « Actions du
      match » wrote « 0-0 » with a hyphen under the derived « 0 – 0 ». Both now come from
      `lib/retro/labels.ts`, count what is filled in, and are tested (decision 083)
- [x] …and the compositions of a match typed up afterwards stop being credited to a confirmation
      nobody made. A retro saisie writes `LINEUP_APPLIED` on purpose, so `applied_event_id` is set on a
      match nobody watched; `appliedNoticeFr` and `lineupsFrozenFr` take `entry_mode` and say
      « enregistrée avec la saisie du match » where that is what happened (decision 089)

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
- [x] …and a test says so, which is the half decision 075 left open: `db/client.test.ts` imports the
      module with `DATABASE_URL` empty and asserts the first query still throws, and that `sql` stays
      both callable and indexable. The 868 tests that existed all ran with the variable set, so none
      of them could have caught it
- [x] Continuous delivery: the `migrate` job applies the committed SQL to Neon on pushes to `main`,
      after typecheck · lint · Vitest · the browser run, with its own no-cancel concurrency group
      (decision 078). Not in the Vercel build command and not ordered against Vercel's own build —
      the decision says why, and names the migration that would force a rethink
- [x] `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_USERNAME` and `TEST_DATABASE_URL` removed from the Vercel
      project, where the first attempt had left them. The first two are read only by `db/bootstrap.ts`
      and `db/seed.ts`, from a command line; the third by nothing in the repository
- [x] The whole stack runs in containers, as an option — `compose.yaml` brings up `postgres:17`
      (named volume, `pg_isready` healthcheck, the credentials `.env.example` and CI already use)
      and a multi-stage production image of the app, which waits for the database to be healthy and
      for the migrations to have applied. Development is still `npm run dev` against the Homebrew
      Postgres: decision 077 adds compose, it does not supersede 016. `output: "standalone"` is
      gated on `NEXT_OUTPUT_STANDALONE` so Vercel builds unchanged
- [x] The owner set the `DATABASE_URL` repository secret and turned Deployment Protection off, and
      the two unblocked everything that was waiting on them. `/connexion` answers `200` with the
      French login form instead of a `302` to `vercel.com/sso-api`, so the squad can reach the app
      with nothing but the link
- [x] …and the `migrate` job has now run for real, which it never had: on the push that merged #49 it
      applied the committed SQL to Neon in 41 seconds — `migrations applied`, exit 0 — after
      typecheck · lint · Vitest · the browser run. Every previous observation of it was a *skip* on a
      pull request, so the one branch that matters had been untested
- [x] Only `main` deploys. Vercel built every branch — nine preview deployments in twenty-three
      minutes of one session, each a running copy of the app pointed at the production Neon database,
      because `DATABASE_URL` is the same value for Preview and Production. `vercel.json` holds the one
      rule that stops it and nothing else (decision 080). The minimatch trap is written down: `*` does
      not cross a `/`, so a lone `*` would have matched `main` and missed every `feat/<slice>` branch
- [x] Versions are tagged. There were none — eight milestones and a live deployment with no way to name
      what was running except a commit hash. The version is `package.json`'s `version` field, and the
      `tag` job cuts `v<version>` on `main` after the tests *and* the migration pass, so a tag never
      names a version whose schema change failed (decision 081). Bumping is still a human judgement;
      remembering to tag is not
- [ ] `db:bootstrap` — the super admin. This is the last thing between a working deployment and a
      usable one: the schema is there and every screen is reachable, but there is no account to log in
      with, and an invite-only app cannot make one from the browser (decision 052). One command,
      `docs/DEPLOY.md` §3, from the Neon dashboard's pooled string. **Whether it has been run cannot
      be checked from a session**: the connection string is only in Vercel (sensitive, unreadable) and
      in a GitHub secret (write-only), so the answer is a login attempt in a browser
- [ ] Reset the super-admin password, which spent the first hour of the deployment sitting in the
      Vercel environment where `docs/DEPLOY.md` says it must never be. Free, if the account is created
      with a fresh password rather than the one that was in Vercel: the same `db:bootstrap` run does
      both, because it is idempotent and re-hashes the password every time
- [ ] Verify on a real iPhone and Android in daylight — `docs/DEPLOY.md` §6. No longer blocked by the
      login page; it now waits only on an account to log in with
- [ ] Give Preview its own Neon branch — **before** previews are ever turned back on, not now. Decision
      080 removed the hazard by removing the previews; this is the fix that would make them safe to
      have again, and the roadmap keeps it because « we turned it off » is not « we solved it »

## First run and static assets

Two defects found by running the app out of `compose.yaml` rather than by reading a screen — the
first one live in production too.

- [x] The PWA install prompt has an icon. `proxy.ts` was guarding `public/` — its exclusion list
      named six static files and not one of the three the manifest points at, so every icon request
      answered `307 /connexion` and the browser reported an invalid image, in production as much as
      locally. The exclusion is now the class of static paths rather than an enumeration, and
      `proxy.test.ts` reads `public/` at test time so a fourth file cannot break it silently
      (decision 091). The proxy's redirects had no test before this either
- [x] A local `docker compose up` can be logged into. It left a migrated schema with zero users and
      no way to find that out; `compose.yaml` now has a `seed` service in the `setup` profile
      (`npm run docker:seed`) for the demo season, and the header comment, the `bootstrap` comment
      and `docs/DEPLOY.md` state that `up` creates no account and that `admin`/`change-me` is a seed
      account `db:bootstrap` deliberately refuses. `db/seed.ts`'s `NODE_ENV=production` guard is
      untouched — the service runs from the `tools` image, which sets no `NODE_ENV`
