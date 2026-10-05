# COST.md — what this project has cost, and what that number is not

Measured on **2026-10-05**, with `main` at `0e5b619` (version `1.0.0-beta.7`, 149 commits, 147
merged pull requests, 85 810 lines across `.ts`/`.tsx`/`.sql`/`.css`/`.md`). The repository was
created on 2026-09-22 and its first commit landed on 2026-09-23, so everything below covers
**thirteen days**.

**The headline, and read the next sentence with it: $747.05.** That is the cost of the model tokens
this project consumed, **at API list prices, on this machine only**. It is not an invoice, nobody
necessarily paid it, and the three sections after the table are not footnotes — they are the
difference between this figure and what left anyone's bank account.

---

## The measured figure

| session | where it ran | cost (USD) |
|---|---|---|
| `7054d16c` | the main checkout | 463.08 |
| `62dacd8d` | worktree `binary-spinning-hickey` | 152.34 |
| `efba1c3d` | worktree `ux-analyser` | 96.63 |
| `cbd8a8a5` | worktree `iphone-analyser` | 31.50 |
| `7dc058d6` | `tmp/football-manager` | 3.49 |
| `81055d9b` | `tmp/football-manager` | 0.01 |
| **total** | **6 sessions** | **747.05** |

Divided by what it bought, which is the only form of this number that is any use when deciding
whether to spend more:

- **$5.01 per commit** (149)
- **$5.08 per merged pull request** (147)
- **$0.0087 per line** of committed TypeScript, SQL, CSS and Markdown — under a cent
- **$57.47 per day** across the thirteen days

### How to re-derive it rather than trusting this file

Claude Code writes a `cost-state` record into its own transcript as it goes. Each one carries a
running `totalCostUSD` for that session and a `hasUnknownModelCost` flag; **all six sessions here
report `false`**, which is what makes the figure an accounting rather than an estimate — no message
was priced at a rate the tool did not know.

```bash
python3 - <<'PY'
import json, glob, os
last = {}
for d in glob.glob('/home/bgonzva/.claude/projects/*football-manager*'):
    for f in glob.glob(os.path.join(d, '*.jsonl')):
        for line in open(f, errors='replace'):
            if '"cost-state"' not in line: continue
            o = json.loads(line)
            if o.get('type') == 'cost-state': last[o['sessionId']] = o['totalCostUSD']
print(round(sum(last.values()), 2), 'USD across', len(last), 'sessions')
PY
```

Take the **last** record per `sessionId`, not the sum of all of them: the value is cumulative and is
rewritten through the session, so adding every record double-counts. Five transcript directories
match this project — the main checkout, three `.claude/worktrees/*` and `tmp/football-manager` — and
a session's cost is filed under the directory it ran in, which is why a glob is the right instrument
and `ls` on one directory is not.

### Where the tokens went, which is the interesting part

| | tokens |
|---|---|
| output | 5 556 900 |
| cache write | 32 821 786 |
| cache read | 743 149 817 |
| input, uncached | 14 898 |

**Uncached input is 0.002 % of all input.** Essentially every request read its context from the
prompt cache instead of paying full rate for it, and that is the single reason the total is $747 and
not several times that: a cache read costs a fraction of a fresh input token, and this project read
743 million of them against 32.8 million written. The practical consequence for anyone working here
is that **long sessions are cheap and cold starts are not** — the expensive act is re-establishing
context, not continuing to use it.

Output is the other half of the bill and it is the half that correlates with work actually done: 5.56
million output tokens across 7 452 assistant messages.

---

## What this number does not include

### 1. The other machine

`COORDINATION.md` exists because **more than one session works this repository, sometimes on
machines that cannot see each other at all.** Transcripts are local, so a session that ran on the
other machine left its `cost-state` records there. Of the 147 merged pull requests, several are
recorded in `docs/SESSIONS.md` as the other machine's work, and **none of their cost is in the table
above**.

So $747.05 is a floor, not a total. To close the gap, run the snippet above on the other machine and
add the two.

### 2. A subscription is not a bill

`totalCostUSD` is computed from token counts at **API list prices**. If the work was done under a
Claude subscription rather than API billing, that money was never charged — the real outlay was the
subscription fee for the period, and $747.05 is then better read as *what this project would have
cost at list prices*, which is a useful number for a different question (is this worth automating,
what would it cost someone else) and the wrong one for « what did I spend ».

**This file cannot tell which case applies**, because the transcript records the computed cost either
way. Check the billing mode, and if it is a subscription, the honest total for the thirteen days is
the pro-rated fee.

### 3. Time

Nobody's hours are in here, on either side. Thirteen days of review, phone testing and decisions is
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
  and standard runners are free for public repositories with no minute cap. The usage is not small:
  **343 workflow runs**, averaging 197 s of wall clock over a sample of 100 completed runs, so
  roughly **1 130 minutes**. Worth writing down because the number is the bill the day the repository
  is made private — about 1 130 minutes against a 2 000-minute monthly allowance, i.e. still nothing
  until the pace roughly doubles, and ~$9/month at $0.008/minute beyond it.
- **Neon: unverified.** Two databases are in play (preview and production) and the free tier plausibly
  covers both, but **this file will not assert it** — reading the plan needs credentials this
  session deliberately does not have. Check it in the Neon console; if it is the free tier, say so
  here with the date.
- **The domain: shared, and not this project's alone.** `7orteils.bgonzva.fr` and
  `dev.7orteils.bgonzva.fr` are subdomains of `bgonzva.fr`, which also serves the `portfolio`
  project. The registration is a real cost and attributing all of it here would be wrong; attributing
  none of it is the convention this file adopts, stated so that the next reader knows it is a choice.

---

## Keeping this file honest

It is a snapshot, like `COORDINATION.md`'s `## NOW` and unlike the rest of `docs/`, and it will rot
the same way. Two rules:

1. **Re-run the snippet, do not edit the number.** Every figure above is either a command's output or
   arithmetic on one, and the commands are in the file for that reason.
2. **Date the measurement, and name the commit it was taken at.** A cost without a denominator —
   149 commits, thirteen days — says nothing at all.
