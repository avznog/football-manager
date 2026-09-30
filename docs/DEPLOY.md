# Deploying

Vercel for the application, Neon for the database, and git between them — in two halves (decision 119):
a push to `main` runs the checks, migrates the **preview** schema and moves the preview deployment at
`dev.7orteils.bgonzva.fr`; a tag `v*` pushed **by hand** migrates **production** and then deploys it.
Nothing else deploys anywhere.

This has been done for real — a Neon project and a Vercel project both called `football-manager`,
the latter under the `avznog-team` scope and connected to `avznog/football-manager` on GitHub. So
what follows is both the record of how this instance was set up and the procedure for another one.

---

## 1. The database — Neon

Interactive signup, so the owner does this. **Done** for the live instance.

1. Create a project on [neon.tech](https://neon.tech). Region: **Frankfurt** or **Paris** — the
   team is French, and every request in this app reads the database, so a round trip across the
   Atlantic is felt on every screen.
2. Copy the **pooled** connection string. It looks like:
   ```
   postgres://user:password@ep-something-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   The pooled one, with `-pooler` in the host: `db/client.ts` opens one connection per serverless
   invocation, and a direct connection runs out of them.

## 2. Migrations

**After the first one, CI does this.** The committed SQL is applied by GitHub Actions — never from the
Vercel build command, never by hand before a deploy (decision 078) — and *which* database it reaches is
decided by what was pushed (decision 119):

| What you pushed | Job | Database |
|---|---|---|
| a commit to `main` | `migrate-preview` in `.github/workflows/ci.yml` | the preview branch, `PREVIEW_DATABASE_URL` |
| a tag `v*`, by hand | `migrate-production` in `.github/workflows/release.yml` | production, `DATABASE_URL` |

Both run only once typecheck, lint, Vitest and the browser run have passed on that same commit, both
have their own concurrency group with `cancel-in-progress: false` so a second push can never interrupt
SQL that has started applying, and both **fail loudly when their secret is absent** rather than skipping:
a migration that silently did not happen is the thing being prevented. The production one also runs
*before* the deploy job in the same workflow, which is the ordering decision 078 could not have.

Two repository secrets, set once each — a string in Vercel cannot be read back, so every place that
needs one gets its own paste:

```bash
gh secret set DATABASE_URL --repo avznog/football-manager           # the pooled production string
gh secret set PREVIEW_DATABASE_URL --repo avznog/football-manager   # the pooled string of the Neon preview branch
```

This is the *only* way migrations reach production now, including the first one. That was not the
plan — this section used to say the first migration had to come from a shell, because there is no
schema to serve against until it has run — but on the push that merged the `migrate` job itself, CI
applied it: `migrations applied`, 41 seconds, against a database that had none. A brand-new Neon
database needs nothing from a laptop.

Running it by hand is still the way to migrate a database CI does not know about — a restored copy, or a
scratch Neon branch:

```bash
DATABASE_URL='postgres://…-pooler…/neondb?sslmode=require' npm run db:migrate
```

Migrations are committed SQL (`db/migrations/`), so this applies exactly what CI tested. Never
`db:push` at a production database, and never `db:reset` — it refuses unless `ALLOW_REMOTE_RESET=yes`,
and there is no reason to set it.

If the Neon project was attached through Vercel's marketplace rather than created by hand, take the
string from the **Neon** dashboard: `vercel env pull` hands back an empty value for it, see §4.

### Still to verify — a question for the owner

**Does `PREVIEW_DATABASE_URL` really hold the connection string of the Neon *preview* branch?** No
session can check: a GitHub secret is write-only and the Vercel copies are sensitive, so the only person
who can read it is the owner. It matters more than it looks. If that secret holds the **production**
string — pasted there before the preview branch existed, or copied from the wrong tab — then every push
to `main` now migrates production, which is precisely the ordering decision 119 was written to stop, and
nothing anywhere would say so: the job would print `migrations applied` and go green. Please open it once
and confirm the host and database name are the preview branch's, not production's.

## 3. Reference data and the first account — `db:bootstrap`

```bash
DATABASE_URL='postgres://…' \
SUPER_ADMIN_USERNAME=benjamin \
SUPER_ADMIN_PASSWORD='something long and real' \
npm run db:bootstrap
```

This writes the eleven seven-a-side positions, the seven built-in formations, and **one** user,
marked super admin. Nothing else — no demo season; `npm run db:seed` refuses to run with
`NODE_ENV=production` and must not be talked into it, because its fake team would land in the real
season's statistics.

Why a script exists for this at all: signing up is invite-only by design (decision 008), and invites
come from a coach. An empty database has no coach, so without this there is no way in at all
(decision 052).

It is **idempotent**: running it again re-hashes the password and re-confirms the flag, which makes
it the password reset of last resort for the one account that has no coach to ask.

It refuses a password under 8 characters, and refuses `change-me` — that account can read and
rewrite every team on the instance.

## 4. Vercel

The project is `avznog-team/football-manager`, connected to `avznog/football-manager`. **Deploys from git
come only from `main`**, and a push to any other branch deploys nothing at all (decision 080). What a
`main` push produces is a **Preview** deployment, the one serving `dev.7orteils.bgonzva.fr`, because the
project's production branch is a **parked branch** rather than `main`.

**Production is not deployed from git at all.** `release.yml` builds it and deploys it with the Vercel
CLI — `vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod`, the CLI pinned to
`vercel@61` — on a tag, and only after the production migration has succeeded (decision 119). That is
what makes the ordering deterministic instead of "within seconds", which is the whole trade decision 078
had rejected. `vercel --prod` from a laptop still works and is the break-glass route, but it skips the
gate, the checks and the migration, so it is an incident tool and not a way to ship.

If it ever has to be re-linked:

```bash
vercel link --yes --project football-manager
vercel git connect --yes
```

Next.js is detected without configuration. `vercel.json` holds two rules and nothing else: the branch
rule below, and `"regions": ["lhr1"]` so the functions run in the same city as the database (decision
111). It is read from the repository rather than the dashboard, which is why the CI build honours it too.
The build command is the default `npm run build`, and it deliberately does not migrate: decision 078 says
why.

### Only `main` deploys

```json
{ "git": { "deploymentEnabled": { "**": false, "*": false, "main": true } } }
```

Read it as "nothing, except `main`". Three keys for two rules because of one trap: the patterns are
[minimatch](https://github.com/isaacs/minimatch), where **`*` does not match a `/`** — and every
branch in this repository is `feat/<slice>`, so a lone `*` would have matched `main` and missed every
branch it was written to stop. `**` crosses the slash; `*` is kept because it costs nothing and the
next reader should not have to know which one does the work.

`main` matches both `**` (false) and `main` (true), and Vercel's rule is that a branch matching several
patterns deploys if **any** of them is `true`. So the `true` wins, on purpose.

This is a `git.deploymentEnabled` rule rather than an `ignoreCommand`, which is the other way to do it:
`ignoreCommand` starts a build container and then exits early, so it shows a cancelled deployment per
push and bills for the start-up. `deploymentEnabled` means the deployment is never created.

### One variable name, two databases, and the trap in it

The application reads `DATABASE_URL` and nothing else. In Vercel that name is **scoped per
environment**: the Production scope holds the pooled production string and the Preview scope holds the
pooled string of the Neon **preview** branch, so the same code reads a different database depending on
which deployment is answering. That is the whole mechanism behind decision 119's split — CI decides which
*schema* moves, and Vercel's environment scoping decides which *data* a running copy sees. Both are
marked **sensitive**, with two consequences, and the second one cost three builds:

- **Nothing can read it back** — not the dashboard, not `vercel env ls`, not `vercel env pull`, which
  writes `[SENSITIVE]` where the value would be. That is the point of the setting. It is also why both
  strings have to be pasted independently into the two GitHub secrets in §2, and why a session that
  needs to run a migration has to ask for one rather than fetch it.
- **A sensitive variable does not exist during the build.** Vercel exposes it at runtime only. The
  first three deploys failed with `DATABASE_URL is not set` about a variable that was set, correctly,
  for Production — because `db/client.ts` read it at module scope and `next build` imports every
  route to collect page data. That is fixed at the root (decision 075) rather than by un-marking the
  variable, which would have traded a permanently readable production password for nothing.

**A green build does not mean `DATABASE_URL` is set.** The build deliberately does not need it
(decision 075): the connection opens on the first query, not on import, so a deploy with no database
compiles perfectly and then answers every page with « Un problème est survenu ». The proof that the
variable is right is step 5, in a browser. If the site builds and every screen fails, it is this
variable — the server log will say so in as many words.

`SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` are **not** needed in Vercel. They are read by
`db/bootstrap.ts` and `db/seed.ts`, both of which run from a command line, never from the
application. Leaving a password in the deployment environment for no reason is how it leaks — and it
happened here on the first attempt: both were set on the Vercel project, along with a
`TEST_DATABASE_URL` that nothing in the repository reads at all. All three were removed. A password
for the one account that can read and rewrite every team on the instance, once it has been somewhere
it did not need to be, is reset rather than reasoned about: run `db:bootstrap` again with a new one.

### The preview deployment, and the gun that used to be loaded

`DATABASE_URL` used to be set for Preview with **the same value as Production**. While every branch
deployed, that meant every pull request previewed against the real season and a Server Action tapped in a
preview wrote to it — the same hand that opens a preview to check a lineup editor, writing to the season
the team's statistics come from. Vercel Authentication kept the reachable set to the team scope rather
than the internet, which made it survivable, not fine.

Decision 080 unloaded it by removing the previews: no branch but `main` deploys. Decision 119 brings one
preview back on purpose and is meant to pay the price 080 deferred — **a separate Neon preview branch**,
with its own connection string in the Preview scope and in the `PREVIEW_DATABASE_URL` secret. Whether the
two strings really are two is the open question above, and until it is answered this paragraph describes
the intent rather than a verified fact. So there is exactly one
preview deployment, `dev.7orteils.bgonzva.fr`, it is what a merge to `main` moves, and it is a real
running copy of the app against data nobody's season depends on.

A `feat/<slice>` branch still gets nothing: `vercel.json` keeps every other branch off, which is 080's
mechanism, untouched. If per-branch previews are ever wanted, that is a separate change, and it would
want the same Neon branch this one does — see the question above, which is the one thing about this
arrangement no session has been able to confirm.

### Turn Deployment Protection off

**Done** for the live instance — production answers `200` and the French login form. Kept here
because it is the first thing to check if the site ever goes silent for the squad.

A new Vercel project has **Vercel Authentication** on. While it is on, every request is answered with
a `302` to `vercel.com/sso-api` and only members of the Vercel team can open the app:

```
$ curl -sI https://football-manager-avznog-team.vercel.app/connexion
HTTP/2 302
location: https://vercel.com/sso-api?url=…
```

This project's whole point is that a dozen amateur footballers join it with a code sent on WhatsApp.
None of them has a Vercel account, and inviting them to one to look at a match sheet is absurd — so
**Settings → Deployment Protection → Vercel Authentication → Disabled**, for production at least.
Steps 5 and 6 below are impossible until it is off: the phone in daylight sees the Vercel login page.

Leaving it on for *preview* deployments is reasonable and costs nothing, since previews are only ever
opened from this machine.

### If the database came from the Neon integration

Attaching Neon through Vercel's marketplace, rather than `vercel env add` by hand, writes eighteen
variables prefixed `FOOTBALL_MANAGER_` (`…_DATABASE_URL`, `…_PGHOST`, `…_POSTGRES_PRISMA_URL`, the
unpooled and non-pooling variants, …). **The application reads none of them.** It reads
`DATABASE_URL` and nothing else, so that one still has to exist on its own — the integration creates
it too, but check it is there and that it holds the *pooled* string. Do not be tempted to make the app
read the prefixed one instead: that ties this code to one integration's naming for no gain.

Their values are stored sensitive, which has one consequence worth knowing before you go looking for
it: `vercel env pull` writes them back as `DATABASE_URL=""`. Vercel will not hand a sensitive value
back out, not even to the account that owns it. So the connection string for step 2's migrations has
to be copied from the **Neon** dashboard, not pulled from Vercel.

## 5. First run, in the browser

1. Go to `/connexion` and log in with the username and password from step 3.
2. You have no team, so invariant 5 sends you to `/rejoindre`. Because you are the super admin that
   screen offers **« Crée ton équipe »** first — name the team and submit; you become its coach and
   land in the app.
3. `/equipe` → **« Inviter des joueurs »**: generate a code per player (or one code with several
   uses) and send it on WhatsApp. Each player chooses their own password; nobody types anybody
   else's.
4. `/equipe` → **« Réglages de l'équipe »**: the club's two colours. They are not decoration — the
   discs on the pitch and the team header are drawn in them (decision 011).
5. Add the season's matches from `/calendrier`. A match already played is typed up afterwards with
   « Saisir le match » (decision 047), so starting mid-season loses nothing.

## 6. On a real phone

The one check that cannot be automated, and the one that has caught the most: open the site on an
iPhone and on an Android, **outside, in daylight**, and walk a match. Is the turf legible in the sun?
Is the ACTION button reachable with a thumb? Does dragging a player onto a slot work without a mouse?

Every defect found in waves 3 and 4 was a screen stating something untrue and none of them failed a
test, which is why this step is in the definition of done rather than in a wish list.

---

## Upgrading later

Squash-merge the pull request. That gets the change **tested and onto the preview**, and no further:
`ci.yml` typechecks, lints, runs Vitest and the browser suite, then applies any new migration to the
preview database, while Vercel's Git integration builds the same commit as a Preview deployment at
`dev.7orteils.bgonzva.fr`. Production is untouched and still serving the last tag (decision 119).

Nothing orders Vercel's preview build against the preview migration, so for a few seconds the new code
may be serving against the old schema — on the preview, which is what makes that acceptable now.
Production has no such window: `release.yml` migrates and *then* deploys, in one workflow, in that order.
A migration that is not safe in either direction — a dropped column, a narrowed type — is still worth
saying out loud in the pull request, because the preview will live through the window even though
production will not.

### Shipping a version

The version of the app is the `version` field in `package.json` and lives nowhere else. Cutting the tag
is a **deliberate human act**, four steps:

1. **Bump `package.json`'s `version` in the pull request that earns it** — a feature is a minor, a fix is
   a patch, and a hyphen makes it a pre-release (`1.0.0-beta.4`, decision 110). One number, one commit,
   reviewed with the change that justifies it.
2. **Squash-merge it and let `ci.yml` finish green.** The preview migration runs here.
3. **Look at the preview.** `https://dev.7orteils.bgonzva.fr`, at 390 px, in both themes, on the screens
   the change touches. This is the step the old flow could not offer at all, and it is the point of
   having a preview: production has not moved yet, so there is still time to find the defect.
4. **Tag it and push the tag.** From a `main` that is up to date with `origin`:

   ```bash
   git switch main && git pull
   git tag -a v1.0.0-beta.4 -m "The composition editor refuses a finished match"
   git push origin v1.0.0-beta.4
   ```

Then **watch `release.yml`** — `gh run watch` or the Actions tab. It gates the tag, re-runs the same
checks on the tagged commit, migrates production, builds and deploys production with the Vercel CLI, and
publishes the GitHub release last, so a release page never names a version that failed to migrate or
failed to deploy (decisions 108 and 110). A green run is still not proof the app *works*: open
`https://7orteils.bgonzva.fr` and load one page that queries the database, for the reason in §4.

**If the gate refuses the tag**, nothing was migrated and nothing was deployed — that is the point of
putting it first. The error names the exact command, and it is always the same shape:

```bash
git push origin :refs/tags/v1.0.0-beta.4   # delete it on the remote
git tag -d v1.0.0-beta.4                   # and locally
```

Then fix the cause and tag again. There are two causes. The tag did not equal `v$(package.json version)`
**at the commit it points at** — so either tag the version the commit actually claims, or bump
`package.json` in a pull request first, which is step 1. Or the commit is not reachable from
`origin/main` — so merge the branch and tag the commit on `main`, because only `main` has been through a
pull request, CI and a look at 390 px.

Re-pushing a tag that already deployed is not an error: it re-tests, re-migrates and re-deploys, and
publishes no second release. That is how a release whose deploy job failed on a bad afternoon is retried.

To find what a tag contains, `git show v1.0.0-beta.3`. To see which version is **live**, read the latest
tag — not `package.json` on `main`, which is now allowed to be ahead of production, and normally is
between a merge and the decision to ship.

## Running the whole stack locally with Docker — optional

Vercel plus Neon is the deployment. `compose.yaml` is something else: a way to run the app the way
production runs it — a real production build, a real Postgres 17 — without Vercel, Neon, or a
Homebrew service. It is **an addition, not a replacement**. `npm run dev` against the Homebrew
Postgres is still the development loop (decisions 016 and 077).

Three things it is good for: checking a production build before pushing, giving a machine with no
Homebrew a database, and reproducing what CI's `postgres:17` service does.

```bash
npm run docker:db                     # Postgres 17 alone, on 5432, for `npm run dev` on the host
docker compose run --rm migrate       # apply the committed migrations
npm run docker:up                     # build and start the app on http://localhost:3000
npm run docker:logs                   # follow it
npm run docker:down                   # stop; add docker:reset to drop the volume too
```

### `up` leaves a schema with nobody in it

`docker compose up` starts `db`, `migrate` and `app` — and that is all. Both services that create
users sit in the `setup` profile, which `up` does not start, so the app comes up on port 3000 with a
migrated schema and zero rows in `users`. There is no password that works, and the login screen
cannot say so: **`admin`/`admin` and `admin`/`change-me` both fail on a freshly `up`ped stack.** The
first because no account exists at all; and even after `db:bootstrap`, `change-me` is refused by
design — `db/bootstrap.ts` blacklists the demo password and enforces a minimum length, so `admin` as
a password is refused too (decision 052). `admin`/`change-me` is a *seed* account: it exists only if
you ran the seed.

Two ways out, and they are different things:

```bash
# A demo season you can click through: `admin` / `change-me`, and the squad on `motdepasse`.
npm run docker:seed

# Or one real super admin and reference data, no demo data — the production path, as in step 3.
SUPER_ADMIN_USERNAME=admin SUPER_ADMIN_PASSWORD='…' docker compose run --rm bootstrap
```

Take the seed when you want to see the app full of a season; take bootstrap when you want the local
stack to behave like the deployment, where the first account is the only account. The seed is local
only: it is built from the `tools` image, which sets no `NODE_ENV`, and `db/seed.ts` refuses to run
under `NODE_ENV=production` precisely so known passwords cannot reach a real database.

Notes worth having before something surprises you:

- The credentials are the ones `.env.example` and CI already use — `football` / `football` /
  `football_manager` — so nothing else has to be reconfigured. They are development credentials and
  the compose file is not for production.
- `app` waits for `db` to be healthy *and* for `migrate` to exit successfully, so the first request
  never hits a schemaless database.
- The `app` image is built with `NEXT_OUTPUT_STANDALONE=1`, which is the only thing that turns on
  `output: "standalone"` in `next.config.ts`. Vercel builds without it and is unaffected.
- Data lives in the named volume `db-data`. `docker compose down` keeps it; `npm run docker:reset`
  deletes it.
- Set `APP_PORT` or `POSTGRES_PORT` if 3000 or 5432 is taken.
- `npm run test:e2e` still drives `localhost` on the host (decision 043); point its `DATABASE_URL`
  at the compose Postgres if you want to use it instead of Homebrew.

## Environment variables, all of them

| Variable | Where | Why |
|---|---|---|
| `DATABASE_URL` | Vercel, **scoped per environment** (sensitive): the production string on Production, the Neon preview branch's on Preview. Also the `DATABASE_URL` GitHub secret — production only — and the shell for `db:*` scripts | The only variable the application itself needs. Unreadable once set in Vercel, so each place gets its own paste. |
| `PREVIEW_DATABASE_URL` | the GitHub secret of that name, only | What `migrate-preview` in `ci.yml` applies the committed SQL to on a push to `main`. Must be the Neon **preview** branch — see §2's « still to verify ». Nothing in the application reads this name. |
| `VERCEL_TOKEN` | the GitHub secret of that name, only | Lets `release.yml` deploy production with the CLI *after* the migration, which is the ordering decision 119 bought with it. Scope it to this project and rotate it if it is ever printed. |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub repository **variables**, not secrets | Which project `vercel pull` links to. They are identifiers, not credentials, so they are readable on purpose. |
| `SUPER_ADMIN_USERNAME` | command line, once | The first account, in `db:bootstrap`. |
| `SUPER_ADMIN_PASSWORD` | command line, once | Its password. Never in Vercel, never in a GitHub secret. |
| `ALLOW_REMOTE_RESET` | nowhere | Exists so `db:reset` can refuse. Do not set it in production. |
| `FOOTBALL_MANAGER_*` | Vercel, written by Neon's integration | Read by nothing in this repository. Ignore them. |
