# Football Manager — plan de conception

## Rework from the cahier des charges — 2026-10-09

**This section is the current plan; everything below it is the original design, kept because it
explains why the app is shaped the way it is.** Where the two disagree, this section wins, and each
point it changes is recorded as a decision (145 onwards) rather than edited out of the text below.

After two real matches the owner wrote **[`cahier-des-charges.md`](../cahier-des-charges.md)** (repo
root, French): a review of the whole product. It asks for a GitHub Project holding all the work, then a
rework that **removes** what the team does not use — trainings, availability, the reminder message, the
separate match sheet, every formation but one, position changes, preferred positions on the profile —
and **rebuilds** game mode around unpaired group changes and tap-a-player actions, restricts who may
rate, gives preferred positions to coaches only, and rebuilds the statistics and the équipe type around
goals, assists and goals conceded. It also reports one bug.

**Line 1 of the cahier is a working rule, not a feature:** ask the owner when in doubt rather than
improvise; and **no production tag during this rework** — everything lands on `main` and the preview
(`dev.7orteils.bgonzva.fr`), which is « latest ». Production stays on `v1.0.0-beta.10` (decision 146).

### Where the work is tracked

The GitHub Project **« Football-manager »** (`gh project view 5 --owner avznog`) holds every merged pull
request as **Done** and one issue per slice below, labelled `cahier-des-charges`. A slice's issue moves
to *In progress* when its branch is pushed; its pull request says `Closes #<issue>`, so the merge lands
it in *Done*. **Read the board before starting work on another machine** (decision 146).

### The owner's answers

| # | Question | Answer |
|---|---|---|
| Q1 | Past work on the board | the merged pull requests themselves, as Done cards — no issues written after the fact |
| Q2 | Tagging | **no production tag** for now; preview only |
| Q3 | Where the plan lives | here + `docs/ROADMAP.md` + one issue per slice |
| Q4 | Positions | exactly **GB, DC, MC, AIL, AT** — a new « Ailier » `AIL` replaces `MG`/`MD`: two slots, one position |
| Q5 | Trainings and availability data | **drop the tables** (production holds 0 trainings, 5 answers) |
| Q6 | A position swap with nobody coming on | through **« Changement » with 0 in / 0 out**, ending on the drag & drop pitch |
| Q7 | Statistics | **ratings stay** (a fourth équipe type, the notes leaderboard); **impact at a position = goal difference while he played there, per 60′, smoothed** |
| Q8 | The légende goalkeeper | refused if **worse than the squad's average keeper** (goals conceded per 60′ in goal, smoothed) |
| Q9 | The starting composition | applied **as soon as game mode opens**, by a coach or operator — never by a viewer |
| Q10 | Old preferred positions | **mapped**: `DG`/`DD` → `DC`; `AG`/`AD`/`MG`/`MD` → `AIL`; `GB`/`MC`/`AT` unchanged |

### What this plan decided on the owner's latitude

The cahier invites a better idea in one place (« si tu as une meilleure manière, fais donc ») and is
silent in others. These are the choices taken, each recorded as a decision:

- **A goal conceded just before a change counts against the players who were on** — not by moving the
  change to the next minute, which invents a minute nobody played, but by one ordering rule in the
  reducer: at an identical clock reading, facts come before pitch events, segment by segment between
  clock events. Live stamps are millisecond-precise, so the goal tapped first already wins; the rule is
  for minute-granular entries (decision 147).
- **A group change is one `LINEUP_APPLIED`**: the whole pitch after the change, stamped at the reading
  of the ACTION tap. Who goes in and out is a step of the screen; the event says where everybody
  stands, so positions are always known, and the reducer already turns a snapshot into leave / move /
  enter. No new event type, no migration, and the paired `SUBSTITUTION`s already in production keep
  reducing exactly as they do (decision 147).
- **Applying the composition on open must not freeze it.** Until kick-off, a composition that was only
  applied automatically stays editable and game mode re-applies the newer version. A re-composition by
  hand in game mode wins and stops the automatic one. This rides slice S9.
- **Who may be rated is unchanged** — minutes > 0, never yourself. Only who may *rate* changes.
- **Non-negotiable invariant 3 of `CLAUDE.md`** (« a planned composition is never applied
  automatically ») is superseded by Q9. The decision and the change to `CLAUDE.md` ride slice S9, so the
  rule changes in the same pull request as the behaviour.

### The slices, in order

One branch, one pull request, squash-merged on green CI. Several run at once in separate worktrees; the
grouping exists because they would otherwise edit the same files.

| Slice | Issue | What |
|---|---|---|
| S1 `fix/void-starting-lineup` | #160 | « appliquer la compo → annuler → le terrain a disparu »: voiding the starting composition empties the pitch for good |
| S2 `feat/remove-trainings` | #161 | trainings, attendance and their statistics; tables dropped |
| S3 `feat/remove-availability` | #162 | match availability and the « relance » message; table and enum dropped |
| S4 `feat/single-formation` | #163 | one formation, `1-2-3-1`, with `AIL`; the picker and custom shapes go; old wishes mapped |
| S5 `feat/coach-positions` | #164 | preferred positions set by coaches only, off `/moi`, used by statistics only |
| S6 `feat/composition-sheet` | #165 | the composition page is the only selection step: the pitch, then remplaçant / supporter / — below |
| S7 `feat/game-mode-menu` | #166 | four actions — But, But encaissé, Changement, Autre; « Sifflet » replaces « Fin » |
| S8 `feat/group-changes` | #167 | unpaired group changes ending on the drag & drop pitch, the ordering rule, tap a player to act |
| S9 `feat/auto-apply-composition` | #168 | the starting composition applied when game mode opens |
| S10 `feat/post-match-changes` | #169 | adding a change after the match, refused when it is not realistic |
| S11 `feat/rating-eligibility` | #170 | only starters, substitutes and supporters of that match may rate |
| S12 `feat/stats-data` | #171 | goals for while on, minutes per position; the stats and rankings the cahier lists; impact per position |
| S13 `feat/equipe-type` | #172 | offensive, défensive, « 7 de légende », notes — on the coach's positions and the one formation |

The detail of each slice is in its issue. Every slice meets the definition of done in `CLAUDE.md`; the
role-dependent screens of this rework (composition, `/joueur/[id]` positions, notation, game mode) are
looked at as coach and as player in one pass.

---


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

### Fourth batch from the beta on the owner's iPhone — 2026-10-01

The owner installed the beta and used it as a coach would. Four things came back, and they are a
different kind of thing from the three earlier batches: those were almost entirely screens stating
something untrue, and two of these four are **scope** — the plan asked for something, the something
got built, and the something is wrong. That is why they are here and not only in `docs/ROADMAP.md`.

Two of the four also turned out, on reading the code, to be **narrower than the words suggest**, and
both are written up below as what they actually are rather than as what they first sounded like. That
is deliberate: a remark acted on literally, when the literal reading is already satisfied, produces a
diff that changes nothing and a session that believes it shipped something.

**1. Retro-entry is one list of actions, and its score is derived.** Amends screen 8 and the « Starting
point » row of the planning table.

Screen 8 asks for « score, scorers, assists, who played and how long », and that is what was built —
but as **three** stacked cards: a « Score » card at the top with two big add-a-goal buttons, then
« Changements », then « Actions du match », each with its own « + Ajouter » in its header. The four
remarks are one redesign of that, and taking them one at a time misses it: there is **one** list of
actions, and **one** add button, underneath it.

- **The score card stops being the way goals are entered.** Read the first remark and the second
  together and they are the same remark. `retro-form.tsx` already derives the scoreline from the rows
  through `reduceMatch` — the score is *not* typed anywhere in this repository and never was, and the
  file's own header says so. But the control that *adds* a goal is a pair of buttons inside a card
  titled « Score », sitting above everything else, and from a thumb that is indistinguishable from
  editing the score: tap, the number goes up. That is what « we must not be able to edit the score
  directly » is pointing at. So the « Score » card keeps the derived scoreline and **loses its two
  buttons**; a goal is added from the action list like every other action, which is the only place it
  can carry the scorer the card never asked for.
- **The add button goes under the list, not over it.** Both « + Ajouter » buttons are passed as the
  `Card`'s `action` prop, and `Card` renders that in its `<header>`, above the children. Typing up a
  match is a loop — add an action, add the next — so the control that starts the next iteration must
  be where the last one left the thumb. Above a growing list it walks backwards up the screen on
  every single action. Cheap to fix, and only sensible once there is one list rather than three.
- **A substitution is just another action.** Two blocks exist because a change and a goal felt like
  different kinds of thing when the screen was drawn. They are not: both are one row appended to one
  event log at one minute, and `buildRetroLog` has always emitted a change as an ordinary
  `SUBSTITUTION` event. One block, one list, one add button. Note the internal representation can
  stay as it is — `retroPitch`, `findRetroIssues` and the minute-defaulting are all built on
  `entry.changes`, and the merge the owner asked for is a merge of the **screen**, not of the model.
- **The same actions as in game mode**, which is *not* every `MatchEventType`, and the gap is smaller
  than it sounds. Against game mode's tiles, retro-entry is missing `SUBSTITUTION` (the bullet above)
  and `POSITION_CHANGE`. Three things stay as they are, deliberately: `FOUL` is offered in retro and
  is **not** a game-mode tile (decision 114 removed it there, on purpose — so « the same set » cannot
  mean « identical »), and `REMARK` and `COMMENT` are **live-only by design**, which `RETRO_FACT_TYPES`
  and `isAmendableEventType` both already state. Whether a remark made from memory a week later is
  worth recording is a product question the owner has not answered; it stays open under M4 rather
  than being answered by an array literal.
- **The case this redesign makes easier to reach, and which belongs in the same slice:** a match typed
  up with no actions at all. It says it has nothing recorded. It does **not** print « 0 – 0 » — that
  is the defect the third batch already paid for once.

**2. Dates are DD/MM/YYYY and times are 24h, everywhere.** Amends nothing above; the plan never said.

**Audited, and every surface the app formats itself already complies** — so this item is not the
change it looks like. Decision 109 made `DD/MM/YYYY` the one shape, `lib/calendar/time.ts` is the only
module that formats an instant, `lib/player/injury.ts` the only one that formats a `date` column, all
twenty-odd call sites go through them, 24h is pinned twice over (`fr-FR` **and** an explicit
`hour12: false`) and the tests assert the literal strings. There is no `toLocaleDateString` in the
repository and no month-name array left.

**Which leaves exactly one surface that does not comply, and it is the one the owner was almost
certainly looking at:** the five native pickers — `<input type="date">` in the three injury forms and
`<input type="datetime-local">` in the match and training forms. A native control renders in the
**browser's** locale, not the app's, so on a phone set to English the owner sees `MM/DD/YYYY` and an
AM/PM clock in the one place the app cannot reach with a formatter. Decision 109 saw this and declined
to act — « replacing the native control with our own is a real change with a real cost — offered to the
owner, not taken ». This batch is the owner coming back to that offer, so it needs answering rather
than re-declining: the native control is still the best thing under a thumb, so the app prints the
value it holds underneath it in its own one shape instead of replacing it.

**3. Preferred positions belong to the player, and there are seven of them.** Amends screens 9, 10
and the Permissions section.

- **The coach cannot edit them.** The Permissions section already says a player « sets position
  preferences » and does not grant it to the coach — so this is the plan being enforced rather than
  changed. A preference is a statement about what someone wants to play, and the only person who can
  make that statement is the person it is about. The coach has the composition editor for what he
  wants; that is a different question with a different screen.
- **Seven positions, in two shapes, not eleven.** The picker offers an eleven-a-side pitch to a team
  that plays seven. A player cannot prefer a position his team never fields. The two shapes the team
  actually plays are **GK + 2-3-1** and **GK + 3-2-1**, so the picker offers the union of their slots
  and nothing else. Note this is about the **preference picker only** — the « custom formations » of
  the planning table and the composition editor's own templates are a separate surface and are not in
  scope here.
- **It crashes on select-and-save**, reported from the phone. The first crash in the beta rather than
  a wrong sentence. The reproduction is worth writing down even if the fix is one line.

**4. A tap on the bottom tab bar is acknowledged, and is not dropped.** Amends screen 1's tab bar.

The owner's wording has two halves and only one of them is latency: « there is always a delay », and
« sometimes nothing happens, I need to click a few times ». The second is a tap that did not do what
it looked like it did, and no amount of making a navigation faster fixes it.

**The measuring is already done and must not be repeated.** PR #111 changed no production code on
purpose: it measured, and the numbers are in `docs/SESSIONS.md` under « Where the two seconds on the
iPhone actually are » — 31–35 ms of server think time per tab, 126–217 ms tap-to-heading unthrottled,
844 ms for `/stats` under CPU ×4 with a 100 ms RTT, and a 1.54 s cold start that is infrastructure and
the owner's to fix. (Separately, decision 111 pinned the functions to `lhr1`; it is an older entry
that happens to share the number with the pull request, and it is not #111's write-up.) It also
cleared all four iOS suspects the brief named, each against a file. So what is left is building what
it prescribed, in its order:

- **Acknowledge the tap. Done — #114, decision 123.** The owner's observation was true when he made
  it: `components/nav/bottom-nav.tsx` had no pressed state at all, while every `Button` variant in the
  repo had an `active:` class, and `useLinkStatus` appeared nowhere. Both halves are now false, which
  is the point — `active:bg-surface-2` and a `useLinkStatus` pending indicator both landed in #114.
  Kept here rather than deleted because the remark is the provenance of the fix, and a reader who
  only sees the fix cannot tell which items came from the owner on a phone.
- **And this is the dropped tap, with a measurement behind it rather than a guess.** #111 found that
  under CPU ×4 a tap landing *before hydration* produced a full native document navigation in five of
  five samples on Calendrier. The bar is a client component reading `usePathname`, so until it
  hydrates a tap is a cold page load whose first paint is seconds away with nothing on screen. That
  is « I click and nothing happens », and the fix is the same one, now shipped with the bullet above:
  **a pressed state renders before hydration, a router pending state does not.** Two device-only
  suspicions stay written down rather
  than acted on — iOS Safari's own bottom toolbar eating the first tap under `viewportFit: "cover"`,
  and `html { overflow-x: hidden }` against a `fixed` bar — because neither can be settled from
  source and both are outside the four #111 cleared.
- **A `<Suspense>` boundary on `/stats` — proposed here, built, measured, and withdrawn. Do not
  re-open it from this line.** 844 ms made it look like the one screen where streaming pays, and the
  observation that the repository has zero `loading.tsx` files and zero `<Suspense>` boundaries is
  still true today. It is true *because* the boundary was reverted: it ships the fallback in the HTML
  and engages only when the query outruns the shell flush, so it would have broken the no-JavaScript
  path in the slow case and kept it in the fast one. The full argument is four screens below, under
  « Properties to protect » item 4, and in decision 123 — read it there before proposing a boundary
  anywhere, because the reason is not « no streaming on these screens ».
- **`Promise.all` on the two tab pages #111's audit left on the table** — `/stats` and `/moi` each
  await two independent queries in sequence. Seventeen of twenty-one pages already do this. It is
  worth a few tens of milliseconds and it will not be described as the fix for anything, any more
  than #111 would let the auth-prefix joins be.

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
implementation **for the CSS and not for the scope** — it acknowledges one surface because that was the
slice, so copy its `-webkit-tap-highlight-color` reasoning and not its decision to stop at one component. Also `D47`, `A3`. **Done when** the acknowledgement comes from one shared utility applied
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
   withdrawn rather than patched (decision 123). **The argument is not « no streaming on these screens »,
   and shortening it to that leaves a rule nobody can reason with.** It is this: a streaming boundary ships
   the *fallback* in the HTML and swaps the real content in with an inline script, and it **engages only
   when the query outruns the shell flush** — so the fast case keeps the no-JavaScript path and the slow
   case loses it. **The normal case would have been the broken one**, which is worse than a uniform
   limitation, because a uniform limitation is a trade-off somebody can accept and an intermittent one is
   not. A boundary on a screen whose controls must work without JavaScript has to answer *that*, and a
   boundary whose fallback is honest and whose screen does not depend on JS-free controls is not
   forbidden by this at all.

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
