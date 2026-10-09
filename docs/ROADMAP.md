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
- [x] …and the shared error screen now offers the one recovery that works. It said « Réessayez ; si
      cela se reproduit, passez par un autre écran et revenez », which is two vouvoiements (decision
      074) and two inert instructions: `reset()` is `setState({ error: null })` and re-renders out of
      the same JavaScript bundle, and a client navigation keeps that bundle, so for a stale Server
      Action id after a deploy — 404, `UnrecognizedActionError`, the failure mode all 42
      `useActionState` call sites share — neither could ever recover. « Recharger la page » is the
      primary button now, offered for **every** error rather than only the one it was found on,
      because a reload is never wrong advice for « this screen could not display »; a skew-specific
      sentence may change the copy and never whether the button is there (decision 127). Five states
      walked at 390 × 844 in both themes, and the full Playwright suite run for it
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
      instead of the demo season (decision 044), plus CI — the job lives in
      `.github/workflows/checks.yml`, which `ci.yml` calls for every pull request and every push to
      `main` and `release.yml` calls again for a tag (decision 119)
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
- [x] A player can put a name on his shirt as well as a number — and the two answer to two different
      people. The flocage is his own (`profile:editShirtName`, self-scoped, like his preferred
      positions); the number stays the coach's, because a squad's numbers have to agree with each
      other and `updateMember` already refuses one already worn. `shirt_name`, 12 characters checked
      in the column, uppercased at display time and never stored uppercased, shown on the fiche and on
      the `/equipe` row a coach reads when he orders the shirts (decision 104)
- [x] **The positions editor no longer 500s, and the save is the player's alone.** Two defects under
      the owner's « saving my postes crashes »: nothing in any migration had ever inserted the eleven
      `positions` rows, so a migrated-never-bootstrapped database had the foreign key and none of its
      targets and every save raised `23503` — fixed by `db/migrations/0006_seed_positions.sql`,
      `ON CONFLICT DO NOTHING` so `seedReference()` keeps owning every later change — and the coach
      could edit a teammate's wishes at all, through `assertCanActFor`'s `member:update` fallback,
      which is now a bare `assertCan` on the self-only `profile:editPositions`. The read-only card
      says « Chaque joueur choisit ses postes lui-même. », a failed write says « Tes postes n'ont pas
      été enregistrés. Réessaie. » instead of throwing, and a `ForbiddenError` still reaches the
      error boundary on purpose
- [x] The picker offers the **seven positions the owner named** — `GB DG DD MC AG AT AD`: keeper,
      central defence left and right, the middle, the two wings, the striker. Three rules in two days:
      eight as the union of `1-3-2-1` and `1-2-3-1` (decision 130), six as the distinct codes of
      `1-3-2-1` alone (decision 141), and now **seven that are not derived from any formation at all**
      (decision 142) — `1-3-2-1` fields a `DC` and no winger, `1-2-1-3` fields the wingers and neither
      full-back. So the test no longer recomputes the set from `BUILTIN_FORMATIONS`; it types the seven
      out as the specification and keeps the one invariant that survives, *every wish is fielded by some
      built-in formation*. Two mismatches with the usual shape are deliberate and pinned by a test: a
      **wish is a preference, not a promise**, so `AG`/`AD` are wishable though `1-3-2-1` has no winger,
      and `DC` is not though it fields one. A chip row lets a player remove a stored
      `DC`/`MG`/`MD`/`MOC`, one way only, and `POSITION_CODES` stays at eleven: the composition editor
      is not narrowed
- [x] The flocage has **no character limit**. It was capped at 12 in three places — a constant, the
      Zod schema and the check constraint — and the owner removed the ceiling on 2026-10-06
      (`0008_true_johnny_storm.sql`). The constraint stays as a lower bound, `char_length >= 1`, which
      is the half that keeps « no flocage » a single value; the squad row already truncates with an
      ellipsis at 390 px, so a long one breaks no layout
- [x] `POSITION_BY_CODE` is `Partial<Record<…>>` rather than a cast, so an unknown code is
      `undefined` at the type level instead of a `TypeError` that could 500 four screens from one bad
      row; the honest type found 16 errors across 5 files, one of them in `db/reference.ts` itself
- [x] The field errors a positions form rejects are rendered. Zod reports the offending *element*, so
      `toFormState` keys it `secondary.1` while the form read `fieldErrors.secondary` and displayed
      nothing at all. `fieldErrorsUnder` in `lib/auth/validation.ts`, fixed in the consumer rather
      than in the `toFormState` every other form shares. Every message on that path is French now; one
      of the English Zod defaults had been leaking the internal position codes to the player
- [ ] **Nothing tests the positions editor — not one unit test, not one Playwright step.** No spec
      mentions `updatePlayerPositions`, `PositionsEditor`, `PositionPicker` or any string the card
      prints; `lib/player/positions.test.ts` covers the pure helpers and stops short of the action.
      That absence is why a 500 on the most ordinary save in the app reached the owner's phone, and
      the permission fix above is held up only by `can()`'s own assertions — which are narrower than
      they look: `lib/auth/can.test.ts:79` pins a *player* out of somebody else's positions and `:126`
      a *non-playing* coach out of his own, while the `playerCoach` fixture at `:27` — the actor the
      old fallback actually let through — is never once asked about a foreign `targetMemberId`
- [ ] The **second** field-error defect on the same form, which the first fix does not cover:
      `teamId` and `memberId` are rendered nowhere. `positions-editor.tsx:101` asks
      `fieldErrorsUnder` for `"primary", "secondary"` only, so a rejected identifier — « Ce formulaire
      est invalide, recharge la page. », which is what a stale or forged form produces — leaves the
      screen completely silent while « Modifications non enregistrées. » at `:113` still claims the
      work is pending. It looks exactly like a lost tap, which is the complaint the owner already has
      about this app, and the remedy the message names is one the player will never read

## M2 — Calendar
- [x] Matches CRUD (opponent, kick-off, home/away, venue, competition, periods)
- [x] The competitions a team plays in are the coach's list, edited on `/equipe`, not four enum values
      compiled into the app. Every existing team is backfilled with the four labels the enum printed,
      every match repointed at its own team's row before the column goes `NOT NULL`; `restrict` on the
      foreign key and archiving for the ones the team stops playing, and the stats filter keys on the
      id so a rename orphans nothing (decision 107)
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
- [x] The « Supprimer » cards say what they take with them, counted. Both are plain forms with no
      confirmation dialog — on purpose — which makes their description the confirmation step, and it
      named the cheapest thing the cascade destroys: « avec les disponibilités déclarées » over a
      match holding eleven answers, an eleven-row sheet and two compositions. The training twin never
      mentioned `training_attendance`, markable before the séance because `AttendanceList` is not
      gated on `over`. `lib/calendar/deletion.ts`, eleven tests (decision 098)
- [x] A présence cannot be recorded about an evening nobody has lived. `AttendanceList` rendered for
      a coach with no reference to `over`, so « Tout le monde est là » was one tap on a séance four
      days away — and `getAttendanceMarks` has no date filter, so `/stats` then read « 3 séances
      pointées » in a season of two, with Brice credited 1/3 where the truth is 0/2. `attendanceIsOpen`
      opens the pointage 30 minutes before kick-off and never closes it; both Server Actions refuse
      outside the window, and the card says what to use meanwhile (decision 099)
- [x] A match says where it is played, everywhere it is named. `matches.is_home` had existed since
      the first migration and the form had always asked for it, and two badges printed it — every
      other surface printed the bare opponent, so a season of calendar rows read identically, `/stats`
      hid the fact in a `title` attribute (nowhere, on a phone — decision 072), game mode's final
      whistle and the availability control said « contre » about matches played away, and the WhatsApp
      reminder never mentioned the ground at all. « contre X » at home, « à X » away, derived in
      `lib/calendar/labels.ts` (decision 103)

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
- [x] « Hors feuille » counts players. The match page and the compositions header both said « 3 hors
      feuille » on a thirteen-player squad with eleven on the sheet — fourteen in total, one tap from a
      sheet screen that said « 2 » — because they counted the non-playing coach `createTeam` inserts on
      every new team. `isSheetCandidate` is the filter that existed inline in one page, named, and
      `countSquadRoles` applies it to its own input (decision 096)
- [x] …and the « Composition » card on the match page calls the function decision 085 wrote, instead of
      keeping its own copy of the sentences. It printed « Place tes sept joueurs sur la pelouse : tu
      pourras ensuite planifier les changements » on a match played ten days earlier — the exact string
      a green test in `plan.test.ts` forbids — under a primary button to an editor that refuses a
      finished match. `lib/composition/copy.test.ts` now fails if any screen hard-codes one of the five
      status-dependent sentences again (decision 097)
- [x] The bench and the pitch fit on one phone screen. The pitch was `w-full` on a 1080:1580 ratio, so
      at 390 px it was 477 px of turf and the bench's wrapping rows began below the fold: a drag whose
      source and target cannot be on screen together is a broken feature, not a cramped layout. The
      turf is capped at 280 px wide (410 px tall — still wide enough that two 48 px discs cannot touch,
      which happens below 266 px), and the bench, the blocking errors and the confirm button are one
      sticky dock above the tab bar, where the save bar used to sit *under* it (decision 105)
- [x] …and a new composition opens with the team already on the pitch. Creating one « à partir de la
      10ᵉ minute » opened an empty pitch, so a coach who wanted one substitution placed seven players.
      The pre-fill is the composition **in force at that minute** — `planInForceBefore`, the same
      function that chooses what « Changements déduits » compares against, so the pitch and the card
      cannot disagree — and an inherited player who has left the sheet is not placed, his post stays
      open and the notice names him. Nothing is written until the coach submits, which the footer now
      says: « Rien n'est encore enregistré. » (decision 106)
- [x] The minute field can be emptied. It was the only controlled `type="number"` in the app whose state
      was a `number`, and `clampMinute` turned `""` into `NaN` into `0`, so the field snapped back to 0
      the instant it was empty and reaching 10 meant typing `010` and then deleting from the left. It
      holds the typed string now, like `MinuteInput` in `retro-form.tsx` has since M7: `""` is legal to
      be *in* and invalid to *submit*, and `parseMinute` returns `null` rather than 0, because
      `z.coerce.number("")` is 0 on the server and a silent 0 would overwrite the starting composition
- [x] Dragging a player onto the bench benches him, instead of putting him in a defender's slot. The
      bench was a drag *source* and never a target, and the only way off the pitch was a drop outside
      it — but the dock is `sticky z-20` over a `z-auto` pitch, so a finger on the bench is still inside
      the pitch's bounding box, `pointOf` returned a valid point and `nearestSlot` took over.
      `usePitchDrag` hands the raw **client** point to `onDrop` and `onMove` as well as the pitch point,
      and the editor tests the dock's rect *before* anything reads the pitch point: the dock is painted
      in front, so it wins on overlap, and the pitch's 12 px of forgiveness is deliberately not extended
      to it. The drop feedback is driven from the same containment test, so the ring and the drop cannot
      disagree
- [x] …and the e2e suite exercises a drag at all. It placed every player by **tapping** — the documented
      equivalent, and the path that works in a glove — so `usePitchDrag`'s whole pointer path had no
      browser-level coverage, which is why the defect above shipped. `e2e/happy-path.spec.ts` now has a
      test of its own that drags the attacker onto the bench, verified to fail against the unfixed code.
      It needs an assertion **between** the `pointermove` and the `pointerup`, because `end` closes over
      the `drag` state of the render its handler was attached to: released in the same task as the move
      it still sees `moved: false`, calls `onTap`, and the test passes for a reason that has nothing to
      do with dragging. **That closure has now produced a false negative twice in this repository**
- [ ] No other screen has a drag test. The gesture is one implementation — the React part in
      `components/pitch/usePitchDrag.ts` over the rules in `lib/pitch/drag.ts` — with three callers: the
      composition editor, which now has one, plus TERRAIN's `components/action-sheet/terrain-sheet.tsx`
      and `app/(app)/stats/equipe-type/_components/seven-pitch.tsx`. What a drop
      *means* is per screen on purpose (decisions 045 and 055), so a covered call site proves nothing
      about the other two: TERRAIN's drop off the turf is a no-op and the seven's disc opens a picker,
      and both screens have something painted in front of the pitch that the new client-point check
      would have to be right about

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
- [x] Game mode gets the whole phone (decision 112). The route moved to its own group,
      `app/(jeu)/match/[id]/jeu/`, which changes no URL and escapes `AppShell`: no team header, no tab
      bar, one back button. The scoreboard card, the back-link row and the pitch card's header became
      one 56 px `MatchBar` printing the time and the live score, so 325 px of chrome above the pitch
      became 64 and the pitch went from 481 px tall with 318 visible to 540 against 715 available. The
      bottom bar is one line — ACTION on half, « Pause » and the clock button on the other — and the
      16 px gap the owner reported is gone, because it was `bottom-[4.5rem]` (72) clearing a
      `min-h-14` (56) tab bar that no longer exists
- [x] A `COMMENT` action: a free-text note of up to 280 characters, optionally about a player, inert in
      the reducer and shown in the timeline and the recap. The ACTION menu is four tiles and an
      « Autre… »; « Faute » is no longer offered, though `FOUL` stays in the vocabulary because the log
      is append-only (decision 114)
- [x] A live match no longer offers its own summary. Both « Après le match » and the recap gate on
      `status === "finished"` rather than « has kicked off », and `resultLabel` stopped printing
      « Victoire » beside a 2–1 in the 20th minute (decision 113)
- [x] The clock no longer runs into the score, and the bar fits the phone it was measured on. The clock
      was the only child flex was allowed to squeeze — `min-w-0`, no `shrink-0`, beside a score and an
      action that were both `shrink-0` — so the row gave way at the one place it must not and « 45:00 »
      in 30 px digits spilled under the score. It is `shrink-0` now, and the **action** is the child that
      yields and clips its right edge. Measured against the compiled CSS inside the 369 px the row has at
      393: a typical row wanted 355 and wants 321. The word « Nous » was 34 px of that and is gone —
      with it, « 00:00 » and « 0 – 0 » beside « Composition » wanted 370 of 369 *before kickoff on a
      393 px phone*, so the bar overflowed in the state every match starts in. Which way round the score
      reads is now said by **underlining our own figure**: an underline and not a colour, because
      `--color-accent` on one of two numerals would read as a state and a score has no state
      (decision 117, restating 061, 064 and 112)
- [x] The clock button says « Début », and still answers to it. « Envoi » is a word a coach has to
      translate; the rename broke **WCAG 2.5.3 Label in Name**, because the button announces its label
      and « Début » is not a word of « Coup d'envoi », so voice control saying the visible word would
      have activated nothing. The final whistle's fix — change the *short* label, « Sifflet » rather than
      « Fin » — was unavailable here, since « Début » is the word that had to be visible. So the
      **accessible name** gave way: `clockActionFr` returns a third string, `name`, which is `label`
      everywhere except the two kick-off branches. `presenter.test.ts` walks every reachable phase of a
      1, 2 and 3-period match asserting the containment (decision 117)
- [x] A `REMARK` action behind « Remarque »: six one-tap judgements about one player, in the words the
      owner uses on the touchline — « Bon retour », « Bel effort », « Mauvaise passe », « Bon placement »,
      « Perte de balle », « Beau geste ». **One** enum value with the kind in the payload and not six
      types, so a seventh remark is a line in `REMARK_KINDS` rather than a migration (decision 122,
      `0005_goofy_sir_ram.sql`). `memberId` is required, unlike a `COMMENT`'s; the reducer computes
      nothing from it, asserted as whole-state equality against the same log without it; one formatter,
      `remarkDetailFr`, writes the line for game mode's timeline and for the recap; and a remark reaches
      the shared match summary, which the owner asked for, because `HIDDEN_EVENT_TYPES` hides only
      `PAUSE`, `RESUME` and `VOID` — pinned by a test, since that is a set three screens away
- [x] Every action tile is drawn as well as named, the ACTION menu and the six remarks alike:
      hand-rolled inline SVG on `components/theme/theme-toggle.tsx`'s pattern, `currentColor` so a
      tile's tone tints its drawing and both themes are free, `aria-hidden` so the accessible name
      stays the French label. No icon dependency, and there is not to be one. Rasterised at 16 px and
      four of them redrawn: a 24-unit grid stroked at 1.75 holds about four strokes before it turns to
      mud. `ACTION_ICONS` is keyed by tile; `REMARK_ICONS` is a total `Record<RemarkKind, ReactNode>`,
      so a seventh kind added without a drawing fails `tsc` instead of shipping a blank tile
- [ ] Two shapes of the match bar still do not fit at 393 px and cannot at any font metric: « 10 – 10 »
      with a stoppage span wants 370 of the 369 available, and a match long enough to print « 120:00 »
      wants 388. Today the action slot absorbs it by clipping — TERRAIN loses up to 19 px of its right
      edge, which is legible from context and is why that child was chosen to yield. What would actually
      fix it is a shorter action word or an icon with its name in the `aria-label`, and neither should be
      designed from the arithmetic alone: « TERRAIN » is the word the owner's team uses out loud, and an
      icon for « ajuster le terrain » is not obvious. At 375 px the typical row still has 30 px spare, so
      this is a tail case and not a phone size
- [ ] Ask the team whether anybody reads the underline. Decision 117 replaced the « Nous » caption with a
      mark on our own numeral, and the mark is **unlabelled**: the fact is in the `aria-label` and in
      decision 061's ours-first ordering, but nothing on screen says an underline means « nous ». The
      question is not answerable from a desk — one match watched over somebody's shoulder settles it. If it
      reads as decoration, the 34 px have to come from somewhere else, and the candidate is the item
      above: a shorter action word buys more than the caption cost
- [ ] `hasFinalWhistle(matchId)` — one existence query, the `hasMatchEvents` shape with
      `type = 'FINAL_WHISTLE'` and the same not-voided predicate — so the match page can self-heal a
      stale `matches.status` without paying `getLiveMatch`'s seven queries on every view (decision 113).
      Until it exists, a match whose log holds a final whistle but whose column still says `live`
      badges « En cours » on the calendar and hides « Voir le résumé » until somebody opens game mode
- [ ] `COMMENT` in the retro-entry screen. The owner asked for a comment *during* the match, so
      `RETRO_FACT_TYPES` was left alone; `retroFactNeedsMember` would need a third case — the note is
      required, the player is not
- [ ] Reading the comments attached to a player on that player's own page. The event carries
      `memberId`, so the data is there the day it is wanted
- [ ] A remark can only be tapped **live**. `RETRO_FACT_TYPES` in `lib/retro/log.ts` is untouched, so a
      match typed up afterwards carries none — the same gap as the `COMMENT` line above and for the
      same reason: the owner asked for a remark during the match. `retroFactNeedsMember` would need a
      case where the player is required and there is no free text, which is the easier half; what the
      retro form would have to grow is a kind picker, and whether a judgement made from memory a
      fortnight later is worth recording is a product question, not a missing branch
- [ ] **No per-remark statistics at all.** Nothing counts « mauvaise passe » per player, and nothing
      should until somebody decides what the count is *for*: these are the one thing in the log that is
      an opinion rather than an observation (decision 122), and a season table of them is a judgement
      about a teammate that the rest of the team can read. `match_player_stats` has no column for one,
      `lib/stats/aggregate.ts` ignores them, and the data is all in the log the day the product answer
      exists. A remark is readable today exactly where it was tapped: the timeline and the recap

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
- [x] …and a sort tab no longer throws the reader back to the title. Every control on `/stats` is a
      `<Link>` writing a search param, which is what makes the selection shareable and no-JS-proof —
      and the App Router scrolls to the top on every navigation, so sorting the player list from
      halfway down the page moved the one thing the reader was looking at. `scroll={false}` on both
      the chips and the tabs (decision 100)

- [x] One register in the French: the app tutoies everywhere. Eight strings vouvoied, including the
      banner a player reads in game mode, with the same coach addressed both ways on one screen
      (decision 074, and the rule is in `CLAUDE.md`)

- [x] One shape for a date, and it is the French one: `27/09/2026`, and a 24-hour clock. The
      invitation expiry built its own formatter with no `timeZone`, in a client component, so it
      rendered in UTC on the server and in the reader's zone after hydration — and named no year; the
      injury history spelled the month out where a record wants digits; the calendar row said
      « dim. 27 sept. » in a list that crosses 1 January. `formatDate` beside `formatTime` in
      `lib/calendar/time.ts` is now the only place that knows the shape (decision 101)
- [~] The app answers a thumb. The functions were deployed in `iad1` with the database in `eu-west-2`,
      so every render crossed the Atlantic once per query — `lhr1` now, decision 111. What is left is
      the half no region fixes: nothing on screen acknowledges a tap, and pages await their queries in
      sequence. Assigned to the other machine, brief at the top of `COORDINATION.md`
- [x] …and the sentences too: « dimanche 27/09/2026 à 10:30 », « dim. 27/09/2026 », « demain,
      28/09/2026 », « Blessé depuis le 13/09/2026 ». Decision 101 had kept the month as a word inside
      prose; the 390 px pass showed the prose date sitting three centimetres above the numeric one, so
      the reader was comparing two shapes of the same fact. The year is unconditional now — a season
      crosses 1 January — and `MONTHS_FR`, `formatDayMonthFr` and three format constants go with their
      last callers (decision 109)
- [x] …and the five native pickers, which 109 had written off as « not ours », now say underneath them
      what they hold: « 14/03/2026 », « 14/03/2026 à 20:05 ». `<input type="date">` and
      `<input type="datetime-local">` render in the *browser's* locale, so on a phone set to English the
      owner was picking a kick-off in `MM/DD/YYYY` off an AM/PM clock inside an app that writes
      `27/09/2026` everywhere else. 109 offered him a control of our own and he declined; the answer he
      came back with keeps the native control — still the best thing under a thumb — and echoes its value
      in the app's shape. `components/ui/date-input.tsx` wraps all five, `formatInputValueFr` reads the
      parts of the `YYYY-MM-DD` string and never builds a `Date` (UTC midnight west of Greenwich is the
      day before, and an off-by-one echo is worse than no echo), an empty or unreadable value renders no
      element rather than « --/--/---- », and the line is `aria-hidden` because the defect is what the eye
      sees. `lib/player/injury.ts` delegates to the same digits so the app still has one definition of
      `DD/MM/YYYY` (decision NNN, which supersedes 109's carve-out — the number is assigned on merge)
- [x] **« L'équipe type » — a pitch that names the best (or worst) seven for one chosen criterion**, at
      `/stats/equipe-type`. Buts, passes, notes and invincibilité, all as rates, each figure shrunk
      toward the squad by a **measured** amount rather than gated behind a minimum number of matches —
      so a one-rating 9,0 ranks below a twelve-rating 7,4, a player with no data lands exactly on the
      squad mean and heads neither ranking, and nobody appears or vanishes at a threshold. Positions
      are an exact assignment, not a greedy pass, and the objective is stated on screen. Tapping a disc
      swaps a player and the heading stops claiming to be the best seven (decision 115)
- [x] …and its four filters sit **under** the seven, as labelled native selects. They shipped as four
      rows of `min-h-11` chips in the page header — 216 px of ways to ask the question above the first
      answer, with the pitch below the fold on a 393 px phone. Two rows of selects in a grid instead:
      160 px, and a 48 px tap target where a chip was 44. The type size is untouched, because
      `components/ui/input.tsx` sets `text-base` deliberately — under 16 px iOS Safari zooms the page
      when a picker opens. The filter is still a view of the URL and still works with JavaScript off:
      `onChange` pushes `equipeTypeHref(...)`, and the surrounding `<form method="get">` submits the same
      four parameters without it. That second path sends `?critere=` for anything left at its default,
      which `equipeTypeHref` never writes, so all four parsers now have a test for an empty value and two
      of them moved out of `page.tsx` into `best-seven-copy.ts` to be testable at all. `NO_FORMATION_FR`
      lost « ou choisis une forme toi-même **ci-dessus** », which the move turned from misplaced into
      false (decision 116)
- [ ] `sevenQuestionKey` carries the question and not the data. If the server ever recomputes a different
      optimum for the same competition · criterion · direction · formation — a `revalidate`, a
      `router.refresh()`, a rating or a final whistle landing while the page is open — the pitch would keep
      the old seven while the list and the notes below it update: decision 116's defect in the one input the
      key omits. Nothing on this route calls `refresh()` today, so it is latent rather than live; the cheap
      belt is to fold a signature of the computed optimum, or `stats.matchesConsidered`, into the key
- [ ] A desktop keyboard stepping through one of those selects navigates on **every arrow key**. A closed
      native `<select>` fires `change` per keypress in most desktop browsers, so « Buts » → « Sans
      encaisser » costs two server renders and two history entries where the chips it replaced cost one.
      iOS — the target — commits once when the picker closes, which is why this is a follow-up and not a
      fix. The shape of one is to commit on `blur` or `Enter` for keyboard interaction without breaking the
      pointer path that already works
- [ ] The four-up grid at `sm` has never been seen with four selects in it: the demo team has one played
      formation, so the formation select is absent and the row is three. `grid-cols-2 sm:grid-cols-4` is
      asserted in the class list and nowhere in a browser. A fixture with two played shapes would settle it
- [x] *(Done in S12, decision 160: `match_player_positions`, written at the freeze, backfilled by
      `db:refreeze`. Kept below as it was written.)* **Minutes by position, so « meilleur milieu droit »
      becomes a measurement.** There is exactly
      one positional figure anywhere in the database — `match_player_stats.gkMinutes` — and the
      reducer's `positionSpells` are in-memory match state that the freeze path never writes down. So
      every screen that talks about a post can only mean what a player has *declared* in
      `player_positions`, and « l'équipe type » says so out loud rather than implying a measurement
      that does not exist (decision 115). What would change that: a `minutes_by_position` table
      written at the final whistle from `positionSpells`, plus a backfill by replaying the log. A
      migration, a change to the freeze path and a backfill — worth doing, not worth smuggling into
      the screen that revealed it
- [ ] **Save an « équipe type » as a real composition.** The obvious next ask after the pitch exists,
      and a genuinely different feature: it writes `compositions` rows, so it has to respect invariant
      3 — a composition is never applied automatically, the coach confirms it
- [x] The pre-fill notice names its source without stuttering: « Équipe reprise de la composition de
      départ », not « de la composition « composition de départ » ». `planSourcePhraseFr`, and the
      test asserts the whole line (decision 106)

## M6 — Ratings & recap

> **Decision 137 rebuilt this milestone, and the `[x]` boxes above the rebuild record September, not
> today.** A note is now the mean of what the others gave you, and the individual notes are the coach's
> alone. The four lines that follow this note — the card-at-a-time flow, the reciprocity gate, the optional
> comment, the two-tap pad of decision 102 — all describe something that has been deleted. They are kept
> because a reader of `git log` will meet them, and the block at the end of this section is what is true.
>
> **Then decision 139 replaced the rules around it, a day later.** *Every member* rates, supporter and
> non-playing coach included; a mean is visible when **the coach says so, per match**, and hidden again
> when he says so; **nothing ever closes**. So the items below that talk about a rating window, about
> means coming out « quand tout le monde aura noté », or about a publish button that is a deadline, are
> history too — including the decision-138 block, which 139 supersedes entirely. The last block of this
> section is the current rule.

- [x] Rating flow: one teammate per card, 0–10, optional comment
- [x] Results hidden until you have submitted your own
- [x] Window closes at the next kick-off — **deleted by decision 138**, see the block at the end of this
      section: the window now closes when the means come out, and not on a date
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
      finishing has a closing time — and `progress.ts` makes missing it permanent (decision 079). **That
      sentence no longer exists**: decision 138 removed the date it named, and 139 removed the deadline
      itself. What is printed now is who decides — `ratingInvitationFr`
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
- [x] …and noting is two taps: choose, then « Suivant ». Tapping a score advanced the card in the
      same handler, so the number the reader had just chosen was replaced by the next teammate before
      it could look chosen — a pad with a correct selected state that was never once on screen. The
      selection is now a fill, a ring, a bolder digit and « Note choisie : 8 / 10 » in an
      `aria-live` region; the forward button says « Passer sans noter » on a card with no score, and
      the last card has none at all (decision 102)

**The rebuild — decision 137, `feat/ratings-rebuild`.** Everything below this line is the milestone as
it stands.

- [x] **A note is the mean of what the others gave you.** One screen, every teammate who played listed
      once, a native `<input type="range">` each at `min=0 max=10 step=0.5`, one submit — all the notes
      or none, which is what the old flow could not do per card. `components/ui/slider.tsx` keeps the
      browser's own appearance and sets exactly one property (`accent-color`, as `accent-accent`): the
      Tailwind recipe of `appearance-none` plus two vendor pseudo-elements takes the theme colour with
      it and leaves a grey rail in dark mode. Keeping the native thumb is also what gives the arrow keys
      a half-point step for free, which the happy path asserts. `app/(app)/match/[id]/notation/
      _components/rating-sheet.tsx` replaces `rating-flow.tsx`, and `lib/rating/flow.ts` is deleted:
      there is no forward button left for it to label
- [x] **The screen says what a slider costs, because a range has no unset state.** Every curseur starts
      at 5,0 and every curseur is submitted, so an untouched one records 5,0 as an opinion rather than a
      silence. `RATING_SLIDERS_START_AT_FR` says so above the list — « Tous les curseurs partent de 5,0.
      Si tu n'y touches pas, c'est la note que tu donnes. » — and there is deliberately no « passer sans
      noter », which would claim to do something the control cannot do
- [x] **Nobody rates himself, and nobody rates a man who did not play.** `minutes > 0` in the log, not a
      role on the sheet: `ratings_no_self` is the half of the rule the table can see, and the minutes
      half lives in `lib/rating/validation.ts` and in `submitRatings`, which is where a crafted form post
      is caught rather than at the screen. The `comment` column and its `Textarea` are gone
- [x] **Published, or « en attente » — one question with no viewer in it.** `lib/rating/published.ts`:
      the means are out when every expected rater has submitted, **or** the coach has published. (It
      shipped with a third clause — the window closing at the next kick-off — which decision 138 deleted
      a day later, for the very hole the next sentence already names.) `matches.ratings_published_at` is
      the coach's escape
      hatch (`publishRatings`, `rating:publish`, idempotent), and it exists because the automatic
      backstop has a hole the size of a season's last match — no next kick-off, so the team that most
      wants its notes would be the team whose notes wait for ever. The coach reads who is missing before
      he is offered the button — « 4 joueurs sur 8 n'ont pas fini », naming them
      (`ratings-panel.tsx`, `publish-ratings-form.tsx`). **Decision 139 superseded all of this**: there is
      no derived clause left, the button is the only door, the file is now
      `ratings-visibility-form.tsx`, and the fraction counts members
- [x] **`MIN_NOTES_FOR_MEAN = 3`**: a match published with one note is not a verdict, so below three
      notes a player has no mean. Decision 025's two, raised
- [x] **The raw notes are the coach's, enforced by not selecting them.** `getRatingResults` returns
      `published: false` *above* the select that would fetch any score, and a non-coach receives
      `count: null` and `received: []` for every player — so an unpublished match's figures never leave
      Postgres, and the `canSeeNotes` branches in `ratings-panel.tsx` are about layout, not about
      secrecy. Two new coach-only `can()` actions carry it: `rating:readNotes` and `rating:publish`
- [x] **The count is the coach's too.** On a player's own row a count is an invitation to work out who
      did not rate him, and in a squad of a dozen that arithmetic is easy and poisonous. So the
      man-of-the-match card reads « 9,0 de moyenne » and no longer « sur 7 notes », even for the coach,
      because that card is read by everybody
- [x] **Every reader now sees the same season.** `ratingVisibility`, `visibleMatchIds`,
      `hiddenMatchIds`, `hiddenRatedCounts`, `getVisibleRatingScores`'s second round trip and the
      « d'après les matchs que tu as notés » on three screens are deleted; `/stats`, a player's profile
      and « l'équipe type » print one set of numbers. The largest simplification in the repository since
      the stats cache, and bought by a product decision rather than by a refactor (decision 021 goes
      entirely)
- [x] **`PlayerRating.count` counts matches, not notes.** `MIN_RATINGS` is now `MIN_RATED_MATCHES` and
      the screens say « sur 6 matchs notés ». Same number, two denominators, neither constant importing
      the other. PR #105's shrinkage is better on this unit: the within-player variance is now
      match-to-match variation rather than rater-to-rater disagreement
- [x] **The migration is `0007_chubby_silver_samurai.sql`, and three of its statements are
      irreversible** on purpose: `score` → `numeric(3,1)` with `ratings_score_half_step`, `comment`
      dropped, every self-rating deleted (`ratings_no_self` cannot be added over the rows decision 007
      required). Production holds no ratings at all; a local or preview database loses the seed's
      fixtures, and `db/seed.ts` stopped writing both in the same commit
- [x] **The browser suite was rewritten, not repaired** — every rating selector it used addressed
      something that no longer exists. It now walks all three states in one pass: four of the eight men
      who played rate (the smallest number that leaves every rater exactly on the floor), the means stay
      in while four still owe, the coach is shown their four names and publishes without them, and the
      published screen is then read by the coach and by a player — « 28 notes sur 8 joueurs à noter »
      and the author chips for him, « 9,0 » and nothing else for the player. Half of that assertion is
      an absence, which is the only shape in which a leak of the kind 021 allowed can fail a test
- [x] **Walked by hand**, on a reset database, at 390 px, both themes, coach and player side by side in
      one pass: the J3 recap (means out), the J5 recap (published, one note each, no mean), the J7 recap
      (« en attente » plus the coach's publish button) and the J7 notation screen as a player who had not
      rated. The player's rows carry a mean and nothing else; the coach's carry the count and the author
      chips, and the difference between the two screens is exactly those two things. It found the three
      defects below, all three fixed in the same walk
- [x] **The deadline sentence still threatened a punishment the app had stopped carrying out.**
      `ratingDeadlineFr` ended « après, tu ne peux plus noter et **tu ne verras pas celles de l'équipe** » —
      decision 024's second edge, which 137 reversed in the same breath as it wrote « the window closing
      publishes the means ». Found by reading `audit/light-joueur-notation.png`, not by a test: three unit
      assertions pinned the whole sentence and all three passed, because they had been updated to match
      the code rather than the decision. Now « les moyennes sortent sans tes notes », and the third test
      asserts the old clause is *absent*
- [x] **The seed asserted a fixture it no longer held.** `db/seed.ts` printed « notes : J7 complètes
      (HDM Julien 9,0) » and its docblocks described decision 021's gate in three places, while the data
      said something else entirely: J7 has four raters of nine and an open window, so nothing is out at
      all. Worse, **no match showed a published mean for anybody** — the J3 round had three raters, and a
      rater is rated by the *other* raters only, so each of the three sat at two notes, below
      `MIN_NOTES_FOR_MEAN`. A fourth full rater fixes it: the raters land on 3 and everybody else on 4,
      J3 now publishes nine real means (Léo and Julien share at 7,0), and the three states each have
      exactly one match — J3 out, J5 published but too thin, J7 awaited
- [x] **The coach lost notes that existed, on a published match with no mean.** `ratings-panel.tsx`
      returned « pas encore assez de notes » whenever every mean was below the floor, for both readers —
      so on J5, where eight notes are in the table, the one person entitled to read them saw nothing. The
      floor is about the figure, not about the notes: the coach now reads his rows with « — » where the
      mean is withheld, and the card says « Aucune moyenne n'est sortie » beside the count. The player's
      screen is unchanged, because for him there genuinely is nothing
- [x] **A played match stays rateable until its means come out, however old it is** (decision 138, the
      owner's request: « when we are on a match that has already been played, we must have the
      possibility to fill up the notes if we have not yet done it »). `ratingWindow` takes `finished` and
      `published` and no clock; the next-kick-off deadline is gone, with `ratingDeadlineFr`, `closesAtMs`,
      `nextKickoffAtMs`, `getNextKickoffAfter`, `getLatestStartedKickoffMs` and `getSeasonStats`'s
      `nowMs`. **Whether a season's means are out is now a question about rows only** — two fewer round
      trips, and one fewer answer that moves between two renders of the same page
- [x] **The circle was broken by a deletion, not by a condition.** `ratingsPublication` used to take the
      window state and the new rule needs the window to take publication, so publication's third clause
      went — it was the unreliable one, which the docblock had already said never fires for a season's
      last match. The dependency runs one way now, publication → window, and `publicationOf` in
      `lib/rating/queries.ts` is the single place that answers « are the means out? », so the recap and
      the notation screen cannot disagree about it
- [x] **One unconditional sentence replaces the date.** `ratingUrgencyFr`: « Tu peux encore noter : les
      moyennes ne sont pas sorties. Elles sortiront dès que tout le monde aura noté, ou quand le coach
      décidera de les sortir — et tes notes ne compteront plus. » True for every played match, so the
      three screens print it unconditionally; the old one named the next kick-off and, for a season's last
      match, printed nothing at all
- [x] **The seed carries the case it could not before.** `RatingsFixture` gained `publishedAt`, set after
      the notes so a row is never published over notes that failed the half-point check. J3 and J5 are
      published and closed; **J2, J6 and J7 are rateable whatever their age**, and J2 — five weeks old —
      is the match to open `/notation` on to see this working. Verified by SQL against a reset database
      rather than by rereading the prose: J3 published/34 notes, J5 published/8, J7 unpublished/32
- [x] **The coach is told that his tap is now the deadline.** Found by the 390 px pass and by nothing
      else: the publish form said « elles ne bougeront plus » and stopped, which was the whole consequence
      when the calendar would have closed the window anyway and is half of it now. It reads « …et plus
      personne ne pourra noter ce match », in both the singular and the plural branch
- [x] **The coach decides when a match's means are out, and he can take them back** (decision 139, the
      owner's correction of 137 and 138: « everyone can note, even the supporters; the notes are available
      only when the coach says so, per match; if he does not say so, no one can see no notes »).
      `matches.ratings_published_at` is the whole rule — null hidden, timestamp visible, nothing derives
      it — and `rating:publish` writes it both ways (`publishRatings` / `hideRatings`, one permission, one
      shared helper, so a coach who may show can always undo it). No migration: the column was already a
      nullable `timestamptz`
- [x] **Any member rates; only those who played are rated.** `rating:submit` is the one self-scoped action
      in `can()` that does not require `isPlayer`, because a non-playing coach is a member with the best
      view of the hour — and because the coach's own tally counts active members, so a denominator the
      permission refuses would be a figure that lies. The `minutes > 0` rule for who may be *rated* is
      decision 137's and survives untouched
- [x] **The rating window stops existing as a concept.** `lib/rating/window.ts` and its tests deleted,
      with `ratingWindow`, `getRatingWindow`, `publicationOf`, `ratingsPublication`, `owingRaterIds`,
      `NotationBlockedReason` and `ratingUrgencyFr`. `lib/rating/published.ts` is one predicate over one
      column, `meansAreVisible`. Publication had a derived clause under 137 — « every expected set is in » —
      and deleting it takes the rater→rated graph out of the publication question: `lib/stats/queries.ts`
      drops `getRatingAuthors`, `lib/stats/ratings.ts` drops its nested maps, `getNotationView` loses a
      round trip, and the season's score query starts before the logs are replayed
- [x] **The anti-anchoring guarantee is gone, deliberately.** Decisions 021, 137 and 138 all existed for
      « nobody writes his notes after reading the team's ». A player can now read a published mean and
      then rate the man it belongs to, a mean the squad has read can vanish, and no mean is ever final.
      The owner was told all three in those words and chose the switch anyway — he wants the figures under
      his own hand, per match, more than he wants anchoring-proof arithmetic among twelve people who see
      each other every Sunday
- [x] **« silent » replaces « owing », over the members rather than the players.** `RaterTally` is
      « 4 membres sur 9 » with the coach counted, because the form posts a whole set at once and « has not
      finished » collapses to « has sent nothing ». Members who have left are on neither side of the
      fraction
- [x] **Six sentences the screens had to stop saying**, every one true last week: « seuls les joueurs qui
      ont joué donnent des notes », « La notation est fermée », « les moyennes sortiront quand tout le
      monde aura noté » (three places), « elles ne bougeront plus, et plus personne ne pourra noter ce
      match », « ceux qui étaient sur le terrain avec toi ». `ratingInvitationFr(meansVisible)` replaces
      the deadline with who decides, and says out loud that a late note moves a figure the squad has read.
      A reader who did not play is told **why he is asked anyway** in his own case — supporter,
      named-but-never-on, not-on-the-sheet, three sentences, because the three EmptyStates this replaces
      told them apart
- [x] **One guard that looks cosmetic and is not.** The match page's rating card dropped `notation.played`
      and gained `progress.requiredCount > 0`: an empty set is *vacuously* complete, so without it a match
      nobody played would congratulate every reader on having noted everybody
- [ ] **The crafted form post is still not tried by hand.** `lib/rating/validation.ts` and
      `submitRatings` refuse a note on yourself and a note on a 0-minute substitute, and unit tests cover
      both, but nobody has posted the form fields directly to prove the server and not the screen is what
      refuses. That is the half no screenshot can demonstrate
- [ ] **Whether 5,0 as a default produces a squad of average players** is a question for the owner after
      a real Sunday, and not one a session can answer. If it does, the answer is not a « passer sans
      noter » button — it is a different control

## M7 — Retro-entry & amendments
- [x] "Saisie rétroactive" screen synthesising a full event log from a filled-in sheet
      (`lib/retro/log.ts`, `app/(app)/match/[id]/saisie/`) — minutes are optional and stamped,
      see decision 048
- [x] …and reachable without running game mode for a match already over. That screen shipped behind a
      deadlock nobody had walked into until the owner tried to backfill a season: its card is gated on
      `status === "finished"`, the only writer of that column refused without a `FINAL_WHISTLE`, and
      the only thing that appends one is game mode. « Terminer le match » on the match page now writes
      the column and appends nothing, « Rouvrir le match » undoes it, and both refuse once there is a
      déroulé (decision 121)
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

## M8 — Rework from the cahier des charges (2026-10-09)

The owner's review after two real matches, `cahier-des-charges.md`. Plan: the top section of
`docs/PLAN.md`. Tracked on the GitHub Project « Football-manager », one issue per slice. **No production
tag during this rework** (decision 146): every item below reaches the preview only.

- [x] **The board** — the 158 merged pull requests added to the Project as *Done*; one issue per slice
      below, labelled `cahier-des-charges` (#160–#172)
- [x] **S1** · #160 · voiding the starting composition makes the pitch disappear (« appliquer la
      compo → l’annuler → le terrain a disparu »), decision **150**. The `LINEUP_APPLIED` that filled an empty pitch
      (`TimelineEntry.startingLineup`) has no « Annuler » in game mode, and `appendMatchEvents` /
      `amendMatchEvents` refuse a crafted `VOID` of it with a 409 the outbox shows. A later
      composition keeps « Annuler ». The reducer decides « applied » from the log alone, so a plan
      whose application was voided is proposed again; `lineups.applied_event_id` is kept for the
      composition screen and the formation stats
- [x] **S2** · #161 · remove trainings (tables dropped)
      - [x] **S2 `feat/remove-trainings` — trainings are gone, tables and all** (decision 155, owner decision
            Q5). `/entrainements` and everything under it, `lib/training/`, the « Entraînements » button and
            every training branch of the calendar (`CalendarTraining`, the training window, the pointage
            window, the attendance line on a row, the « Match » / « Entraînement » kind badge on the pinned
            card), the four `training:*` permissions, the attendance rate on `/stats` and on a player's
            profile (the « Présence » sort tab, the « Présence aux entraînements » card, the séance notes), the
            demo season's four sessions and `e2e/attendance.spec.ts`. Migration `0011_calm_giant_girl.sql`
            drops `training_attendance`, `training_availability` and `trainings`; `availability_status` stays
            for `match_availability` until S3. Match availability is untouched
- [x] **S3** · #162 · remove match availability and the reminder message (table and enum dropped),
      decision **156**. `setMatchAvailability` and its schemas, `getMatchAnswers` /
      `getTeamMatchAnswers`, the answers count in the deletion warning, `availability:declare`; the
      « Ta réponse » card, the availability grid and the « relancer » card on `/match/[id]`; the
      Dispo / Pas dispo / Peut-être control, the « 1 dispo · 16 sans réponse » line and the answer
      badge on the calendar (the pinned card now ends on « Voir le match »); the answer badge on the
      match sheet; the tallies, the relance message and their labels in `lib/calendar/`; the demo
      season's answers; « disponibilités » in the app description and the « Retirer de l’effectif »
      card. The happy path's availability step became « a player opens the match and is asked
      nothing ». Migration `0013_known_apocalypse.sql` drops `match_availability` and
      `availability_status`
- [x] **S4** · #163 · one formation, `1-2-3-1`, positions GB / DC / MC / AIL / AT
      - [x] **S4 `feat/single-formation` — one formation, five positions** (decisions **157**, **158**). The
            `1-2-3-1` is the only formation: GB, DC × 2, AIL × 2 either side of MC, AT. New position `AIL`
            « Ailier » replaces `MG`/`MD`; the vocabulary is exactly GB, DC, MC, AIL, AT. Migration
            `0012_single_formation.sql` inserts `AIL`, rewrites the built-in's two side slots in place, and maps
            `player_positions` (DG/DD → DC, AG/AD/MG/MD → AIL, MOC → MC). The formation select and the
            « Postes » mode are gone from the composition editor, the formation select from the game-mode
            composer, and the « Forme de jeu » select and `?formation=` from the équipe type. The wish picker
            offers the five codes; its retired-wish chips are gone. The radarlocal importer resolves the two
            wingers by `x` (160 / 840), dry run verified
- [x] **S5** · #164 · preferred positions set by coaches only, gone from `/moi` (decisions **163**,
      **164**). `profile:editPositions` is a coach action: a coach edits any player's card on
      `/joueur/[id]`, everybody else — the player himself included — reads it, under « Ce sont les coachs
      qui indiquent les postes. ». `/moi` no longer prints them. Compositions and game mode no longer read
      them: no position code on the bench discs, no `primaryPositionCode` / `positionCodes` in
      `getCompositionMembers`, `LivePlayer` or the retro roster, nothing on the match sheet. Kept: the
      équipe type (`best-seven-input.ts`) and the squad list on `/equipe`, as information. The picker's
      « non souhaité » became « pas son poste »
- [x] **S6** · #165 · the composition page replaces the match sheet, decisions **165** and **166**.
      `/match/[id]/feuille`, `squad-sheet.tsx`, `setMatchSquad` and its schema, `sheetNextStepFr` and
      the « Feuille de match vide » gates are gone. The **composition de départ** is the selection:
      its bench is every player, whoever is placed is titulaire, and a list under the pitch marks
      everybody else Remplaçant / Supporter / — (a coach who does not play: Supporter / — only).
      `saveLineup` writes `match_squad` from it in the same transaction (`squadFromComposition`, pure,
      `lib/composition/squad.ts`), drops the newly unselected and the supporters from the other planned
      compositions, and refuses a plan at minute 0 or a starting composition without its list. A
      planned change still draws on the starters and substitutes only. Wording: « non sélectionné »
      for « hors feuille »; the compositions list names the supporters under the starting seven
- [x] **S7** · #166 · game mode: But, But encaissé, Changement, Autre; « Sifflet » replaces « Fin »,
      decision **151**. « Autre action » holds CSC, the two penalties, Blessure, Remarque and
      Commentaire; « Changement de poste » left the menu (its flow, `SlotPicker` and its icon are
      deleted; old `POSITION_CHANGE`s still reduce and render). In the last period the clock button
      is « Sifflet » straight away, and its confirmation writes `PERIOD_END` + `FINAL_WHISTLE` in one
      outbox batch (`enqueueAll`, `finalWhistleEvents`) — checked in the database: same stamp,
      consecutive `seq`, match finished, stats frozen. « Changement » itself is unchanged until S8
- [x] **S8** · #167 · unpaired group changes, goal-before-change ordering, tap a player to act,
      decisions **147** and **152**. « Changement » asks who goes out and who comes in (any number,
      zero included), then opens the pitch pre-arranged by `changeArrangement`; « Valider » writes one
      `LINEUP_APPLIED` stamped at the ACTION tap. The paired `sub-out` / `sub-in` flow is gone, and so
      is the TERRAIN button (a 0 / 0 « Changement » is the same pitch). `orderMatchEvents` puts facts
      before pitch events at an identical reading, segment by segment between clock events, except in
      the segment that first fills the pitch. `pitchEventFr` names a `LINEUP_APPLIED` for game mode
      and the recap alike (« Composition de départ » / « Changement » / « Changement de poste »). A
      disc on the pitch opens ACTION about that player. Production check of decision 147: the query
      returned no row on the local restore; the run against production is the orchestrator's
- [x] **S9** · #168 · the starting composition applied when game mode opens, decision **153**
      (supersedes invariant 3 for the starting composition, and decision 006 for it). Pure
      `autoLineupToApply` decides; game mode writes one `LINEUP_APPLIED { auto: true }` at 0′ with a
      `client_event_id` derived from the match, the plan and its seven (`lib/match/ids.ts`), so two
      phones write one row. Before the kick-off the composition stays editable and an edited version
      is re-applied; the kick-off freezes it (`autoLineupToLock`). A coach's own arrangement stops it
      for good. The reducer drops zero-length spells and posts (no phantom starter), and a finished
      match proposes no plan any more
- [ ] **S10** · #169 · add changes after the match, realistically
- [x] **S11** · #170 · only starters, substitutes and supporters may rate
      - [x] **Only the match sheet rates** — starters, substitutes and supporters of that match, plus anybody
            the log has playing; an unselected member is refused (decision **159**, superseding rule 1 of 139).
            `mayRateMatch` in `lib/rating/progress.ts` is the pure predicate; `submitRatings` refuses with a
            French sentence, the notation screen explains instead of offering the form, the match page's duty
            card is not shown, and the coach's tally counts eligible raters only (« 10 sur 12 de la feuille de
            match »). A match with no sheet has no raters. Who is **rated** is unchanged (`minutes > 0`)
      - [x] Tests: the predicate and the tally in `progress.test.ts`, the refusal in `actions.test.ts` (I/O
            mocked), the coach on no sheet in the happy path
- [x] **S12** · #171 · stats data: goals for while on, minutes per position, rates, impact per position
      - [x] Reducer: `goalsForWhileOn` and per-position minutes / goals for / goals against per player,
            kept to the goal and concede bookkeeping and `accrue`; minutes apportioned so they add up,
            `GB` pinned to `gkMinutes` (decision **160**)
      - [x] `match_player_stats.goals_for_while_on` and the new `match_player_positions`, written by the
            one writer in one transaction; migration `0014_ambiguous_vindicator.sql`
      - [x] `npm run db:refreeze` (`scripts/refreeze-stats.mts`), idempotent, refuses a remote URL without
            `--allow-remote`; run by `ci.yml` `migrate-preview` and `release.yml` `migrate-production`
            right after `db:migrate` (decision **161**). Run on `football_wd`: 2 matches, 24 + 39 rows,
            every invariant checked by SQL
      - [x] `/stats` in five sections — Attaque · Défense · Gardiens · Temps de jeu · Impact par poste —
            then Notes and the squad list; « 1 but encaissé toutes les X min » outfield and in goal,
            shrunk with the existing Gamma–Poisson fit, raw record beside it, « aucun but encaissé »
            instead of ∞; impact per position as two shrunk Poisson rates (decision **162**)
      - [x] Profile card: conceded outfield and its rate, keeper figures, minutes by position
- [x] **S13** · #172 · équipe type: offensive, défensive, 7 de légende, notes
      - [x] `?critere=` names one of four sevens; old and empty values fall back to `offensive`; `sens`
            (« la pire ») removed (decision **171**)
      - [x] Per-slot figures and lexicographic keys in `solveAssignment` (`SquadCell.keys` / `allowed`),
            built by `lib/stats/sevens.ts` on S12's smoothed rates; goals then assists at the printed
            tenth; outfield before the goal
      - [x] Légende: impact per post, AT → AIL → MC → DC → GB as a key order; keeper among those who
            played in goal, refused below the keepers' average (Q8, decision **172**)
      - [x] Each disc prints the ranked figure and its raw record; the seven's rule under the title

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
      `tag` job cut `v<version>` on `main` after the tests *and* the migration passed, so a tag never
      named a version whose schema change failed (decision 081). Bumping is still a human judgement —
      and **so is tagging, since decision 119**: the generator became a gate, and the item below is where
      that flow is written down
- [x] Shipping and merging are two acts. A push to `main` now runs the checks, migrates the **preview**
      database (`PREVIEW_DATABASE_URL`) and then deploys the preview with the Vercel CLI, and cuts **no**
      tag; a tag `v*` pushed **by hand** is what gates, re-tests, migrates production and deploys it with
      the CLI before publishing the release (decision 119, superseding 081, 078's rejection of a
      repository `VERCEL_TOKEN`, and 080's reliance on Vercel's Git integration). The checks live once, in
      `.github/workflows/checks.yml`, called by both `ci.yml` and `release.yml`. What this buys that the
      old flow could not: each migration provably precedes the code that needs it, on the preview as much
      as on production, and there is a running copy of the app to look at before anything ships
- [x] Both deployments are issued by CI, and Vercel's Git integration issues none. `vercel.json` sets
      `git.deploymentEnabled` to `false` for every pattern including `main`. This item exists because the
      first draft of 119 said the integration was producing a Preview from `main`, and the Vercel API said
      otherwise: the last three integration deployments were `main` merges with `target=production`, and
      the merge after the owner parked the production branch produced no deployment at all. « Only `main`
      and a tag deploy » is now true by construction rather than by dashboard state
- [ ] **Watch the first push to `main` after this merges and confirm `https://dev.7orteils.bgonzva.fr`
      serves the new commit.** This is the one thing in the new design that is expected rather than
      observed. That domain is pinned to the git branch `main`, and a git-pinned domain cannot be
      re-pointed with `vercel alias set`, so `deploy-preview` sets `VERCEL_GIT_COMMIT_REF: main` to make
      the CLI's deployment claim the branch. If `dev.` does not move: the owner removes the `main` pin from
      the domain in the Vercel dashboard, after which CI can alias it explicitly — `docs/DEPLOY.md` §4
- [ ] **A question only the owner can answer: does the `PREVIEW_DATABASE_URL` secret hold the Neon
      *preview* branch's connection string, or production's?** That the secret **exists** is verified
      through the GitHub API, along with `DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
      `VERCEL_PROJECT_ID`; what is *inside* it cannot be read from any session, because the API returns a
      secret's name and never its value and the Vercel copy is sensitive on purpose. If it holds the
      production string — pasted before the preview branch existed, or copied from the wrong tab — then
      every merge to `main` migrates production, silently and green, which is exactly what decision 119 was
      written to stop. One look at the secret settles it; `docs/DEPLOY.md` §2 says what to compare
- [ ] Related and equally unverified: **does the Neon `preview` branch exist at all?** Nothing in the
      repository names it and no session can resolve a connection string it cannot read. If it does not
      exist, the item above answers itself the wrong way
- [ ] `db:bootstrap` — the super admin. This is the last thing between a working deployment and a
      usable one: the schema is there and every screen is reachable, but there is no account to log in
      with, and an invite-only app cannot make one from the browser (decision 052). One command,
      `docs/DEPLOY.md` §3, from the Neon dashboard's pooled string. **Whether it has been run cannot
      be checked from a session**: the connection string is only in Vercel (sensitive, unreadable) and
      in a GitHub secret (write-only), so the answer is a login attempt in a browser
- [x] ~~Reset the super-admin password, which spent the first hour of the deployment sitting in the
      Vercel environment where `docs/DEPLOY.md` says it must never be.~~ **Closed without being done, by
      the owner (decision 132).** It would have been free — `db:bootstrap` is idempotent and re-hashes on
      every run — and the password's hour in Vercel is a real fact, not a doubt. The decision is the
      owner's and the item is not waiting on anything; do not re-propose it. The same entry closes the
      database wipe and the Neon `neondb_owner` rotation
- [ ] Verify on a real iPhone and Android in daylight — `docs/DEPLOY.md` §6. No longer blocked by the
      login page; it now waits only on an account to log in with
- [ ] Preview has its own Neon branch. Decision 080 removed the hazard by removing the previews and this
      item kept the real fix on the list, because « we turned it off » is not « we solved it ». Decision
      119 is *designed* to pay it — one preview deployment with its own connection string in Vercel's
      Preview scope and in the `PREVIEW_DATABASE_URL` secret — but it stays unticked, because the two
      questions above are exactly the question of whether it was paid, and neither can be answered from a
      session. It was ticked once on the strength of the intent; that is the same mistake as the premise
      119 had to correct
- [x] The Vercel project's production branch points away from `main` — it is parked on
      `vercel-production-placeholder`, set by the owner and read back from the Vercel API. This was an
      outstanding owner action across three sessions' notes and is **done**. Note it is no longer
      load-bearing: with the Git integration off for every branch, it is a second thing that would have to
      be wrong before a push could reach production, not the thing that keeps `main` off production
- [x] **`formations` and `formation_slots` are seeded by a migration too — the owner decided, after
      hitting it on production.** `db/migrations/0009_seed_formations.sql` inserts the seven
      `BUILTIN_FORMATIONS` with `team_id is null` and their 49 slots, idempotently and insert-only,
      guarded on `label` among the rows with no team — the same key `seedReference()` uses, so the two
      writers agree and neither duplicates the other's rows. Proven from empty, not assumed: a scratch
      database given `npm run db:migrate` and nothing else ends with **11 positions, 7 built-in
      formations and 49 slots**, and re-running the file twice more inserts nothing. Decision NNN,
      which generalises 0006 and supersedes the paragraph below. The reasons the item below gave for
      leaving it out all survive and none of them were a reason to ship an unusable screen: a team
      still forks a template into its own `formations` row (decision 005), and `seedReference()` still
      owns every later change to a label or a coordinate, because the migration never updates
- [x] ~~**Decide whether `formations` and `formation_slots` get seeded by a migration too — the owner's
      call, deliberately not taken.**~~ **Taken — see the item above.** The eleven `positions` now are, because
      `player_positions.position_code` and `formation_slots.position_code` both reference
      `positions.code` (`db/migrations/0000_wealthy_radioactive_man.sql:264` and `:239`) and no
      migration had ever inserted a single row. **Measured on a fresh database after `db:migrate`
      alone: `positions` was 0 before migration 0006, and `formations` / `formation_slots` are 0
      either way** — both are written only by the same hand-run `seedReference()`, so a migrated but
      never bootstrapped database can **plan no composition at all**, with an empty Formation select
      and nothing to drag onto the turf. That half was kept out on purpose: the seven templates are
      editable content, a team may fork them into its own `formations` rows (decision 005), and a
      migration inserting them would quietly decide what the shapes are and what becomes of a team
      that has already edited one. Either seed them, or make `db:bootstrap` a required step that
      something checks — but it should be a decision rather than a side effect

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

## The production audit at iPhone 16 conditions

The owner asked for the live app at `7orteils.bgonzva.fr` to be looked at « everywhere », under iPhone
16 conditions. It was: `npm run audit:screens` against production (100 screens, both themes, coach and
player) plus two throwaway probes at the phone's real geometry — 393 × 852 CSS px, `deviceScaleFactor`
3, touch, iOS user agent — in `scripts/probe-iphone16.mjs` and `scripts/probe-composition.mjs`.

**The mechanical checks were all clean**: no console output anywhere, no sideways scroll at 393 px,
no English framework string, no screen reachable by the wrong person, no page without an `h1`, and
nothing permanently hidden under the tab bar at maximum scroll. Everything below needed eyes, or a
viewport shaped like a hand. Not one of these defects fails a test, which is the same sentence the
definition of done in `CLAUDE.md` already carries about waves 3 and 4.

**The pass was then repeated on WebKit 26.6**, Safari's own engine, because `dvh`,
`env(safe-area-inset-*)` and sticky positioning are emulated by Chromium rather than reproduced, and
the composition-editor findings below rest entirely on those three. It changed nothing. Every
geometry figure came back identical to within one pixel of scroll rounding — the pitch at 508–918,
the dock at 588–780, the tab bar at 795–852, `innerHeight` 852, the same 80 px of reachable turf —
and the finding counts were equal to the unit: 27 tap targets, 153 tiny texts, 38 under-bar overlaps,
and the same HTTP 500 below. So the defects are the app's, not one engine's reading of it.

Two things the repeat did *not* establish, recorded so they are not mistaken for conclusions.
WebKit's timings were three to ten times Chromium's (3670 ms to log in against 379 ms, 495–1061 ms
per tab against 283–339 ms), which is the headless Linux WebKit build and not an iPhone's Safari:
nothing about it predicts what the owner's phone does, and it is not evidence of a performance
defect. And headless WebKit has no browser chrome, so `innerHeight` is the full 852 px in both
engines. A real iPhone spends 50–90 px of that on the URL bar until the page is scrolled, which makes
the reachable-turf finding below an **under**-statement on device rather than an artefact.

### The screens that state something untrue

- [ ] A match still being played is announced as a win. The pinned calendar card is chipped « En
      cours » and prints « 1 – 0 » beside a solid green **V**, and its screen-reader text reads
      « Victoire, 1 – 0 » — a result declared for a match nobody has finished.
      `app/(app)/calendrier/_components/next-event-card.tsx:92` renders `ScorePill` for any match with
      a derived score; the `live` flag computed at `:41` only picks the border colour. The same class
      of defect as « 0 – 0 » for an unrecorded match, and the fix belongs next to it in
      `event-parts.tsx:86`: a live score is a running score, never a verdict
- [x] The recap contradicts itself about who came on. In « Les notes », Yanis and Fabien carried « entré
      en jeu »; in « Temps de jeu » a few hundred pixels below, the same two men were « non entré ·
      0 min ». The badge still reads `squadRole === "substitute"`, and it is now true: decision 137 put
      only the men with `minutes > 0` in that list, so a named substitute who stayed on the bench is not
      in it to be mis-described. Fixed by the list's membership rule rather than by the line this item
      pointed at — worth saying, because the line is still there and still reads the sheet
- [ ] « Ce match a été saisi après coup, sans composition : les temps de jeu viennent de la saisie »
      is shown for a match nothing has been entered for — the same screen still offers « Saisir le
      match », which only renders when `score === null`. `lib/composition/plan.ts:437` branches on
      `match.entryMode === "retro"` alone and never on whether a log exists, so it describes a record
      the app does not hold. `app/(app)/match/[id]/saisie/page.tsx:76-81` refuses to make that claim;
      this sentence should be held to the same standard
- [x] `/stats` shows two members of one team two different « Meilleures notes » podiums under
      identical copy — coach: Julien 9,0 · Ali 8,0 · Hugo 8,0; Ali: Karim 7,0 · Samir 7,0 · Hugo 6,0,
      and the counts diverge too (Nico « 6,0 sur 4 notes » against « 5,5 sur 2 notes »). Decision 007's
      reciprocity gating was *why*, and the fix this item prescribed — label the card « d'après les
      matchs que tu as notés » — was overtaken: decision 137 deleted the gate, so the podium is the
      same for every reader and needs no viewer-relative label. The card now reads « Moyenne reçue, à
      partir de 3 matchs notés », which is an absolute leaderboard and is now true
- [ ] The rank column invents an order among ties: #2 Ali 8,0, #3 Hugo 8,0, #4 Karim 8,0, and #4
      Rayan 1 but above #5 Ali 1 but. `app/(app)/stats/_components/leaderboard.tsx:50` prints
      `{index + 1}`; a competition rank repeats on equal values
- [x] A rating for a man who never came on: Fabien read MATCHS 0 · MINUTES 0′ · NOTE 5,0 « sur 4
      notes » on the coach's `/stats` (« 3 fois remplaçant »). This item offered two fixes and decision
      137 took the first: the notation screen does not offer a 0-minute substitute, and the Server Action
      refuses one even if the form is crafted. A man with no minutes now has no note to average
- [x] *(Moot since decision 155: trainings were removed on 2026-10-09.)* « Présence aux entraînements » has no minimum denominator, so Rayan — who has left the club —
      tops it at 1/1 · 100 %, above ten players on 1/2. `app/(app)/stats/_components/attendance.tsx:31`
      sorts on the rate and uses `marked` only as a tie-break, while « Meilleures notes » enforces
      `MIN_RATED_MATCHES = 3` for precisely this reason (`MIN_RATINGS` when this was written; renamed by
      decision 137, which changed its denominator from notes to matches and not its argument)
- [ ] Three already-archived competitions are advised to « Archive-la plutôt », beside a control that
      only offers « Réactiver ». `lib/competition/labels.ts:56-72` never receives
      `competition.archived`, so the advice clause is unconditional
      (`app/(app)/equipe/competition-manager.tsx:151`)

### The French

- [x] Two shipped vouvoiements, which decision 074 forbids without exception.
      `lib/match/presenter.ts:868` « Renseign**ez**-la avant le coup d'envoi », now « Renseigne-la » —
      the line was `:787` when this was written and the comments added since moved it, so `:868` is the
      fixed sentence and the quoted one is what used to be there — and on the player's
      game-mode screen that sentence orders him to fill in a composition the banner above it says only
      the operator may touch, so the copy is the coach's, served to everyone.
      `components/action-sheet/terrain-sheet.tsx:206` « Appu**yez** sur un poste pour le placer » is a
      live-region announcement, which is why no screenshot caught it — and `CLAUDE.md` quotes
      « Appuie sur un poste » as the correct form. A `grep` for the `-ez` imperative belongs in the
      review checklist: « vous » and « votre » were already clean, and these two hid behind that.
      **A third was found after this item was written, and all three are fixed now.** « Réessay**ez** ; si
      cela se reproduit, pass**ez** par un autre écran » on the shared error screen was two vouvoiements in
      one sentence, on the one screen a user only ever reads when something has already gone wrong
      (decision 127). Three for three behind the `-ez` imperative rather than behind « vous » is the
      argument for the grep, not a coincidence — and the grep this item asked for is a **test** now, not a
      line in a review checklist: see the two items at the end of this section
- [ ] « À **Les** grosses courges », on every away fixture whose opponent's name opens with an
      article. `lib/calendar/labels.ts:111` is `` `${isHome ? "contre" : "à"} ${opponentName}` `` with
      no elision, so « à » never contracts to « aux » or « au », and « à FC des Deux-Ponts » claims to
      name a ground while « contre » names a club. It is the row's own heading — the one line that
      does not truncate — so it is the most visible text in the calendar
- [ ] « 0 joueur**s** avec des minutes », and « 1 joueurs » for the same reason: the plural is
      hard-coded at `app/(app)/match/[id]/saisie/_components/retro-form.tsx:455` while its own
      siblings two lines below guard it. French takes the singular after zéro and after un
- [ ] « clean sheet » and « Clean sheets » in English, next to « sans encaisser » — the French for it
      — elsewhere on the same screens. Worse, the team card's « Clean sheets 1 » and the keepers'
      « Hugo 2 · Mehdi 0 » are different quantities (decision 018) under one label, so `/stats`
      appears to say 1 = 2 + 0. `recap/_components/scoreboard.tsx:79`, `team-summary.tsx:70`,
      `keepers.tsx:39`, `joueur/_components/stats-card.tsx:97`
- [ ] A colon opens a line: « poste secondaire ⏎ : Milieu offensif central » on `/moi`. A plain space
      before the colon is breakable; French typography needs a narrow no-break space
      (`lib/player/positions.ts:133`, `:136`, `:139`). The same wrap splits a count from its label in
      the availability line — « 4 ⏎ sans réponse » — at `lib/calendar/timeline.ts:316`
- [ ] « Déplacer le poste de attaquant » in an accessible name:
      `components/composition/composition-editor.tsx:960` interpolates the position bare, when
      `atPositionFr` in `db/reference` exists for this and is used forty lines earlier
- [ ] « 1 csc » is the one abbreviation on a screen that spells everything else out in a sentence
- [x] **Decision 074 is a test now, not a convention** — `tutoiement.test.ts` at the repository root
      walks `app/`, `components/`, `lib/` and `db/` as text with `node:fs` and fails on « vous »,
      « votre », « vos » and a curated list of `vous` imperatives in any line that is not a comment. It
      is at the root because that is where `vitest.config.ts` collects it from, while what it *reads* is
      four directories Vitest collects nothing out of — `include` governs collection, never what a test
      may open. **Eight live breaches fixed in the same change**: `terrain-sheet.tsx:176`, `:206`,
      `:301`; `lineup-composer.tsx:102`; `presenter.ts:569`, `:570`, `:868`, `:882`. Two more, in
      `components/errors/error-screen.tsx:50`–`:51`, were baselined by their text until #118 merged —
      #118 went first (decision 127), so the two entries were deleted and the baseline's length cap
      lowered to **zero** in this branch, which the staleness test would have forced anyway by going red
      and naming them. The uncomfortable half is in the decision
      entry: `lib/match/presenter.test.ts:428` was asserting « Touchez un joueur pour le faire entrer. »
      verbatim, so a test was holding one of the eight in place
- [ ] **16 unit-test assertions are incidental verbatim tripwires on French copy.** Each pins a whole
      French user-facing string with `toBe`, so any future copy fix — a tutoiement fix included — breaks
      a test that was never about copy. That is not hypothetical: it is exactly how
      `lib/match/presenter.test.ts:428` came to be pinning « Touchez un joueur pour le faire entrer. »
      All sixteen were checked against the source and all sixteen still point at such an assertion;
      **three of the paths first written down were wrong and are corrected here**.
      `lib/match/presenter.test.ts:428`, `:439` (« En dehors du terrain »), `:446` (« Tous les joueurs
      sont sur le terrain. »), `:756` (« Personne n'est encore sur le terrain. »);
      **`lib/calendar/timeline.test.ts`** (not `lib/match/`) `:463` (« Relancer ceux qui n'ont pas
      répondu »), `:465`; **`lib/composition/plan.test.ts`** (there is no `lib/match/plan.test.ts`)
      `:328` (« Il reste 3 postes à pourvoir. »), `:543`, `:601`, `:603`; **`lib/match/terrain.test.ts`**
      (not `lib/composition/`) `:364` (« 8 joueurs placés : il n'en faut que 7. ») and `:388`, which is a
      `toEqual` on a two-element array of whole sentences; `lib/retro/validation.test.ts:328`,
      `lib/rating/flow.test.ts:51`, `lib/player/validation.test.ts:102`, `lib/team/labels.test.ts:9`.
      Beside them, `e2e/` names French copy literally in **171 argument positions** — 66 worded strings
      passed to `getByText` / `getByLabel` / `hasText` and 105 `{ name: … }` role options, counted as
      occurrences rather than lines — of which only **13** are assertion-shaped. That last figure is the
      one that matters and it is small: `toHaveText` / `toContainText` occur 67 times, but 54 of those
      assert a clock or a score (« 00:00 », « 0 – 3 », « 26’ »), not a sentence. An earlier draft of this
      item said « roughly 160 … about 54 »; both numbers were wrong and the first was a `getByRole`
      count, which really is 160 and is a count of **selectors**, not of copy. Those sites stay, per the
      argument in
      `tutoiement.test.ts` for leaving `e2e/` out of the scan. The mitigation is mechanical: downgrade
      the 16 from `toBe` to `toContain` on the one fragment that discriminates the case. Not done in the
      pull request that added the guard, because it is a separate concern — the guard is about copy the
      app ships, this is about how the suite is written — and sixteen files of churn would have buried a
      change whose point is one new test file and eight corrected sentences

### The phone

- [ ] **The composition editor has no tappable post when it opens** — the worst of everything found.
      At 393 × 852 and `scrollY = 0`: the pitch box sits at 508–918 while the sticky dock occupies
      588–780 and the tab bar 795–852, so **80 of 410 px** of turf is in the clear band. On the create
      route it is **zero of 410**: the dock's top edge bisects the « Terrain » card heading and slices
      the Joueurs/Postes control in half, and the only pitch visible is a 15 px green sliver showing
      the tops of two discs. `elementFromPoint` at each of the seven post centres returns a tab-bar
      link, a bench disc, or nothing — the keeper is 65 px below the fold. The screen whose entire
      purpose is « Appuie sur un joueur puis sur un poste » says exactly that while offering nothing to
      press, until the coach scrolls 567 px (664 on create). The header comment at
      `composition-editor.tsx:36-50` budgets `740 − 56 − 72 − 196 = 416 px` for a 410 px pitch "with no
      scrolling"; the real chrome above the turf is 508 px, because that arithmetic counts the app
      header and not the page header, the formation card, or the pre-fill notice
      (`app/(app)/match/[id]/composition/_components/editor-screen.tsx:212-229`). The cap is not the
      problem and shrinking the pitch is not the fix
- [x] The dock floats 15 px too high, leaving a window onto the scrolling turf between it and the tab
      bar. `composition-editor.tsx:224` pins it at `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`
      = 72 px, and the tab bar is 57 px plus its own `safe-pb`; the gap survives any inset. It reads as
      a rendering glitch — and `app/globals.css`'s `tabbar-pb` was a **third** number for the same bar
      (4 rem), which is why fixing the identical subtraction in game mode (decision 112) did not fix
      it here: that route has no tab bar, so the number was made irrelevant rather than corrected.
      `--tabbar-h` is the one source now and all three read it; measured at 390 px in both themes, dock
      bottom 788 against tab bar top 787, the 1 px being the bar's own border (decision 118)
- [x] « Tout le monde est là » on `/entrainements`, at 08:00, for a séance at 19:00 — and the tap wrote
      nothing. Decision 099 guarded both Server Actions on `attendanceIsOpen` and left the third place
      that decides whether the list is offered at all, the inline card on `/entrainements`, asking
      `daysFromNow(…) === 0`. Between #88 and now the page rendered the button and the thirteen rows,
      and every one of them returned early in silence: 099 replaced an untruth with a refusal, this
      call site turned the refusal into a dead button. One predicate, three callers, no fourth allowed
      — and the first browser check of it was void while reporting the expected result, because a
      three-migration-stale local database made the page throw and « ×0 » agreed for the wrong reason
      (decision 120)
- [x] Nothing in the app acknowledged a tap, so every wait looked like a tap that missed. Zero
      `loading.tsx` files, no `useLinkStatus`, no `<Suspense>`, no `useTransition`; the tab bar at
      `components/nav/bottom-nav.tsx:32` was a bare `<Link>` with a colour for the tab you are on and
      no pressed state. Measured: 342–367 ms per tab tap on an emulated 4G phone, 844 ms for `/stats`,
      and **1.54 s for a cold function start** — which is what the owner feels, because a coach opens
      this app once a week and pays that on the first tap every time. The fix makes nothing faster and
      is the difference between « c'est lent » and « ça n'a pas marché ». Numbers in
      `docs/SESSIONS.md`. The tab bar now acknowledges a tap twice, and the split is which of the two
      can run before hydration — `active:bg-surface-2` is plain CSS and paints in the window where a
      tap becomes a native document navigation instead of a routed one (5 of 5 samples on Calendrier
      under CPU ×4), and `useLinkStatus` adds a wordless 2 px hairline after hydration, held invisible
      for 180 ms so it never fires on the 126–217 ms navigations the pressed state already answered.
      Two acknowledgements and no third: a `<Suspense>` boundary was built for `/stats` and thrown
      away, because the shell commits before the 180 ms and the hairline then never paints at all —
      0 hairlines at 100 ms on `/stats` against 1 at 300 ms on `/calendrier` (decision 123)
- [ ] `/stats` costs 844 ms of the 844 ms it takes to appear on an emulated 4G phone — 2.4× its
      neighbours, and 314 ms against 109 ms as a local load. Its own aggregation, not the shared auth
      prefix. **And not a `<Suspense>` boundary**, which earlier notes in this file and in
      `docs/SESSIONS.md` called the one screen where one would pay for itself: it was written, measured
      and removed. Streaming SSR puts the *fallback* in the HTML and swaps the content in with an
      inline script, so with JavaScript off the reader sits on the skeleton for good while the figures
      sit finished and hidden in the same document — and decisions 100 and 116 made these chips
      `<Link>`s precisely so this screen reads and filters with no JavaScript. It also only engages
      when the query outruns the shell flush, so the fast case keeps the no-JS path and the slow case,
      which is the phone case, loses it. The fix here is the aggregation, not a shape to look at while
      it runs (decision 123)
- [ ] **Two things about the tab bar that only the owner's phone can answer**, both written as checks
      to run rather than as defects. First, whether iOS Safari's own bottom toolbar is consuming the
      first tap: the viewport is `viewportFit: "cover"` at `app/layout.tsx:27`, so the bar sits in the
      region Safari's chrome occupies and then collapses out of, and « sometimes nothing happens »
      would be explained entirely by a tap landing on Safari rather than on the app. Instrument it the
      way the composition-editor probe did — `document.elementFromPoint` at each of the four tab
      centres, before and after a scroll that collapses the toolbar, recording what it actually
      returns. Second, whether `html { overflow-x: hidden }` at `app/globals.css:185` interacts badly
      with a `fixed` bar: on iOS that combination has historically shifted or detached fixed children,
      and nothing on Linux reproduces it. Neither check needs a code change to perform, and neither
      should be written up as fixed until it has been seen on the device
- [ ] The `/stats` filter and sort chips have `hover:` and `transition-colors` and **no** `active:`
      either — `app/(app)/stats/_components/filters.tsx:70` and `:152` — so on a phone, where
      `hover:` never fires (decision 072), a chip tap has no pressed state at all. Found while giving
      the tab bar one and deliberately left alone: it is the same defect on a different surface, and
      it belongs to a pass over every tappable chip row rather than to the tab-bar slice
- [ ] The auth prefix is four *dependent* database round trips before any page's own first query:
      `readSession` → `users` → `teamMembers` → `teams`, in `lib/auth/dal.ts`. Two of the four collapse
      into joins. In-region that is single-digit milliseconds, so this is a tidiness item and must not
      be described as a latency fix — measured, the server contributes 31–35 ms to a whole screen
- [ ] Tap targets below Apple's 44 × 44 pt floor, in the places most used with a thumb: the player
      names in every availability list are links as small as **16 × 32** (« Ali », « Léo » 24 × 32) —
      thirteen of them per screen; the `/stats` filter and sort chips are 36 px tall; « Détails » on
      the calendar is 45 × 20; « Rejoindre une équipe » on the login screen is 141 × **19**; the header
      avatar is 40 × 44. A 24 px target is not a defect in a screenshot and is a defect in a hand
- [ ] The relance textarea slices its last line through the middle of the glyphs. `rows={4}` is fixed
      at `app/(app)/calendrier/_components/reminder-card.tsx:51` while the message grows with the
      squad, and thirteen names need five lines at 393 px. Half a line of text reads as a broken
      render, not as an invitation to scroll — and this card exists to be read and copied
- [ ] *(« Présence » is no longer a sort tab since decision 155.)* The `/stats` competition filter is hard-clipped at the viewport edge with no affordance:
      « Amical (arch… » is sliced mid-word and a fifth chip (« Tournoi ») is entirely invisible. The
      comment at `app/(app)/stats/_components/filters.tsx:83` knows the row "scrolls sideways rather
      than wrapping" and ships no fade, no partial chip, no hint — so a coach cannot discover that
      filtering by Tournoi is possible. `SortTabs` at `:137` only just fits and will clip « Présence »
      on a 360 px phone
- [ ] The Formation select truncates its own value mid-number — « Classique 1-3- » for « Classique
      1-3-2-1 » — in a 158 px grid column (`composition-editor.tsx:573`). A control showing half of
      something that looks like a score looks broken
- [ ] Opponent names truncate to unidentifiable stubs in six of ten calendar rows: « À FC des
      Deux-P… », « À Stade de la C… », « Contre US des … ». The title is `block truncate` between a
      fixed date column and a shrink-0 score, leaving roughly 135 px
      (`app/(app)/calendrier/_components/event-row.tsx:66`). Two away trips to different clubs render
      identically
- [ ] « aujourd'hui » twice, 20 px apart, on the pinned card: the chip row says « Match · En cours ·
      aujourd'hui » and the line under it « Aujourd'hui, 24/09/2026 à 17:41 ». `formatRelativeDays`
      and `formatWhen` both emit the relative word, and only for today and tomorrow — which is exactly
      when the card is looked at
- [ ] The goalkeeper's name chip overlaps the drawn goal: 1 px of clearance against the pitch box's
      bottom edge, because `PITCH_MARGIN` is ~10 px at this size and the disc's hanging chip is 16 px.
      No other post has it
- [ ] The white « Couleur secondaire » swatch is invisible in the light theme only — white fill and a
      light-grey border on a white card reads as an unset box, where dark mode shows an unmistakable
      white block (`app/(app)/equipe/team-settings.tsx:115`). A white change strip is the common case
      for an amateur side, and no hex text sits beside the swatch to fall back on
- [ ] « Archiver » / « Réactiver » have no button chrome: `variant="ghost"` is fill-less and
      border-less at rest, and `hover:` never fires on a phone (decision 072), so the only control for
      the archive decision is indistinguishable from the grey prose either side of it, while
      « Renommer » right above is a bordered secondary button. It also omits `pending`, alone among the
      card's four controls (`app/(app)/equipe/competition-manager.tsx:158`)
- [ ] A match whose kick-off is behind us but which nobody has declared over still asks the question
      that closed: « Ta réponse » on the match page says « Tu peux changer d'avis jusqu'au coup
      d'envoi » under a kick-off three weeks old, and the coach is still offered a « relancer » message
      for the players who never answered. Both gate on `status === "scheduled"`, which was a fair proxy
      for « still to come » until decision 121 made *finished* something the coach declares rather than
      something the clock produces — so the untruth is older than that change and merely easier to
      reach now. Whether a player may still answer after the kick-off is the owner's call, which is why
      this is a line here and not a patch
- [ ] The « Forme récente » score strip runs together — « 2 – 0 3 – 2 2 – 2 1 – 3 2 – 1 » at 10 px
      mono, where the gap between two matches is no wider than the gap inside one score
      (`team-summary.tsx:141`). The same 10 px floor shows up across `/moi`'s stat captions; 11 px for
      a tab-bar label is iOS convention and is not the complaint
- [ ] *(The séance half is moot since decision 155.)* Two copy asymmetries between the roles, both showing someone a remedy they cannot apply: the
      player is told « Une saisie rétroactive les ferait apparaître » (`team-summary.tsx:93`), and only
      the player — not the coach who can act — is told that an unmarked séance counts in no attendance
      rate (`lib/calendar/labels.ts:237` against `attendance-list.tsx:91`). Also `/feuille`'s
      « Enregistrer la feuille » is the one non-full-width primary submit in the app, left ragged after
      2 000 px of scrolling, and a player is offered « Ouvrir le mode match » for a screen that then
      tells him he may only watch
- [x] *(Moot since decision 155: trainings were removed on 2026-10-09.)* A player's page for a past session is 450 px of blank that never answers his own question: it
      says « 11 présents sur 14 pointés » and never « Tu étais là »
      (`app/(app)/entrainements/[id]/page.tsx:163`), because the availability grid is empty on an old
      séance. Whether that is a defect or a choice is the owner's call, but the emptiness is not
- [x] *(Moot since decision 155: trainings were removed on 2026-10-09.)* The « pas encore pointé » state is the loudest thing on the coach's screen in light mode
      (thirteen filled dark-slate pills) and the quietest in dark, for a state that means *nothing
      decided yet*. `attendance-list.tsx:53` paints it `peer-checked:bg-ink-muted`, where
      `components/ui/segmented-control.tsx` documents a `neutral` tone built for this exact case
- [x] **The same shorthand-versus-longhand cascade bug decision 124 fixed was live in game mode too**, and
      was the only other instance: the sticky ActionBar carried `safe-pb py-2`, and `.safe-pb` is emitted
      after `.py-2`, so the 8 px under the two buttons the coach taps most resolved to the bare inset —
      measured `pb 0px` at 390 px. `.pb-2` is emitted before `.safe-pb` as well, so the obvious repair
      would not have worked either; a sum is not expressible as two utilities here. One functional
      `safe-pb-*` utility, used as `safe-pb-2`, measured `pb 8px` after — named rather than an inline
      bracketed value because an arbitrary `pb-*` is emitted before `.safe-pb` and would silently lose
      the sum to a stray, while the named one is emitted after it. The other four `safe-*` users were
      swept and are clean: each is a lone longhand with no shorthand on the same property (decision 126)
- [ ] `isUuid()` (`lib/player/validation.ts:23-25`) tests the lax regex at `:17`, while the actions
      validate the same ids with `z.uuid()`, which in Zod 4 enforces the RFC variant nibble — so a page
      can load for an id the action then silently rejects. Latent only: every real row is a
      `gen_random_uuid()` v4, which is exactly what hides it
- [x] **`safe-px` cancelled every `px-N` it was paired with. The count was made and it is five `safe-*`
      users, two defects — both now fixed.** `safe-px` sets the *longhands* `padding-left` /
      `padding-right` (`app/globals.css:158-161`) while `px-N` compiles to the `padding-inline`
      shorthand, and a longhand after a shorthand wins unconditionally — not a specificity coin-flip.
      **Reordering the block cannot help**, and the reason is not the one first written here: Tailwind v4
      sorts `@layer utilities` **by property** and interleaves custom `@utility` rules among the
      built-ins rather than appending them after, which is why `safe-px` is declared *above* `gutter-px`
      and emitted *below* it. So on a phone held upright, where every inset is `0px`, the gutter was
      zero. Found on `app/error.tsx`, where the new error-screen button row measured 4 → 386 of a 390 px
      viewport — the « confirm button 8 px off the right edge » class arriving by a cascade rather than
      by arithmetic — and the worst of the three page shells was `app/(auth)/layout.tsx:9`: `/connexion`
      and `/rejoindre` measured `0px/0px` with the card running 0 → 375 at 375 px, in both themes, on
      the first two screens any new user sees. This slice deliberately fixed **none** of it: an earlier
      push gave `ErrorScreen` its own `px-5` and it was withdrawn, because `app/(app)/error.tsx` renders
      that same component inside `app-shell`'s `px-4`, so padding it there double-pads one parent while
      leaving the others bare. Decision 124 did it instead, with a new `gutter-px` on the three page
      shells and **not** a `max()` inside `safe-px` — `components/nav/bottom-nav.tsx` is the one
      `safe-px`-with-no-`px` site in the tree, i.e. the one place the utility is used correctly, and
      insetting a deliberately edge-to-edge bar would have taken four tap targets from 97.5 px to
      87.5 px with nothing clipped and every check green. The second defect was the sticky ActionBar in
      game mode, closed in its own item above. `tabbar-pb` is neither: decision 118 already settled that
      it is kept deliberately and that its `+1rem` is clearance rather than a discrepancy
- [ ] **The crash the owner reported from his iPhone is still unexplained.** The error-screen branch
      reproduced a real failure mode on the way — a stale Server Action id after a deploy, 404 and
      `UnrecognizedActionError`, which every one of the app's 42 `useActionState` call sites is exposed
      to — and it is **not** this: the owner's crash survived a force-quit, a force-quit is a document
      navigation, and a document navigation is always served by the latest deployment, so skew cannot
      survive one. Decision 127 made the recovery screen's advice true and bought a real exposure a
      recovery; it closed nothing about the report. Another session is investigating, so coordinate
      before duplicating the hunt

### The audit tooling itself

- [ ] `npm run audit:screens` has been capturing the same screen twice and nobody noticed: the four
      `*-stats-coupe-buts.png` are **byte-identical** to `*-stats.png`. `scripts/audit-screens.ts:179`
      asks for `/stats?competition=cup&tri=buts`, but `competition` takes a competition **UUID** since
      decision 107 and `tri` takes the English keys `minutes|goals|assists|rating|attendance`, so both
      values are unrecognised and the page correctly degrades to « Toutes » / « Minutes ». The filtered,
      goals-sorted screen has therefore never been reviewed by anyone, and four of the hundred shots
      are dead weight. A regression from #97, and the script should fail rather than degrade when a
      query it hard-codes stops meaning anything
- [ ] `tri=goals` is a half-French query parameter — a French key with English values — in a URL
      `app/(app)/stats/_components/filters.tsx:4-6` describes as shareable, i.e. user-facing, where the
      project forbids mixing the two languages
- [ ] The viewport in `scripts/audit-screens.ts` is `390 × 844`, an iPhone 12/13/14. The owner's phone
      is an iPhone 16 — 393 × 852 at DPR 3 — and three pixels is exactly the margin a `w-[390px]`
      assumption hides in. The two probes added in this pass measure the right geometry; the audit
      script should take the viewport from one list of devices rather than a literal
- [ ] `/match/nouveau/composition` answers HTTP 500 with React #441 in the console: `[id]` catches the
      literal `nouveau`, and a non-UUID id should be a 404. No link reaches it, which is why it has
      survived
- [ ] Neither the audit script nor the first probe ever opened the composition **editor** — the audit
      captures only its locked and empty states — which is why the worst defect in the app went
      unrecorded until a probe drove it. `scripts/probe-composition.mjs` now does, read-only, and it
      never submits: the screens past a save (the pending button, `state.error`, `minuteClash`,
      `shapeProblems`) remain unaudited because the only database to drive is the owner's production one

## From the UX audit of 2026-10-01

Evidence and reasoning: `docs/UX_AUDIT_2026-10-01.md`. Slices and ranking:
`docs/PLAN.md` § Amendments → « UX audit of the preview deployment ». The identifiers below (`D1`, `S4`,
`A1`) are the report's, and each one there carries the measurement, the screenshot and the file and line.

Ordered by harm, which is not the order they are cheapest to fix.

- [x] *(What was still open here — the offline pointage — is moot since decision 155: trainings were removed on 2026-10-09.)* **Slice 1 — attendance stops losing data.** `D1` is **fixed** and has the regression test the audit
      asked for: `AttendanceList` is one `<form>` with two submit buttons, holding its marks in client
      state (`lib/training/attendance.ts`), so the card and the radios are counted from the same value
      and no submit can carry a mark the coach cannot see. Proved both ways — the new
      `e2e/attendance.spec.ts` fails against the old component at exactly the radio assertion, with the
      input's attribute reading `checked` while its live state is `unchecked`, which is `D1` in one line.
      `D4`(a) is **fixed**: a save that throws is caught and becomes a `role="alert"` above the list with
      every mark still under it, and the three refusals the two actions used to swallow in silence
      (unparseable form, unknown training, pointage not open yet) now return a French `FormState`. `A3` is
      **fixed**: both buttons take `Button`'s `pending`. **`D4`(b) and `A4` are still open** — the offline
      pointage is still discarded. The full outbox was costed and rejected for this slice:
      `lib/match/outbox.ts` is event-specific (`PendingEvent`, `client_event_id`,
      `POST /api/match-events`, backoff, permanent-vs-retryable) and would need a second IndexedDB
      store and a new POST API. A localStorage
      draft surviving a reload was designed as the substitute and **was not shipped either**, so nothing
      about offline changed: this slice stopped the losses that happen *online*, which were the ones
      destroying rows
- [ ] **Slice 2 — one tap-acknowledgement token, applied everywhere.** `D2`: no `:active` rule exists in
      the served stylesheet outside a `pointer-events` utility block, and in all 18 throttled samples the
      first thing that changes after a tap *is* the next screen. #114 is the first surface, not the last
      gap — « survivors, not coverage »
- [ ] **Slice 3 — match sheet and composition editor.** `D3` (6 or 8 starters save silently and empty
      composition slots), `D14` (the editor opens with zero of seven slots tappable), `D15`, `D19`, `D20`,
      `D51`
- [ ] **Slice 4 — guard the live match.** `D5` (« Fin du match » ends only the period, unconfirmed),
      `D6` (the scorer field is created 487 px below the button), `D18`, `D22`, `D34`, `D41`, `D52`
- [ ] **Slice 5 — one rule for when availability is open.** `D9`, `D10`, `D11`, `D37` are four faces of
      decision 121 meeting `isPast`: « finished » and « played » are different facts
- [~] **Slice 6 — ratings**, mostly overtaken by decision 137 rather than worked through. `D13` is gone:
      only men with `minutes > 0` are in the list the badge describes. `D21` is gone: the unpublished
      panel is headlined « Les moyennes ne sont pas encore sorties » and no longer hardcodes
      « Note tes coéquipiers pour voir les notes » over a sentence contradicting it. `D7`'s first half is
      gone with the pad — eleven cards, « Précédent » / « Passer sans noter » / « Enregistrer » 253 px
      below the fold, tap + scroll + tap eleven times — because there is one screen, one slider each and
      one submit. **`D7`'s second half still stands:** nothing survives a navigation away, and it is now
      one form's worth of sliders rather than a card counter — and the « 11 notes choisies, pas encore
      envoyées » warning the old flow at least printed went with the card counter, so there is now no
      warning at all. Same family as `D4`, and the outbox game mode has is still the answer nobody has
      written here
- [ ] **Slice 7 — the way in.** `D16` (the invite link is never built), `D17`, `D30`, `D31`, `A6`, `A7`
- [ ] **Slice 8 — roster and profiles.** `D8` (a coach can demote himself out of the app with one tap),
      `D29`, `D32`, `D33`, `D35`, `D36`, `D43`, `D44`, `D45`
- [ ] **Slice 9 — errors, readability, copy.** `D24` (HTTP 500 on a malformed id), `D48` (the last
      vouvoiement in the app), `D38`, `D39`, `D40`, `D42`, `D46`, `D49`, `D50`
- [ ] **Slice 10 — amend « Verification ».** A test for a second submit after `revalidatePath`; a unit
      test asserting no second-person-plural imperative in the French strings; a `uuid` shape guard on
      every `[id]` route
- [ ] **Eight absences**, roadmap rather than bugs: `A1` no way to change a password anywhere and no admin
      reset — decide this one first · `A2` man of the match computed and never surfaced · `A5` « parti »
      unexplained · `A8` no « (toi) » in the leaderboards (`A3`, `A4`, `A6`, `A7` ride with the slices
      above)
- [ ] **Eleven questions for the owner** (`S1`–`S11`) are open and must not be answered by a developer.
      They are listed in the plan's amendment batch, unresolved and named as unresolved
- [ ] **Owner-side cleanup, not a code task:** an orphaned `users` row for `auditg` and three matches
      named « UX Audit H »/« retro »/« retro 2 » on the preview database. Ids in the report's last
      section. The matches cannot be deleted through the UI and should not be — `deleteMatch` refuses once
      an event log exists, which is invariant 1 working
---

## The fourth batch from the owner's iPhone — 2026-10-01

Four remarks, after the owner installed the beta and used it as a coach would. They are written up as a
batch in `docs/PLAN.md` under « Amendments » — two of them are scope rather than defects, which is why
the plan had to grow a section for them.

**Two of the four are narrower than the words**, and both were audited before anything was changed.
That is the part worth reading if you are new to this batch: a remark acted on literally, when the
literal reading is already satisfied, produces a diff that changes nothing and a session that believes
it shipped something.

**Where the work is, as of 2026-10-01.** This section was written before any of it was done, so the
boxes below have been brought back in line with the repository more than once; read them, not this
paragraph, for the detail. **All four of the owner's remarks are now on `main`**, and each carries a
decision entry that exists and is numbered: the tab-bar acknowledgement merged first as #114, decision
123; the preferred positions merged as #125, decisions **129** (whose wish it is, and the empty
`positions` table behind the crash — `db/migrations/0006_seed_positions.sql`), **130** (eight codes in
the picker, eleven in the vocabulary) and **131** (an unknown code sorts last instead of throwing); the
native-picker echo merged as #116, decision **133**; and the retro redesign merged last, as #127
`feat/retro-one-action-list`, squashed into `e8bc983`, as decision **134** — which decision 049 now
points at in one added clause, so the *enterable* / *correctable* split is findable from whichever entry
a reader lands on first. **No `[~]` is left in this section.** The thing earlier versions of this
paragraph named as the remainder — a `POSITION_CHANGE` row, waiting on a `RetroAction` arm — is not
outstanding: the owner **decided against building it**, and #127's last commit took the type back out of
the enterable list (decision 134).

**Three small things are left over**, and none of them is the redesign. One: whether a `REMARK` or a
`COMMENT` typed up from memory a week later is worth recording at all is a product question the owner
has not answered, still open under M4, and named in the action-set item below. Two: on the positions
form, a rejected `teamId` or `memberId` still leaves the screen silent while « Modifications non
enregistrées. » claims the work is pending — the last item of the positions subsection says so, and it
is open on `main`. Three: the two unticked boxes further down, the two device-only tab-bar suspicions no
Linux session can settle and the `E2E_PORT` collision, which are open by their own statement rather than
by omission. Each item names the commit, the pull request and the decision that did it, and where the plan
recorded here turned out to be wrong, the item says so rather than being quietly replaced — the owner's
observation is the provenance and stays as he made it.

### The retro-entry screen is one list, with the button underneath

The owner, on typing up a match played without the phone: the add button must sit under the actions and
not over them; the score must not be editable; the same actions as in game mode must be available; and
« Changements » and « Actions du match » must become one block. They are one redesign, not four items.

- [x] **The « Score » card keeps its scoreline — and keeps its two buttons.** This line used to say it
      would lose them, and that was the plan rather than the answer. The owner's remark stands as he
      made it: « we must not be able to edit the score directly ». It does not describe a typed score —
      there is **no score input anywhere in this repository**, and `retro-form.tsx` has derived the
      scoreline through `reduceMatch` since it was written, as the second bullet of its own header
      comment says. What it describes is the one row-adding helper the two buttons share —
      `addFactRow("GOAL_FOR")` and `addFactRow("GOAL_AGAINST")` in `retro-form.tsx`, which used to be a
      separate `addGoal` — behind « + But pour nous » / « + But encaissé »,
      inside a card titled « Score », above everything else: tap, and the number above goes up. **The
      two shortcuts were deliberately kept.** They are one tap per goal — a 7–3 is ten taps, against ten
      `<select>` interactions if the only way in is an action row — and the tap was never score editing,
      because the number above is derived from the row it adds and nothing else (invariant 2, decision
      047). What was wrong was the card rendering *unconditionally*, which is the last item in this
      group, and that is what shipped. Also corrected rather than kept: « the one way to add a goal that
      cannot name a scorer » is false. The tap creates a fact row with a scorer field — 487 px below
      the fold, which is the audit's `D6`, and why `dc8b952` takes « Un appui par but » out of the card
      description instead of leaving a sentence that confirmed the wrong mental model. All of that is on
      `main`: #127, squash-merged as `e8bc983`, decision 134
- [x] **The two « + Ajouter » buttons become one, below the list.** They were passed as the `Card`
      `action` prop, and `components/ui/card.tsx:61` renders that inside the `<header>`, before
      `{children}` — which is the defect itself, and the reason `Card` is the one file not to touch
      here. Typing up a
      match is a loop, so the control that starts the next iteration has to be where the last one left
      the thumb; above a growing list it walks backwards up the screen on every action. **Done by
      `280c6b5` on #127, now on `main` as part of `e8bc983` (decision 134)**, and the *way* it was done
      is the part not to undo:
      the single « + Ajouter une action » is passed as a **child after the `<ul>`**, and `Card` itself was
      deliberately left untouched. One call site needs a footer and no other card in the app does, so a
      `footer` prop would reshape a component used everywhere to serve one screen. A sticky button was
      rejected for a reason a later session would otherwise rediscover: it would cover « Enregistrer ».
      `61bd777` had prepared the ground on the same branch — the end-to-end walk located the seven
      starter selects by `page.locator("select").nth(index)`, which would have gone red for nothing the
      moment a `select` appeared higher up the page, and is now scoped to `select[name^="starter:"]`
- [x] **One list, not two: a substitution is just another action.** `buildRetroLog` has always emitted
      a change as an ordinary `SUBSTITUTION` event — the `retroSubstitutions` loop inside it, in
      `lib/retro/log.ts` — so the two blocks are a distinction the model never made. **Both halves are
      now on `main` (#127, squashed into `e8bc983`, decision 134),
      in two commits on purpose: `79dbdee` the data and `280c6b5` the screen.** The first deliberately
      left the screen alone — the form went on rendering « Changements » and « Actions du match » as two
      cards reading and writing one array, because a visible string moving in that commit would have been
      a bug rather than the feature. `280c6b5` is the screen: one card, one `<ul>` in the order the coach
      typed it, and one merged empty state `retroActionsEmptyFr` replacing the two that each described one
      of the two cards.
      Two properties of the screen half not to undo. **The list is never sorted by minute** — rows would
      jump under the thumb the moment a minute is typed, and an undated row, which decision 048 makes the
      common case, would have no defined place. And `entry` now carries every row including the
      half-filled ones, so the warnings can appear while the coach is still typing and « Enregistrer » can
      refuse; a separate `previewEntry` holds the filtered list for `buildRetroLog`, because « sort
      personne » is not an event the reducer can replay. And this line used to say the opposite of what
      shipped: it claimed keeping
      `entry.changes` as the internal representation was « cheaper and no less honest », and it was
      neither. The two sections were two shapes — a substitution has two players and no type, a fact has
      a type with a scorer and an assist — each with its own field prefix, decoder, schema, domain type
      and validation rules, converging only inside `buildRetroLog`. They are one `RetroAction`
      discriminated union now, `RetroEntry.changes`/`.facts` are one `actions` array, and `RetroChange`
      and `RetroFact` survive as `Extract<…>` of it, so `retroPitch` kept its signature and its tests.
      The four exhaustive switch sites that replaced two loops are still the return, and the reason is no
      longer an arm that is coming — there is none, by decision 134, as the item below now says. It is
      that the four places the two shapes diverge are *named and enumerable*: the payload builder and the
      idempotency seed in `lib/retro/log.ts`, `readActionFields` and `findRetroIssues` in
      `lib/retro/validation.ts`. Any future arm is a compile error at exactly those four and nowhere else,
      instead of a silent omission nobody can list — and the stamp resolver is the same guarantee by
      narrowing rather than by `switch`: `resolveFactClockMs` takes `RetroFact`, so « just resolve the
      stamp of an action » does not compile, which is what keeps decision 048's two rules two rules
- [x] **The action set gains `SUBSTITUTION`, and `POSITION_CHANGE` was decided against.** This line read
      « gains `SUBSTITUTION` and `POSITION_CHANGE`, and nothing else » for as long as that was the plan;
      the owner's answer is narrower, and it is the answer. « The same actions as during a game » cannot
      mean identical, in either direction. `FOUL` is offered in retro
      and is deliberately **not** a game-mode tile (decision 114). `REMARK` and `COMMENT` are live-only
      by design, and whether a remark made from memory a week later is worth recording is a product
      question the owner has not answered. It stays open under M4 rather than being answered by an array
      literal. **And the asymmetry now runs the other way too: `POSITION_CHANGE` is a game-mode tile and
      is deliberately not a retro row.** The owner decided not to build it, so game mode keeps one action
      the retro sheet does not — and that is **the trade, not a gap**. It is recorded as decision 134,
      whose reasons a later session should read before « fixing » it: the slot select such a row needs has
      non-unique labels (`labelFr` on a 1-3-2-1 gives two « Milieu »), `retroPitch`'s slot bookkeeping
      would go stale, an unstamped position change is a label floating inside a spell, and it is the
      action least likely to be reconstructed from memory a week later. Nothing in the repository is
      waiting on it: #127's last commit (`3695da2` on the branch, in `main` as part of `e8bc983`) removed
      `POSITION_CHANGE` from `RETRO_ACTION_TYPES` and deleted `readActionFields`'s explicit
      `case "POSITION_CHANGE"`, and `lib/retro/log.test.ts` now asserts `isRetroActionType` refuses it,
      with the test's own name saying that re-adding it for symmetry is the mistake it exists to catch.
      **Two things this line said are no longer true.** It is not « two places »: `947dbf1`
      deleted the duplicated `z.enum` in `retroFactSchema` (`lib/retro/validation.ts`), which had the
      seven codes written out a second time and accepted and refused independently of the constant it was
      meant to mirror, and
      `retroFactSchema` is now `z.enum(RETRO_FACT_TYPES)`. And it is not one list: putting
      a type the entry form offers into `RETRO_FACT_TYPES` (`lib/retro/log.ts`) makes it **correctable
      on a finished match**, because `isAmendableEventType` is `isRetroFactType(type) || type ===
      "SUBSTITUTION"` (`lib/retro/amend.ts:55`) — a permission change by accident, several files from the
      list that caused it, and a contradiction of decision 049's « only football facts may be corrected ».
      **So the two constants stay two, and that is the clause in this item not to tidy away.**
      `RETRO_ACTION_TYPES` is now *literally* `RETRO_FACT_TYPES` plus `SUBSTITUTION`, which makes the pair
      look like pure duplication and is exactly why decision 134 spends a paragraph on it: merging them
      would point `isAmendableEventType` at the array the entry form is built from, so the **next** type
      added for data entry would silently become correctable on a frozen match. `RETRO_ACTION_TYPES`
      answers « what may a coach type up? », `RETRO_FACT_TYPES` answers « what may he correct
      afterwards? », only the second is a permission, and `SUBSTITUTION`'s amendability is granted
      explicitly by name in that predicate. Both carry the question they answer in their doc comment, and
      those comments are
      load-bearing. **All of it is on `main` (#127, `e8bc983`): `SUBSTITUTION` is offered in the per-row
      type select**, which maps over `RETRO_ACTION_TYPES` itself — the hand-written
      `RETRO_FACT_TYPES` + `"SUBSTITUTION"` list the form used to keep, in order to subtract
      `POSITION_CHANGE`, is gone, because there is nothing left to subtract and nothing left to keep in
      step by hand
- [x] **A match typed up with no actions at all must say so, not print « 0 – 0 ».** Making the scoreline
      the only score surface makes this case easier to reach, not harder, and it is the defect the third
      batch already paid for once. Done by `dc8b952` on #127, now on `main` as part of `e8bc983`, so
      `lib/retro/labels.ts` holds both functions below. `retroScoreLineFr` returns `null`
      unless the sheet holds a row of `SCORING_EVENT_TYPES`, and the card prints a sentence instead of a
      scoreline when it does not: not « any content at all », so a sheet with one foul and no goals still
      shows none, which is what lets the next card's « Un 0 – 0 sans rien à signaler, ça existe. » stay
      true. `280c6b5` then collapsed the two lists' two empty states into `retroActionsEmptyFr` in the same
      module, which keeps the only thing that distinguished them — before the starting seven is named the
      list has nothing it can usefully hold, so it points at the composition card above rather than
      inviting an action nobody could fill in — and takes a boolean, not a count, because the sentence
      claims no number (decision 083). In `labels.ts`
      because Vitest sees nothing under `app/` (decision 083), and the walk asserts the untouched sheet
      prints no scoreline

### Dates and times — audited, and already right everywhere the app controls

- [x] **Every date the app formats itself is `DD/MM/YYYY`, and every time is 24h.** Decision 109 did
      this. Audited end to end for this batch: `lib/calendar/time.ts` is the only module that formats an
      instant and `lib/player/injury.ts` the only one that formats a `date` column; all twenty-odd call
      sites go through them; 24h is pinned twice over, by the `fr-FR` locale **and** an explicit
      `hour12: false` (`time.ts:195`), with a test looping all 24 hours; there is no
      `toLocaleDateString` in the repository and `MONTHS_FR` is gone. The tests pin the literal strings
- [x] **The five native pickers render in the browser's locale, not the app's** — the three
      `<input type="date">` in the injury forms (now `DateInput` at `injury-declare-form.tsx:60`, `:82`,
      `injuries-card.tsx:99`) and the two `<input type="datetime-local">` in the match and training
      forms (`match-form.tsx:96`, `training-form.tsx:51`). On a phone set to English the owner sees
      `MM/DD/YYYY` and an AM/PM clock in the one place a formatter cannot reach. Decision 109 saw this
      and declined to act — « offered to the owner, not taken » — and this batch is him coming back to
      it. **His answer: keep the native control, which is still the best thing under a thumb, and print
      the value it holds underneath it in the app's own shape.** Not a custom picker. **Shipped in #116
      (`feat/echo-native-date-values`), merged, as decision 133.**
      `components/ui/date-input.tsx` wraps all five and renders one quiet line — « 14/03/2026 », or
      « 14/03/2026 à 20:05 » with the « à » `formatWhen` already uses. Three properties of it worth not
      undoing: the echo never builds a `Date`, because parsing `YYYY-MM-DD` as one gives UTC midnight and
      an off-by-one-day echo is worse than none; an empty or unreadable value renders no element at all
      rather than a placeholder, since « --/--/---- » is a screen stating something it does not know; and
      it is `aria-hidden`, because the defect is what the eye sees and a reader already hears the control's
      value once. `lib/player/injury.ts` delegates to the same digits, so the fix for a wrong date format
      is not a third way to format a date. Decision 133 supersedes the carve-out at the end of 109 rather
      than opening a second decision about date formats

### Preferred positions belong to the player, and the picker offers eight (now six — 2026-10-06)

- [x] **The coach must not be able to edit a player's preferred positions.** `assertCanActFor`
      (`lib/player/actions.ts:53-61`) tries the self action and then falls back to `member:update`,
      which is a coach permission (`lib/auth/can.ts:89`) — so a coach rewriting a teammate's wishes was
      deliberate, documented, and wrong. It had to go in **three** places or it half-went: the
      fallback at the positions call site, `canEditPositions` in `app/(app)/joueur/[id]/page.tsx`, and
      the coach wording in `positions-editor.tsx`. Removing only the first would leave a coach an
      enabled save button whose submit throws. Note `profile:editShirtName` has the same fallback by the
      same reasoning and is **not** in scope: the owner asked about positions. **Shipped in #125
      (`fix/positions-belong-to-the-player`), merged, as decision 129** — whose part one this is, and
      which supersedes the one clause of decision 104 that cited the preferred positions as its
      precedent. `lib/player/actions.ts:116` is the bare `assertCan` now. `fffff7b` did exactly those three
      files and no others, so the « three places » count held: the call is now a bare `assertCan` on the
      self-only `profile:editPositions`, the coach's card now says « Chaque joueur choisit ses postes
      lui-même. » — whose decision it is, rather than that a permission is missing — and the editable
      description lost the ternary only the player can now reach. `profile:editShirtName` keeps its
      fallback and the branch says why rather than leaving it to look like a leftover: a shirt name is an
      order with a supplier and a deadline. `lib/auth/can.test.ts` already asserted a coach may not, and
      passed unchanged — thinner cover than it sounds, since nothing unit or Playwright exercises the
      positions editor at all
- [x] **The picker offers eight positions, not eleven: `GB DG DC DD MG MC MD AT`.** *(Superseded on
      2026-10-06: the owner reversed the choice recorded below and took the **one** shape rather than
      the union, so the list is the six codes of `1-3-2-1`. The history is kept because the question
      he was put — « only 7 » is not expressible — and the answer he gave then are what make the new
      answer legible.)* `MOC`, `AG` and
      `AD` are 11-a-side positions this team never fields. The owner asked for « only 7, as we are
      playing with 7 players », and that is not expressible — `1-2-3-1` is `GB,DC,DC,MG,MC,MD,AT` and
      `1-3-2-1` is `GB,DG,DC,DD,MC,MC,AT`, which is seven slots each but **six** distinct codes each and
      **eight** in union. Put to him, and he chose the union. Shipped in `e7e319c` on #125, merged, as
      decision 130, with the eight recomputed in the test from `BUILTIN_FORMATIONS` so the list cannot
      drift from the shapes it is drawn from. **One consequence this line did not mention and should:
      a stored `MOC`, `AG` or `AD` survives every save** — the hidden inputs come from the selection's own
      keys and `fromSelection` iterates all eleven — so a shorter grid alone would make such a code
      invisible and *unremovable*, with no screen anywhere able to clear it. Hence a row of removable
      chips, derived from the same value the grid is, one per non-offered code, removable once and not
      re-addable. Its copy says « Ces postes ne sont plus proposés » and must never say « n'existent
      plus », which would be false: `MOC` is a slot in `1-3-3-0` and `AG`/`AD` in `1-2-1-3`, both still
      shippable. Removing a retired *primary* leaves no primary rather than promoting a secondary, a
      state already legal and already reachable by cycling your only primary off
- [x] **Narrow the picker, not `POSITION_CODES`.** The constant at `db/reference.ts:50-62` is read by
      `lib/composition/validation.ts:89` (`z.enum(POSITION_CODES)` on every saved lineup slot),
      `components/composition/composition-editor.tsx:69`, `lib/formation/shape.ts` and
      `lib/stats/best-seven-input.ts`. Narrowing it would make every built-in formation containing a
      dropped code **unsavable** — `1-3-3-0` has `MOC`, `1-2-1-3` has `AG` and `AD` — and would silently
      drop existing declarations through the `isPositionCode` filters at `lib/player/queries.ts:131-137`
      and `lib/team/queries.ts:90`. The composition editor keeps all seven built-in formations: « only
      two compositions » was about the picker, confirmed with the owner. Honoured by #125, merged, rather
      than merely restated — it is the second half of decision 130: `POSITION_CODES` is untouched at eleven
      and a test pins the eleven so nobody tidies them away to match the picker. `024a403` on the same
      branch is **decision 131** and goes the other way, making the vocabulary *safer* to be wide —
      `POSITION_BY_CODE` was built with a cast, so `rankOf` threw a `TypeError` on any code the reference
      data does not know, reachable from `getPreferredPositions` and
      `getSquad` and therefore able to take out the profile, `/moi`, `/equipe` and the composition editor
      at once; typing it `Partial<Record<…>>` let the compiler enumerate the sixteen readers across five
      files instead of a hand-written list missing one
- [x] **The app crashes on select-and-save, reported from the phone. The cause was found, and it was
      not in the code.** The first crash in the beta rather than a wrong sentence, so the reproduction
      stays written down. **Fixed in #125, merged, as part two of decision 129.**
      `updatePlayerPositions` had **no try/catch**, so anything it threw reached the
      error boundary instead of becoming a French message; `fa2d3ed` puts a
      guard around the write and **only** the write — `requireActor`, the schema parse and the permission
      check stay outside it, because a `ForbiddenError` is a bug or an attack and must keep reaching the
      boundary rather than being flattened into a polite sentence. It logs the Postgres `code` rather
      than a stringified error, because `23503` and `23505` are different bugs one digit apart. **The
      cause: `player_positions.position_code` references `positions.code`, and no migration had ever
      inserted a single row into `positions` — the only writer was `seedReference()`, reached only from
      the hand-run `db:seed` and `db:bootstrap`.** So a database that had had `db:migrate` run and had
      never been bootstrapped carried the foreign key and none of its targets, and every save of a
      preferred position raised `23503`; reads worked, because a read joins to a table that is merely
      empty. `db/migrations/0006_seed_positions.sql` inserts the eleven with `ON CONFLICT (code) DO
      NOTHING`, generated through `drizzle-kit generate --custom` so the journal carries it, and
      `db/reference.ts` stays the single source of truth. **The line that used to say « the local
      `positions` reference table holds all eleven rows » is struck**: it was true, it was offered here as
      having ruled the crash out, and it was the measurement most likely to hide it — the local database
      is seeded, the owner's was not, so the one machine anybody would check on is the one machine where
      the bug cannot happen. Still ruled out and still worth keeping: Neon imposes no transaction
      limitation here (`db/client.ts` is postgres.js over TCP in both environments, so `db.transaction` is
      fine), `player_positions` is one row per position rather than an array column, and `revalidatePath`
      is present. Two loose ends. `formations` and `formation_slots` are in the same state and were
      deliberately left — `formation_slots.position_code` has its own foreign key, both tables are written
      only by the same seeder, and a freshly migrated database measurably has zero formations, so it can
      plan **no composition at all**; decision 129 records that as the owner's decision rather than
      smuggling it in — « 0 either way, and deliberately left that way », with the reason that a team
      renames its shapes into its own `formations` rows (decision 005). And #118, which rewrote the error
      screen this crash landed on, explicitly declined to claim
      the stale-action-id failure was the owner's crash, since a force-quit always fetches the latest
      deployment — a restraint that reads correctly now the real cause is known
- [x] **`toFormState` and the editor disagree about a field name, so a rejected position is silent.**
      `toFormState` (`lib/auth/validation.ts:72-79`) builds keys with `issue.path.join(".")`, producing
      `secondary.1`, while the editor read `state?.fieldErrors?.secondary`. A validation rejection on
      a position code therefore rendered **nothing at all**. Found while reading for the crash; it is not
      the crash. Fixed by `d738c45`, merged with the rest of #125, with `fieldErrorsUnder`
      (`lib/auth/validation.ts:96`, called at `positions-editor.tsx:103`) — in the *consumer*, not in
      `toFormState`, because `["secondary", 1]` is a correct description of the issue and `toFormState` is
      shared by every form in the app, so
      collapsing the index there would silently merge messages on screens nobody is looking at. It strips
      only a trailing index and matches the key in full, so `secondaryThing` stays a different field. Two
      details the original line missed: the `??` meant `primary`'s message only ever appeared *because*
      the `secondary` key was absent, so the single case that did produce a flat `secondary` key
      suppressed `primary` at the same time; and `teamId` and `memberId` are rendered nowhere on this
      form, so a rejected identifier still leaves the screen silent while « Modifications non
      enregistrées. » claims the work is pending — a separate defect, and still open on `main` now that
      the rest of this item has merged

### A tap on the bottom tab bar is acknowledged

PR #111 measured this and deliberately changed no production code; its numbers are in `docs/SESSIONS.md`
under « Where the two seconds on the iPhone actually are ». **Do not re-measure.** The items it
prescribed are below, in its order. (Decision 111 is an older, unrelated entry that happens to share the
number with the pull request — it is the `iad1` → `lhr1` region pin, not #111's write-up.)

- [x] **A pressed state on `components/nav/bottom-nav.tsx`, in plain CSS.** This is #111's own
      conclusion and the reason the order matters: **a pressed state renders before hydration, a router
      pending state does not.** #111 found that under CPU ×4 a tap landing before hydration produced a
      full native document navigation in **5 of 5** samples on Calendrier — the bar is a client
      component reading `usePathname`, so until it hydrates a tab tap is a cold document load whose
      first paint is seconds away with nothing on screen. That is the owner's « I click and nothing
      happens, I need to click a few times ». Every `Button` variant in `components/ui/button.tsx` had
      an `active:` class and the tab bar had none. Shipped in #114, merged, as decision 123:
      `active:bg-surface-2` at `components/nav/bottom-nav.tsx:68`, the fill every `ghost` and
      `secondary` variant already uses, and deliberately with no `transition-colors` so it lands in the
      same frame as the touch. The reason it had to be hand-written is in that entry and is not obvious:
      Tailwind v4's preflight sets `-webkit-tap-highlight-color: transparent` on `html`, so the app lost
      the platform's free tap flash the day Tailwind was installed. **One thing #114 could not verify from
      a Linux session**: iOS Safari has historically not applied `:active` to a plain `<div>`, which is
      why the class is on the `<Link>`'s own `<a>` — only the owner's phone can confirm the fill paints
      under his thumb
- [x] **`useLinkStatus` for the post-hydration half**, called from a component inside the `<Link>`.
      There was no `useLinkStatus`, `useTransition` or `useOptimistic` anywhere in `app/` or
      `components/`. Keep it quiet, and keep it out of each tab's accessible name. Shipped in #114,
      merged: `TabPending` at `components/nav/bottom-nav.tsx:100` draws a 2 px hairline across the top of
      the tab that started the navigation, `aria-hidden` and wordless on purpose — decision 122's rule
      about the action tiles' SVGs reused rather than rediscovered. The `120ms linear 180ms both` in
      `.fm-pending` (`app/globals.css:325`) is what keeps it off the navigations the pressed state has
      already answered: a tab tap measured 126–217 ms unthrottled, and `both` is load-bearing, since
      without it the hairline would sit at full opacity through the delay
- [x] **A `<Suspense>` boundary or `loading.tsx` for `/stats`** was proposed here, and it is **answered
      rather than outstanding: built, measured, and withdrawn** (decision 123). 844 ms under CPU ×4 +
      100 ms RTT made it look like the one screen where streaming pays. The repository still has **zero**
      `loading.tsx` files and zero `<Suspense>` boundaries, and it is true *because* the boundary was
      reverted rather than because nobody has got to it. **Do not re-open it from this line, and do not
      shorten the reason to « no streaming on these screens », which leaves a rule nobody can reason
      with.** The argument is in decision 123 and in `docs/PLAN.md` § Amendments → « UX audit of the
      preview deployment » → « Properties to protect » item 4, and it turns on *when* a boundary engages,
      not on whether streaming is allowed. Two further things recorded there: the skeleton promised three
      cards where the true answer on a new team is often zero, and the measurement that the boundary
      committed the shell before the 180 ms delay elapsed, so it would have taken the hairline away
      rather than composing with it. `/stats`'s 844 ms stays open under this heading as a query to make
      faster, not a wait to decorate
- [x] **`Promise.all` on the two tab pages #111's « 17 of 21 » audit left on the table.** Tens of
      milliseconds, and **not** to be described as the fix for anything, exactly as #111 refused to let the
      `dal.ts` prefix joins be. `/calendrier`'s two awaits are genuinely serial — `getCalendar` needs
      `team` — and are not an opportunity. **One of the two shipped in #114 and the other is closed as
      « will not do », and the asymmetry is the point** (decision 123). `/moi`'s `getUserTeams` and
      `getPlayerProfile` share no input, so they are one `Promise.all` now
      (`app/(app)/moi/page.tsx:29`), with the `null` for a non-playing coach passed straight through so
      the condition stays a condition instead of becoming a query that returns nothing. `/stats` cannot:
      `getSeasonStats` (`app/(app)/stats/page.tsx:75`) consumes the competition id that
      `parseCompetitionId` has just validated against `getTeamCompetitions` (`:66`), and that validation
      is what drops an id naming a deleted or a foreign competition — parallelising them would mean
      trusting the id from the query string
- [ ] **Two device-only suspicions, written down rather than acted on**, because neither can be settled
      from source and both are outside the four iOS suspects #111 cleared: iOS Safari's own bottom
      toolbar consuming the first tap under `viewportFit: "cover"` (`app/layout.tsx:27`) with a 56 px bar
      at `bottom-0`, and `html { overflow-x: hidden }` (`app/globals.css:249`) against a `fixed` bar. The
      instrument for the first is what `document.elementFromPoint` returns at the centre of each tab on
      the owner's phone. **Still open and still unsettled**: #114 shipped the two acknowledgements above
      without touching either suspicion, and neither can be closed from a Linux session — decision 123's
      own residual risk is the same shape and is named there. **What is no longer a suspicion:** there is
      no overlay, no pseudo-element, no transform and no `backdrop-filter` over the tab bar, and nothing
      competing with it in z-order — checked through the whole ancestor chain, so the classic iOS
      « transformed ancestor breaks fixed hit-testing » bug is absent rather than unexamined

### The tooling this batch broke its nose on

- [ ] **`npm run test:e2e` will silently test another session's code.** The port is
      `Number(process.env.E2E_PORT ?? 3000)` (`playwright.config.ts:25`) and the server is
      `reuseExistingServer: !process.env.CI` (`:80`), so a local run attaches to whatever is already
      answering on 3000 instead of starting the working tree's own dev server — and says nothing about
      it, because reusing a server is the normal, documented, deliberately cheap path. **Several sessions
      share this machine**, sometimes with different branches checked out in different worktrees, so the
      failure mode is not theoretical: a run during this batch produced a screenshot of a defect that had
      already been fixed in the tree the run was launched from, and the screenshot was believed before the
      port was. A pass is as dangerous as a failure here, and neither can be told apart from the real
      thing by looking at the report. **The workaround is to pin `E2E_PORT`** to something nobody else is
      on — the variable exists for exactly this and the comment above it says so — and the thing worth
      deciding is whether the suite should refuse a server it did not start, or at least print which one
      it attached to. Not started: CI is unaffected (`E2E_WEB_SERVER` and `CI` both set), so this costs
      only local sessions, which is also why it will keep happening until something checks

## The instrument for the questions only the phone can answer — 2026-10-01

Three of the open items in this file say, in different words, « neither can be settled from a Linux
session ». There is now a way to ask the device directly: a capture bookmarklet the owner taps into the
preview deployment, and `POST /api/dev/trace`, which prints what it sends to the server console so a
session reads it live with `vercel logs`. It is decision 136 (« The owner's iPhone gets a trace sink,
and it ships nothing »); `scripts/iphone-trace/README.md` is the operating instructions.

**Nothing in this section is `[x]`, and the asymmetry is deliberate.** The tool exists; no finding has
been confirmed with it; it has not itself been run on the device. The rule the rest of this file keeps —
nothing is written up as fixed until it has been seen on the owner's phone — binds the instrument as much
as the defects, so the only thing that can promote any box below is a reading from the iPhone 16.

- [~] **The trace sink is built and has never been run on an iPhone.** `scripts/iphone-trace/capture.js`
      → `build-bookmarklet.mjs` → a `javascript:` URL in the gitignored `audit/`;
      `app/api/dev/trace/route.ts` behind `isTraceSinkEnabled` (`lib/dev/trace.ts`, 19 unit tests), which
      reads `VERCEL_ENV` and answers **404 on production**, indistinguishable from an absent route. The
      four steps are build · install the bookmark · tap it on the screen in question · read
      `vercel logs`. Two things to know before relying on it: the minified URL is **14 359 characters**
      and whether iOS Safari accepts a bookmark address that long **has not been observed** — a truncated
      paste is the failure that looks like success — and on preview the route is public and
      unauthenticated by design, so anyone who knows the path can write bounded noise into the log stream
      (schema-validated, capped at 200 entries). Nothing of it is in the app's bundle, which is what keeps
      decision 127's reasoning about the absent error digest true
- [ ] **The two tab-bar suspicions above** — « Two device-only suspicions, written down rather than acted
      on », under « A tap on the bottom tab bar is acknowledged » — are the first target, and the trace
      implements that item's own prescribed method rather than a new one: `elementFromPoint` at the centre
      of each of the four tabs (Calendrier · Équipe · Stats · Moi), once on install while Safari's bottom
      toolbar is still expanded, and again after a scroll that collapses it. Three readings tell the
      suspicions apart — the tab's own name (tappable where it is painted), a stranger's name (geometry
      and hit regions disagree), and `(rien)` for a null hit, which is the `overflow-x: hidden` shape.
      Each pass carries `scrollY`, `innerHeight` and the visual viewport's height and `offsetTop`, which
      is how a collapsed toolbar is told from an expanded one after the fact. **Still unsettled**: this
      line adds an instrument and no evidence
- [ ] **The crash on saving preferred positions is fixed, and it is the argument for the sink.** Its
      cause — `positions` holding none of the rows its foreign key points at — was found by reading, over
      hours, from a machine where the bug could not happen, because the only thing the phone produced was
      « ça plante ». `updatePlayerPositions` now logs the Postgres `code` server-side, so the *next* one
      of these is in the log stream; what the trace adds is the browser half the server never sees. Open
      here only as a method note: the next crash reported from the phone starts with a trace, not with a
      re-read of the action
- [ ] **The audit's viewport is `390 × 844` and the owner's phone is `393 × 852` at DPR 3** — the item
      under « The audit tooling itself ». The trace's device block records the user agent, DPR, `screen`,
      `innerWidth`/`innerHeight`, the visual viewport, the theme as `<html>` actually carries it, whether
      it is running installed to the home screen, and the **resolved** `env(safe-area-inset-bottom)` in
      px. That is the first time those numbers will have come from the device rather than from a
      `deviceScaleFactor` we set ourselves, and it is what the `w-[390px]` assumptions and the
      `--tabbar-h` / safe-area work have to be checked against. The audit script taking its viewport from
      one list of devices is still the fix; this only supplies the measurements it should be built on

## The redirect loop a dead session cookie caused — 2026-10-06

Found on production, not by a test: `curl -H 'Cookie: fm_session=x' https://7orteils.bgonzva.fr/connexion`
answered `307 location: /`. A cookie whose `sessions` row has gone made every screen of the app
unreachable, including the one with the logout button, and the cookie being `httpOnly` meant the
browser could not be told to drop it. Decision **143** has the full account.

- [x] **A cookie that identifies nobody is now deleted instead of bounced.** `readSessionState()`
      returns `anonymous | stale | active` where `readSession()` returned `{ userId } | null`, and
      that collapsed third case is the whole bug: the layout guard could only send both negatives to
      `/connexion`, where `proxy.ts` — which sees a cookie and asks no database — sent one of them
      straight back. `app/deconnexion/route.ts` is the piece neither guard could be: a Route Handler
      may write cookies, so it calls `destroySession()` and answers 303 to `/connexion?expiree=1`.
      After that hop there is nothing left for the optimistic and the authoritative guard to disagree
      about, which is why the loop cannot re-form rather than merely being longer
- [x] **The user is told, in one sentence and tutoied** — « Ta session a expiré, reconnecte-toi. »
      above the login form, and only when the guard said so, so a deliberate `/deconnexion` does not
      claim an expiry. Walked at 390 × 844 in both themes, read as images
- [x] **Covered at both levels, because this shipped with nothing on it.**
      `lib/auth/session-state.test.ts` pins the decision, `proxy.test.ts` pins that `/deconnexion` is
      never intercepted in any of the three cookie states, and `e2e/stale-session.spec.ts` is the one
      that would have caught the outage: a forged cookie, a visit to `/`, and an assertion that the
      itinerary is **at most four navigations** — a loop being a property of the whole chain, which
      only a browser walks. Confirmed non-vacuous by reverting the fix and watching it fail
- [ ] **Nothing prunes sessions on a schedule, and `pruneExpiredSessions()` has no caller.** It is
      the function whose routine use produces this state, and it is currently dead code — so the
      path above is reached today by a restore or a rebuilt database rather than by housekeeping. Left
      open deliberately: wiring a pruner is a separate decision about where periodic work runs on
      Vercel, and it is now safe to make, which it was not before this change

## Importing the seasons that happened before the app — 2026-10-06

- [x] **`ratings.score` tolerates one decimal, not only half-points.** The historical per-match
      figures are already *means* of real notes — 7.3, 4.2, 3.9 — and `ratings_score_half_step`
      refused all of them; rounding to the half-point was the only way through and it collapses a
      season's ranking into five-way ties. `ratings_score_one_decimal`
      (`0010_puzzling_karen_page.sql`, decision **144**) replaces it, with the range check, the
      no-self check and the unique triple untouched and no row needing to change. The **match-day
      slider is deliberately unchanged**: still `step=0.5`, still « Une note va par demi-points », so
      the form is stricter than the column on purpose
- [x] **The read-side filter moved with the column**, which was the part that would have bitten
      silently: `isValidScore` filters rows *already read from the database*, so with only the
      constraint relaxed every imported mean would have inserted fine and then been dropped on the
      way out, leaving the season table empty of the rows the import was for. It now accepts a tenth
      — with a float tolerance, not because the naive `Number.isInteger(score * 10)` is wrong today
      (it holds for all 101 tenths, and the test walks them) but because the half-point version could
      *rely* on `0.5` being exact and this one cannot
