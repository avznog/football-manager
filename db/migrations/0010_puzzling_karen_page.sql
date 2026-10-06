-- Decision 144 — `ratings.score` tolerates one decimal, not only half-points.
--
-- The match-day slider still steps by 0.5 and `lib/rating/validation.ts` still refuses anything
-- else, so nothing about what a rater can submit changes. What changes is what the *column* will
-- hold: a historical per-match mean computed from real notes lands on 7.3, and rounding it to the
-- half-point collapses a season's ranking into five-way ties.
--
-- Widening a check loses nothing: every row the old check admitted satisfies the new one.
--
-- The new check is a statement of intent rather than enforcement, and knowingly so: `numeric(3,1)`
-- *rounds* on insert instead of erroring, so `7.26` is already stored as `7.3` by the time the
-- check runs and `(score * 10) = floor(score * 10)` can never fire. It is kept for the same reason
-- `ratings_score_range` coexists with the Zod schema — the column states its own shape, and if the
-- scale is ever widened the check becomes live enforcement rather than something to remember.
ALTER TABLE "ratings" DROP CONSTRAINT "ratings_score_half_step";--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_one_decimal" CHECK (("ratings"."score" * 10) = floor("ratings"."score" * 10));
