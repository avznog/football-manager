# Data model

The authoritative definition lives in `db/schema.ts` (Drizzle). This document explains the
**intent and the invariants**, which the schema alone cannot express. Keep it in sync.

All tables use `uuid` primary keys with `gen_random_uuid()` defaults and `timestamptz` timestamps.

## Identity and membership

### `users`
`id`, `username` (unique, lowercase), `password_hash` (argon2id), `display_name`,
`is_super_admin`, `created_at`.

A user is a person, independent of any team. Usernames are unique app-wide because there is no
email; the username *is* the login.

### `sessions`
`id` (the opaque token, stored hashed), `user_id`, `expires_at`, `created_at`.
Deleted on logout. Expired rows are pruned lazily.

### `teams`
`id`, `name`, `slug` (unique), `crest_url`, `primary_color`, `secondary_color`, `created_at`.
Colours are used for kit discs and the team header only — never as the app's accent
(decision 014).

### `team_members`
`id`, `team_id`, `user_id`, `role` (`coach` | `player`), `is_player`, `jersey_number`, `shirt_name`,
`joined_at`, `left_at`.

> **This is the central table.** Almost everything else references a `team_member`, not a `user` —
> a person's goals belong to their membership of a team, not to their account.

Invariants:
- unique `(team_id, user_id)` where `left_at is null`
- unique `(team_id, jersey_number)` among active members, when the number is set
- `shirt_name` is the flocage — what is printed on the back of the shirt, often a nickname rather
  than a name. Nullable and null for most members. **No maximum length** — the twelve-character cap
  was removed on the owner's instruction (`0008_true_johnny_storm.sql`), because how short a name has
  to be to print legibly is a decision for whoever orders the shirts. `team_members_shirt_name_length`
  is kept as a lower bound only, `char_length >= 1`, so « no flocage » has exactly one representation
  and no screen has to tell `''` from `null`. Deliberately **not**
  unique: two players may both be floqués « JUNIOR ». Stored as typed and uppercased at display time
  only (`lib/player/shirt.ts`), so a player's own capitalisation survives
- `role = 'coach'` with `is_player = true` means a player-coach: they get both permission sets
- a member with `left_at` set keeps all their historical stats but disappears from selection lists

### `invites`
`id`, `team_id`, `code` (unique, short and human-readable), `role`, `expires_at`, `max_uses`,
`uses`, `created_by`, `created_at`.

Opening an invite link lets someone create an account (or join with an existing one) and become a
`team_member` with the invite's role. Consuming an invite increments `uses` atomically and must
refuse when `uses >= max_uses` or the invite has expired.

## Positions and formations

### `positions` — reference data, never edited by users
`code` (pk), `label_fr`, `line` (`GB` | `DEF` | `MIL` | `ATT`), `default_x`, `default_y`, `sort`.

The 7-a-side vocabulary is **five codes**: `GB`, `DC`, `MC`, `AIL` (« Ailier », line `MIL`), `AT` —
the posts of the one formation (decision 157). The table also still holds the seven retired codes
(`DG`, `DD`, `MG`, `MD`, `MOC`, `AG`, `AD`), because the retired formations' slots reference them; the
app's vocabulary (`db/reference.ts`) no longer contains them and nothing offers them.
Coordinates are integers `0..1000` on a vertically-oriented pitch, `y = 0` at our own goal line.

This table is the reason position preferences are meaningful: a player says "I want to play AT",
and any formation containing an `AT` slot matches.

### `formations`
`id`, `team_id` (**null = built-in template, shared by every team**), `name`, `label`
(e.g. `1-2-3-1`), `created_by`, `created_at`.

**One formation is offered: the built-in `1-2-3-1`** — GB, DC, DC, AIL, MC, AIL, AT (decision 157). Every
composition is saved on it; the editor and game mode offer no choice and no way to draw a shape. The six
other built-ins and any team-drawn rows stay in the table, unoffered, because an old `lineups.formation_id`
or an old event's slot id may reference them — which is also why game mode and the stats still load
every formation's slots.

### `formation_slots`
`id`, `formation_id`, `position_code`, `x`, `y`, `sort`.
Exactly 7 slots per formation, exactly one with `position_code = 'GB'`.

**The seven built-ins are seeded by a migration**, `0009_seed_formations.sql`, exactly as the eleven
`positions` are by `0006_seed_positions.sql`. `db/migrate` alone therefore leaves a database with 11
positions, 7 formations with `team_id is null` and 49 slots, and the composition editor works on it —
`seedReference()` is no longer the only writer of those rows. It had been, and production had never
run it, so `/match/<id>/composition` and `/match/<id>/saisie` both said « Les formations types n'ont
pas été chargées dans la base » and no composition could be made at all. Both seed migrations are
idempotent and insert-only: `db/reference.ts` stays the single source of truth and `seedReference()`
still owns every later change to a label or a coordinate (decision 141). `0012_single_formation.sql`
adds `AIL` and rewrites the built-in `1-2-3-1`'s `MG`/`MD` slots to `AIL` in place (same ids), since the
seeder will not touch slots a composition uses.

### `player_positions`
`team_member_id`, `position_code`, `preference` (`primary` | `secondary`).
At most one `primary` per member. Set by the player on their profile by tapping a pitch diagram; any of
the five codes may be wished for (decision 158). `0011` mapped older rows onto them — DG/DD → DC,
AG/AD/MG/MD → AIL, MOC → MC — collapsing duplicates per member and keeping `primary` over `secondary`.

## Calendar

### `competitions`
`id`, `team_id`, `label_fr`, `sort`, `archived_at`, `created_at`.
`unique (team_id, label_fr)`, `index (team_id)`, `on delete cascade` from the team.

**Each team owns its own list** (decision 107). It used to be a Postgres enum of four values, and a
coach could not say that his team plays « Championnat D3 » and the « Coupe du Crédit Mutuel ». The
four old words survive as the defaults every team is created with — `lib/competition/defaults.ts`,
written by `createTeam`, by `db/bootstrap.ts` for a team that has none at all, by the demo seed and
by the e2e fixture — and the coach renames, adds and retires them on `/equipe` (`competition:manage`,
coach only).

`sort` orders the match form's `<select>`: the league is 0, so a new match lands on it.

`archived_at` is the alternative to deleting. An archived competition disappears from the match form
and from nowhere else: its matches keep it, and `/stats` still offers it as a filter as long as it
holds matches. It is the only way to retire « Coupe 2024 » without rewriting a season, which is why
`matches.competition_id` may be `restrict` rather than something softer.

### `matches`
`id`, `team_id`, `kickoff_at`, `opponent_name`, `is_home`, `venue`,
`competition_id` → `competitions.id`, **`on delete restrict`**,
`periods_count` (default 2), `period_minutes` (default 30),
`status` (`scheduled` | `live` | `finished`), `operator_user_id`,
`entry_mode` (`live` | `retro`), `created_by`, `created_at`.

The score is **never stored here** — it is derived from `match_events` (decision 003), and frozen
into `match_player_stats` at the final whistle.

`competition_id` is `restrict` and not `set null`: which competition a match was played in is part of
what happened, and a cascade that emptied it would silently rewrite the season of every screen that
reads it. So deleting a competition is refused, by the database and — first, and counted — by the card
on `/equipe`, which offers archiving instead (decisions 098 and 100). Every read carries the label
alongside the id (`competitionLabel`), so a rename propagates to the calendar, the match pages and
`/stats` with nothing to invalidate.

### ~~`match_availability`~~
Dropped by migration `0012`, together with the `availability_status` enum (decision 156, 2026-10-09):
players no longer declare whether they are available, and the coach no longer chases answers.

### `match_squad`
`(match_id, team_member_id)` unique, `role` (`starter` | `substitute` | `supporter`), `created_at`.
The selection — still called « the match sheet » in the code — though there is no sheet screen any
more (decision 165): it is **written by saving the starting composition**. The seven on its pitch are
`starter`, the list under the pitch names `substitute` and `supporter`, and every other member has no
row (« non sélectionné »). A member with `is_player = false` can only be `supporter` (decision 166).
Only members listed here may rate (decision 159), and only `starter`/`substitute` may appear in a
planned change. The retro entry (`lib/retro/actions.ts`) still writes starters and substitutes itself.

### ~~`trainings`, `training_availability`, `training_attendance`~~
Dropped by migration `0011` (decision 155, 2026-10-09): the team no longer manages trainings in the
app. The `availability_status` enum they shared with `match_availability` went with the latter in
`0012` (decision 156).

### `injuries`
`id`, `team_member_id`, `started_on`, `expected_return_on`, `note`, `declared_by`, `resolved_on`.
A member is injured if a row exists with `resolved_on is null`. Injured members are flagged, not
blocked, in selection and in the composition editor.

## The match event log

### `match_events` — append-only, the heart of the system
```
id               uuid pk
match_id         uuid not null
client_event_id  uuid not null unique   -- idempotency key generated on the device
type             match_event_type not null   -- a Postgres enum; see below
period           int not null
minute           int not null           -- continuous: 2nd half of a 2x30 runs 30..60
clock_ms         int not null           -- precise elapsed match time
occurred_at      timestamptz not null   -- captured on the device
recorded_at      timestamptz not null default now()
payload          jsonb not null default '{}'
created_by       uuid not null
voids_event_id   uuid                   -- only set on VOID events
```

Types and their payloads:

| type | payload |
|---|---|
| `KICKOFF` | `{}` — starts a period |
| `PERIOD_END` | `{}` |
| `PAUSE` / `RESUME` | `{ reason? }` — the clock only advances between RESUME and PAUSE |
| `GOAL_FOR` | `{ scorerId?, assistId? }` — the scorer is optional: an opponent own goal counts for us with nobody to credit, and a retro entry often has the score without the scorer (decision 017) |
| `GOAL_AGAINST` | `{}` — no opponent detail (decision 010) |
| `OWN_GOAL` | `{ scorerId }` — counts against us, not as a goal for the player |
| `PENALTY_SCORED` | `{ scorerId }` |
| `PENALTY_MISSED` | `{ scorerId }` |
| `SUBSTITUTION` | `{ outId, inId, slotId }` |
| `POSITION_CHANGE` | `{ memberId, fromSlotId, toSlotId }` |
| `LINEUP_APPLIED` | `{ lineupId, slots: [{ slotId, memberId }] }` — the confirmed result of a planned or ad-hoc composition; supersedes the previous on-pitch state wholesale |
| `FOUL` | `{ memberId }` |
| `INJURY` | `{ memberId }` |
| `COMMENT` | `{ note, memberId? }` — a free note the coach types during the match, up to 280 characters; the player is optional because a comment is about the game as often as about somebody (decision 114) |
| `REMARK` | `{ kind, memberId }` — one tap about one player. `memberId` is **required**, which is the only way a remark differs from a `COMMENT`. `kind` is one of `REMARK_KINDS` (decision 122) |
| `FINAL_WHISTLE` | `{}` |
| `VOID` | `{}` with `voids_event_id` set |

`type` is the Postgres enum `match_event_type`, so the list of types is constrained by the database
and a new one costs an `ALTER TYPE … ADD VALUE` — `0004_tricky_human_torch.sql` for `COMMENT` and
`0005_goofy_sir_ram.sql` for `REMARK`, both inserted `BEFORE 'FINAL_WHISTLE'` so the enum keeps
reading in match order. `MATCH_EVENT_TYPES` in `lib/match/events.ts` repeats the list for a module
free of Drizzle at runtime, and `MATCH_EVENT_TYPES_MATCH_THE_DATABASE` stops compiling if the two
**sets** drift — it compares two TypeScript unions, which are unordered, and both of them are
TypeScript: the `pgEnum` array in `db/schema.ts`, not Postgres itself. So the shared order is a
convention kept by hand rather than a proof, and it is kept so the enum reads in match order. Nothing
at runtime depends on the ordinal.

**Which kinds a `REMARK` may hold is *not* in the database** (decision 122). `REMARK_KINDS` —
`GOOD_TRACK_BACK`, `GOOD_EFFORT`, `BAD_PASS`, `GOOD_POSITIONING`, `LOST_BALL`, `NICE_SKILL` — is an
array in `lib/match/events.ts`, so a seventh remark is a line of TypeScript rather than a migration.
The cost of that is a kind the code does not know: the strict payload schema refuses one at ingestion,
and the reducer, which may never refuse history, reads such a row as a remark naming its player and no
kind — the lenient schema accepts any non-empty kind precisely so the `memberId` is not thrown away
with the word. A remark with no `memberId` at all is `invalidPayload` and names nobody.

**Hard rules.** No `UPDATE`, no `DELETE`, ever. Ingestion is an idempotent insert keyed on
`client_event_id`. A `VOID` may not target another `VOID`.

### `lineups`
`id`, `match_id`, `formation_id`, `from_minute`, `is_initial`, `applied_event_id`, `created_by`.
A composition planned in advance. `applied_event_id` stays null until the coach confirms it in
game mode (decision 006) — that is how "planned" and "actually happened" stay distinguishable.

### `lineup_slots`
`(lineup_id, formation_slot_id)` unique, `team_member_id`.
Also unique `(lineup_id, team_member_id)` — a player cannot occupy two slots.

### `match_player_stats` — a cache, not a source of truth
`(match_id, team_member_id)` unique, `minutes`, `goals`, `assists`, `own_goals`,
`penalties_scored`, `penalties_missed`, `fouls`, `gk_minutes`, `clean_minutes`,
`conceded_while_on`, `gk_clean_minutes`, `conceded_while_gk`, `goals_for_while_on`, `squad_role`,
`computed_at`.

`goals_for_while_on` (decision 160) is the other half of `conceded_while_on`: goals our team scored
while he was on the pitch, his own included. Outfield conceded is `conceded_while_on − conceded_while_gk`
exactly (both are incremented in the reducer's one `concede()`); outfield *clean* minutes are **not**
derivable by subtraction, because the keeper's clean clock restarts when he takes the gloves.

`clean_minutes` / `conceded_while_on` cover every player; `gk_clean_minutes` /
`conceded_while_gk` are the same two figures restricted to time spent in goal, which is what a
goalkeeper's clean sheet means. A keeper kept one in this match when `gk_minutes > 0 and
conceded_while_gk = 0`; keeping the minutes too lets a substituted keeper keep credit for the
half they kept clean (decision 018).

Written by reducing `match_events` at the final whistle, and recomputed from scratch whenever the
match is amended. **Never** written incrementally — that would let it drift from the log.

### `match_player_positions` — the same cache, cut by position (decision 160)
PK `(match_id, team_member_id, position_code)`, `minutes`, `goals_for`, `goals_against`; FKs to
`matches` and `team_members` with `on delete cascade`, like `match_player_stats`. One row per player per
position he held in the match. `position_code` is the slot's code **as the log had it** (`GB`, `DC`,
`MG`, later `AIL`…); there is no FK to `positions`, because a cache keeps what happened while the
catalogue changes under it, and grouping (MG/MD/AG/AD/AIL → « Ailier », DG/DD/DC → « Défenseur
central ») happens at read time in `lib/stats/positions.ts`.

Written by `lib/match/finalize.ts` in the **same transaction** as `match_player_stats`, deleted and
reinserted on every re-freeze. Invariants, per player and match: `Σ minutes = match_player_stats.minutes`
(minutes are apportioned by largest remainder so rounding cannot break it), the `GB` row's minutes
`= gk_minutes`, `Σ goals_for = goals_for_while_on`, `Σ goals_against = conceded_while_on`. The one
exception: time in a slot outside the catalogue has no row, so the sum falls short rather than invent a
position.

**Backfill.** `npm run db:refreeze` re-runs `finalizeMatchById` for every finished match (decision
161); CI runs it after `db:migrate` on the preview and on production, so a column a migration adds is
filled from the log in the same deploy.

## Ratings

### `ratings`
`id`, `match_id`, `rater_member_id`, `rated_member_id`, `score` (`numeric(3,1)`, 0–10 with one
decimal), `created_at`. Unique `(match_id, rater_member_id, rated_member_id)`.

Rewritten by decision 137, which supersedes 007 on three of its clauses and 024 entirely; decision **139**
then replaced the rules around it — who may write a row, and what makes one readable — while leaving the
table itself untouched. 021 is gone with it.
`comment` was **dropped** and the self-ratings decision 007 required were **deleted**
(`0007_chubby_silver_samurai.sql`) — see the migration's own header for why each of those is
irreversible on purpose.

Invariants:
- `score` is between 0 and 10 **and lands on a tenth**: two checks, `ratings_score_range` and
  `ratings_score_one_decimal` (`(score * 10) = floor(score * 10)`, `0010_puzzling_karen_page.sql`,
  decision **144**, superseding `ratings_score_half_step`). The *column* is one decimal because a
  historical per-match mean imported from real notes lands on 7.3 and rounding it to the half-point
  collapses a season's ranking into ties; the **match-day slider still steps by half a point** and
  `lib/rating/validation.ts` still refuses anything else, so the form is stricter than the table on
  purpose. The one-decimal check is **documentation, not enforcement**: `numeric(3,1)` rounds on
  insert rather than erroring, so it can never fire — kept for the same reason `ratings_score_range`
  coexists with the Zod schema
- **nobody rates himself** — `ratings_no_self`, `rater_member_id <> rated_member_id`
- **the rated member must have played**: `minutes > 0` in the log, not a role on the sheet. The **rater**
  needs nothing of the sort — any member of the team may rate, supporter and non-playing coach included
  (decision 139, superseding 137 on this half). Both are facts about `match_events` and the membership
  rather than about this table, so they live in `lib/rating/validation.ts` and in `submitRatings`, which
  is where a crafted form post is caught
- **inserts are never refused for being late.** A played match is rateable for ever, and the means being
  out changes nothing: a note that arrives afterwards moves a figure the squad has read (decision 139,
  which deleted the rating window). The only timing rule is that the match is `finished`
- **nothing is read until the coach has shown the match's means**, and what a non-coach may read is one
  mean per player. Never a raw score, never an author. `lib/rating/published.ts` owns the question and
  `getRatingResults` enforces it by not selecting

### `matches.ratings_published_at`
Nullable `timestamptz` on `matches`, written by `publishRatings` and `hideRatings` (`rating:publish`,
coach-only, one permission both ways).

**The whole of « are this match's means out? »** — null is hidden, a timestamp is visible, and nothing
derives, schedules or infers it (decision 139). It had two other clauses in its short life: « every
expected rater has submitted » (137) and « the window closed at the next kick-off » (007, deleted by 138).
Both are gone, so the rater→rated graph has left the publication question entirely and
`lib/rating/published.ts` is one predicate over this column.

Three things it is **not**, each of which the docs asserted at some point: not an escape hatch (nothing
else publishes, so it is the only door), not a deadline (nothing closes the notation), and not write-once
— **it can be set back to null**, which is how the coach hides a match again. The cost was stated and
accepted: a mean the squad has read can vanish, and there is no record of what was visible when.
Publishing is idempotent, so two taps do not move the instant; hiding and showing again does move it,
which is right — that is a new decision, not a repeat of the old one.

## Derived, never stored

Score, who is on the pitch right now, minutes played, clean-sheet minutes, man of the match,
and every season aggregate. All of it comes from `lib/match/reducer.ts` and `lib/stats/`.
If you find yourself adding a column to store one of these, stop and reread decision 003.
