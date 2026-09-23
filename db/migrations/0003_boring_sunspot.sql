-- Competitions become the coach's own data (decision 107).
--
-- This is a DATA migration, and the order below is the whole point: the table is created, the four
-- old enum values are inserted as defaults for every existing team, the new column is added
-- NULLABLE, every match is pointed at its team's row by the label its enum value maps to, and only
-- then is the column made NOT NULL and the old one dropped. `SET NOT NULL` is the safety catch: a
-- match left unmapped by the CASE below aborts the whole migration instead of quietly losing which
-- competition it was played in.
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"label_fr" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitions_team_label_unique" UNIQUE("team_id","label_fr")
);
--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitions_team_idx" ON "competitions" USING btree ("team_id");--> statement-breakpoint
-- The four values the enum used to hold, in the French the screens already printed for them, for
-- every team that exists. Same list as `DEFAULT_COMPETITIONS` in `lib/competition/defaults.ts`,
-- which is what a team created from here on gets; this file is the one-off for the teams that
-- predate the table. `ON CONFLICT` so a re-run over a half-applied database is harmless.
INSERT INTO "competitions" ("team_id", "label_fr", "sort")
SELECT "teams"."id", "defaults"."label_fr", "defaults"."sort"
FROM "teams"
CROSS JOIN (VALUES ('Championnat', 0), ('Coupe', 1), ('Amical', 2), ('Tournoi', 3)) AS "defaults"("label_fr", "sort")
ON CONFLICT ("team_id", "label_fr") DO NOTHING;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "competition_id" uuid;--> statement-breakpoint
-- Every match keeps the competition it was played in: the enum value picks the team's row by label.
UPDATE "matches" SET "competition_id" = "competitions"."id"
FROM "competitions"
WHERE "competitions"."team_id" = "matches"."team_id"
  AND "competitions"."label_fr" = CASE "matches"."competition"
    WHEN 'league' THEN 'Championnat'
    WHEN 'cup' THEN 'Coupe'
    WHEN 'friendly' THEN 'Amical'
    WHEN 'tournament' THEN 'Tournoi'
  END;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "competition_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_competition_idx" ON "matches" USING btree ("competition_id");--> statement-breakpoint
ALTER TABLE "matches" DROP COLUMN "competition";--> statement-breakpoint
DROP TYPE "public"."competition";
