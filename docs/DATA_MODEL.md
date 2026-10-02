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
  than a name. Nullable and null for most members; `char_length between 1 and 12`, so « no flocage »
  has exactly one representation and no screen has to tell `''` from `null`. Deliberately **not**
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

The fixed 7-a-side vocabulary: `GB`, `DG`, `DC`, `DD`, `MG`, `MC`, `MD`, `MOC`, `AG`, `AT`, `AD`.
Coordinates are normalised `0..1` on a vertically-oriented pitch, `y = 0` at our own goal line.

This table is the reason position preferences are meaningful: a player says "I want to play AT",
and any formation containing an `AT` slot matches.

### `formations`
`id`, `team_id` (**null = built-in template, shared by every team**), `name`, `label`
(e.g. `1-3-2-1`), `created_by`, `created_at`.

### `formation_slots`
`id`, `formation_id`, `position_code`, `x`, `y`, `sort`.
Exactly 7 slots per formation, exactly one with `position_code = 'GB'`.

### `player_positions`
`team_member_id`, `position_code`, `preference` (`primary` | `secondary`).
At most one `primary` per member. Set by the player on their profile by tapping a pitch diagram.

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

### `match_availability`
`(match_id, team_member_id)` unique, `status` (`yes` | `no` | `maybe`), `note`, `updated_at`.
Written by the player themselves; a coach may not answer on their behalf.

### `match_squad`
`(match_id, team_member_id)` unique, `role` (`starter` | `substitute` | `supporter`), `created_at`.
The match sheet. Only members listed here may rate after the match (decision 007), and only
`starter`/`substitute` may appear in a lineup.

### `trainings`
`id`, `team_id`, `starts_at`, `venue`, `note`, `created_by`.

### `training_availability`
`(training_id, team_member_id)` unique, `status`, `updated_at`.

### `training_attendance`
`(training_id, team_member_id)` unique, `present`, `marked_by`, `marked_at`.
Declared availability and actual attendance are deliberately separate — the gap between them is
interesting.

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
`conceded_while_on`, `gk_clean_minutes`, `conceded_while_gk`, `squad_role`, `computed_at`.

`clean_minutes` / `conceded_while_on` cover every player; `gk_clean_minutes` /
`conceded_while_gk` are the same two figures restricted to time spent in goal, which is what a
goalkeeper's clean sheet means. A keeper kept one in this match when `gk_minutes > 0 and
conceded_while_gk = 0`; keeping the minutes too lets a substituted keeper keep credit for the
half they kept clean (decision 018).

Written by reducing `match_events` at the final whistle, and recomputed from scratch whenever the
match is amended. **Never** written incrementally — that would let it drift from the log.

## Ratings

### `ratings`
`id`, `match_id`, `rater_member_id`, `rated_member_id`, `score` (`numeric(3,1)`, 0–10 in
half-points), `created_at`. Unique `(match_id, rater_member_id, rated_member_id)`.

Rewritten by decision 137, which supersedes 007 on three of its clauses and 021 and 024 entirely.
`comment` was **dropped** and the self-ratings decision 007 required were **deleted**
(`0007_chubby_silver_samurai.sql`) — see the migration's own header for why each of those is
irreversible on purpose.

Invariants:
- `score` is between 0 and 10 **and lands on a half-point**: two checks, `ratings_score_range` and
  `ratings_score_half_step` (`(score * 2) = floor(score * 2)`). The step the slider implies is stated
  by the database rather than implied by it, because a `smallint` behind a half-point control rounds
  silently
- **nobody rates himself** — `ratings_no_self`, `rater_member_id <> rated_member_id`
- **both members must have played**: `minutes > 0` in the log, not a role on the sheet. That is a fact
  about `match_events` and no constraint here can see it, so it lives in `lib/rating/validation.ts`
  and in `submitRatings`, which is where a crafted form post is caught
- inserts are refused once the next match for that team has kicked off
- **nothing is read until the match's means are published**, and what a non-coach may read is one mean
  per player. Never a raw score, never an author. `lib/rating/published.ts` owns the question and
  `getRatingResults` enforces it by not selecting

### `matches.ratings_published_at`
Nullable `timestamptz` on `matches`, written by `publishRatings` (`rating:publish`, coach-only).

The coach's escape hatch, and the only stored half of « are this match's means out? ». The other two
clauses are derived: every expected rater has submitted, or the window has closed at the next
kick-off. It exists because the last match of a season has no next kick-off, so without it the team
that most wants its notes is the team whose notes could wait for ever (decision 137). Idempotent: a
second publish does not move the instant.

## Derived, never stored

Score, who is on the pitch right now, minutes played, clean-sheet minutes, man of the match,
and every season aggregate. All of it comes from `lib/match/reducer.ts` and `lib/stats/`.
If you find yourself adding a column to store one of these, stop and reread decision 003.
