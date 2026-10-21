# COST.md — what this project has cost, and what that number is not

Measured on **2026-10-21**, with `main` at `23863e2` (version `1.1.2`, 215 commits, 210 merged pull
requests, 105 444 lines across `.ts`/`.tsx`/`.sql`/`.css`/`.md`). The repository was created on
2026-09-22 and its first commit landed on 2026-09-23, so everything below covers **twenty-nine days**.

**The headline, and read the next sentence with it: $2113.87.** That is the cost of the model tokens
this project consumed, **at API list prices, on both machines** — $1583.94 on the Linux one
(`/home/bgonzva`) and $529.93 on the macOS one (`/Users/benjamingonzva`), each measured by running
`node scripts/cost.mjs` there. It is not an invoice, nobody necessarily paid it, it is still a floor
(one macOS session reports $0, see below), and the sections after the table are not footnotes — they
are the difference between this figure and what left anyone's bank account.

**This file is re-measured every session** (decision 202, issue #232): `node scripts/cost.mjs` prints
every figure in it. It is a snapshot, and the measurement is a command precisely because a snapshot
rots.

---

## The measured figure

| session | machine | where it ran | cost (USD) |
|---|---|---|---|
| `7054d16c` | Linux | the main checkout | 1297.08 |
| `e0c60542` | macOS | the main checkout, 2026-09-22 → 2026-10-06 | 529.93 |
| `62dacd8d` | Linux | worktree `binary-spinning-hickey` | 152.34 |
| `efba1c3d` | Linux | worktree `ux-analyser` | 96.63 |
| `cbd8a8a5` | Linux | worktree `iphone-analyser` | 31.50 |
| `7dc058d6` | Linux | `tmp/football-manager` | 3.49 |
| `a677bdb5` | Linux | a `.claude/worktrees/*` agent, 2026-10-16 | 2.88 |
| `81055d9b` | Linux | `tmp/football-manager` | 0.01 |
| `1a3e8cd8` | macOS | the main checkout, 2026-10-09 → 2026-10-13 | 0.00 — **reported, not real** |
| **total** | | **9 sessions** | **2113.87** |

The Linux machine is **$1583.94 (75 %)** and the macOS machine **$529.93 (25 %)**. The macOS rows are
the 2026-10-14 run there and are carried unchanged: this refresh ran on the Linux machine, which can
only ever measure its own.

**`1a3e8cd8` is the one figure in the table that is wrong, and it is wrong low.** Both of its
`cost-state` records say `totalCostUSD: 0` with `hasUnknownModelCost: false`, yet its transcript holds
149 `claude-opus-5-5` messages — 104 440 output tokens, 1.10 million cache writes, 11.3 million cache
reads — and three subagent worktrees. The session ran through a regional model id
(`eu.anthropic.claude-opus-5-5[1m]`), which is the likeliest reason it went unpriced, but that is
inferred, not checked. The script does not estimate a price for it, on purpose: it is an accounting,
and an invented number would be the first thing in it nobody could re-derive. Read the total as a
floor by that session's worth, which its token counts put at a small fraction of `e0c60542`'s.

The session that wrote this refresh is `7054d16c`, which *is* in the table, so its own row is the one
figure here that is stale by a few minutes: a session's `cost-state` is flushed as it goes, and the
work of writing this paragraph is not in the $1297.08 above it. Previous refreshes were written by a
session with no record at all yet (`b90dfd89`, macOS, 2026-10-14, absent from the table for that
reason); a long-lived session merely under-reports its tail instead.

Divided by what it bought, which is the only form of this number that is any use when deciding
whether to spend more:

- **$9.83 per commit** (215) — the Linux machine alone was $7.37
- **$10.07 per merged pull request** (210) — the first time this project has crossed ten dollars a PR
- **$0.0200 per line** of committed TypeScript, SQL, CSS and Markdown — two cents exactly, up from 1.84
- **$72.89 per day** across the twenty-nine days — was $77.20 on 2026-10-16

### Against the last snapshot, which is the only way to read the trend

The previously published combined total was **$1929.96** on 2026-10-16. This machine added
**$183.91** over the five days since, to reach $2113.87, which is **$36.78 a day** of actual spend in
that window — half the project's lifetime average of $72.89, and the reason the per-day rate fell
while the total rose.

The per-*unit* rates went the other way, and that is the thing to read: **$9.06 → $9.83 per commit**,
**$9.28 → $10.07 per merged PR**, **$0.0184 → $0.0200 per line**. Those five days bought only two
commits and two merged pull requests, so almost all of the $183.91 is work that produced no new row
in git — the watch-integration research that ended in a « no » (Strava's 10-athlete cap and its
redistribution clause, Garmin's business-use-only program, HealthKit having no server API), the
cost-refresh pass, and a long diagnosis of the match clock. **A `no` costs the same as a `yes` and
leaves no denominator behind**, which is precisely why the per-commit figure is the wrong number to
optimise and the per-day one is worth watching.

The rate per line held up better than the rate per commit because the two commits in that window were
large: the clock fix alone is 833 lines, over half of them tests.

**Every comparison in this section is the Linux machine against itself**, because that is the only
machine any of these snapshots was taken on. The macOS figure cannot be split across that date: a `cost-state` record
carries no timestamp, only a running total. What can be said is that its one priced session ran from
2026-09-22 to 2026-10-06, so nearly all of its $529.93 belongs *before* the last snapshot — the
2026-10-05 figure was low by roughly that much, and the combined pace was front-loaded rather than
accelerating.

The 2026-10-05 measurement was **$747.05** over thirteen days, at `0e5b619` / `1.0.0-beta.7`, with
149 commits and 147 merged pull requests. So the nine days from there to 2026-10-14 added **$585.77**,
**53 commits** and **51 merged pull requests** — a burn of **$65.09 per day** in that window against
**$57.47 per day** before it. Set against the **$36.78 per day** of the five days since 2026-10-16,
the project's three measured windows read $57 → $65 → $37 a day: the peak was the season being
imported and shipped, not the latest work.

What those nine days bought, so the number has something to be weighed against: the thirteen-slice
cahier-des-charges rework, the owner's third and fourth backlogs, the first three matches rebuilt from
his paper sheets, the 342 real ratings recovered from the old app, `v1.0.0` and `v1.0.1` shipped,
production becoming the team's real season, and the eighteen championship fixtures imported from the
FSGT.

### How to re-derive it rather than trusting this file

```bash
node scripts/cost.mjs     # on each machine, then add the totals
```

Claude Code writes a `cost-state` record into its own transcript as it goes. Each one carries a
running `totalCostUSD` for that session and a `hasUnknownModelCost` flag; **all nine sessions
report `false`**, which is what makes the figure an accounting rather than an estimate — no message
was priced at a rate the tool did not know. `1a3e8cd8` shows that the flag is not the whole story: a
session can report `false` and still record nothing.

The script exists because that record has one trap in it, and it is the kind that produces a confident
wrong number. `totalCostUSD` is **cumulative** and is rewritten through the session, so the **last**
record per `sessionId` is the session's cost and summing every record double-counts wildly. And a
session is filed under the directory it ran in — five transcript directories match this project, the
main checkout, three `.claude/worktrees/*` and `tmp/football-manager` — so a glob over
`~/.claude/projects/*football-manager*` is the right instrument and `ls` on one directory is not.
The glob starts from the **home directory, not a literal**: the first version of the script
hard-coded `/home/bgonzva`, and on the macOS machine it would have found no transcript at all and
printed **$0.00** with every appearance of a measurement.

### Where the tokens went, which is the interesting part

| | Linux | macOS | both |
|---|---|---|---|
| output | 8 558 913 | 3 839 367 | 12 398 280 |
| cache write | 108 867 494 | 15 627 673 | 124 495 167 |
| cache read | 1 969 289 958 | 638 846 352 | 2 608 136 310 |
| input, uncached | 21 010 | 12 432 | 33 442 |

The **Linux column is today's run**, all four rows. The **macOS column is the 2026-10-14
measurement**, carried over and not re-derived, because only the machine the script runs on can be
measured.

These count the sessions' own transcripts and **not their subagents'**, which Claude Code files under
`<session>/subagents/` where the script's glob does not reach (twenty of them on macOS alone). The
dollar figures are each session's own running total, which is believed — not checked — to include its
subagents, so the token table is the smaller of the two measurements and should not be priced by hand
to second-guess the dollar one.

**Uncached input is 0.0013 % of all input.** Essentially every request read its context from the
prompt cache instead of paying full rate for it, and that is the single reason the total is $2114 and
not several times that: a cache read costs a fraction of a fresh input token, and this project read
2.61 **billion** of them against 124 million written. The practical consequence for anyone working
here is that **long sessions are cheap and cold starts are not** — the expensive act is
re-establishing context, not continuing to use it.

Cache **writes** are the line that moved most since 2026-10-16 — 68.0 → 108.9 million on this
machine, up 60 % while output rose 9 %. A cache write is what a *new* or *re-established* context
costs, so that ratio is the compaction and the fresh subagents of the last five days showing up in
the bill. It is the same lesson from the other side.

Output is the other half of the bill and it is the half that correlates with work actually done: 12.4
million output tokens, across 16 711 assistant messages (10 502 on Linux today, 6 209 on macOS on
2026-10-14).

---

## What this number does not include

### 1. A machine that has not run the script

`COORDINATION.md` exists because **more than one session works this repository, sometimes on
machines that cannot see each other at all.** Transcripts are local, so each machine's `cost-state`
records exist only on that machine, and the script can only ever print **its own machine's** share.

Both known machines are now in the table — the macOS one was added on 2026-10-14 by running the
script there. **A refresh from one machine must keep the other machine's last figure** and say how
old it is, rather than drop it: replacing the whole table with one machine's output would quietly
take $529.93 or $1583.94 off the headline. If a third machine ever works here, it is absent until it
runs the script.

### 2. A subscription is not a bill

`totalCostUSD` is computed from token counts at **API list prices**. If the work was done under a
Claude subscription rather than API billing, that money was never charged — the real outlay was the
subscription fee for the period, and $2113.87 is then better read as *what this project would have
cost at list prices*, which is a useful number for a different question (is this worth automating,
what would it cost someone else) and the wrong one for « what did I spend ».

**This file cannot tell which case applies**, because the transcript records the computed cost either
way. Check the billing mode, and if it is a subscription, the honest total for the twenty-nine days is
the pro-rated fee.

### 3. Time

Nobody's hours are in here, on either side. Twenty-nine days of review, phone testing and decisions is
the largest uncosted input to the project and the one this file is least able to measure.

---

## Infrastructure — measured, and it is zero

Three of the four are verified, and the verification matters more than the result, because « we are
on the free tier » is exactly the kind of claim that is true until a usage threshold moves.

- **Vercel: $0.** The account's plan is `hobby`, status `active` —
  `vercel api /v2/user` → `billing.plan`. Both deployments this project has (production
  `7orteils.bgonzva.fr`, preview `dev.7orteils.bgonzva.fr`) run inside it. Two consequences already
  recorded elsewhere in `docs/` follow from the plan rather than from a choice: Skew Protection is
  Pro-and-above and therefore unavailable (decision 127), and the `?dpl=` cache-buster is all a
  `deploymentId` buys here (`docs/SESSIONS.md`).
- **GitHub Actions: $0.** `avznog/football-manager` is **public** (`gh repo view --json visibility`),
  and standard runners are free for public repositories with no minute cap. The usage keeps growing:
  **492 workflow runs** (462 five days ago), averaging 196 s of wall clock over a sample of 100
  completed runs, so roughly **1 607 minutes** (was ~1 494). Worth writing down because the number is
  the bill the day the repository is made private — about 1 607 minutes against a 2 000-minute monthly
  allowance, i.e. still nothing, but no longer with much room, and ~$0.008/minute beyond it.
- **Neon: still unverified, and the reason is the same one as last time.** Two databases are in play
  (preview and production) and the free tier plausibly covers both, but **this file will not assert
  it**. This session holds the *database* connection strings and **no Neon API key**, and a Postgres
  password cannot read an account's plan: the gap is not a thing nobody got round to, it is a
  credential nobody has. Check it in the Neon console; if it is the free tier, say so here with the
  date.
- **The domain: shared, and not this project's alone.** `7orteils.bgonzva.fr` and
  `dev.7orteils.bgonzva.fr` are subdomains of `bgonzva.fr`, which also serves the `portfolio`
  project. The registration is a real cost and attributing all of it here would be wrong; attributing
  none of it is the convention this file adopts, stated so that the next reader knows it is a choice.

---

## Keeping this file honest

It is a snapshot, like `COORDINATION.md`'s `## NOW` and unlike the rest of `docs/`, and it will rot
the same way. Three rules, and the first is now in `CLAUDE.md`'s definition of done:

1. **Refresh it every session.** The owner asked for the cost to be known and current (issue #232,
   decision 202). A session that changed anything runs the script and updates **its own machine's
   rows** in this file, keeping the other machine's last figures and their date.
2. **Run `node scripts/cost.mjs`, do not edit the number.** Every figure above is either that
   script's output or arithmetic on one, which is why the script is in the repository rather than in
   somebody's shell history.
3. **Date the measurement, name the commit it was taken at, and keep the previous snapshot's
   figures.** A cost without a denominator — 215 commits, twenty-nine days — says nothing at all, and a
   cost without its predecessor says nothing about where it is going.
