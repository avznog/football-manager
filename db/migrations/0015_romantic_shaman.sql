CREATE TYPE "public"."seven_kind" AS ENUM('offensive', 'defensive', 'legende', 'notes');--> statement-breakpoint
CREATE TABLE "seven_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"kind" "seven_kind" NOT NULL,
	"competition_id" uuid,
	"fingerprint" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"slots" jsonb NOT NULL,
	"reasons" jsonb,
	"summary_fr" text,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seven_suggestions_fingerprint_unique" UNIQUE("team_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "seven_suggestions" ADD CONSTRAINT "seven_suggestions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seven_suggestions" ADD CONSTRAINT "seven_suggestions_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seven_suggestions_lookup_idx" ON "seven_suggestions" USING btree ("team_id","kind","competition_id");