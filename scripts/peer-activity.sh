#!/usr/bin/env bash
#
# What the other sessions have done since the last time this ran.
#
# There is more than one Claude session on this repository and they are on different machines, so
# none of them can see the others directly (`ListAgents` lists this machine only). What they *do*
# share is `origin`. This reads it — branches, open pull requests, `main`, and the log in
# COORDINATION.md — and prints only what moved.
#
# Read-only with respect to git: no fetch into the working tree, no checkout, nothing staged. It
# touches one file, a snapshot under `.git/`, which is never committed by construction.
#
#   npm run peer            # what changed since last time
#   npm run peer -- --full  # the whole picture, changed or not
#
# Exit code is 0 when nothing changed and 10 when something did, so a watcher can branch on it.

set -uo pipefail

REPO="avznog/football-manager"
SNAPSHOT="$(git rev-parse --git-dir)/peer-activity-snapshot"
FULL=0
[ "${1:-}" = "--full" ] && FULL=1

if ! command -v gh >/dev/null 2>&1; then
  echo "peer-activity: needs the gh CLI on PATH." >&2
  exit 2
fi

# One API round trip per kind of thing, all of them read-only.
branches=$(gh api "repos/$REPO/branches" --jq \
  '.[] | select(.name != "main") | "branch \(.name) \(.commit.sha[0:8])"' 2>/dev/null | sort)

prs=$(gh pr list --repo "$REPO" --state open --json number,headRefName,title,updatedAt --jq \
  '.[] | "pr #\(.number) \(.headRefName) \(.updatedAt) \(.title)"' 2>/dev/null | sort)

main_head=$(gh api "repos/$REPO/commits/main" --jq '"main \(.sha[0:8]) \(.commit.message | split("\n")[0])"' 2>/dev/null)

# The coordination log is the one place another session can answer deliberately, so a new line in
# it is worth more than any amount of inferred activity.
coord_log=$(gh api "repos/$REPO/contents/COORDINATION.md?ref=main" --jq '.content' 2>/dev/null \
  | base64 -d 2>/dev/null | sed -n '/^## Log/,$p' | grep -c '^- \*\*' )

current=$(printf '%s\n%s\n%s\ncoord-log-lines %s\n' "$main_head" "$branches" "$prs" "${coord_log:-0}")

if [ ! -f "$SNAPSHOT" ]; then
  printf '%s' "$current" > "$SNAPSHOT"
  echo "peer-activity: first run, baseline recorded."
  echo "$current" | sed 's/^/  /'
  exit 10
fi

previous=$(cat "$SNAPSHOT")

if [ "$current" = "$previous" ] && [ "$FULL" -eq 0 ]; then
  echo "peer-activity: no change since $(date -r "$SNAPSHOT" '+%H:%M:%S')."
  exit 0
fi

if [ "$FULL" -eq 1 ] && [ "$current" = "$previous" ]; then
  echo "peer-activity: no change, full picture:"
  echo "$current" | sed 's/^/  /'
  exit 0
fi

echo "peer-activity: changed since $(date -r "$SNAPSHOT" '+%H:%M:%S'):"
diff <(echo "$previous") <(echo "$current") | grep -E '^[<>]' | sed \
  -e 's/^< /  gone: /' \
  -e 's/^> /  new:  /'

printf '%s' "$current" > "$SNAPSHOT"
exit 10
