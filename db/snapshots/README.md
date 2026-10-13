# `db/snapshots/`

Dumps of a **deployed** database, kept in git on purpose: they are the only copy of a season that
was about to be overwritten, and a session on another machine has no other way to find one.

They are not part of the schema and nothing reads them. `db/migrations/` is the schema's history;
this directory is data's.

## The rule, because this repository is public

**A dump committed here is published.** Redact it before committing, and say at the top of the file
what was taken out:

- **every password hash** — argon2id or not, a published hash is an offline cracking target, and the
  super admin's hash reaches every team in the instance;
- **every row of `sessions`** — a session cookie in this app *is* the `sessions.id`, so a dump of
  that table is a list of working bearer tokens.

Keep the unredacted dump outside git. `audit/` is gitignored and is where the rest of this
repository's working files already live.

A redacted dump restores into a database nobody can log into, which is the intended trade: the
season is preserved, the credentials are not. Set a password locally afterwards if you need to sign
in.

## What is here

| File | What it is |
|---|---|
| `preview-20261012.sql` | The preview database on 2026-10-12, taken immediately before production's data was restored over it. The demo season « AS Dimanche », at migration `0014`. |
| `matches-1-3-rebuilt.sql` | The first three matches rebuilt from the owner's paper sheets, plus the preferred positions derived from them (decisions 179 and 180). **Spent: production received this data on 2026-10-12**, through the full restore from preview and not by applying this file. It stays here as the record of what was reviewed on preview. Carries no credentials, so nothing needed redacting. |

**No future dump goes in the other direction.** Production has been in real use since 2026-10-12 and
is the authoritative copy of the season; data flows production → preview only. Decision **201** is the
rule and the reason.

## `matches-1-3-rebuilt.sql`, and why it is here rather than only in a script

Written while production still needed this data; it got it another way on 2026-10-12. What follows is
why the file was trustworthy, kept because it is the record of the review — not an instruction to run
it anywhere.

The rebuild is reproducible — `scripts/rebuild-matches.mts` and
`scripts/assign-positions-from-play.mts`, driven by `backlogs/matches-1-3-blocks.json` — and either
route reaches the same state. The file exists because the owner asked that the work not be done twice,
and because the two things are not quite the same: **the file is what was reviewed on preview**, and
the scripts are what would be computed again.

Both were checked to agree, on a local restore of the production dump taken the same day: apply
migrations `0011`–`0014`, run `db:refreeze`, then apply the file, and the result is **byte-identical**
to preview across seven fingerprints — `match_events`, `match_player_stats`,
`match_player_positions`, `player_positions`, `match_squad`, the match statuses and
`lineups.applied_event_id`. That rehearsal is the reason the file can be trusted against production
without having been run there.

**It can be applied at all** only because preview was restored from production on the same day, so the
identifiers are production's: the md5 of every `matches.id`, `team_members.id` and `users.id` is
identical on both, verified rather than assumed. If production's rows are ever recreated, this file
stops being applicable and the scripts become the only route.
