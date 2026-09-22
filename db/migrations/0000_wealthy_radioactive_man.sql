CREATE TYPE "public"."availability_status" AS ENUM('yes', 'no', 'maybe');--> statement-breakpoint
CREATE TYPE "public"."competition" AS ENUM('league', 'cup', 'friendly', 'tournament');--> statement-breakpoint
CREATE TYPE "public"."entry_mode" AS ENUM('live', 'retro');--> statement-breakpoint
CREATE TYPE "public"."match_event_type" AS ENUM('KICKOFF', 'PERIOD_END', 'PAUSE', 'RESUME', 'GOAL_FOR', 'GOAL_AGAINST', 'OWN_GOAL', 'PENALTY_SCORED', 'PENALTY_MISSED', 'SUBSTITUTION', 'POSITION_CHANGE', 'LINEUP_APPLIED', 'FOUL', 'INJURY', 'FINAL_WHISTLE', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'finished');--> statement-breakpoint
CREATE TYPE "public"."position_line" AS ENUM('GB', 'DEF', 'MIL', 'ATT');--> statement-breakpoint
CREATE TYPE "public"."position_preference" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."squad_role" AS ENUM('starter', 'substitute', 'supporter');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('coach', 'player');--> statement-breakpoint
CREATE TABLE "formation_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"position_code" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"sort" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "injuries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_member_id" uuid NOT NULL,
	"started_on" date NOT NULL,
	"expected_return_on" date,
	"note" text,
	"declared_by" uuid,
	"resolved_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"code" text NOT NULL,
	"role" "team_role" DEFAULT 'player' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lineup_slots" (
	"lineup_id" uuid NOT NULL,
	"formation_slot_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	CONSTRAINT "lineup_slots_slot_unique" UNIQUE("lineup_id","formation_slot_id"),
	CONSTRAINT "lineup_slots_member_unique" UNIQUE("lineup_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"from_minute" integer DEFAULT 0 NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"applied_event_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lineups_match_from_minute_unique" UNIQUE("match_id","from_minute")
);
--> statement-breakpoint
CREATE TABLE "match_availability" (
	"match_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"status" "availability_status" NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_availability_unique" UNIQUE("match_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"client_event_id" uuid NOT NULL,
	"type" "match_event_type" NOT NULL,
	"period" smallint NOT NULL,
	"minute" integer NOT NULL,
	"clock_ms" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"voids_event_id" uuid,
	"seq" integer NOT NULL,
	CONSTRAINT "match_events_client_event_unique" UNIQUE("client_event_id"),
	CONSTRAINT "match_events_match_seq_unique" UNIQUE("match_id","seq")
);
--> statement-breakpoint
CREATE TABLE "match_player_stats" (
	"match_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"own_goals" integer DEFAULT 0 NOT NULL,
	"penalties_scored" integer DEFAULT 0 NOT NULL,
	"penalties_missed" integer DEFAULT 0 NOT NULL,
	"fouls" integer DEFAULT 0 NOT NULL,
	"gk_minutes" integer DEFAULT 0 NOT NULL,
	"clean_minutes" integer DEFAULT 0 NOT NULL,
	"conceded_while_on" integer DEFAULT 0 NOT NULL,
	"squad_role" "squad_role",
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_player_stats_unique" UNIQUE("match_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "match_squad" (
	"match_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"role" "squad_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_squad_unique" UNIQUE("match_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"opponent_name" text NOT NULL,
	"is_home" boolean DEFAULT true NOT NULL,
	"venue" text,
	"competition" "competition" DEFAULT 'league' NOT NULL,
	"periods_count" smallint DEFAULT 2 NOT NULL,
	"period_minutes" smallint DEFAULT 30 NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"operator_user_id" uuid,
	"entry_mode" "entry_mode" DEFAULT 'live' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_periods_positive" CHECK ("matches"."periods_count" > 0 and "matches"."period_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "player_positions" (
	"team_member_id" uuid NOT NULL,
	"position_code" text NOT NULL,
	"preference" "position_preference" DEFAULT 'secondary' NOT NULL,
	CONSTRAINT "player_positions_unique" UNIQUE("team_member_id","position_code")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"code" text PRIMARY KEY NOT NULL,
	"label_fr" text NOT NULL,
	"line" "position_line" NOT NULL,
	"default_x" integer NOT NULL,
	"default_y" integer NOT NULL,
	"sort" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"rater_member_id" uuid NOT NULL,
	"rated_member_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_unique" UNIQUE("match_id","rater_member_id","rated_member_id"),
	CONSTRAINT "ratings_score_range" CHECK ("ratings"."score" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'player' NOT NULL,
	"is_player" boolean DEFAULT true NOT NULL,
	"jersey_number" smallint,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "team_members_jersey_range" CHECK ("team_members"."jersey_number" is null or "team_members"."jersey_number" between 1 and 99)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"crest_url" text,
	"primary_color" text DEFAULT '#1f6feb' NOT NULL,
	"secondary_color" text DEFAULT '#ffffff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "training_attendance" (
	"training_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"present" boolean NOT NULL,
	"marked_by" uuid,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_attendance_unique" UNIQUE("training_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "training_availability" (
	"training_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"status" "availability_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_availability_unique" UNIQUE("training_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "formation_slots" ADD CONSTRAINT "formation_slots_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_slots" ADD CONSTRAINT "formation_slots_position_code_positions_code_fk" FOREIGN KEY ("position_code") REFERENCES "public"."positions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_declared_by_users_id_fk" FOREIGN KEY ("declared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_slots" ADD CONSTRAINT "lineup_slots_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_slots" ADD CONSTRAINT "lineup_slots_formation_slot_id_formation_slots_id_fk" FOREIGN KEY ("formation_slot_id") REFERENCES "public"."formation_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_slots" ADD CONSTRAINT "lineup_slots_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_availability" ADD CONSTRAINT "match_availability_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_availability" ADD CONSTRAINT "match_availability_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_squad" ADD CONSTRAINT "match_squad_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_squad" ADD CONSTRAINT "match_squad_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_positions" ADD CONSTRAINT "player_positions_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_positions" ADD CONSTRAINT "player_positions_position_code_positions_code_fk" FOREIGN KEY ("position_code") REFERENCES "public"."positions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_member_id_team_members_id_fk" FOREIGN KEY ("rater_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rated_member_id_team_members_id_fk" FOREIGN KEY ("rated_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_availability" ADD CONSTRAINT "training_availability_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_availability" ADD CONSTRAINT "training_availability_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "formation_slots_formation_idx" ON "formation_slots" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "formations_team_idx" ON "formations" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "injuries_member_idx" ON "injuries" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "invites_team_idx" ON "invites" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "lineups_match_idx" ON "lineups" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id","seq");--> statement-breakpoint
CREATE INDEX "matches_team_kickoff_idx" ON "matches" USING btree ("team_id","kickoff_at");--> statement-breakpoint
CREATE INDEX "ratings_match_idx" ON "ratings" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trainings_team_starts_idx" ON "trainings" USING btree ("team_id","starts_at");