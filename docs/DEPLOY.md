# Deploying

Vercel for the application, Neon for the database. Two accounts, four commands, once.

Everything here has been run against an empty database on a developer machine; the only steps that
have *not* been executed for real are the ones that need the owner's Neon and Vercel accounts, and
they are marked. Follow it in order — step 4 is the one that is easy to skip and impossible to
recover from without it.

---

## 1. The database — Neon

Interactive signup, so the owner does this.

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

From a machine with the repository, against the production database:

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

> Needs the owner's Vercel account. The CLI on this machine is authenticated as `avznog`.

```bash
vercel link          # pick the scope, name the project football-manager
vercel env add DATABASE_URL production      # paste the pooled Neon string
vercel env add DATABASE_URL preview         # same, or a Neon branch
vercel --prod
```

Next.js is detected without configuration; there is no `vercel.json` and none is needed.

**A green build does not mean `DATABASE_URL` is set.** The build deliberately does not need it
(decision 075): the connection opens on the first query, not on import, so a deploy with no database
compiles perfectly and then answers every page with « Un problème est survenu ». The proof that the
variable is right is step 5, in a browser. If the site builds and every screen fails, it is this
variable — the server log will say so in as many words.

`SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` are **not** needed in Vercel. They are read by
`db/bootstrap.ts` and `db/seed.ts`, both of which run from a command line, never from the
application. Leaving a password in the deployment environment for no reason is how it leaks.

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

Attaching Neon through Vercel's marketplace, rather than `vercel env add` by hand, writes about
fifteen variables prefixed `FOOTBALL_MANAGER_` (`…_DATABASE_URL`, `…_PGHOST`, `…_POSTGRES_URL`, …).
**The application reads none of them.** It reads `DATABASE_URL` and nothing else, so that one still
has to exist on its own — the integration creates it too, but check it is there and that it holds the
*pooled* string.

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

```bash
DATABASE_URL='…' npm run db:migrate    # if the release contains a migration
vercel --prod
```

Migrations run before the deploy, and they are written to be safe against the previous version still
serving traffic for a few seconds.

## Environment variables, all of them

| Variable | Where | Why |
|---|---|---|
| `DATABASE_URL` | Vercel (production + preview), and the shell for `db:*` scripts | The only variable the application itself needs. |
| `SUPER_ADMIN_USERNAME` | command line, once | The first account, in `db:bootstrap`. |
| `SUPER_ADMIN_PASSWORD` | command line, once | Its password. Never stored in Vercel. |
| `ALLOW_REMOTE_RESET` | nowhere | Exists so `db:reset` can refuse. Do not set it in production. |
