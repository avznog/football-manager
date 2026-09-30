# Do not push to this branch

This branch exists for one reason: Vercel's **Production Branch** setting must name a branch that
exists in the connected repository, and this project must never deploy to production from a push.

`docs/DEPLOY.md` and decision 080: `main` feeds the preview at `dev.7orteils.bgonzva.fr`, and
production at `7orteils.bgonzva.fr` is promoted deliberately, by the release job, after the
production migration has run. Pointing the Production Branch at a real working branch — it was
`stop/handover` — means any push to that branch deploys unmigrated work straight to production.

So the Production Branch points here instead, and this branch holds no application code at all: it
is an orphan commit with this file and nothing else. A push to it would fail the build rather than
deploy anything, which is the loud failure we want if somebody ever does it by accident.

If you need to change this, change the Vercel setting first.