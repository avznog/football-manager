CREATE TABLE "match_player_positions" (
	"match_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"position_code" text NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "match_player_positions_match_id_team_member_id_position_code_pk" PRIMARY KEY("match_id","team_member_id","position_code")
);
--> statement-breakpoint
ALTER TABLE "match_player_stats" ADD COLUMN "goals_for_while_on" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_player_positions" ADD CONSTRAINT "match_player_positions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_positions" ADD CONSTRAINT "match_player_positions_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;