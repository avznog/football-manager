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
- [ ] **Minutes by position, so « meilleur milieu droit » becomes a measurement.** There is exactly
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
- [x] …and noting is two taps: choose, then « Suivant ». Tapping a score advanced the card in the
      same handler, so the number the reader had just chosen was replaced by the next teammate before
      it could look chosen — a pad with a correct selected state that was never once on screen. The
      selection is now a fill, a ring, a bolder digit and « Note choisie : 8 / 10 » in an
      `aria-live` region; the forward button says « Passer sans noter » on a card with no score, and
      the last card has none at all (decision 102)

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
- [ ] Reset the super-admin password, which spent the first hour of the deployment sitting in the
      Vercel environment where `docs/DEPLOY.md` says it must never be. Free, if the account is created
      with a fresh password rather than the one that was in Vercel: the same `db:bootstrap` run does
      both, because it is idempotent and re-hashes the password every time
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
- [ ] The recap contradicts itself about who came on. In « Les notes », Yanis and Fabien carry « entré
      en jeu »; in « Temps de jeu » a few hundred pixels below, the same two men are « non entré ·
      0 min ». `app/(app)/match/[id]/recap/_components/ratings-panel.tsx:91` deduces it from
      `squadRole === "substitute"` — from what the coach *planned*. This is the exact bug whose fix
      `lib/rating/progress.ts:144-159` documents at length: the notation flow was corrected and the
      recap is the copy that was missed. The log answers this question, not the sheet
- [ ] « Ce match a été saisi après coup, sans composition : les temps de jeu viennent de la saisie »
      is shown for a match nothing has been entered for — the same screen still offers « Saisir le
      match », which only renders when `score === null`. `lib/composition/plan.ts:437` branches on
      `match.entryMode === "retro"` alone and never on whether a log exists, so it describes a record
      the app does not hold. `app/(app)/match/[id]/saisie/page.tsx:76-81` refuses to make that claim;
      this sentence should be held to the same standard
- [ ] `/stats` shows two members of one team two different « Meilleures notes » podiums under
      identical copy — coach: Julien 9,0 · Ali 8,0 · Hugo 8,0; Ali: Karim 7,0 · Samir 7,0 · Hugo 6,0,
      and the counts diverge too (Nico « 6,0 sur 4 notes » against « 5,5 sur 2 notes »). Decision 007's
      reciprocity gating is *why*, and it is right, but the card is titled as an absolute leaderboard
      — « Moyenne reçue, à partir de 3 notes » — and the note at `app/(app)/stats/page.tsx:182` only
      mentions the two excluded matches. Two team-mates will argue about who is best rated. The label
      has to become viewer-relative: « d'après les matchs que tu as notés »
- [ ] The rank column invents an order among ties: #2 Ali 8,0, #3 Hugo 8,0, #4 Karim 8,0, and #4
      Rayan 1 but above #5 Ali 1 but. `app/(app)/stats/_components/leaderboard.tsx:50` prints
      `{index + 1}`; a competition rank repeats on equal values
- [ ] A rating for a man who never came on: Fabien reads MATCHS 0 · MINUTES 0′ · NOTE 5,0 « sur 4
      notes » on the coach's `/stats` (« 3 fois remplaçant »). Either the notation screen should not
      offer a 0-minute substitute, or the average is suppressed at zero minutes — the same argument
      `playedLabelFr` already settled for « non entré »
- [ ] « Présence aux entraînements » has no minimum denominator, so Rayan — who has left the club —
      tops it at 1/1 · 100 %, above ten players on 1/2. `app/(app)/stats/_components/attendance.tsx:31`
      sorts on the rate and uses `marked` only as a tie-break, while « Meilleures notes » enforces
      `MIN_RATINGS = 3` for precisely this reason
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
- [ ] The `/stats` competition filter is hard-clipped at the viewport edge with no affordance:
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
- [ ] Two copy asymmetries between the roles, both showing someone a remedy they cannot apply: the
      player is told « Une saisie rétroactive les ferait apparaître » (`team-summary.tsx:93`), and only
      the player — not the coach who can act — is told that an unmarked séance counts in no attendance
      rate (`lib/calendar/labels.ts:237` against `attendance-list.tsx:91`). Also `/feuille`'s
      « Enregistrer la feuille » is the one non-full-width primary submit in the app, left ragged after
      2 000 px of scrolling, and a player is offered « Ouvrir le mode match » for a screen that then
      tells him he may only watch
- [ ] A player's page for a past session is 450 px of blank that never answers his own question: it
      says « 11 présents sur 14 pointés » and never « Tu étais là »
      (`app/(app)/entrainements/[id]/page.tsx:163`), because the availability grid is empty on an old
      séance. Whether that is a defect or a choice is the owner's call, but the emptiness is not
- [ ] The « pas encore pointé » state is the loudest thing on the coach's screen in light mode
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

- [ ] **Slice 1 — attendance stops losing data.** `D1`: « Tout le monde est là » writes 13 présent rows,
      leaves all 13 radios reading « — », and the next save deletes eleven of them. Also `D4` (offline
      pointage discarded, « Réessayer » cannot work), `A3`, `A4`
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
- [ ] **Slice 6 — ratings.** `D7` (both controls below the fold, progress lost on navigation), `D13` (the
      recap says « entré en jeu » for men who never came on, and `playedLabelFr` already fixes it on
      `/notation`), `D21`
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
