/**
 * Seeding, in two halves.
 *
 *  1. **Reference data** — the seven-a-side positions and the built-in formation templates from
 *     `db/reference.ts`. The application is useless without them, so this half runs in every
 *     environment, including production, and is idempotent.
 *  2. **A demo season** — a fake team of fourteen, seven played matches with real event logs,
 *     four trainings, an injury and some ratings. Development only.
 *
 * Usage:
 *   npm run db:seed                 # reference + demo
 *   npm run db:seed -- --reference  # reference only (this is what production gets)
 *
 * The demo half is deterministic: the same fixture every time, so a screenshot or a bug report
 * means the same thing tomorrow. Nothing here uses `Math.random()`.
 *
 * ## Why the season is deliberately awkward
 *
 * A demo season made of wins, full match sheets and tidy ratings makes every screen look right,
 * which is precisely the problem: a regression in an edge case then stays invisible until a real
 * Sunday. So this fixture contains, on purpose, one instance of each case the application claims to
 * handle — a defeat, a draw, a keeper swapped at half time who then concedes, a goal with nobody to
 * credit, a match nobody ever recorded, a supporter on a sheet, a member who has left but still
 * holds a goal, a voided event, and ratings that are complete for one viewer and incomplete for
 * another. Each match below carries the figures it is supposed to produce, so a human reading a
 * screen can tell at a glance whether it is lying.
 *
 * ## How a played match is written
 *
 * Exactly the way the application writes one: a squad, an initial composition, and an **append-only
 * event log**. Nothing stores "3-2". The match is then frozen through the real freeze path
 * (`lib/match/finalize.ts`), which reduces the log with the real reducer and writes
 * `match_player_stats` — so the cache and the log cannot disagree, and a bug in either shows up here
 * rather than in production. There is deliberately no second way to write a match.
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
  type Competition,
  type MatchEventType,
} from "./schema";
import { hashPassword } from "../lib/auth/password";
import { finalizeMatchById } from "../lib/match/finalize";

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

/** Every demo match is a 2 × 30, so a continuous minute reads 0..60 (decision 009). */
const PERIOD_MINUTES = 30;

type PlayerFixture = {
  username: string;
  displayName: string;
  jerseyNumber: number;
  primary: PositionCode;
  secondary: PositionCode[];
  /** A player-coach: both permission sets (decision 002). */
  isCoach?: boolean;
  /**
   * Days ago this member left the team. They keep every goal and every minute they played
   * (`docs/DATA_MODEL.md`) but disappear from selection lists — the case `lib/stats/queries.ts`
   * deliberately keeps and `lib/team/queries.ts` deliberately hides.
   */
  leftDaysAgo?: number;
};

/**
 * Fourteen players: thirteen in the current squad, plus one who left in the autumn. Enough for a
 * seven-a-side squad with a bench, a couple of absences and a departure.
 */
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
  // Left the club in the autumn — after scoring on J2. His goal must survive in every season table.
  { username: "rayan", displayName: "Rayan", jerseyNumber: 13, primary: "AT", secondary: ["AD"], leftDaysAgo: 20 },
];

/* ---- dates ---------------------------------------------------------------- */

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

/** Sunday is match day. 7 when today is Sunday, so the next fixture is always in the future. */
function daysUntilNextSunday(): number {
  const today = new Date().getDay(); // 0 = Sunday
  return today === 0 ? 7 : 7 - today;
}

/**
 * Offset of a past match day: `pastSunday(0)` is the most recent Sunday **strictly** in the past.
 *
 * Anchoring on the last Sunday rather than on "today minus n" matters: a played match whose
 * kick-off is a few hours in the future would be a nonsense the whole app would have to tolerate,
 * and the rating window (`lib/rating/window.ts`) reads the *next* kick-off, so the newest played
 * match has to sit before today and the next fixture after it.
 */
function pastSunday(weeksAgo: number): number {
  const today = new Date().getDay();
  const lastSunday = today === 0 ? -7 : -today;
  return lastSunday - 7 * weeksAgo;
}

/** Whether a fixture player was still a member `offsetDays` from today (negative = in the past). */
function wasMemberAt(player: PlayerFixture, offsetDays: number): boolean {
  return player.leftDaysAgo === undefined || offsetDays < -player.leftDaysAgo;
}

/* -------------------------------------------------------------------------- */
/* The demo season                                                            */
/* -------------------------------------------------------------------------- */

async function seedDemo(): Promise<void> {
  const existing = await db.query.teams.findFirst({
    where: eq(teams.slug, TEAM_SLUG),
    columns: { id: true },
  });
  if (existing) {
    console.log(`  « ${TEAM_NAME} » existe déjà — rien à faire. (npm run db:reset pour repartir de zéro)`);
    return;
  }

  // One hash for everybody: argon2 is deliberately slow, and fourteen of them is fourteen
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
  // He is on no match sheet, so he is the one viewer the rating gate never applies to
  // (decision 024) — useful for checking that a screen is hiding notes for the right reason.
  await db
    .insert(teamMembers)
    .values({
      teamId: team.id,
      userId: admin.id,
      role: "coach",
      isPlayer: false,
      joinedAt: at(pastSunday(8), 18),
    });

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
        // Backdated to before the first match of the fixture: a profile claiming that a player
        // who scored in August joined the club today is the sort of small lie that makes a demo
        // useless for reading a screen.
        joinedAt: at(pastSunday(8), 18),
        leftAt: p.leftDaysAgo === undefined ? null : at(-p.leftDaysAgo, 12),
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

  // Brice is out for the rest of the month, which is why he is a *supporter* on the two most
  // recent match sheets rather than a substitute (decisions 020 / 022).
  await db.insert(injuries).values({
    teamMemberId: m("brice"),
    startedOn: isoDate(-9),
    expectedReturnOn: isoDate(12),
    note: "Entorse de la cheville.",
    declaredBy: admin.id,
  });

  /* ---- trainings ------------------------------------------------------- */

  /**
   * Four sessions, and the three states of decision 020 are all reachable:
   *
   * - **T1** — marked, a normal mix. Three absent; Rayan was still a member and was present.
   * - **T2** — marked, and **everybody absent**: the pitch was unplayable and the session was
   *   called off on the spot. 13 rows, all `present = false`.
   * - **T3** — **never marked**: not one row in `training_attendance`. This is *not* the same fact
   *   as T2, and the attendance rate must treat it as such — « présent / pointé », never
   *   « présent / effectif ». Both sessions look identical in the list; only the stats can tell
   *   them apart, which is exactly the bug this fixture exists to catch.
   * - **T4** — still to come: declared availability, nothing marked, two non-responders.
   */
  const createdTrainings = await db
    .insert(trainings)
    .values([
      { teamId: team.id, startsAt: at(-25, 19), venue: "Stade municipal", createdBy: admin.id },
      {
        teamId: team.id,
        startsAt: at(-11, 19),
        venue: "Stade municipal",
        note: "Terrain impraticable, séance écourtée.",
        createdBy: admin.id,
      },
      { teamId: team.id, startsAt: at(-4, 19), venue: "Gymnase des Peupliers", createdBy: admin.id },
      {
        teamId: team.id,
        startsAt: at(3, 19),
        venue: "Stade municipal",
        note: "Travail sur les sorties de balle.",
        createdBy: admin.id,
      },
    ])
    .returning({ id: trainings.id, startsAt: trainings.startsAt });

  // The third session is deliberately not bound to a name: nothing is ever written about it.
  const [trainingMixed, trainingAllAbsent, , nextTraining] = createdTrainings;

  const absentFromMixed = new Set(["mehdi", "fabien", "brice"]);
  await db.insert(trainingAttendance).values(
    PLAYERS.filter((p) => wasMemberAt(p, -25)).map((p) => ({
      trainingId: trainingMixed.id,
      teamMemberId: m(p.username),
      present: !absentFromMixed.has(p.username),
      markedBy: admin.id,
    })),
  );

  await db.insert(trainingAttendance).values(
    PLAYERS.filter((p) => wasMemberAt(p, -11)).map((p) => ({
      trainingId: trainingAllAbsent.id,
      teamMemberId: m(p.username),
      present: false,
      markedBy: admin.id,
    })),
  );

  // The third session gets nothing at all, on purpose: `markedSessions` must therefore be 2.

  // Declared availability for the one to come — not everybody has answered, which is the
  // whole point of the coach's "qui n'a pas répondu" list.
  const availableForNext = PLAYERS.filter((p) => wasMemberAt(p, 3)).slice(0, 9);
  await db.insert(trainingAvailability).values(
    availableForNext.map((p, index) => ({
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

  const common = { teamId: team.id, adminId: admin.id, formationId: formation.id, slotFor, m };

  /* -------------------------------------------------------------------- */
  /* The played season, oldest first                                      */
  /* -------------------------------------------------------------------- */

  /**
   * J1 — **championnat, à domicile, victoire 3-2.** Entered retroactively (decision 013), and the
   * one match holding a **voided goal**.
   *
   * Log: 11′ Julien (p. Karim) · 24′ encaissé · 27′ but de Léo **annulé** · 28′ Karim (p. Léo) ·
   * 38′ Léo → Yanis · 44′ penalty de Julien · 51′ csc de Nico · 55′ Karim MC → AT puis Julien →
   * Momo · 58′ penalty manqué de Momo.
   *
   * Expected — score **3-2**, conceded at 24′ and 51′:
   * - Julien 2 buts (dont 1 penalty), Karim 1 but + 1 passe, Léo 1 passe **et 0 but** (the 27′ one
   *   is annulled and must count nowhere), Nico 1 csc, Thomas 1 faute, Momo 1 penalty manqué.
   * - Minutes: Hugo/Samir/Thomas/Nico/Karim 60′, Julien 55′, Léo 38′, Yanis 22′, Momo 5′,
   *   Ali/Fabien 0′ — sum 420′ = 7 × 60.
   * - Clean minutes (first concession at 24′): 24′ for everyone who started, Yanis 13′ (38′→51′),
   *   Momo 5′ (55′→60′, nothing conceded after 51′).
   * - Hugo: 60′ in goal, 24′ gk-clean, conceded 2 while keeper → **no** clean sheet.
   */
  await seedPlayedMatch({
    ...common,
    kickoffAt: at(pastSunday(6), 10, 30),
    opponentName: "FC Rivière",
    isHome: true,
    venue: "Stade municipal",
    competition: "league",
    entryMode: "retro",
    starters: [
      [SLOT.gb, "hugo"],
      [SLOT.dg, "samir"],
      [SLOT.dc, "thomas"],
      [SLOT.dd, "nico"],
      [SLOT.mcLeft, "leo"],
      [SLOT.mcRight, "karim"],
      [SLOT.at, "julien"],
    ],
    substitutes: ["momo", "yanis", "ali", "fabien"],
    log: (push) => {
      push("GOAL_FOR", 11, { scorerId: m("julien"), assistId: m("karim") });
      push("FOUL", 19, { memberId: m("thomas") });
      push("GOAL_AGAINST", 24);

      // A goal wrongly credited, then corrected the way the app does it: never erased.
      const mistake = push("GOAL_FOR", 27, { scorerId: m("leo") });
      push("VOID", 27, {}, { voids: mistake });
      push("GOAL_FOR", 28, { scorerId: m("karim"), assistId: m("leo") });

      push("PERIOD_END", 30);
      push("KICKOFF", 30, {}, { period: 2 });
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
      push("SUBSTITUTION", 55, {
        outId: m("julien"),
        inId: m("momo"),
        slotId: slotFor(SLOT.mcRight),
      });
      push("PENALTY_MISSED", 58, { scorerId: m("momo") });
    },
  });

  /**
   * J2 — **championnat, à domicile, victoire 2-1.** The match that makes the awkward memberships
   * mean something:
   *
   * - **Rayan scored** here and has **left the club** since (`team_members.left_at`). A season
   *   table that loses a September scorer in January is wrong, so he must still appear — flagged as
   *   departed — in the scorers, the minutes and the player list.
   * - **Brice is a supporter**, the one sheet role that may neither rate nor be rated
   *   (decisions 007 / 020 / 022): 1 selection, 1 « supporter », 0 appearance, no rating card.
   * - **Léo comes off and comes back on** (38′ of football in two spells) and **Ali comes on and
   *   goes off again** — rolling substitutions, so minutes and clean minutes are not a single
   *   interval for anybody.
   * - **Two position changes with no substitution at all** at 38′: Karim and Rayan swap MC and AT.
   *   The team stays seven, nobody's minutes move, only their `positionSpells`.
   *
   * Expected — score **2-1**, conceded once, at 44′:
   * - Rayan 1 but (18′) + 1 passe (56′), Karim 1 but (56′) + 1 passe (18′).
   * - Minutes: Hugo/Samir/Thomas/Nico/Karim/Rayan 60′, **Léo 30′** (0→20 then 50→60),
   *   **Ali 30′** (20→50), Fabien/Yanis 0′, Brice (supporter) 0′ — sum 420′.
   * - Clean minutes: 44′ for the six who played throughout; **Léo 30′ of 30′ — he was off the
   *   pitch when we conceded, and his second spell starts clean** (reducer rule 3), so his
   *   `conceded_while_on` is 0; Ali 24′ of 30′ with `conceded_while_on` 1.
   * - Hugo: 60′ in goal, 44′ gk-clean, conceded 1 → no clean sheet.
   * - No ratings at all for this match: it must therefore *not* be counted as « masqué » for
   *   anybody (there is nothing to hide).
   */
  await seedPlayedMatch({
    ...common,
    kickoffAt: at(pastSunday(5), 10, 30),
    opponentName: "Union des Lavandières",
    isHome: true,
    venue: "Stade municipal",
    competition: "league",
    entryMode: "live",
    starters: [
      [SLOT.gb, "hugo"],
      [SLOT.dg, "samir"],
      [SLOT.dc, "thomas"],
      [SLOT.dd, "nico"],
      [SLOT.mcLeft, "leo"],
      [SLOT.mcRight, "karim"],
      [SLOT.at, "rayan"],
    ],
    substitutes: ["ali", "fabien", "yanis"],
    supporters: ["brice"],
    log: (push) => {
      push("GOAL_FOR", 18, { scorerId: m("rayan"), assistId: m("karim") });
      push("SUBSTITUTION", 20, {
        outId: m("leo"),
        inId: m("ali"),
        slotId: slotFor(SLOT.mcLeft),
      });
      push("PERIOD_END", 30);
      push("KICKOFF", 30, {}, { period: 2 });
      // A double position change and not a single substitution: the striker drops into midfield
      // and the midfielder goes up front.
      push("POSITION_CHANGE", 38, {
        memberId: m("karim"),
        fromSlotId: slotFor(SLOT.mcRight),
        toSlotId: slotFor(SLOT.at),
      });
      push("POSITION_CHANGE", 38, {
        memberId: m("rayan"),
        fromSlotId: slotFor(SLOT.at),
        toSlotId: slotFor(SLOT.mcRight),
      });
      push("GOAL_AGAINST", 44);
      push("SUBSTITUTION", 50, {
        outId: m("ali"),
        inId: m("leo"),
        slotId: slotFor(SLOT.mcLeft),
      });
      push("GOAL_FOR", 56, { scorerId: m("karim"), assistId: m("rayan") });
    },
  });

  /**
   * J3 — **coupe, à l'extérieur, DÉFAITE 1-3.** The only defeat of the season, and the match that
   * gates Karim: he submitted **three notes out of ten** and must therefore still see nothing of
   * this match's ratings, anywhere (decisions 021 / 023).
   *
   * Expected — score **1-3**, conceded at 8′, 26′ and 49′:
   * - Julien 1 but (21′), Léo 1 passe, Karim 1 faute.
   * - Minutes: Hugo/Samir/Nico/Karim/Julien 60′, Léo 53′, Brice 36′, Thomas 24′, Momo 7′,
   *   Yanis 0′ — sum 420′.
   * - Clean minutes: 8′ for everyone who started (we conceded early), Thomas 13′ (36′→49′),
   *   Momo 7′ (53′→60′).
   * - Hugo: 60′ in goal, 8′ gk-clean, conceded 3.
   * - Ratings: Hugo and Julien each submitted a **complete** set of ten; Karim only rated Hugo,
   *   Samir and himself. So Hugo and Julien see the results and Karim does not — and `/stats` must
   *   tell Karim one match is withheld and why.
   * - Man of the match: **Léo and Julien share it at 7,5 over 2 notes** (7 from Hugo, 8 from
   *   Julien). A shared award is decision 025 working; a single name here is a bug.
   */
  await seedPlayedMatch({
    ...common,
    kickoffAt: at(pastSunday(4), 10, 30),
    opponentName: "Olympique Vallée",
    isHome: false,
    venue: "Complexe des Tilleuls",
    competition: "cup",
    entryMode: "live",
    starters: [
      [SLOT.gb, "hugo"],
      [SLOT.dg, "samir"],
      [SLOT.dc, "brice"],
      [SLOT.dd, "nico"],
      [SLOT.mcLeft, "leo"],
      [SLOT.mcRight, "karim"],
      [SLOT.at, "julien"],
    ],
    substitutes: ["momo", "yanis", "thomas"],
    log: (push) => {
      push("GOAL_AGAINST", 8);
      push("GOAL_FOR", 21, { scorerId: m("julien"), assistId: m("leo") });
      push("GOAL_AGAINST", 26);
      push("PERIOD_END", 30);
      push("KICKOFF", 30, {}, { period: 2 });
      push("SUBSTITUTION", 36, {
        outId: m("brice"),
        inId: m("thomas"),
        slotId: slotFor(SLOT.dc),
      });
      push("FOUL", 42, { memberId: m("karim") });
      push("GOAL_AGAINST", 49);
      push("SUBSTITUTION", 53, {
        outId: m("leo"),
        inId: m("momo"),
        slotId: slotFor(SLOT.mcLeft),
      });
    },
    ratings: {
      bases: {
        hugo: 5,
        samir: 6,
        brice: 5,
        nico: 5,
        leo: 7,
        karim: 6,
        julien: 7,
        momo: 6,
        yanis: 6,
        thomas: 6,
      },
      raters: [
        { username: "hugo", delta: 0 },
        { username: "julien", delta: 1, comment: { about: "leo", text: "Le seul à avoir couru." } },
        // A partial set, kept as decision 023 says, and still gating him as decision 021 says.
        { username: "karim", delta: 2, only: ["hugo", "samir", "karim"] },
      ],
    },
  });

  /**
   * J4 — **amical, à domicile, MATCH NUL 2-2**, and the one **goal with nobody to credit**
   * (decisions 017 / 036): at 14′ an opponent put it in his own net. The score has to count it and
   * no player may be credited, so the scorers deliberately do **not** add up to the score.
   *
   * Mehdi keeps goal here, which is the only reason he has any goalkeeping minutes outside J5.
   *
   * Expected — score **2-2**, conceded at 23′ and 57′, **1 « but sans buteur »**:
   * - Momo 1 but (41′), Karim 1 passe. Credited goals: 1. Team `goalsFor`: 2.
   * - Minutes: Mehdi/Samir/Thomas/Nico/Léo/Karim 60′, Momo 50′, Julien 10′, Yanis/Ali 0′ — 420′.
   * - Clean minutes: 23′ for the starters, Julien 7′ (50′→57′).
   * - Mehdi: 60′ in goal, 23′ gk-clean, conceded 2.
   */
  await seedPlayedMatch({
    ...common,
    kickoffAt: at(pastSunday(3), 10, 30),
    opponentName: "US des Chênes",
    isHome: true,
    venue: "Stade municipal",
    competition: "friendly",
    entryMode: "live",
    starters: [
      [SLOT.gb, "mehdi"],
      [SLOT.dg, "samir"],
      [SLOT.dc, "thomas"],
      [SLOT.dd, "nico"],
      [SLOT.mcLeft, "leo"],
      [SLOT.mcRight, "karim"],
      [SLOT.at, "momo"],
    ],
    substitutes: ["julien", "yanis", "ali"],
    log: (push) => {
      // No `scorerId`: an opponent's own goal counts for us with nobody to credit (decision 017).
      push("GOAL_FOR", 14, {});
      push("GOAL_AGAINST", 23);
      push("PERIOD_END", 30);
      push("KICKOFF", 30, {}, { period: 2 });
      push("GOAL_FOR", 41, { scorerId: m("momo"), assistId: m("karim") });
      push("SUBSTITUTION", 50, {
        outId: m("momo"),
        inId: m("julien"),
        slotId: slotFor(SLOT.at),
      });
      push("GOAL_AGAINST", 57);
    },
  });

  /**
   * J5 — **tournoi, à l'extérieur, victoire 3-2**, and **the goalkeeper fixture**: Hugo keeps the
   * first half clean and Mehdi replaces him at half time and concedes twice. This is what makes
   * `gk_clean_minutes` / `conceded_while_gk` mean anything (decision 018) — the two halves are
   * checkable by hand, and neither figure is derivable from the other.
   *
   * There is also a **voided GOAL_AGAINST at 25′**: the coach logged a goal that was disallowed.
   * If the void were mishandled, Hugo's clean half would collapse — which is the point of putting
   * it here rather than anywhere else.
   *
   * Expected — score **3-2**, conceded at 35′ and 52′ (both under Mehdi):
   * - **Hugo: 30′ played, 30′ in goal, 30′ clean, 30′ gk-clean, 0 conceded → 1 clean sheet for the
   *   keeper of a match the team lost 0-2 after his half.**
   * - **Mehdi: 30′ played (30→60), 30′ in goal, 5′ clean and 5′ gk-clean (30′→35′), 2 conceded.**
   * - Field players who played throughout: 60′, 35′ clean, 2 conceded while on.
   * - Minutes: Samir/Thomas/Nico/Léo/Karim 60′, Hugo 30′, Mehdi 30′, Julien 50′, Momo 10′,
   *   Yanis/Ali 0′ — sum 420′.
   * - Julien 1 but (12′), Karim 1 but (40′) + 2 passes (12′, 57′), Momo 1 but (57′), Léo 1 passe.
   * - Ratings: **Mehdi alone** submitted, and his set is complete. Every player therefore has
   *   exactly **one** note, so the recap must say « pas encore assez de notes » rather than name a
   *   man of the match (decision 025), while still listing the notes with their count of 1.
   *   Mehdi sees them; Karim and Hugo, who were on the sheet and never rated, see nothing.
   */
  await seedPlayedMatch({
    ...common,
    kickoffAt: at(pastSunday(2), 10, 30),
    opponentName: "Stade de la Colline",
    isHome: false,
    venue: "Tournoi de la Colline",
    competition: "tournament",
    entryMode: "live",
    starters: [
      [SLOT.gb, "hugo"],
      [SLOT.dg, "samir"],
      [SLOT.dc, "thomas"],
      [SLOT.dd, "nico"],
      [SLOT.mcLeft, "leo"],
      [SLOT.mcRight, "karim"],
      [SLOT.at, "julien"],
    ],
    substitutes: ["mehdi", "momo", "yanis", "ali"],
    log: (push) => {
      push("GOAL_FOR", 12, { scorerId: m("julien"), assistId: m("karim") });
      // Disallowed: logged, then annulled. Hugo's half must stay clean.
      const disallowed = push("GOAL_AGAINST", 25);
      push("VOID", 25, {}, { voids: disallowed });
      push("PERIOD_END", 30);
      push("KICKOFF", 30, {}, { period: 2 });
      // The gloves change at half time — a 7-a-side habit, and the whole point of decision 018.
      push(
        "SUBSTITUTION",
        30,
        { outId: m("hugo"), inId: m("mehdi"), slotId: slotFor(SLOT.gb) },
        { period: 2 },
      );
      push("GOAL_AGAINST", 35);
      push("GOAL_FOR", 40, { scorerId: m("karim"), assistId: m("leo") });
      push("SUBSTITUTION", 50, {
        outId: m("julien"),
        inId: m("momo"),
        slotId: slotFor(SLOT.at),
      });
      push("GOAL_AGAINST", 52);
      push("GOAL_FOR", 57, { scorerId: m("momo"), assistId: m("karim") });
    },
    ratings: {
      bases: {
        hugo: 8,
        samir: 6,
        thomas: 6,
        nico: 6,
        leo: 7,
        karim: 7,
        julien: 7,
        mehdi: 5,
        momo: 7,
        yanis: 5,
        ali: 5,
      },
      raters: [{ username: "mehdi", delta: 0 }],
    },
  });

  /**
   * J6 — **championnat, à l'extérieur, JOUÉ ET JAMAIS ENREGISTRÉ.** The sheet was made, the match
   * was played, and the phone never came out: `status = 'finished'` with **not one event**.
   *
   * This is not 0-0 and must never be shown as one (aggregate rule 7, decision 013). Expected:
   * - no score anywhere, no result, absent from the form guide;
   * - counted as **1 match non enregistré**, and **not** in « matchs joués »;
   * - nine selections on the sheet, **zero** appearance and zero minute for everybody;
   * - no `match_player_stats` row at all: there is no final whistle, so there is nothing to freeze.
   *   `finalizeMatch` is still asked, and correctly declines.
   */
  await seedPlayedMatch({
    ...common,
    kickoffAt: at(pastSunday(1), 10, 30),
    opponentName: "FC des Deux-Ponts",
    isHome: false,
    venue: "Stade des Deux-Ponts",
    competition: "league",
    entryMode: "retro",
    starters: [
      [SLOT.gb, "hugo"],
      [SLOT.dg, "samir"],
      [SLOT.dc, "thomas"],
      [SLOT.dd, "nico"],
      [SLOT.mcLeft, "leo"],
      [SLOT.mcRight, "karim"],
      [SLOT.at, "julien"],
    ],
    substitutes: ["momo", "yanis"],
    // No `log`, no composition applied, no events: the retro entry of M7 is still owed.
    withoutLineup: true,
  });

  /**
   * J7 — **championnat, à l'extérieur, victoire 2-0**, the most recent match and the only
   * **clean sheet** of the season. It is also the match whose ratings are *complete* for Karim, so
   * he sees this one and not J3 or J5 — the rating gate exercised in both directions by the same
   * viewer (decisions 007 / 021 / 024).
   *
   * Because it is the last played match and the next fixture is next Sunday, **its rating window is
   * open**: `/match/<id>/notation` is usable here and nowhere else.
   *
   * Expected — score **2-0**:
   * - Julien 1 but (9′), Ali 1 but (52′), Karim 1 passe, Léo 1 passe, Nico 1 faute,
   *   Momo 1 blessure (46′) and off at 48′.
   * - Minutes: Hugo/Samir/Thomas/Nico/Léo/Karim 60′, Julien 40′, Ali 12′, Momo 8′,
   *   Yanis/Fabien 0′, Brice (supporter) 0′ — sum 420′.
   * - Nothing conceded, so **clean minutes = minutes** for everybody, and Hugo has 60′ gk-clean →
   *   his **second** clean sheet of the season.
   * - Ratings: Karim, Hugo, Julien and Samir each submitted a complete set of the eleven rateable
   *   members. Deltas are 0 / +1 / −1 / 0, so **every average is exactly its base**:
   *   Julien 9,0 · Karim 8,0 · Hugo 8,0 · Ali 8,0 · Léo 7,0 · Samir 7,0 · Thomas 7,0 ·
   *   Nico 6,0 · Momo 6,0 · Yanis 5,0 · Fabien 5,0, over **4** notes each.
   *   Man of the match: **Julien, 9,0**.
   * - **Brice is a supporter**: he may not rate, may not be rated, and appears in no rating card —
   *   while still being allowed to read the results, since he had no set to submit (decision 024).
   */
  await seedPlayedMatch({
    ...common,
    kickoffAt: at(pastSunday(0), 10, 30),
    opponentName: "CS Morvan",
    isHome: false,
    venue: "Stade du Morvan",
    competition: "league",
    entryMode: "live",
    starters: [
      [SLOT.gb, "hugo"],
      [SLOT.dg, "samir"],
      [SLOT.dc, "thomas"],
      [SLOT.dd, "nico"],
      [SLOT.mcLeft, "leo"],
      [SLOT.mcRight, "karim"],
      [SLOT.at, "julien"],
    ],
    substitutes: ["momo", "yanis", "ali", "fabien"],
    supporters: ["brice"],
    unavailable: [{ username: "mehdi", note: "En déplacement ce week-end." }],
    log: (push) => {
      push("GOAL_FOR", 9, { scorerId: m("julien"), assistId: m("karim") });
      push("FOUL", 27, { memberId: m("nico") });
      push("PERIOD_END", 30);
      push("KICKOFF", 30, {}, { period: 2 });
      push("SUBSTITUTION", 40, {
        outId: m("julien"),
        inId: m("momo"),
        slotId: slotFor(SLOT.at),
      });
      // A stoppage: the clock stops and restarts at the same match minute, so nobody is credited
      // with the two real minutes the physio took (reducer rule 2).
      push("INJURY", 46, { memberId: m("momo") });
      push("PAUSE", 46, { reason: "Blessure de Momo" });
      push("RESUME", 46);
      push("SUBSTITUTION", 48, {
        outId: m("momo"),
        inId: m("ali"),
        slotId: slotFor(SLOT.at),
      });
      push("GOAL_FOR", 52, { scorerId: m("ali"), assistId: m("leo") });
    },
    ratings: {
      bases: {
        hugo: 8,
        samir: 7,
        thomas: 7,
        nico: 6,
        leo: 7,
        karim: 8,
        julien: 9,
        momo: 6,
        yanis: 5,
        ali: 8,
        fabien: 5,
      },
      raters: [
        {
          username: "karim",
          delta: 0,
          comment: { about: "julien", text: "Énorme, il tient la ligne tout seul." },
        },
        { username: "hugo", delta: 1 },
        { username: "julien", delta: -1 },
        { username: "samir", delta: 0 },
      ],
    },
  });

  /* -------------------------------------------------------------------- */
  /* What is still to come                                                */
  /* -------------------------------------------------------------------- */

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

  /* -------------------------------------------------------------------- */
  /* The season, in one line, so a screen can be checked against it       */
  /* -------------------------------------------------------------------- */

  console.log(`  équipe « ${TEAM_NAME} » · ${PLAYERS.length} joueurs (dont 1 parti) · 9 matchs · 4 entraînements`);
  console.log("  saison : 4 V · 1 N · 1 D · 1 match non enregistré · 13 buts pour, 10 contre");
  console.log("           1 but sans buteur · 1 but annulé · 1 but encaissé annulé");
  console.log("           Hugo 2 clean sheets (dont une mi-temps, J5) · Mehdi 0 sur 2 matchs");
  console.log("           notes : J7 complètes (HDM Julien 9,0) · J3 partielles pour Karim ·");
  console.log("                   J5 un seul notateur (« pas encore assez de notes »)");
  console.log(`  connexion : ${adminUsername} / ${process.env.SUPER_ADMIN_PASSWORD ?? "change-me"} (coach)`);
  console.log(`              karim / ${DEMO_PASSWORD} (joueur-coach) · hugo / ${DEMO_PASSWORD} (joueur)`);
}

/* -------------------------------------------------------------------------- */
/* Played matches, with a real event log                                      */
/* -------------------------------------------------------------------------- */

/** `[slot sort, username]` — the slot is addressed by `sort`, see `slotFor`. */
type SlotPlan = ReadonlyArray<readonly [number, string]>;

/** Appends one event at a continuous display minute (decision 009) and returns its id. */
type Push = (
  type: MatchEventType,
  minute: number,
  payload?: Record<string, unknown>,
  options?: { period?: number; voids?: string },
) => string;

/**
 * A fixed set of notes for one match.
 *
 * `bases` is the average each player is *meant* to end up with, and every rater applies their own
 * `delta` to all of them. When the deltas of a complete round sum to zero, each average is exactly
 * its base — which is what makes the numbers on the recap screen checkable without a calculator.
 */
type RatingsFixture = {
  bases: Record<string, number>;
  raters: ReadonlyArray<{
    username: string;
    delta: number;
    /** A deliberately **partial** set (decision 023): only these teammates were rated. */
    only?: readonly string[];
    comment?: { about: string; text: string };
  }>;
};

type PlayedMatchSpec = {
  teamId: string;
  adminId: string;
  formationId: string;
  slotFor: (sort: number) => string;
  m: (username: string) => string;
  kickoffAt: Date;
  opponentName: string;
  isHome: boolean;
  venue: string;
  competition: Competition;
  entryMode: "live" | "retro";
  starters: SlotPlan;
  substitutes: readonly string[];
  /** On the sheet, may not rate and may not be rated (decisions 007 / 022). */
  supporters?: readonly string[];
  /** Declared unavailable — on no sheet, but their answer is on the match page. */
  unavailable?: ReadonlyArray<{ username: string; note?: string }>;
  /**
   * The events between the kick-off and the final whistle; both of those, the initial
   * `LINEUP_APPLIED` and the closing `PERIOD_END` are added here so no fixture can forget them.
   * Omitted entirely for a match that was played and never recorded.
   */
  log?: (push: Push) => void;
  /** Skip the initial composition too — a match nobody entered has no lineup either. */
  withoutLineup?: boolean;
  ratings?: RatingsFixture;
};

/**
 * Writes a played match the way the application does, and freezes it the way the application does.
 *
 * The event log is the only record of what happened; `match_player_stats` is then written by
 * `finalizeMatchById`, i.e. by the real reducer over the real log (invariant 2). Seeding those rows
 * by hand would hide a bug in the reducer instead of exposing one, and would let the cache and the
 * log disagree — which is the one thing the whole design is arranged to prevent.
 */
async function seedPlayedMatch(spec: PlayedMatchSpec): Promise<void> {
  const { m, slotFor } = spec;
  const hasLog = spec.log !== undefined;

  const [match] = await db
    .insert(matches)
    .values({
      teamId: spec.teamId,
      kickoffAt: spec.kickoffAt,
      opponentName: spec.opponentName,
      isHome: spec.isHome,
      venue: spec.venue,
      competition: spec.competition,
      periodMinutes: PERIOD_MINUTES,
      // A match with a log is left `live` and closed by the freeze path, exactly as game mode does
      // it. A match with no log has no final whistle to close it, so its status is the only thing
      // saying it was played — which is what an owed retro entry looks like (decision 013).
      status: hasLog ? "live" : "finished",
      entryMode: spec.entryMode,
      operatorUserId: spec.adminId,
      createdBy: spec.adminId,
    })
    .returning({ id: matches.id });

  const starterNames = spec.starters.map(([, username]) => username);
  const supporters = spec.supporters ?? [];

  await db.insert(matchSquad).values([
    ...starterNames.map((u) => ({ matchId: match.id, teamMemberId: m(u), role: "starter" as const })),
    ...spec.substitutes.map((u) => ({
      matchId: match.id,
      teamMemberId: m(u),
      role: "substitute" as const,
    })),
    ...supporters.map((u) => ({
      matchId: match.id,
      teamMemberId: m(u),
      role: "supporter" as const,
    })),
  ]);

  await db.insert(matchAvailability).values([
    ...[...starterNames, ...spec.substitutes, ...supporters].map((u) => ({
      matchId: match.id,
      teamMemberId: m(u),
      status: "yes" as const,
    })),
    ...(spec.unavailable ?? []).map((entry) => ({
      matchId: match.id,
      teamMemberId: m(entry.username),
      status: "no" as const,
      note: entry.note ?? null,
    })),
  ]);

  let lineupId: string | null = null;
  if (!spec.withoutLineup) {
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
    lineupId = lineup.id;

    await db.insert(lineupSlots).values(
      spec.starters.map(([sort, username]) => ({
        lineupId: lineup.id,
        formationSlotId: slotFor(sort),
        teamMemberId: m(username),
      })),
    );
  }

  /* ---- the event log --------------------------------------------------- */

  if (hasLog) {
    let seq = 0;
    const events: Array<typeof matchEvents.$inferInsert> = [];

    const push: Push = (type, minute, payload = {}, options = {}) => {
      const id = randomUUID();
      events.push({
        id,
        matchId: match.id,
        clientEventId: randomUUID(),
        type,
        // A period boundary belongs to the period it *starts*, which only the fixture knows: at 30′
        // the `PERIOD_END` is still period 1 and the `KICKOFF` is already period 2.
        period: options.period ?? (minute <= PERIOD_MINUTES ? 1 : 2),
        minute,
        clockMs: minute * 60_000,
        occurredAt: new Date(spec.kickoffAt.getTime() + minute * 60_000),
        payload,
        createdBy: spec.adminId,
        voidsEventId: options.voids ?? null,
        seq: seq++,
      });
      return id;
    };

    push("KICKOFF", 0);
    const appliedId = push("LINEUP_APPLIED", 0, {
      lineupId,
      slots: spec.starters.map(([sort, username]) => ({
        slotId: slotFor(sort),
        memberId: m(username),
      })),
    });

    spec.log!(push);

    push("PERIOD_END", 60, {}, { period: 2 });
    push("FINAL_WHISTLE", 60, {}, { period: 2 });

    await db.insert(matchEvents).values(events);

    // The composition was actually applied, so point it at the event that did it (decision 006).
    if (lineupId) {
      await db.update(lineups).set({ appliedEventId: appliedId }).where(eq(lineups.id, lineupId));
    }
  }

  /* ---- freeze it through the real path --------------------------------- */

  const frozen = await finalizeMatchById(spec.teamId, match.id);
  if (hasLog && !frozen.finished) {
    throw new Error(
      `Fixture « ${spec.opponentName} » : le match n'a pas pu être figé — le log n'a pas de coup de sifflet final.`,
    );
  }
  if (!hasLog && frozen.finished) {
    throw new Error(
      `Fixture « ${spec.opponentName} » : un match sans aucun événement ne devrait rien figer.`,
    );
  }

  /* ---- ratings --------------------------------------------------------- */

  if (spec.ratings) {
    // Only `starter` and `substitute` may rate or be rated — a supporter has no card
    // (decision 007, `lib/rating/progress.ts`).
    const rateable = [...starterNames, ...spec.substitutes];
    const clamp = (score: number) => Math.max(0, Math.min(10, score));

    const rows = spec.ratings.raters.flatMap((rater) => {
      const targets = rater.only ?? rateable;
      return targets.map((target) => {
        const base = spec.ratings!.bases[target];
        if (base === undefined) {
          throw new Error(
            `Fixture « ${spec.opponentName} » : pas de note de référence pour « ${target} ».`,
          );
        }
        return {
          matchId: match.id,
          raterMemberId: m(rater.username),
          ratedMemberId: m(target),
          score: clamp(base + rater.delta),
          comment: rater.comment?.about === target ? rater.comment.text : null,
        };
      });
    });

    await db.insert(ratings).values(rows);
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
