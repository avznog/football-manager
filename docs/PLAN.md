# Football Manager — plan de conception

## Context

Benjamin coaches a 7-a-side football team and currently manages the season by hand
(WhatsApp for availability, memory for compositions, nothing for stats). The goal is a
mobile-first web app, used in the browser, deployed on Vercel, that covers the full
season loop: calendar → availability → squad selection → composition → live match →
stats → player ratings, plus training attendance.

Source of requirements: `instructions.md` (in French, written by Benjamin) plus the
decisions captured in the planning conversation and recorded below.

The repository is currently empty apart from `instructions.md` — this is a greenfield build.

### Decisions taken during planning

| Topic | Decision |
|---|---|
| Git vs data | Spec, data model, decision log and SQL migrations in git; live data in Postgres. Git is what lets a fresh Claude session resume, **not** a database. |
| Scope | Multi-team data model (users can belong to several teams with a role per team), single-team UX. |
| Live match | One operator (coach, or a delegate they designate). Every action written to Postgres as an **append-only, immutable event log** — full audit trail, corrections are appended, never overwrites. Client-side outbox queue so a dead 4G bar can't lose an event. |
| Formations | Standard 7-a-side templates with typed slots, plus custom formations created by dragging slots. |
| Ratings | 0–10, whole numbers. Only players on the match sheet can rate. They rate everyone including themselves. Author names visible to all. |
| Auth | Username + password. Coach generates a team invite link/code; player sets their own password on joining. Coach/admin can reset any password. No email provider. |
| Events tracked | Goal (scorer + optional assist), goal conceded, own goal, penalty scored/missed, substitution, position change, foul, injury. **No cards. No opponent scorer names, no shots/saves/corners.** |
| Clock | Configurable periods and duration per match, **default 2×30**. Continuous display (2nd half shows 30'→60'). Manual pause for stoppages. |
| Pitch visual | Realistic turf: green with mowing stripes, white markings, players as numbered kit-coloured discs with the name underneath. |
| Colour mode | Light and dark, following the phone, with a manual override. |
| Branding | Neutral app palette; club colours and crest only where they carry meaning (kit discs, team header, match cards). |
| Personality | Sober tool, one celebratory moment: the post-match recap. |
| Reminders | In-app only. No push, no email. The coach gets a "who hasn't answered" list. |
| Match data | Date, kick-off, opponent, home/away, venue, score, **competition** — each team defines its own list, starting from the four the app used to hardcode (championnat / coupe / amical / tournoi), with stats filterable by competition (decision 107). No convocation fields, no manual league table. |
| Clean sheets | Both: GK clean sheets as the headline stat, clean minutes for every player on their detail page. |
| Language | **French only.** UI strings in French, code and identifiers in English. |
| Starting point | Retro-entry screen so matches already played this season can be backfilled without game mode. |
| Stack | Next.js App Router on Vercel · Neon Postgres · Drizzle ORM with SQL migrations in git · self-written session auth. |

---

## Architecture

### Stack

- **Next.js (App Router)**, TypeScript, React Server Components; Server Actions for mutations.
- **Neon Postgres** (serverless driver over HTTP for reads in RSC, pooled for actions).
- **Drizzle ORM** — schema in `db/schema.ts`, generated SQL in `db/migrations/` (committed).
- **Tailwind CSS** + a small hand-rolled component set (buttons, sheets, dialogs). Avoid a
  heavy UI kit: the pitch and the action sheet are custom anyway.
- **Auth**: username + password (argon2id), opaque session token in an httpOnly cookie,
  `sessions` table in Postgres. No third-party auth dependency.
- **Drag and drop**: pointer events directly on an SVG/absolute-positioned pitch rather than
  a DnD library — the pitch is a fixed coordinate space, and touch-dragging a disc onto a slot
  is simpler to control by hand than to configure. `dnd-kit` only if this proves painful.
- **PWA manifest** for home-screen install (icon, standalone display, theme colour). No service
  worker push — installability only.
- **Tests**: Vitest for the event reducer and permission checks (the two places where a bug is
  expensive). Playwright for one end-to-end happy path.

### The event log — the core of the design

Everything that happens in a match is a row in `match_events`, never updated, never deleted:

```
match_events
  id              uuid pk
  match_id        uuid
  client_event_id uuid  unique      -- idempotency key generated on the phone
  type            text              -- see below
  period          int               -- 1, 2, ...
  minute          int               -- continuous display minute (2nd half = 30..60)
  clock_ms        int               -- precise elapsed match time
  occurred_at     timestamptz       -- real wall-clock time on the device
  recorded_at     timestamptz       -- server insert time
  payload         jsonb             -- type-specific
  created_by      uuid
  voids_event_id  uuid null         -- set on a VOID event, points at the mistake
```

Event types: `KICKOFF`, `PERIOD_END`, `PAUSE`, `RESUME`, `GOAL_FOR`, `GOAL_AGAINST`,
`OWN_GOAL`, `PENALTY_SCORED`, `PENALTY_MISSED`, `SUBSTITUTION`, `POSITION_CHANGE`,
`LINEUP_APPLIED`, `FOUL`, `INJURY`, `FINAL_WHISTLE`, `VOID`.

**All match state is derived by reducing this log** — score, who is currently on the pitch,
minutes played per player, clean-sheet minutes. One pure function:

```
lib/match/reducer.ts   reduceMatch(events, lineups, config) → MatchState
```

This is the single most important file in the project and gets the most unit tests:
minutes played across substitutions, position changes mid-match, clean-sheet minutes per
player and per GK, score with own goals and penalties, and correct handling of voided events.

Derived per-player numbers are recomputed on read while a match is live, then frozen into
`match_player_stats` when the match is finalised, so season stats are a cheap aggregate.

**Correcting a mistake**: the coach taps an event in the timeline and chooses "annuler". That
appends a `VOID` event pointing at it. The reducer ignores voided events. Nothing is ever
erased, and the timeline can show "but de Karim 58' — annulé".

**Outbox**: every action is written to an IndexedDB queue with its `client_event_id`, then
POSTed. On failure it stays queued and retries; `occurred_at` and `clock_ms` are captured on
the device, so a delayed sync still lands at the right minute. The unique constraint on
`client_event_id` makes retries safe. The UI shows a discreet "3 actions en attente" badge.

### Data model (main tables)

```
users            id, username unique, password_hash, display_name, is_super_admin
sessions         id, user_id, expires_at
teams            id, name, slug, crest_url, primary_color, secondary_color
team_members     id, team_id, user_id, role ('coach'|'player'), is_player bool,
                 jersey_number, joined_at, left_at null
invites          id, team_id, code unique, role, expires_at, max_uses, uses, created_by

positions        static reference set of 7-a-side positions (GB, DG, DC, DD, MG, MC, MD,
                 MOC, AG, AT, AD) with canonical x/y and a line (GB|DEF|MIL|ATT)
player_positions team_member_id, position_code, preference ('primary'|'secondary')

formations       id, team_id null (null = built-in template), name, label ('1-3-2-1')
formation_slots  id, formation_id, position_code, x, y, order

competitions     id, team_id, label_fr, sort, archived_at   -- the coach's own list (decision 107)
matches          id, team_id, kickoff_at, opponent_name, is_home, venue,
                 competition_id -> competitions (on delete restrict),
                 periods_count, period_minutes (default 30),
                 status ('scheduled'|'live'|'finished'), operator_user_id,
                 entry_mode ('live'|'retro')
match_availability   match_id, team_member_id, status ('yes'|'no'|'maybe'), note, updated_at
match_squad      match_id, team_member_id, role ('starter'|'substitute'|'supporter')
lineups          id, match_id, formation_id, from_minute, is_initial,
                 applied_event_id null       -- set when actually applied in game mode
lineup_slots     lineup_id, formation_slot_id, team_member_id
match_events     (above)
match_player_stats  match_id, team_member_id, minutes, goals, assists, own_goals,
                 fouls, clean_minutes, was_gk_minutes, conceded_while_on

trainings        id, team_id, starts_at, venue, note
training_availability  training_id, team_member_id, status
training_attendance    training_id, team_member_id, present bool, marked_by

injuries         id, team_member_id, started_on, expected_return_on null, note,
                 declared_by, resolved_on null

ratings          id, match_id, rater_member_id, rated_member_id, score 0..10,
                 comment null, created_at
                 unique(match_id, rater_member_id, rated_member_id)
```

`positions` is a fixed reference set so that a player's preferences are meaningful across
every formation. A `formation_slot` maps to a `position_code`, which is how "Julien prefers AT"
gets matched to "slot 4 of 1-3-2-1 is an AT" when the coach builds a composition — the editor
highlights players who want that position.

### Permissions

A single helper, unit-tested, used by every Server Action:

```
lib/auth/can.ts   can(user, action, { team, match })
```

- **super admin** — everything, on every team; appoints coaches; seeded from an env var on first boot.
- **coach** — manages their team: squad, invites, appoints other coaches, matches, trainings,
  formations, compositions, runs game mode (or designates an operator), declares injuries,
  marks training attendance. A coach who is also a player does everything a player does.
- **player** — declares their own availability, sets position preferences, declares their own
  injury, rates teammates after a match they played in, reads all team data.
- **no team** — the only accessible screen is "rejoindre une équipe" (enter an invite code).
  Enforced in a layout guard, not per page.

---

## Screens

Mobile-first, a bottom tab bar on phones (Calendrier · Équipe · Stats · Moi), a sidebar on desktop.

1. **Connexion / rejoindre** — login, join via invite code, set password.
2. **Calendrier** — chronological list of matches and trainings, next event pinned at the top
   with a big "Je suis dispo / pas dispo" control. Past events show the score.
3. **Match (à venir)** — opponent, kick-off, venue, competition; availability grid for the whole
   squad; for the coach: selection (titulaire / remplaçant / supporter), compositions, and the
   list of players who haven't answered.
4. **Éditeur de composition** — the turf pitch. Players are dragged from a bench strip onto
   slots; dropping a player on an occupied slot swaps them. A formation picker at the top, and a
   "créer une formation" mode that drags the empty slots themselves. The coach can add further
   compositions "à partir de la 30ᵉ minute" — the app shows the deduced changes as a diff
   ("Ali → Momo, Karim passe MC → AT").
5. **Mode jeu** — big clock at the top, the turf pitch with the current eleven, the bench below,
   one large **ACTION** button opening a bottom sheet (But / But encaissé / CSC / Penalty /
   Changement / Changement de poste / Faute / Blessure), plus a **TERRAIN** button that opens the
   drag-and-drop pitch for fast multi-player changes with one confirmation. At each planned
   composition minute a prompt appears: it opens the pitch **pre-filled with the plan**, flags any
   player who is injured or already off in red, and waits for the coach's confirmation — a plan is
   a suggestion, never auto-applied. A scrollable timeline of events with per-event "annuler".
6. **Match (terminé) — le moment de fête**: score, scorers, man of the match derived from the
   ratings, the minute-by-minute timeline, minutes played per player. Plus the ratings prompt.
7. **Notation** — one teammate per card, 0–10 slider or number pad, optional comment, swipe to the
   next. You cannot see anyone else's ratings until you've submitted your own (stops copying and
   anchoring). Open until the next match kicks off.
8. **Saisie rétroactive** — for matches already played: score, scorers, assists, who played and
   how long, without game mode. Also the fallback if the phone dies mid-match.
9. **Équipe** — squad list with jersey numbers, preferred positions, injury badges; invite
   management, coach appointment (coach view).
10. **Profil joueur** — the position picker (tap the positions you want on a pitch diagram, mark
    one as primary), injury declaration, and personal stats.
11. **Stats** — per player: matches played, minutes, goals, assists, own goals, GK clean sheets,
    clean minutes, appearances as starter / substitute / GK / supporter, training attendance rate,
    average rating received. Per team: results, form, top scorers, top rated. Filterable by
    competition.
12. **Entraînements** — calendar, availability, and a fast "présent / absent" toggle list for the
    coach on the day.

---

## Files to create

```
app/                      routes, per the screens above
  (auth)/connexion, rejoindre
  (app)/calendrier, match/[id], match/[id]/jeu, match/[id]/notation,
        equipe, joueur/[id], stats, entrainements, moi
  api/match-events/route.ts        idempotent event ingestion for the outbox
db/schema.ts              Drizzle schema (the tables above)
db/migrations/            generated SQL, committed
db/seed.ts                a fake team with 13 players, 3 matches, events — for development
lib/match/reducer.ts      pure reducer: events → match state   ← most tested file
lib/match/lineup.ts       diff two compositions → list of substitutions / position changes
lib/match/clock.ts         continuous-minute computation with pauses
lib/match/outbox.ts       IndexedDB queue + retry
lib/auth/                 password hashing, sessions, can.ts
lib/stats/                season aggregations
components/pitch/         Pitch (turf SVG), PlayerDisc, SlotTarget, DragLayer
components/action-sheet/  the ACTION bottom sheet
docs/PROJECT.md           the vision and the rules of the app, in French
docs/DATA_MODEL.md        tables and invariants
docs/DECISIONS.md         ADR log, starting with the table at the top of this plan
docs/ROADMAP.md           milestones and what is done
docs/SESSIONS.md          append-only: what each working session changed
CLAUDE.md                 how to work on this repo, conventions, where to read first
```

`docs/` + `CLAUDE.md` + `db/migrations/` are what make the project resumable from a fresh
Claude session. Updating `docs/DECISIONS.md` and `docs/SESSIONS.md` is part of every change,
not an afterthought.

---

## Milestones

Each one ends with something usable, and with `docs/ROADMAP.md` and `docs/SESSIONS.md` updated.

- **M0 — Foundations.** Next.js + Tailwind + Drizzle + Neon, light/dark theming, PWA manifest,
  `docs/`, `CLAUDE.md`. Auth: signup via invite, login, sessions, `can.ts`. Teams, memberships,
  invite codes, coach appointment, the "no team" guard. Seed script.
- **M1 — Squad & profiles.** Squad list, jersey numbers, the position picker on a pitch diagram,
  injuries (self- and coach-declared).
- **M2 — Calendar.** Matches (with competition type) and trainings CRUD, availability declaration,
  the coach's non-responders list, training attendance marking.
- **M3 — Compositions.** Built-in 7-a-side formation templates, custom formations, the turf pitch
  drag-and-drop editor, match-sheet selection (titulaire / remplaçant / supporter), planned
  compositions at minute X with the deduced-changes diff.
- **M4 — Game mode.** Clock with pause and continuous minutes, the ACTION sheet, event ingestion,
  outbox queue, planned-composition prompts, TERRAIN fast-change mode, event timeline with void,
  final whistle and freezing of `match_player_stats`.
- **M5 — Stats.** Player and team stats, GK clean sheets and clean minutes, competition filters.
- **M6 — Ratings & recap.** The rating flow, derived man of the match, the celebratory post-match
  recap screen.
- **M7 — Retro-entry & amendments.** Backfill past matches; append amendments to finished matches.

---

## Verification

- **Unit (Vitest) — `lib/match/reducer.ts`**, from hand-written event fixtures:
  minutes played across several substitutions; a player who comes on and goes off again;
  position change without substitution; score with own goals and penalties; GK clean-sheet
  minutes when the keeper changes mid-match; clean minutes for a field player who was off when
  the team conceded; a voided goal not counting.
- **Unit — `lib/match/lineup.ts`**: diffing two compositions produces the right substitutions and
  position changes, including the chained case from the notes (the striker moves to midfield, the
  substitute comes on as striker, the midfielder goes in goal, the keeper comes off).
- **Unit — `lib/auth/can.ts`**: a player cannot select a squad; a coach cannot touch another team;
  a user with no team reaches nothing but the join screen.
- **End to end (Playwright)**: seed a team → coach logs in → creates a match → two players declare
  availability → coach selects the squad and builds a composition plus one planned change at 30' →
  starts game mode → logs a goal with an assist, a goal conceded, and applies the planned change →
  final whistle → score and minutes played are correct → a player submits ratings → the recap
  shows the man of the match.
- **Offline behaviour, by hand**: open game mode, disable the network in devtools, log three
  events, re-enable — the three events land once each, at the right minutes, with no duplicates.
- **On a real phone**: `vercel deploy` a preview, then run through a full match on an iPhone and an
  Android in daylight. Check the turf pitch is legible outdoors, the ACTION button is reachable
  one-handed, and dragging a player onto a slot works with a thumb.

---

## Amendments

Appended after the plan was approved, newest batch last. A batch records work the plan did not
anticipate and the evidence it rests on. It does not rewrite the sections above; where it contradicts
one, it says so.

### UX audit of the preview deployment — 2026-10-01

**Evidence.** `docs/UX_AUDIT_2026-10-01.md`, committed in #122. Every claim below has a measurement, a
screenshot and a file-and-line reference there; this batch carries the work items and the ranking, not
the proof. Read the report before implementing any slice — several fixes are one line in a place that
is not where the symptom appears.

**What it was.** Eight parallel audits drove `dev.7orteils.bgonzva.fr` at 390×844 and 320 px, light and
dark, Chromium and WebKit, as a coach and as a player, with writes allowed on data the audits created
themselves. 52 defects, 11 scope questions, 8 absences, 24 properties worth protecting, 13 stated
limits. Four seeded states were declared observe-only. Measured on `646b830`, re-checked against
`b5a6ddb` (#114) and `c0bfab6` (#119); nothing in it was already fixed.

**One finding that changes the plan rather than adding to it.** The report's `D1`, `D3`, `D18` and `D30`
are all the same shape: **a mutation reports success, or reports a refusal, and destroys or discards what
the user typed in the same breath.**
The plan's verification section tests the reducer, the lineup diff and permissions — the pure logic —
and walks one happy path end to end. None of those four defects fails a single existing test, and all
four are reachable in two taps on a documented path. The gap is not coverage of the logic, it is that
**nothing tests a second submit of a form the server has already re-rendered.** Slice 10 below is the
amendment to « Verification », and it is the one item here that is about the plan rather than the code.

#### Ten slices, ranked by harm

**Slice 1 — Stop losing attendance.** `D1` (« Tout le monde est là » writes 13 rows, leaves 13 radios
reading « — », and the next save deletes eleven of them — uncontrolled `defaultChecked` in a Server
Component is not reset by reconciliation after `revalidatePath`), `D4` (losing signal discards the whole
list and offers a « Réessayer » that cannot work), `A4` (no outbox, though game mode has one), `A3` (no
pending state on either save button). Make the shortcut a second `<button formAction>` inside the single
form so there is one submit model and no way to hold stale radio state. **Done when** the four-step
sequence in `D1` is a passing test and an offline pointage survives a reconnect.

**Slice 2 — Acknowledge the tap, everywhere, from one token.** `D2`: instrumented from `pointerdown`,
"first DOM change after tap" and "new screen content" are the same number in all eighteen throttled
samples; the served stylesheet contains **no `:active` rule outside a `pointer-events` utility block**.
TTFB is 3–27 ms, so this is not a speed problem and making navigation faster will not fix it — which is
why the `lhr1` region pin (decision 111), which worked, did not help. #114 (decision 123) adds the first
such surface on the bottom nav; the comment at `components/nav/bottom-nav.tsx:22` is the reference
implementation. Also `D47`, `A3`. **Done when** the acknowledgement comes from one shared utility applied
to every control, rather than per-screen patches — « survivors, not coverage » is the failure mode to
avoid repeating.

**Slice 3 — Make the match sheet and the composition editor safe to use.** `D3` (the sheet saves 6 or 8
starters silently, and a role change empties composition slots with no warning), `D14` (the editor opens
with 193–221 px of the pitch behind its own dock: zero of seven slots tappable without scrolling, and a
drag aimed at midfield is read as "return to bench"), `D15` (deleting a composition is a ghost button
8 px from « Modifier », no danger styling, no confirmation), `D19` (« Aucun changement. » printed for an
incomplete plan, when `draftChangesPendingFr` exists for exactly this case and only the editor calls
it), `D20` (the starter count is always one save behind), `D51`. **Done when** `starters === 7` is a
schema rule and the pitch is above the dock on mount at both 390 and 320 px.

**Slice 4 — Guard the live match.** `D5` (« Fin du match » ends only the period, and `PERIOD_END` emits
with no confirm while `FINAL_WHISTLE` gets a sheet — one stray tap freezes the clock, recoverable only by
appending a `VOID`), `D6` (retro entry creates the scorer field 487 px below the button that creates it;
the auditor saved without noticing and recorded « buteur non renseigné »), `D18` (every `<select>`
visibly blanks after a rejected save while the data is still there), `D22` (a half-filled substitution is
rejected by « Ce joueur n'est pas valide. » 650 px from the row at fault), `D34`, `D41`, `D52`. **Done
when** no destructive or clock-affecting action in game mode is a single unconfirmed tap, and every
server-side refusal lands on the row that caused it.

**Slice 5 — Stop the calendar and the hub stating things that are not true.** `D9` (the chronologically
next match is filed under « Déjà passé » and no one can answer availability for it), `D10` (a match
« terminé » 17 days in the future loses its « Ta réponse » and « Disponibilités » cards entirely),
`D11` (a match with an empty event log asserts « Saisi sans composition » and offers « Voir le résumé »
above « Saisir le match »), `D37`. All four are consequences of decision 121 — a match can be declared
over — meeting `isPast`, so they are one condition, not four fixes: **availability is open iff the match
is neither finished nor kicked off, and "finished" and "played" are different facts.** Decision 120
already established that a rule like this belongs in one place asked by all its callers.

**Slice 6 — Ratings.** `D7` (eleven cards, both controls 253 px below the fold, and partial progress is
lost on navigation with no guard — note the asymmetry: game mode protects the coach's taps with an
IndexedDB outbox, the rating sheet's 23 taps have nothing), `D13` (the recap labels substitutes « entré
en jeu » who never came on and contradicts its own minutes table one scroll down — `playedLabelFr` exists,
is regression-tested, and was applied to `/notation` and not `/recap`), `D21`.

**Slice 7 — The way in.** `D16` (the coach generates a code, the card tells him to send it on WhatsApp,
and the app never builds the link — `/rejoindre?code=…` works), `D17` (`/rejoindre` names neither the team
nor the role), `D31`, `D30`, `A7`. Plus `A6` as the largest single opportunity in the area: nothing
welcomes a new member, and his first screen is « 14 sans réponse » and a column of « Sans réponse »
badges. One sentence naming the team he just joined and one suggested first action.

**Slice 8 — Roster, profiles and the self-inflicted footgun.** `D8` (a coach can demote himself out of
the app with one tap; the removal card twenty lines below correctly carries `&& !isSelf` and the role
button does not), `D29`, `D32`, `D33`, `D35`, `D36`, `D43`, `D44`, `D45`.

**Slice 9 — Errors, readability and copy.** `D24` (a malformed id is HTTP 500 and the crash boundary;
`/equipe` gets the same case right, so it is a slip, not a gap — and « Réessayer » cannot ever work
there), `D48` (the only vouvoiement left in the app is on that crash screen), `D38` (9 px and 10 px type
carrying load-bearing information), `D39`, `D40`, `D42`, `D46`, `D49`, `D50`.

**Slice 10 — Amend « Verification ».** Add to the plan's test list: a **second submit** of a form whose
Server Component has re-rendered after `revalidatePath` (the `D1` family, which no current test can
catch); a unit test over the French string modules asserting **no second-person-plural imperative**, with
an explicit allow-list — decision 074 is a convention with no test, which is why « Réessayez » shipped
and why the audit's own first sweep missed it; and a shape guard on every `[id]` route, since `D24` is a
missing `uuid` check rather than a missing branch.

#### Eleven questions for the owner — unanswered, and not to be resolved by a developer

These are in the report as `S1`–`S11`. They are listed here so the plan records that they are open, with
no default implied: `/stats` at 6658 px opening on its own footnotes · the shrinkage estimator seating
five players who scored nothing in « La meilleure équipe », and estimates not being marked as estimates
at the point of use · eleven font sizes, four off the design scale · « Nouveau match » being the loudest
thing on the calendar · the pointage being last on the page the evening it is the only thing that matters
· « — » being the loudest thing in every attendance row · cancelling a session costing thirteen taps and
a theme field · a player seeing the lineup on `/jeu` but a 404 on `/composition` · the read-only positions
card stating the same fact three times · the match hub's visual primary on an upcoming match being the
action that ends it · and **`S11`: a match played in the app can never be deleted.** That last one is
invariant 1 and decision 003 working exactly as designed — the question is only whether a match with a
typo in its name should be permanent for the season, and the report offers three answers ranked by cost.

#### Eight absences — roadmap, not bugs

`A1` **no way to change a password anywhere, and no admin reset** (this app writes its own auth; a player
who shared a password has no recourse — the one to decide first) · `A2` man of the match computed and
never surfaced · `A3` no pending state on the attendance saves · `A4` no attendance outbox · `A5`
« parti » unexplained on first use · `A6` nothing welcomes a new member · `A7` « Utilisations »
unexplained · `A8` no « (toi) » marker in the leaderboards.

#### Properties to protect — do not refactor these away

The report's `G1`–`G24` exist because several of these are better than commercial equivalents and are
cheap to lose in a refactor that looks like a simplification. The four that would cost the most:

1. **The app refuses to state a number it cannot justify** (`G1`), naming each reason separately rather
   than once and generically. On `/stats`, three distinct caveats; on `/stats/equipe-type`, four. The only
   change the audit asks for is to its rank on the page (`S1`), never its content.
2. **The permission model holds at the door** (`G13`, the strongest result): eight coach-only routes, an
   honest 404 on each naming the real reason, zero leaked controls in the DOM, and zero links anywhere to
   a door a player cannot open.
3. **The append-only log is explained to the user, not merely honoured** (`G21`): « Une correction ne
   réécrit rien : l'action fautive est annulée et la bonne est ajoutée. Les deux restent dans le déroulé. »
4. **The no-JavaScript paths work** (`G23`), which is why #114's `<Suspense>` boundary on `/stats` was
   withdrawn rather than patched (decision 123) — a streaming boundary ships the fallback in the HTML, and
   it engages only when the query outruns the shell flush, so the slow case loses the no-JS path while the
   fast case keeps it. Any future boundary on a screen whose controls must work without JavaScript inherits
   that argument.

Also: the offline queue is genuinely idempotent, verified by replay (`G22`); retroactive entry is the
best-written feature in the app, and the sentence quoted at `G20` is the model every caveat in this
product should follow.

#### What the audit could not establish

Thirteen limits are stated in the report. The three that matter for anyone acting on this batch: **no
real iPhone** (CDP throttling, not a phone at a touchline — the owner's device is 393×852 at DPR 3, and
the audit ran at 390×844), **contrast was not measured with a meter**, and **five findings were raised
and then disproved** — a theme-drift bug that was a concurrent write on the shared preview database, an
arithmetic contradiction that was a documented shrinkage estimator, escaped markup that was a
`<noscript>` fallback, and two contrast blockers measured against a 15 %-alpha colour as though it were
opaque. Those five are kept in the report deliberately: the method that produced them is the same method
that produced the other 52, and a reader needs to see where it failed.

**Owner action, outside any slice.** The preview database holds an orphaned `users` row for `auditg` and
three matches named « UX Audit H », « UX Audit H retro » and « UX Audit H retro 2 »; the ids are in the
report's final section. The matches cannot be removed through the UI and should not be — `deleteMatch`
refuses once an event log exists — so clearing them is a manual `DELETE` and the owner's call.
