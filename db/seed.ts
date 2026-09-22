/**
 * Seeding, in two halves.
 *
 *  1. **Reference data** — the seven-a-side positions and the built-in formation templates from
 *     `db/reference.ts`. The application is useless without them, so this half runs in every
 *     environment, including production, and is idempotent.
 *  2. **A demo season** — a fake team of thirteen, a handful of matches with real event logs,
 *     trainings, an injury and some ratings. Development only.
 *
 * Usage:
 *   npm run db:seed                 # reference + demo
 *   npm run db:seed -- --reference  # reference only (this is what production gets)
 *
 * The demo half is deterministic: the same fixture every time, so a screenshot or a bug report
 * means the same thing tomorrow. Nothing here uses `Math.random()`.
 */

// Must come first: `db/client.ts` reads DATABASE_URL as it loads.
import "./load-env";

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { db } from "./client";
import {
  BUILTIN_FORMATIONS,
  DEFAULT_FORMATION_LABEL,
  POSITIONS,
  type PositionCode,
} from "./reference";
import {
  formationSlots,
  formations,
  injuries,
  lineupSlots,
  lineups,
  matchAvailability,
  matchEvents,
  matchSquad,
  matches,
  playerPositions,
  positions,
  ratings,
  teamMembers,
  teams,
  trainingAttendance,
  trainingAvailability,
  trainings,
  users,
} from "./schema";
import { hashPassword } from "../lib/auth/password";

/* -------------------------------------------------------------------------- */
/* 1. Reference data                                                          */
/* -------------------------------------------------------------------------- */

async function seedReference(): Promise<void> {
  await db
    .insert(positions)
    .values(
      POSITIONS.map((p) => ({
        code: p.code,
        labelFr: p.labelFr,
        line: p.line,
        defaultX: p.defaultX,
        defaultY: p.defaultY,
        sort: p.sort,
      })),
    )
    .onConflictDoUpdate({
      target: positions.code,
      set: {
        labelFr: sql`excluded.label_fr`,
        line: sql`excluded.line`,
        defaultX: sql`excluded.default_x`,
        defaultY: sql`excluded.default_y`,
        sort: sql`excluded.sort`,
      },
    });

  for (const template of BUILTIN_FORMATIONS) {
    // Built-ins are identified by their label among the rows with no team.
    const existing = await db.query.formations.findFirst({
      where: (f, { and, eq: equals, isNull: nul }) =>
        and(nul(f.teamId), equals(f.label, template.label)),
      columns: { id: true },
    });

    const formationId =
      existing?.id ??
      (
        await db
          .insert(formations)
          .values({ teamId: null, name: template.name, label: template.label })
          .returning({ id: formations.id })
      )[0].id;

    // Slots are replaced wholesale: a template's geometry is ours to change, and no user data
    // points at a built-in slot except through a lineup, which cascades.
    if (existing) {
      const used = await db
        .select({ id: lineupSlots.lineupId })
        .from(lineupSlots)
        .innerJoin(formationSlots, eq(formationSlots.id, lineupSlots.formationSlotId))
        .where(eq(formationSlots.formationId, formationId))
        .limit(1);
      // Somebody's composition depends on these slots — leave them alone.
      if (used.length > 0) continue;
      await db.delete(formationSlots).where(eq(formationSlots.formationId, formationId));
    }

    await db.insert(formationSlots).values(
      template.slots.map((slot) => ({
        formationId,
        positionCode: slot.positionCode,
        x: slot.x,
        y: slot.y,
        sort: slot.sort,
      })),
    );
  }

  console.log(
    `  positions: ${POSITIONS.length} · formations intégrées: ${BUILTIN_FORMATIONS.length}`,
  );
}

/* -------------------------------------------------------------------------- */
/* 2. The demo season                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The seven slots of the default 1-3-2-1, by `sort` (see `BUILTIN_FORMATIONS`): goalkeeper
 * first, then back to front and left to right. Named so the fixtures below read as football.
 */
const SLOT = { gb: 1, dg: 2, dc: 3, dd: 4, mcLeft: 5, mcRight: 6, at: 7 } as const;

const TEAM_NAME = "AS Dimanche";
const TEAM_SLUG = "as-dimanche";
/** Everyone in the demo team shares this. Development only — never seeded in production. */
const DEMO_PASSWORD = "motdepasse";

type PlayerFixture = {
  username: string;
  displayName: string;
  jerseyNumber: number;
  primary: PositionCode;
  secondary: PositionCode[];
  /** A player-coach: both permission sets (decision 002). */
  isCoach?: boolean;
};

/** Thirteen players — enough for a seven-a-side squad with a bench and a couple of absences. */
const PLAYERS: PlayerFixture[] = [
  { username: "karim", displayName: "Karim", jerseyNumber: 8, primary: "MC", secondary: ["MOC"], isCoach: true },
  { username: "hugo", displayName: "Hugo", jerseyNumber: 1, primary: "GB", secondary: [] },
  { username: "mehdi", displayName: "Mehdi", jerseyNumber: 12, primary: "GB", secondary: ["DC"] },
  { username: "julien", displayName: "Julien", jerseyNumber: 9, primary: "AT", secondary: ["MOC"] },
  { username: "momo", displayName: "Momo", jerseyNumber: 11, primary: "AG", secondary: ["AT"] },
  { username: "ali", displayName: "Ali", jerseyNumber: 7, primary: "AD", secondary: ["MD"] },
  { username: "thomas", displayName: "Thomas", jerseyNumber: 4, primary: "DC", secondary: ["MC"] },
  { username: "nico", displayName: "Nico", jerseyNumber: 2, primary: "DD", secondary: ["MD"] },
  { username: "samir", displayName: "Samir", jerseyNumber: 3, primary: "DG", secondary: ["MG"] },
  { username: "leo", displayName: "Léo", jerseyNumber: 6, primary: "MG", secondary: ["AG", "DG"] },
  { username: "yanis", displayName: "Yanis", jerseyNumber: 10, primary: "MOC", secondary: ["AT"] },
  { username: "brice", displayName: "Brice", jerseyNumber: 5, primary: "DC", secondary: ["DD"] },
  { username: "fabien", displayName: "Fabien", jerseyNumber: 14, primary: "MD", secondary: ["AD"] },
];

/** Reference "today" for the fixture: kept relative so the calendar always has a next match. */
function startOfDay(offsetDays: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function at(offsetDays: number, hour: number, minute = 0): Date {
  const date = startOfDay(offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function isoDate(offsetDays: number): string {
  return startOfDay(offsetDays).toISOString().slice(0, 10);
}

async function seedDemo(): Promise<void> {
  const existing = await db.query.teams.findFirst({
    where: eq(teams.slug, TEAM_SLUG),
    columns: { id: true },
  });
  if (existing) {
    console.log(`  « ${TEAM_NAME} » existe déjà — rien à faire. (npm run db:reset pour repartir de zéro)`);
    return;
  }

  // One hash for everybody: argon2 is deliberately slow, and thirteen of them is thirteen
  // seconds of nothing happening.
  const demoHash = await hashPassword(DEMO_PASSWORD);
  const adminHash = await hashPassword(process.env.SUPER_ADMIN_PASSWORD ?? "change-me");
  const adminUsername = (process.env.SUPER_ADMIN_USERNAME ?? "admin").toLowerCase();

  const [team] = await db
    .insert(teams)
    .values({
      name: TEAM_NAME,
      slug: TEAM_SLUG,
      primaryColor: "#1d4ed8",
      secondaryColor: "#ffffff",
    })
    .returning({ id: teams.id });

  /* ---- people ---------------------------------------------------------- */

  const [admin] = await db
    .insert(users)
    .values({
      username: adminUsername,
      displayName: "Coach",
      passwordHash: adminHash,
      isSuperAdmin: true,
    })
    .onConflictDoUpdate({ target: users.username, set: { isSuperAdmin: true } })
    .returning({ id: users.id });

  // The super admin runs this team as a non-playing coach: that is the account you log into.
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: admin.id, role: "coach", isPlayer: false });

  const createdUsers = await db
    .insert(users)
    .values(
      PLAYERS.map((p) => ({
        username: p.username,
        displayName: p.displayName,
        passwordHash: demoHash,
      })),
    )
    .returning({ id: users.id, username: users.username });

  const userIdByUsername = new Map(createdUsers.map((u) => [u.username, u.id]));

  const createdMembers = await db
    .insert(teamMembers)
    .values(
      PLAYERS.map((p) => ({
        teamId: team.id,
        userId: userIdByUsername.get(p.username)!,
        role: p.isCoach ? ("coach" as const) : ("player" as const),
        isPlayer: true,
        jerseyNumber: p.jerseyNumber,
      })),
    )
    .returning({ id: teamMembers.id, userId: teamMembers.userId });

  /** username → team_members.id, which is what every other table references. */
  const memberId = new Map(
    createdMembers.map((m) => [
      createdUsers.find((u) => u.id === m.userId)!.username,
      m.id,
    ]),
  );
  const m = (username: string): string => {
    const id = memberId.get(username);
    if (!id) throw new Error(`Fixture inconsistante : joueur « ${username} » inconnu`);
    return id;
  };

  await db.insert(playerPositions).values(
    PLAYERS.flatMap((p) => [
      { teamMemberId: m(p.username), positionCode: p.primary, preference: "primary" as const },
      ...p.secondary.map((code) => ({
        teamMemberId: m(p.username),
        positionCode: code,
        preference: "secondary" as const,
      })),
    ]),
  );

  /* ---- an injury ------------------------------------------------------- */

  await db.insert(injuries).values({
    teamMemberId: m("brice"),
    startedOn: isoDate(-9),
    expectedReturnOn: isoDate(12),
    note: "Entorse de la cheville.",
    declaredBy: admin.id,
  });

  /* ---- trainings ------------------------------------------------------- */

  const createdTrainings = await db
    .insert(trainings)
    .values([
      { teamId: team.id, startsAt: at(-10, 19), venue: "Stade municipal", createdBy: admin.id },
      { teamId: team.id, startsAt: at(-3, 19), venue: "Stade municipal", createdBy: admin.id },
      {
        teamId: team.id,
        startsAt: at(4, 19),
        venue: "Stade municipal",
        note: "Travail sur les sorties de balle.",
        createdBy: admin.id,
      },
    ])
    .returning({ id: trainings.id, startsAt: trainings.startsAt });

  const [pastTrainingA, pastTrainingB, nextTraining] = createdTrainings;

  // Attendance for the two past sessions: a plausible, fixed pattern rather than noise.
  const absentFrom: Record<string, string[]> = {
    [pastTrainingA.id]: ["mehdi", "fabien", "brice"],
    [pastTrainingB.id]: ["ali", "brice"],
  };
  for (const training of [pastTrainingA, pastTrainingB]) {
    await db.insert(trainingAttendance).values(
      PLAYERS.map((p) => ({
        trainingId: training.id,
        teamMemberId: m(p.username),
        present: !absentFrom[training.id].includes(p.username),
        markedBy: admin.id,
      })),
    );
  }

  // Declared availability for the one to come — not everybody has answered, which is the
  // whole point of the coach's "qui n'a pas répondu" list.
  await db.insert(trainingAvailability).values(
    PLAYERS.slice(0, 9).map((p, index) => ({
      trainingId: nextTraining.id,
      teamMemberId: m(p.username),
      status: index === 7 ? ("no" as const) : index === 5 ? ("maybe" as const) : ("yes" as const),
    })),
  );

  /* ---- formations ------------------------------------------------------ */

  const formation = await db.query.formations.findFirst({
    where: (f, { and, eq: equals, isNull: nul }) =>
      and(nul(f.teamId), equals(f.label, DEFAULT_FORMATION_LABEL)),
    columns: { id: true },
  });
  if (!formation) throw new Error("Les formations intégrées n'ont pas été insérées.");

  const slots = await db
    .select({ id: formationSlots.id, positionCode: formationSlots.positionCode, sort: formationSlots.sort })
    .from(formationSlots)
    .where(eq(formationSlots.formationId, formation.id))
    .orderBy(formationSlots.sort);

  /**
   * Slots are addressed by their `sort`, not by position code: a formation may legitimately
   * hold the same code twice (1-3-2-1 has two `MC`), so the code alone is ambiguous.
   */
  const slotFor = (sort: number): string => {
    const slot = slots.find((s) => s.sort === sort);
    if (!slot) throw new Error(`Formation ${DEFAULT_FORMATION_LABEL} : pas de slot #${sort}`);
    return slot.id;
  };

  /* ---- matches --------------------------------------------------------- */

  await seedFinishedMatch({
    teamId: team.id,
    adminId: admin.id,
    formationId: formation.id,
    slotFor,
    m,
    kickoffAt: at(-17, 10, 30),
    opponentName: "FC Rivière",
    isHome: true,
    venue: "Stade municipal",
    competition: "league",
    entryMode: "retro",
  });

  await seedFinishedMatch({
    teamId: team.id,
    adminId: admin.id,
    formationId: formation.id,
    slotFor,
    m,
    kickoffAt: at(-3, 10, 30),
    opponentName: "Olympique Vallée",
    isHome: false,
    venue: "Complexe des Tilleuls",
    competition: "cup",
    entryMode: "live",
    withRatings: true,
  });

  // The next match: selected, composed, with a planned change at the hour — but not played.
  const [next] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      kickoffAt: at(daysUntilNextSunday(), 10, 30),
      opponentName: "Étoile du Parc",
      isHome: true,
      venue: "Stade municipal",
      competition: "league",
      status: "scheduled",
      createdBy: admin.id,
    })
    .returning({ id: matches.id });

  await db.insert(matchAvailability).values([
    ...["karim", "hugo", "julien", "momo", "thomas", "nico", "samir", "leo", "yanis"].map((u) => ({
      matchId: next.id,
      teamMemberId: m(u),
      status: "yes" as const,
    })),
    { matchId: next.id, teamMemberId: m("ali"), status: "maybe" as const, note: "Je finis le boulot à 10h." },
    { matchId: next.id, teamMemberId: m("brice"), status: "no" as const, note: "Cheville." },
    // mehdi and fabien have not answered — on purpose.
  ]);

  const starters = ["hugo", "samir", "thomas", "nico", "leo", "karim", "julien"];
  const substitutes = ["momo", "yanis", "ali"];
  await db.insert(matchSquad).values([
    ...starters.map((u) => ({ matchId: next.id, teamMemberId: m(u), role: "starter" as const })),
    ...substitutes.map((u) => ({
      matchId: next.id,
      teamMemberId: m(u),
      role: "substitute" as const,
    })),
    { matchId: next.id, teamMemberId: m("brice"), role: "supporter" as const },
  ]);

  const [initialLineup] = await db
    .insert(lineups)
    .values({
      matchId: next.id,
      formationId: formation.id,
      fromMinute: 0,
      isInitial: true,
      createdBy: admin.id,
    })
    .returning({ id: lineups.id });

  await db.insert(lineupSlots).values([
    { lineupId: initialLineup.id, formationSlotId: slotFor(SLOT.gb), teamMemberId: m("hugo") },
    { lineupId: initialLineup.id, formationSlotId: slotFor(SLOT.dg), teamMemberId: m("samir") },
    { lineupId: initialLineup.id, formationSlotId: slotFor(SLOT.dc), teamMemberId: m("thomas") },
    { lineupId: initialLineup.id, formationSlotId: slotFor(SLOT.dd), teamMemberId: m("nico") },
    { lineupId: initialLineup.id, formationSlotId: slotFor(SLOT.mcLeft), teamMemberId: m("leo") },
    { lineupId: initialLineup.id, formationSlotId: slotFor(SLOT.mcRight), teamMemberId: m("karim") },
    { lineupId: initialLineup.id, formationSlotId: slotFor(SLOT.at), teamMemberId: m("julien") },
  ]);

  // A planned change at the half: proposed, never applied automatically (decision 006).
  const [plannedLineup] = await db
    .insert(lineups)
    .values({
      matchId: next.id,
      formationId: formation.id,
      fromMinute: 30,
      isInitial: false,
      createdBy: admin.id,
    })
    .returning({ id: lineups.id });

  await db.insert(lineupSlots).values([
    { lineupId: plannedLineup.id, formationSlotId: slotFor(SLOT.gb), teamMemberId: m("hugo") },
    { lineupId: plannedLineup.id, formationSlotId: slotFor(SLOT.dg), teamMemberId: m("samir") },
    { lineupId: plannedLineup.id, formationSlotId: slotFor(SLOT.dc), teamMemberId: m("thomas") },
    { lineupId: plannedLineup.id, formationSlotId: slotFor(SLOT.dd), teamMemberId: m("nico") },
    // Léo makes way for Yanis, and Karim drops into midfield.
    { lineupId: plannedLineup.id, formationSlotId: slotFor(SLOT.mcLeft), teamMemberId: m("karim") },
    { lineupId: plannedLineup.id, formationSlotId: slotFor(SLOT.mcRight), teamMemberId: m("yanis") },
    { lineupId: plannedLineup.id, formationSlotId: slotFor(SLOT.at), teamMemberId: m("momo") },
  ]);

  // And one further out, with nothing decided yet.
  await db.insert(matches).values({
    teamId: team.id,
    kickoffAt: at(daysUntilNextSunday() + 14, 10, 30),
    opponentName: "AS Coteaux",
    isHome: false,
    venue: "Terrain des Coteaux",
    competition: "friendly",
    status: "scheduled",
    createdBy: admin.id,
  });

  console.log(`  équipe « ${TEAM_NAME} » · ${PLAYERS.length} joueurs · 4 matchs · 3 entraînements`);
  console.log(`  connexion : ${adminUsername} / ${process.env.SUPER_ADMIN_PASSWORD ?? "change-me"} (coach)`);
  console.log(`              karim / ${DEMO_PASSWORD} (joueur-coach) · hugo / ${DEMO_PASSWORD} (joueur)`);
}

/** Sunday is match day. 7 when today is Sunday, so the fixture is always in the future. */
function daysUntilNextSunday(): number {
  const today = new Date().getDay(); // 0 = Sunday
  return today === 0 ? 7 : 7 - today;
}

/* -------------------------------------------------------------------------- */
/* Finished matches, with a real event log                                    */
/* -------------------------------------------------------------------------- */

type FinishedMatchSpec = {
  teamId: string;
  adminId: string;
  formationId: string;
  slotFor: (sort: number) => string;
  m: (username: string) => string;
  kickoffAt: Date;
  opponentName: string;
  isHome: boolean;
  venue: string;
  competition: "league" | "cup" | "friendly" | "tournament";
  entryMode: "live" | "retro";
  withRatings?: boolean;
};

/**
 * Writes a played match the way the application does: a squad, an initial composition, and an
 * append-only event log from which the score and the minutes are derived. Nothing stores "3-1".
 */
async function seedFinishedMatch(spec: FinishedMatchSpec): Promise<void> {
  const { m, slotFor } = spec;

  const [match] = await db
    .insert(matches)
    .values({
      teamId: spec.teamId,
      kickoffAt: spec.kickoffAt,
      opponentName: spec.opponentName,
      isHome: spec.isHome,
      venue: spec.venue,
      competition: spec.competition,
      status: "finished",
      entryMode: spec.entryMode,
      operatorUserId: spec.adminId,
      createdBy: spec.adminId,
    })
    .returning({ id: matches.id });

  const starters = ["hugo", "samir", "thomas", "nico", "leo", "karim", "julien"];
  const substitutes = ["momo", "yanis", "ali", "fabien"];

  await db.insert(matchSquad).values([
    ...starters.map((u) => ({ matchId: match.id, teamMemberId: m(u), role: "starter" as const })),
    ...substitutes.map((u) => ({
      matchId: match.id,
      teamMemberId: m(u),
      role: "substitute" as const,
    })),
  ]);

  await db.insert(matchAvailability).values(
    [...starters, ...substitutes].map((u) => ({
      matchId: match.id,
      teamMemberId: m(u),
      status: "yes" as const,
    })),
  );

  const [lineup] = await db
    .insert(lineups)
    .values({
      matchId: match.id,
      formationId: spec.formationId,
      fromMinute: 0,
      isInitial: true,
      createdBy: spec.adminId,
    })
    .returning({ id: lineups.id });

  const initialSlots: Array<[number, string]> = [
    [SLOT.gb, "hugo"],
    [SLOT.dg, "samir"],
    [SLOT.dc, "thomas"],
    [SLOT.dd, "nico"],
    [SLOT.mcLeft, "leo"],
    [SLOT.mcRight, "karim"],
    [SLOT.at, "julien"],
  ];

  await db.insert(lineupSlots).values(
    initialSlots.map(([sort, username]) => ({
      lineupId: lineup.id,
      formationSlotId: slotFor(sort),
      teamMemberId: m(username),
    })),
  );

  /* ---- the event log --------------------------------------------------- */

  let seq = 0;
  const events: Array<typeof matchEvents.$inferInsert> = [];

  /** Appends one event at a continuous display minute (decision 009). */
  const push = (
    type: typeof matchEvents.$inferInsert.type,
    minute: number,
    payload: Record<string, unknown> = {},
    voidsEventId?: string,
  ) => {
    const id = randomUUID();
    events.push({
      id,
      matchId: match.id,
      clientEventId: randomUUID(),
      type,
      period: minute <= 30 ? 1 : 2,
      minute,
      clockMs: minute * 60_000,
      occurredAt: new Date(spec.kickoffAt.getTime() + minute * 60_000),
      payload,
      createdBy: spec.adminId,
      voidsEventId: voidsEventId ?? null,
      seq: seq++,
    });
    return id;
  };

  push("KICKOFF", 0);
  push("LINEUP_APPLIED", 0, {
    lineupId: lineup.id,
    slots: initialSlots.map(([sort, username]) => ({
      slotId: slotFor(sort),
      memberId: m(username),
    })),
  });
  push("GOAL_FOR", 11, { scorerId: m("julien"), assistId: m("karim") });
  push("FOUL", 19, { memberId: m("thomas") });
  push("GOAL_AGAINST", 24);

  // A goal wrongly credited, then corrected the way the app does it: never erased.
  const mistake = push("GOAL_FOR", 27, { scorerId: m("leo") });
  push("VOID", 27, {}, mistake);
  push("GOAL_FOR", 28, { scorerId: m("karim"), assistId: m("leo") });

  push("PERIOD_END", 30);
  push("KICKOFF", 30);
  push("SUBSTITUTION", 38, {
    outId: m("leo"),
    inId: m("yanis"),
    slotId: slotFor(SLOT.mcLeft),
  });
  push("PENALTY_SCORED", 44, { scorerId: m("julien") });
  push("OWN_GOAL", 51, { scorerId: m("nico") });
  push("POSITION_CHANGE", 55, {
    memberId: m("karim"),
    fromSlotId: slotFor(SLOT.mcRight),
    toSlotId: slotFor(SLOT.at),
  });
  push("SUBSTITUTION", 55, { outId: m("julien"), inId: m("momo"), slotId: slotFor(SLOT.mcRight) });
  push("PENALTY_MISSED", 58, { scorerId: m("momo") });
  push("PERIOD_END", 60);
  push("FINAL_WHISTLE", 60);

  await db.insert(matchEvents).values(events);

  // The composition was actually applied, so point it at the event that did it.
  const applied = events.find((event) => event.type === "LINEUP_APPLIED");
  await db.update(lineups).set({ appliedEventId: applied!.id }).where(eq(lineups.id, lineup.id));

  // `match_player_stats` is a cache built by reducing the log (M4). It is left empty here on
  // purpose: seeding it by hand would hide a bug in the reducer rather than expose one.

  if (spec.withRatings) {
    const raters = ["karim", "hugo", "julien", "samir"];
    const rated = [...starters, "yanis", "momo"];
    /** A fixed, unremarkable spread: good for the scorer, average elsewhere (decision 007). */
    const scoreFor = (username: string, raterIndex: number) =>
      Math.max(
        0,
        Math.min(
          10,
          (username === "julien" ? 8 : username === "hugo" ? 7 : 6) + ((raterIndex + 1) % 3) - 1,
        ),
      );

    await db.insert(ratings).values(
      raters.flatMap((rater, raterIndex) =>
        rated.map((target) => ({
          matchId: match.id,
          raterMemberId: m(rater),
          ratedMemberId: m(target),
          score: scoreFor(target, raterIndex),
          comment:
            rater === "karim" && target === "julien" ? "Énorme, il tient la ligne tout seul." : null,
        })),
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const referenceOnly = process.argv.includes("--reference");

  console.log("Données de référence…");
  await seedReference();

  if (referenceOnly) {
    console.log("Terminé (référence uniquement).");
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Le jeu de démonstration ne doit jamais être inséré en production. Utilise --reference.",
    );
  }

  console.log("Saison de démonstration…");
  await seedDemo();
  console.log("Terminé.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
