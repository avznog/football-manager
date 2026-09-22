/**
 * Drizzle schema — the authoritative definition of the database.
 *
 * Read `docs/DATA_MODEL.md` alongside this file: it documents the invariants that the schema
 * cannot express, and `docs/DECISIONS.md` for why things are shaped this way.
 *
 * Column names are derived automatically in snake_case (see `casing` in `drizzle.config.ts`
 * and `db/client.ts`), so a TS property `teamId` maps to the column `team_id`.
 */

import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const teamRole = pgEnum("team_role", ["coach", "player"]);
export const availabilityStatus = pgEnum("availability_status", ["yes", "no", "maybe"]);
export const squadRole = pgEnum("squad_role", ["starter", "substitute", "supporter"]);
export const competition = pgEnum("competition", ["league", "cup", "friendly", "tournament"]);
export const matchStatus = pgEnum("match_status", ["scheduled", "live", "finished"]);
export const entryMode = pgEnum("entry_mode", ["live", "retro"]);
export const positionLine = pgEnum("position_line", ["GB", "DEF", "MIL", "ATT"]);
export const positionPreference = pgEnum("position_preference", ["primary", "secondary"]);

/**
 * Match event types. See `docs/DATA_MODEL.md` for each one's payload shape.
 * Deliberately excludes cards and opponent detail (decision 010).
 */
export const matchEventType = pgEnum("match_event_type", [
  "KICKOFF",
  "PERIOD_END",
  "PAUSE",
  "RESUME",
  "GOAL_FOR",
  "GOAL_AGAINST",
  "OWN_GOAL",
  "PENALTY_SCORED",
  "PENALTY_MISSED",
  "SUBSTITUTION",
  "POSITION_CHANGE",
  "LINEUP_APPLIED",
  "FOUL",
  "INJURY",
  "FINAL_WHISTLE",
  "VOID",
]);

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Lowercase. This is the login — there is no email (decision 008). */
    username: text().notNull(),
    passwordHash: text().notNull(),
    displayName: text().notNull(),
    isSuperAdmin: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("users_username_unique").on(t.username)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the opaque token handed to the browser. The raw token is never stored. */
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/* Teams and membership                                                       */
/* -------------------------------------------------------------------------- */

export const teams = pgTable(
  "teams",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    crestUrl: text(),
    /** Used for kit discs and the team header only, never as the app accent (decision 014). */
    primaryColor: text().notNull().default("#1f6feb"),
    secondaryColor: text().notNull().default("#ffffff"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("teams_slug_unique").on(t.slug)],
);

/**
 * The central table. Almost everything references a membership rather than a user:
 * a player's goals belong to their membership of a team, not to their account.
 */
export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRole().notNull().default("player"),
    /** A coach with `isPlayer` gets both permission sets (a player-coach). */
    isPlayer: boolean().notNull().default(true),
    jerseyNumber: smallint(),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Set when someone leaves: history is kept, but they disappear from selection lists. */
    leftAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("team_members_team_idx").on(t.teamId),
    index("team_members_user_idx").on(t.userId),
    check("team_members_jersey_range", sql`${t.jerseyNumber} is null or ${t.jerseyNumber} between 1 and 99`),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** Short, human-readable, shared over WhatsApp. */
    code: text().notNull(),
    role: teamRole().notNull().default("player"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    maxUses: integer().notNull().default(1),
    uses: integer().notNull().default(0),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("invites_code_unique").on(t.code), index("invites_team_idx").on(t.teamId)],
);

/* -------------------------------------------------------------------------- */
/* Positions and formations                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reference data, never edited by users. The fixed 7-a-side vocabulary that makes position
 * preferences meaningful across every formation (decision 005).
 * Coordinates are normalised 0..1 on a vertical pitch, y = 0 at our own goal line.
 */
export const positions = pgTable("positions", {
  code: text().primaryKey(),
  labelFr: text().notNull(),
  line: positionLine().notNull(),
  defaultX: integer().notNull(),
  defaultY: integer().notNull(),
  sort: integer().notNull(),
});

export const formations = pgTable(
  "formations",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Null means a built-in template shared by every team. */
    teamId: uuid().references(() => teams.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** e.g. "1-3-2-1" */
    label: text().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("formations_team_idx").on(t.teamId)],
);

/** Exactly 7 rows per formation, exactly one with `positionCode = 'GB'`. */
export const formationSlots = pgTable(
  "formation_slots",
  {
    id: uuid().primaryKey().defaultRandom(),
    formationId: uuid()
      .notNull()
      .references(() => formations.id, { onDelete: "cascade" }),
    positionCode: text()
      .notNull()
      .references(() => positions.code),
    /** Normalised 0..1000 (integer permille) to avoid float drift. */
    x: integer().notNull(),
    y: integer().notNull(),
    sort: integer().notNull(),
  },
  (t) => [index("formation_slots_formation_idx").on(t.formationId)],
);

export const playerPositions = pgTable(
  "player_positions",
  {
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    positionCode: text()
      .notNull()
      .references(() => positions.code),
    preference: positionPreference().notNull().default("secondary"),
  },
  (t) => [unique("player_positions_unique").on(t.teamMemberId, t.positionCode)],
);

/* -------------------------------------------------------------------------- */
/* Matches                                                                    */
/* -------------------------------------------------------------------------- */

/** The score is never stored here — it is derived from `matchEvents` (decision 003). */
export const matches = pgTable(
  "matches",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    kickoffAt: timestamp({ withTimezone: true }).notNull(),
    opponentName: text().notNull(),
    isHome: boolean().notNull().default(true),
    venue: text(),
    competition: competition().notNull().default("league"),
    periodsCount: smallint().notNull().default(2),
    periodMinutes: smallint().notNull().default(30),
    status: matchStatus().notNull().default("scheduled"),
    /** Who drives game mode; defaults to the coach who starts it (decision 004). */
    operatorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    entryMode: entryMode().notNull().default("live"),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("matches_team_kickoff_idx").on(t.teamId, t.kickoffAt),
    check("matches_periods_positive", sql`${t.periodsCount} > 0 and ${t.periodMinutes} > 0`),
  ],
);

/** Written by the player themselves; a coach may not answer on their behalf. */
export const matchAvailability = pgTable(
  "match_availability",
  {
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    status: availabilityStatus().notNull(),
    note: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("match_availability_unique").on(t.matchId, t.teamMemberId)],
);

/** The match sheet. Only members listed here may rate afterwards (decision 007). */
export const matchSquad = pgTable(
  "match_squad",
  {
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    role: squadRole().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("match_squad_unique").on(t.matchId, t.teamMemberId)],
);

/**
 * A composition. `appliedEventId` stays null until the coach confirms it in game mode —
 * that is how "planned" and "actually happened" stay distinguishable (decision 006).
 */
export const lineups = pgTable(
  "lineups",
  {
    id: uuid().primaryKey().defaultRandom(),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    formationId: uuid()
      .notNull()
      .references(() => formations.id),
    /** Continuous match minute from which this composition applies. 0 for the initial one. */
    fromMinute: integer().notNull().default(0),
    isInitial: boolean().notNull().default(false),
    appliedEventId: uuid(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lineups_match_idx").on(t.matchId),
    unique("lineups_match_from_minute_unique").on(t.matchId, t.fromMinute),
  ],
);

export const lineupSlots = pgTable(
  "lineup_slots",
  {
    lineupId: uuid()
      .notNull()
      .references(() => lineups.id, { onDelete: "cascade" }),
    formationSlotId: uuid()
      .notNull()
      .references(() => formationSlots.id, { onDelete: "cascade" }),
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
  },
  (t) => [
    unique("lineup_slots_slot_unique").on(t.lineupId, t.formationSlotId),
    // A player cannot occupy two slots in the same composition.
    unique("lineup_slots_member_unique").on(t.lineupId, t.teamMemberId),
  ],
);

/**
 * APPEND-ONLY. Never UPDATE, never DELETE (decision 003).
 * A mistake is corrected by inserting a VOID event whose `voidsEventId` points at it.
 */
export const matchEvents = pgTable(
  "match_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    /** Idempotency key generated on the device. Makes outbox retries safe (decision 004). */
    clientEventId: uuid().notNull(),
    type: matchEventType().notNull(),
    period: smallint().notNull(),
    /** Continuous display minute: the second half of a 2x30 runs 30..60 (decision 009). */
    minute: integer().notNull(),
    /** Precise elapsed match time, excluding pauses. */
    clockMs: integer().notNull(),
    /** Captured on the device, so a delayed sync still lands at the right moment. */
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    payload: jsonb().notNull().default({}),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Only ever set on a VOID event. A VOID may not target another VOID. */
    voidsEventId: uuid(),
    /** Monotonic per match, so events recorded in the same millisecond still order. */
    seq: integer().notNull(),
  },
  (t) => [
    unique("match_events_client_event_unique").on(t.clientEventId),
    unique("match_events_match_seq_unique").on(t.matchId, t.seq),
    index("match_events_match_idx").on(t.matchId, t.seq),
  ],
);

/**
 * A cache, not a source of truth. Written by reducing `matchEvents` at the final whistle and
 * recomputed from scratch on amendment. Never written incrementally.
 */
export const matchPlayerStats = pgTable(
  "match_player_stats",
  {
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    minutes: integer().notNull().default(0),
    goals: integer().notNull().default(0),
    assists: integer().notNull().default(0),
    ownGoals: integer().notNull().default(0),
    penaltiesScored: integer().notNull().default(0),
    penaltiesMissed: integer().notNull().default(0),
    fouls: integer().notNull().default(0),
    /** Minutes spent in the GB slot. */
    gkMinutes: integer().notNull().default(0),
    /** Minutes on the pitch during which the team conceded nothing (decision 011). */
    cleanMinutes: integer().notNull().default(0),
    concededWhileOn: integer().notNull().default(0),
    squadRole: squadRole(),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("match_player_stats_unique").on(t.matchId, t.teamMemberId)],
);

/* -------------------------------------------------------------------------- */
/* Trainings                                                                  */
/* -------------------------------------------------------------------------- */

export const trainings = pgTable(
  "trainings",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    venue: text(),
    note: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trainings_team_starts_idx").on(t.teamId, t.startsAt)],
);

export const trainingAvailability = pgTable(
  "training_availability",
  {
    trainingId: uuid()
      .notNull()
      .references(() => trainings.id, { onDelete: "cascade" }),
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    status: availabilityStatus().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("training_availability_unique").on(t.trainingId, t.teamMemberId)],
);

/** Deliberately separate from declared availability — the gap between them is interesting. */
export const trainingAttendance = pgTable(
  "training_attendance",
  {
    trainingId: uuid()
      .notNull()
      .references(() => trainings.id, { onDelete: "cascade" }),
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    present: boolean().notNull(),
    markedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    markedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("training_attendance_unique").on(t.trainingId, t.teamMemberId)],
);

/* -------------------------------------------------------------------------- */
/* Injuries                                                                   */
/* -------------------------------------------------------------------------- */

/** A member is injured while a row exists with `resolvedOn` null. Flagged, never blocked. */
export const injuries = pgTable(
  "injuries",
  {
    id: uuid().primaryKey().defaultRandom(),
    teamMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    startedOn: date({ mode: "string" }).notNull(),
    expectedReturnOn: date({ mode: "string" }),
    note: text(),
    declaredBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedOn: date({ mode: "string" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("injuries_member_idx").on(t.teamMemberId)],
);

/* -------------------------------------------------------------------------- */
/* Ratings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Self-rating is allowed, and authorship is visible to everyone (decision 007).
 * A rater may not read anyone else's ratings until they have submitted their own full set —
 * enforced in the query layer, not here.
 */
export const ratings = pgTable(
  "ratings",
  {
    id: uuid().primaryKey().defaultRandom(),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    raterMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    ratedMemberId: uuid()
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    score: smallint().notNull(),
    comment: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ratings_unique").on(t.matchId, t.raterMemberId, t.ratedMemberId),
    index("ratings_match_idx").on(t.matchId),
    check("ratings_score_range", sql`${t.score} between 0 and 10`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(teamMembers),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  matches: many(matches),
  trainings: many(trainings),
  formations: many(formations),
  invites: many(invites),
}));

export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
  preferredPositions: many(playerPositions),
  injuries: many(injuries),
}));

export const playerPositionsRelations = relations(playerPositions, ({ one }) => ({
  member: one(teamMembers, {
    fields: [playerPositions.teamMemberId],
    references: [teamMembers.id],
  }),
  position: one(positions, {
    fields: [playerPositions.positionCode],
    references: [positions.code],
  }),
}));

export const formationsRelations = relations(formations, ({ one, many }) => ({
  team: one(teams, { fields: [formations.teamId], references: [teams.id] }),
  slots: many(formationSlots),
}));

export const formationSlotsRelations = relations(formationSlots, ({ one }) => ({
  formation: one(formations, {
    fields: [formationSlots.formationId],
    references: [formations.id],
  }),
  position: one(positions, {
    fields: [formationSlots.positionCode],
    references: [positions.code],
  }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  team: one(teams, { fields: [matches.teamId], references: [teams.id] }),
  availability: many(matchAvailability),
  squad: many(matchSquad),
  lineups: many(lineups),
  events: many(matchEvents),
  playerStats: many(matchPlayerStats),
  ratings: many(ratings),
}));

export const matchAvailabilityRelations = relations(matchAvailability, ({ one }) => ({
  match: one(matches, { fields: [matchAvailability.matchId], references: [matches.id] }),
  member: one(teamMembers, {
    fields: [matchAvailability.teamMemberId],
    references: [teamMembers.id],
  }),
}));

export const matchSquadRelations = relations(matchSquad, ({ one }) => ({
  match: one(matches, { fields: [matchSquad.matchId], references: [matches.id] }),
  member: one(teamMembers, {
    fields: [matchSquad.teamMemberId],
    references: [teamMembers.id],
  }),
}));

export const lineupsRelations = relations(lineups, ({ one, many }) => ({
  match: one(matches, { fields: [lineups.matchId], references: [matches.id] }),
  formation: one(formations, { fields: [lineups.formationId], references: [formations.id] }),
  slots: many(lineupSlots),
}));

export const lineupSlotsRelations = relations(lineupSlots, ({ one }) => ({
  lineup: one(lineups, { fields: [lineupSlots.lineupId], references: [lineups.id] }),
  slot: one(formationSlots, {
    fields: [lineupSlots.formationSlotId],
    references: [formationSlots.id],
  }),
  member: one(teamMembers, {
    fields: [lineupSlots.teamMemberId],
    references: [teamMembers.id],
  }),
}));

export const matchEventsRelations = relations(matchEvents, ({ one }) => ({
  match: one(matches, { fields: [matchEvents.matchId], references: [matches.id] }),
}));

export const matchPlayerStatsRelations = relations(matchPlayerStats, ({ one }) => ({
  match: one(matches, { fields: [matchPlayerStats.matchId], references: [matches.id] }),
  member: one(teamMembers, {
    fields: [matchPlayerStats.teamMemberId],
    references: [teamMembers.id],
  }),
}));

export const trainingsRelations = relations(trainings, ({ one, many }) => ({
  team: one(teams, { fields: [trainings.teamId], references: [teams.id] }),
  availability: many(trainingAvailability),
  attendance: many(trainingAttendance),
}));

export const injuriesRelations = relations(injuries, ({ one }) => ({
  member: one(teamMembers, {
    fields: [injuries.teamMemberId],
    references: [teamMembers.id],
  }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  match: one(matches, { fields: [ratings.matchId], references: [matches.id] }),
  rater: one(teamMembers, {
    fields: [ratings.raterMemberId],
    references: [teamMembers.id],
  }),
  rated: one(teamMembers, {
    fields: [ratings.ratedMemberId],
    references: [teamMembers.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Formation = typeof formations.$inferSelect;
export type FormationSlot = typeof formationSlots.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type MatchEvent = typeof matchEvents.$inferSelect;
export type Lineup = typeof lineups.$inferSelect;
export type LineupSlot = typeof lineupSlots.$inferSelect;
export type Training = typeof trainings.$inferSelect;
export type Injury = typeof injuries.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type MatchPlayerStats = typeof matchPlayerStats.$inferSelect;

export type TeamRole = (typeof teamRole.enumValues)[number];
export type SquadRole = (typeof squadRole.enumValues)[number];
export type AvailabilityStatus = (typeof availabilityStatus.enumValues)[number];
export type Competition = (typeof competition.enumValues)[number];
export type MatchStatus = (typeof matchStatus.enumValues)[number];
export type MatchEventType = (typeof matchEventType.enumValues)[number];
export type PositionLine = (typeof positionLine.enumValues)[number];
