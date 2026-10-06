-- The flocage loses its ceiling, and keeps its floor.
--
-- `team_members_shirt_name_length` read `between 1 and 12` (`0002_daily_sharon_carter.sql`). The
-- twelve was a guess at what a flocking machine prints legibly across a 7-a-side back, and the
-- owner removed it (2026-10-06): how short a name has to be to fit is a decision for whoever
-- orders the shirts, not a reason for the app to refuse to remember what the player typed.
--
-- The constraint is **relaxed rather than dropped**, because its lower bound does different work:
-- it is what stops a one-space flocage from reaching the column as an empty string, so « no
-- flocage » keeps exactly one representation — `null` — and no screen has to tell `''` and `null`
-- apart. `shirtNameSchema` enforces the same thing from the other side with `trim()` and a
-- transform to `null`; dropping the check here would leave that invariant held in one place
-- instead of two.
--
-- No data migration is needed: widening a check can fail no existing row.
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_shirt_name_length";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_shirt_name_length" CHECK ("team_members"."shirt_name" is null or char_length("team_members"."shirt_name") >= 1);
