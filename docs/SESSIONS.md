# Session log

Append-only. Newest last. One entry per working session: what changed, what was decided, and
where the next session should pick up.

---

## 2026-09-22 — Planning

Read `instructions.md` and turned it into an approved plan (`docs/PLAN.md`) through a round of
challenges and clarifying questions. No code written.

Decisions 001–015 recorded in `docs/DECISIONS.md`. The notable push-backs the owner accepted:
the "everything in git" requirement was reframed as spec-in-git (001), the live match got an
offline outbox on top of the requested database logging (004), and planned compositions became
suggestions requiring confirmation rather than automatic substitutions (006). The owner
knowingly kept visible-authorship ratings against advice (007), mitigated by hiding results
until you have voted.

**Next:** M0 foundations.

---

## 2026-09-23 — M0 foundations

Repository bootstrapped: `CLAUDE.md`, `docs/` (plan, decisions, data model, roadmap, this log).
Local Postgres in Docker chosen for development because provisioning Neon needs an interactive
browser flow (decision 016). Vercel CLI is already authenticated as `avznog`, so deployment is
unblocked as soon as a `DATABASE_URL` exists.

**Next:** see `docs/ROADMAP.md`.
