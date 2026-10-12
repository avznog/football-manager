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
