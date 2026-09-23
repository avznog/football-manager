# COORDINATION.md — read this before you do anything

**This file is how sessions working on this repository at the same time talk to each other.**
It exists because there is no other channel: sessions share no memory, and two of them running on
different machines cannot see each other at all. Git is the only thing they both touch.

`CLAUDE.md` sends you here first, before `docs/`. Read it on **every** wake-up, not once — its
contents change, and the version you remember from an hour ago may be stale.

---

## STATUS: one session is looping, and it does not know it

**2026-09-23, 11:00 CEST.** Written by the session on the owner's machine, for the session that is
not.

A Claude session is running **on another computer, in a loop**. The owner has confirmed this and
**cannot stop it before tonight**. It produced `feat/rating-deadline` / PR #53, and before that some
of the work in `docs/SESSIONS.md`. It is not doing anything wrong — it is doing good work — but it
cannot see this machine, this machine cannot see it, and two sessions editing the same four files is
already costing real time. This file is the owner's idea and it is the right one.

### If you are that session, or any session that did not write this

Do not stop working on the owner's account. Nobody is asking you to abandon a change half-done.
**Do these five things instead**, all of which cost you nothing and save the next session an hour.

1. **Take a decision number at merge time, never before.** This is the single biggest cost so far —
   074 through 081 were claimed by four sessions inside two hours, and one entry was renumbered
   *three* times. Even "renumber against `origin/main` immediately before pushing" is not enough: #53
   took 079 five minutes after another branch had checked and found it free. So: write the entry with
   the number left as `## NNN — …`, and fill it in as the **last commit before you merge**, right
   after a `git fetch`. If you lose the race anyway, renumber and say so in your session entry.

2. **Append. Never restructure.** `docs/SESSIONS.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md` and
   `docs/DEPLOY.md` are the four files every session touches. Add your block at the end of the
   relevant section and change nothing above it. Two appends merge by hand in a minute; one append
   against a rewrite is a real conflict.

3. **Rebase, do not merge, and re-run the checks after.** `git fetch` then `git rebase origin/main`.
   A rebased docs conflict is almost always "keep both blocks, theirs first" — and after resolving it,
   run `npm run typecheck && npm run lint && npm test` again, because a clean textual merge of two
   correct changes is still capable of producing a wrong file.

4. **Write down what you could not verify.** If you claim a job, a deploy or a screen works, say how
   you know. Several entries in `docs/SESSIONS.md` used to assert things that had never been run once.

5. **Leave a note here when you start and when you stop.** The log at the bottom. One line.

### Things that changed under you, so you do not "fix" them

Check these against the current files rather than trusting this list — it is a snapshot.

- **Only `main` deploys to Vercel.** `vercel.json` holds one rule and nothing else (decision 080).
  Your branch will get **no preview deployment**, and no Vercel status check on its pull request.
  That is deliberate, not a broken integration: every preview ran against the *production* Neon
  database. GitHub Actions is the gate. Do not delete `vercel.json` to "restore previews".
- **Migrations are applied by CI on `main`** (decision 078), from the `DATABASE_URL` repository
  secret. Do not run `db:migrate` against production by hand, and never `db:push` or `db:reset` at it.
- **Versions are tags, cut by CI** from `package.json`'s `version` (decision 081). Bump the number in
  your pull request if it earns one; **never create a tag by hand.**
- The app is **live** at `https://football-manager-avznog-team.vercel.app`. It has a schema and, as of
  this writing, **no user account** — `db:bootstrap` has not been run. So `main` is not a toy.

### What stays with the owner, and must not be worked around

`SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` are never stored in Vercel and never in a GitHub
secret. `ALLOW_REMOTE_RESET` is set nowhere. The production connection string is deliberately
unreadable — sensitive in Vercel, write-only as a secret — so if you need it, **ask**; do not try to
extract it, and do not print it if you are handed it.

---

## Log

Newest last. One line: date, which machine or branch, what you are doing or have stopped doing.

- **2026-09-23 11:00 · owner's machine · `feat/deploy-only-main`** — Wrote this file. Landed:
  `vercel.json` so only `main` deploys, the `tag` job, decisions 080 and 081. Watching the `tag` job's
  first real run. Next: nothing on `main` until the owner runs `db:bootstrap`.
