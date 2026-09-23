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

### `matches`
`id`, `team_id`, `kickoff_at`, `opponent_name`, `is_home`, `venue`,
`competition` (`league` | `cup` | `friendly` | `tournament`),
`periods_count` (default 2), `period_minutes` (default 30),
`status` (`scheduled` | `live` | `finished`), `operator_user_id`,
`entry_mode` (`live` | `retro`), `created_by`, `created_at`.

The score is **never stored here** — it is derived from `match_events` (decision 003), and frozen
into `match_player_stats` at the final whistle.

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
type             text not null
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
| `FINAL_WHISTLE` | `{}` |
| `VOID` | `{}` with `voids_event_id` set |

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
`id`, `match_id`, `rater_member_id`, `rated_member_id`, `score` (0–10 integer), `comment`,
`created_at`. Unique `(match_id, rater_member_id, rated_member_id)`.

Invariants:
- both members must be in `match_squad` for that match with role `starter` or `substitute`
- self-rating is allowed (`rater = rated`) — decision 007
- a rater may not read any rating for a match until they have submitted their own full set
- inserts are refused once the next match for that team has kicked off

## Derived, never stored

Score, who is on the pitch right now, minutes played, clean-sheet minutes, man of the match,
and every season aggregate. All of it comes from `lib/match/reducer.ts` and `lib/stats/`.
If you find yourself adding a column to store one of these, stop and reread decision 003.
