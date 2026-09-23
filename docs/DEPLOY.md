# Deploying

Vercel for the application, Neon for the database, and git between them: a push to `main` migrates
the schema and deploys the code.

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

**After the first one, CI does this.** The `migrate` job in `.github/workflows/ci.yml` applies the
committed SQL to Neon on every push to `main`, once typecheck, lint, Vitest and the browser run have
passed (decision 076). It needs one repository secret, set once — the Vercel copy of the string
cannot be read back, so it has to be pasted here separately:

```bash
gh secret set DATABASE_URL --repo avznog/football-manager   # paste the pooled string at the prompt
```

The **first** migration, against a brand-new empty database, still comes from a shell: there is no
schema for the application to serve against until it has run, so it happens before the first deploy
rather than after a push, and it is worth watching.

```bash
DATABASE_URL='postgres://…-pooler…/neondb?sslmode=require' npm run db:migrate
```

Migrations are committed SQL (`db/migrations/`), so this applies exactly what CI tested. Never
`db:push` at a production database, and never `db:reset` — it refuses unless `ALLOW_REMOTE_RESET=yes`,
and there is no reason to set it.

If the Neon project was attached through Vercel's marketplace rather than created by hand, take the
string from the **Neon** dashboard: `vercel env pull` hands back an empty value for it, see §4.

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

The project is `avznog-team/football-manager`, connected to `avznog/football-manager`. **Deploys come
from git**: a push to `main` is a production deploy, a pull request is a preview. `vercel --prod` from
a laptop still works and is the way to ship a commit that is not on `main`, but it should stay the
exception — the point of decision 076 is that the schema and the code move on the same push.

If it ever has to be re-linked:

```bash
vercel link --yes --project football-manager
vercel git connect --yes
```

Next.js is detected without configuration; there is no `vercel.json` and none is needed. The build
command is the default `npm run build`, and it deliberately does not migrate — decision 076 says why.

### The one variable, and the trap in it

`DATABASE_URL`, the pooled Neon string, on Production and Preview, marked **sensitive**. Two
consequences, and the second one cost three builds:

- **Nothing can read it back** — not the dashboard, not `vercel env ls`, not `vercel env pull`, which
  writes `[SENSITIVE]` where the value would be. That is the point of the setting. It is also why the
  same string has to be pasted independently into the GitHub secret in §2, and why a session that
  needs to run a migration has to ask for it rather than fetch it.
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

### Preview deployments share the production database

`DATABASE_URL` is set for Preview too, pointing at the same Neon database as production. Every pull
request therefore previews against the real season, and a Server Action tapped in a preview writes to
it. What keeps this from being worse than it sounds is Vercel Authentication: an unauthenticated
request to a preview URL answers `302` to `vercel.com/sso-api`, so the reachable set is the team
scope, not the internet. It is still a loaded gun — the same hand that opens a preview to check a
lineup editor is writing to the real season — so give Preview its own Neon branch before a second
person is added to the scope.

### Turn Deployment Protection off

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

The one check that cannot be automated, and the one that has caught the most: open the preview on an
iPhone and on an Android, **outside, in daylight**, and walk a match. Is the turf legible in the sun?
Is the ACTION button reachable with a thumb? Does dragging a player onto a slot work without a mouse?

Every defect found in waves 3 and 4 was a screen stating something untrue and none of them failed a
test, which is why this step is in the definition of done rather than in a wish list.

---

## Upgrading later

Squash-merge the pull request. That is the whole procedure: CI typechecks, lints, runs Vitest and the
browser suite, then applies any new migration to Neon, while Vercel builds and promotes the same
commit. Nothing to run by hand.

The two are not ordered against each other, so for a few seconds the new code may be serving against
the old schema. Migrations are written to be safe in that direction. One that cannot be — a dropped
column, a narrowed type — is the case to take out of this flow and do by hand, with the reasoning
written down.

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

An empty database needs the reference data and the first account, as in step 3:

```bash
SUPER_ADMIN_USERNAME=admin SUPER_ADMIN_PASSWORD='…' docker compose run --rm bootstrap
```

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
| `DATABASE_URL` | Vercel production + preview (sensitive), the `DATABASE_URL` GitHub secret, and the shell for `db:*` scripts | The only variable the application itself needs. Unreadable once set in Vercel, so each place gets its own paste. |
| `SUPER_ADMIN_USERNAME` | command line, once | The first account, in `db:bootstrap`. |
| `SUPER_ADMIN_PASSWORD` | command line, once | Its password. Never in Vercel, never in a GitHub secret. |
| `ALLOW_REMOTE_RESET` | nowhere | Exists so `db:reset` can refuse. Do not set it in production. |
| `FOOTBALL_MANAGER_*` | Vercel, written by Neon's integration | Read by nothing in this repository. Ignore them. |
