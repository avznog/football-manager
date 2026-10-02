-- The ratings rebuild (decision 137): half-points, no free text, no self-rating, and a column that
-- says when the coach released a match's means.
--
-- Three of these five statements are irreversible, and they are deliberate rather than tolerated:
--
--   * `comment` is dropped. The free-text field that fed it is gone from the screen, and a column
--     nobody writes is a trap for the next session — it reads as a feature that exists. Production
--     holds no ratings at all, so nothing of anyone's is lost there; a local or preview database
--     loses the seed's fixture comments, which are fixtures.
--   * the self-ratings are deleted, below, because `ratings_no_self` cannot be added over them.
--     Decision 007 *required* a rater to rate himself, so every database seeded before this holds
--     one self-note per rater and `db/seed.ts` wrote them on purpose. They are not data the new rule
--     can reinterpret: a mean « of the notes the others gave him » has no place for his own.
--   * `score` becomes `numeric(3,1)`. Widening a `smallint` loses nothing — every existing whole
--     note survives as `7` → `7.0` — and the half-step check below is satisfied by all of them, so
--     this direction is safe. The way back is not, which is why the check is stated rather than
--     implied: a `smallint` column behind a half-point slider rounds silently.
--
-- `ratings_no_self` is only half of « nobody rates himself, and only a player with minutes is
-- rated ». The other half is a fact about `match_events` that this table cannot see, so it lives in
-- `lib/rating/` and in the Server Action. This constraint is the half that is local, and it is here
-- because a crafted form post is exactly the route the UI cannot guard.
ALTER TABLE "ratings" ALTER COLUMN "score" SET DATA TYPE numeric(3, 1);--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "ratings_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ratings" DROP COLUMN "comment";--> statement-breakpoint
DELETE FROM "ratings" WHERE "rater_member_id" = "rated_member_id";--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_half_step" CHECK (("ratings"."score" * 2) = floor("ratings"."score" * 2));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_no_self" CHECK ("ratings"."rater_member_id" <> "ratings"."rated_member_id");
