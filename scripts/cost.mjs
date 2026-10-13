/**
 * Measures what this project has cost, so `docs/COST.md` can be re-derived rather than edited.
 *
 * ```bash
 *   node scripts/cost.mjs
 * ```
 *
 * ## Why this exists
 *
 * The owner asked to know the cost and to have it kept current (issue #232, decision 202). A number
 * nobody can reproduce rots into a number nobody believes, so every figure `docs/COST.md` prints is
 * this script's output or arithmetic on it. Run it, then update the file from what it says.
 *
 * It reads **only** things it can verify on this machine: Claude Code's own `cost-state` records,
 * git, the GitHub CLI and the Vercel CLI. It asserts nothing it cannot measure — see the « not
 * measured » block it prints at the end, which is the honest part.
 *
 * ## The one trap
 *
 * `cost-state` carries a **cumulative** `totalCostUSD` that is rewritten through a session, so the
 * last record per `sessionId` is the session's cost and summing every record double-counts wildly.
 * And a session is filed under the directory it ran in, so the three `.claude/worktrees/*` sessions
 * and `tmp/football-manager` each have their own transcript directory: a glob is the right
 * instrument and one `ls` is not.
 */

import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { glob } from "node:fs/promises";
import { createInterface } from "node:readline";

const TRANSCRIPTS = "/home/bgonzva/.claude/projects/*football-manager*/*.jsonl";
/** The repository was created on this day; the first commit landed the day after. */
const START = "2026-09-22";

const usd = (n) => `$${n.toFixed(2)}`;
const num = (n) => n.toLocaleString("en-US").replace(/,/g, " ");

function sh(file, args) {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/* ---- 1. The model cost, from Claude Code's own accounting ------------------ */

const perSession = new Map();
const unknownCost = new Set();
const tokens = { output: 0, cacheWrite: 0, cacheRead: 0, input: 0 };
let assistantMessages = 0;
const directories = new Set();

for await (const file of glob(TRANSCRIPTS)) {
  directories.add(file.slice(0, file.lastIndexOf("/")));
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    // Cheap string tests first: these transcripts run to hundreds of megabytes.
    if (line.includes('"cost-state"')) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record.type !== "cost-state") continue;
      // Cumulative: the last one wins, never a sum.
      perSession.set(record.sessionId, record.totalCostUSD);
      if (record.hasUnknownModelCost) unknownCost.add(record.sessionId);
      continue;
    }
    if (!line.includes('"usage"')) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = record.message?.usage;
    if (!usage) continue;
    assistantMessages += 1;
    tokens.output += usage.output_tokens ?? 0;
    tokens.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    tokens.cacheRead += usage.cache_read_input_tokens ?? 0;
    tokens.input += usage.input_tokens ?? 0;
  }
}

const total = [...perSession.values()].reduce((sum, n) => sum + n, 0);

/* ---- 2. What it bought ---------------------------------------------------- */

const head = sh("git", ["rev-parse", "--short", "origin/main"]) ?? "?";
const version = JSON.parse(sh("cat", ["package.json"]) ?? "{}").version ?? "?";
const commits = Number(sh("git", ["rev-list", "--count", "origin/main"]) ?? 0);
const mergedPrs = Number(sh("gh", ["pr", "list", "--state", "merged", "-L", "400", "--json", "number", "-q", "length"]) ?? 0);
const tracked = sh("git", ["ls-files", "--", "*.ts", "*.tsx", "*.sql", "*.css", "*.md"]) ?? "";
let lines = 0;
for (const path of tracked.split("\n").filter(Boolean)) {
  const count = sh("sh", ["-c", `wc -l < ${JSON.stringify(path)}`]);
  lines += Number(count ?? 0);
}
const days = Math.round((Date.now() - Date.parse(START)) / 86_400_000);

/* ---- 3. Infrastructure, measured ------------------------------------------ */

const visibility = sh("gh", ["repo", "view", "--json", "visibility", "-q", ".visibility"]);
const runs = Number(sh("gh", ["run", "list", "-L", "1000", "--json", "databaseId", "-q", "length"]) ?? 0);
const seconds = Number(
  sh("gh", [
    "run", "list", "-L", "100", "--status", "completed", "--json", "startedAt,updatedAt",
    "-q", "[.[] | (((.updatedAt|fromdate) - (.startedAt|fromdate)))] | add/length | floor",
  ]) ?? 0,
);
const vercelRaw = sh("vercel", ["api", "/v2/user"]);
let vercelPlan = "unread";
if (vercelRaw) {
  try {
    const body = JSON.parse(vercelRaw);
    const billing = (body.user ?? body).billing ?? {};
    vercelPlan = `${billing.plan ?? "?"} / ${billing.status ?? "?"}`;
  } catch {
    vercelPlan = "unread";
  }
}

/* ---- 4. Print ------------------------------------------------------------- */

// Europe/Paris, not UTC: late on a Paris evening the two disagree about the day, and every other
// date in this repository is Paris (`CLAUDE.md`).
const today = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
console.log(`\nmeasured ${today} · main ${head} · version ${version}\n`);
console.log("session   cost (USD)");
console.log("--------  ----------");
for (const [id, cost] of [...perSession].sort((a, b) => b[1] - a[1])) {
  console.log(`${id.slice(0, 8)}  ${cost.toFixed(2).padStart(10)}`);
}
console.log(`${"total".padEnd(8)}  ${total.toFixed(2).padStart(10)}   (${perSession.size} sessions, ${directories.size} transcript directories)`);
console.log(
  `\nunknown model cost: ${unknownCost.size === 0 ? "none — this is an accounting, not an estimate" : [...unknownCost].join(", ")}`,
);

console.log(`\nper commit (${commits})        ${usd(total / commits)}`);
console.log(`per merged PR (${mergedPrs})     ${usd(total / mergedPrs)}`);
console.log(`per line (${num(lines)})      $${(total / lines).toFixed(4)}`);
console.log(`per day (${days})            ${usd(total / days)}`);

const allInput = tokens.input + tokens.cacheRead + tokens.cacheWrite;
console.log(`\noutput        ${num(tokens.output).padStart(15)}`);
console.log(`cache write   ${num(tokens.cacheWrite).padStart(15)}`);
console.log(`cache read    ${num(tokens.cacheRead).padStart(15)}`);
console.log(`input uncached${num(tokens.input).padStart(15)}   ${((tokens.input / allInput) * 100).toFixed(4)} % of all input`);
console.log(`assistant messages with usage: ${num(assistantMessages)}`);

console.log(`\nVercel plan        ${vercelPlan}`);
console.log(`repo visibility    ${visibility}  ${visibility === "PUBLIC" ? "(Actions free, no minute cap)" : "(Actions metered!)"}`);
console.log(`workflow runs      ${runs}, ~${seconds}s average → ~${Math.round((runs * seconds) / 60)} minutes`);

console.log(`
not measured, and do not let the table imply otherwise:
  - the other machine's sessions (transcripts are local — COORDINATION.md)
  - whether any of this was actually billed: totalCostUSD is API list price, and a
    subscription is not a bill
  - Neon's plan, which needs a Neon API key this script does not have
  - the domain, shared with the portfolio project, attributed here at zero by convention
  - everybody's hours, on both sides
`);
