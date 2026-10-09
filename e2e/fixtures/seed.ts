/**
 * The data one end-to-end run needs, and nothing else.
 *
 * Run through `tsx --conditions=react-server` (like `db/seed.ts`, and for the same reason:
 * `db/client.ts` is `import "server-only"`), it prints a `Fixture` as JSON on stdout.
 *
 * ## Why this exists at all, next to `db/seed.ts`
 *
 * The demo season is a *demonstration*: it is edited whenever someone needs a better example, and
 * a test that asserts on « AS Dimanche » or on Karim's shirt number breaks the day somebody
 * improves the seed. So this script creates its **own** team, its own coach and its own eight
 * players, keyed on a run id, and hands their ids to the spec. The spec then asserts on what it
 * created. `db/seed.ts` is never imported here and its contents are never assumed.
 *
 * ## Repeatability
 *
 * Every run first deletes the *previous* runs' fixtures — teams whose slug starts with `e2e-`, then
 * users whose username starts with `e2e-`, in that order because `match_events.created_by` is
 * `on delete restrict` and the events have to go with their team first. Nothing else in the
 * database is touched: no `truncate`, no `delete` without a predicate, and never an `update` or a
 * `delete` against `match_events` themselves (invariant 1 — the log of a fixture match dies with
 * its match, which is the only way rows leave that table).
 *
 * Reference data (`positions`, the one shared `1-2-3-1` formation) is *ensured*, never re-created: it
 * is shared with the rest of the database, so this only fills in what a fresh machine is missing.
 */

import { and, eq, isNull, like } from "drizzle-orm";

import "../../db/load-env";
import { db, sql } from "../../db/client";
import { POSITIONS, THE_FORMATION } from "../../db/reference";
import {
  competitions,
  formationSlots,
  formations,
  positions,
  teamMembers,
  teams,
  users,
} from "../../db/schema";
import { hashPassword } from "../../lib/auth/password";
import { defaultCompetitionRows } from "../../lib/competition/defaults";
import type { Fixture, FixturePlayer, FixturePlayerKey } from "./types";

/** Everything this script creates is named after it, and pruned by it. */
const PREFIX = "e2e-";

/** Eight characters at most, so `e2e-<runId>-coach` stays inside the 20-character username limit. */
const RUN_ID = (process.env.E2E_RUN_ID ?? Date.now().toString(36)).slice(-8);

const PASSWORD = "motdepasse-e2e";

const COACH_DISPLAY_NAME = "Coach Renard";

/** The bootstrap account of the first-run scenario: super admin, and in no team. */
const ADMIN_DISPLAY_NAME = "Patron Vasseur";

/**
 * Eight players: seven starters in the 1-2-3-1 and one substitute. The names are distinct enough that
 * no one of them is a substring of another — the specs look players up by visible French text, and
 * « Martin » inside « Martineau » is exactly how such a suite starts lying.
 */
const PLAYERS: readonly { key: FixturePlayerKey; displayName: string; jerseyNumber: number }[] = [
  { key: "gk", displayName: "Gaspard Lemoine", jerseyNumber: 1 },
  { key: "lb", displayName: "Basile Moreau", jerseyNumber: 2 },
  { key: "cb", displayName: "Damien Fabre", jerseyNumber: 3 },
  { key: "rb", displayName: "Corentin Dupont", jerseyNumber: 4 },
  { key: "cm1", displayName: "Marius Ollivier", jerseyNumber: 5 },
  { key: "cm2", displayName: "Nathan Perrin", jerseyNumber: 6 },
  { key: "st", displayName: "Zacharie Nadal", jerseyNumber: 7 },
  { key: "sub", displayName: "Sylvain Bonnet", jerseyNumber: 8 },
];

async function main(): Promise<void> {
  await pruneOldFixtures();
  await ensureReferenceData();
  const fixture = await createTeam(RUN_ID);
  await write(`${JSON.stringify(fixture)}\n`);
}

/* -------------------------------------------------------------------------- */
/* Pruning                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Teams first, then users. `match_events.created_by` restricts deleting a user who has operated a
 * match, and the events only disappear when their match does — which happens through
 * `matches.team_id`'s cascade. Reversing these two statements is a foreign-key error.
 */
async function pruneOldFixtures(): Promise<void> {
  await db.delete(teams).where(like(teams.slug, `${PREFIX}%`));
  await db.delete(users).where(like(users.username, `${PREFIX}%`));
}

/* -------------------------------------------------------------------------- */
/* Reference data                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The position vocabulary and the one shared formation the composition editor needs to render.
 * Both are idempotent: on a machine that has run `npm run db:seed` this does nothing at all.
 */
async function ensureReferenceData(): Promise<void> {
  await db
    .insert(positions)
    .values(
      POSITIONS.map((position) => ({
        code: position.code,
        labelFr: position.labelFr,
        line: position.line,
        defaultX: position.defaultX,
        defaultY: position.defaultY,
        sort: position.sort,
      })),
    )
    .onConflictDoNothing();

  const template = THE_FORMATION;

  const [existing] = await db
    .select({ id: formations.id })
    .from(formations)
    .where(and(isNull(formations.teamId), eq(formations.label, template.label)))
    .limit(1);
  if (existing) return;

  const [created] = await db
    .insert(formations)
    .values({ teamId: null, name: template.name, label: template.label })
    .returning({ id: formations.id });

  await db.insert(formationSlots).values(
    template.slots.map((slot) => ({
      formationId: created.id,
      positionCode: slot.positionCode,
      x: slot.x,
      y: slot.y,
      sort: slot.sort,
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* The team                                                                   */
/* -------------------------------------------------------------------------- */

async function createTeam(runId: string): Promise<Fixture> {
  const [team] = await db
    .insert(teams)
    .values({ name: `E2E ${runId}`, slug: `${PREFIX}${runId}` })
    .returning({ id: teams.id, name: teams.name, slug: teams.slug });

  // What `createTeam` gives a real team (decision 107). The happy path never opens the
  // « Compétition » select — it takes the default — so without these rows « Créer le match » has
  // nothing to file the match under and the whole season loop stops on the first form.
  await db.insert(competitions).values(defaultCompetitionRows(team.id));

  // One hash for everybody: argon2id is deliberately slow, and nine of them is a visible pause.
  const passwordHash = await hashPassword(PASSWORD);

  const coachUsername = `${PREFIX}${runId}-coach`;
  const [coachUser] = await db
    .insert(users)
    .values({ username: coachUsername, passwordHash, displayName: COACH_DISPLAY_NAME })
    .returning({ id: users.id });

  // A coach who does not play: the match sheet then lists exactly the eight players, which is what
  // the spec counts.
  const [coachMember] = await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: coachUser.id, role: "coach", isPlayer: false })
    .returning({ id: teamMembers.id });

  /**
   * The first-run account: super admin, deliberately **without** a `team_members` row. That is the
   * whole point — `requireTeamContext` bounces a user with no team to `/rejoindre` (invariant 5), and
   * the spec checks that screen is not the dead end it used to be.
   */
  const adminUsername = `${PREFIX}${runId}-admin`;
  await db.insert(users).values({
    username: adminUsername,
    passwordHash,
    displayName: ADMIN_DISPLAY_NAME,
    isSuperAdmin: true,
  });

  const playerUsers = await db
    .insert(users)
    .values(
      PLAYERS.map((player, index) => ({
        username: `${PREFIX}${runId}-p${index + 1}`,
        passwordHash,
        displayName: player.displayName,
      })),
    )
    .returning({ id: users.id, username: users.username, displayName: users.displayName });

  // Keyed on the display name rather than on the order `returning` happened to use.
  const userIdByName = new Map(playerUsers.map((row) => [row.displayName, row.id]));

  const memberships = await db
    .insert(teamMembers)
    .values(
      PLAYERS.map((player) => ({
        teamId: team.id,
        userId: expect(userIdByName.get(player.displayName), player.displayName),
        role: "player" as const,
        isPlayer: true,
        jerseyNumber: player.jerseyNumber,
      })),
    )
    .returning({ id: teamMembers.id, userId: teamMembers.userId });

  const membershipIdByUserId = new Map(memberships.map((row) => [row.userId, row.id]));
  const usernameByUserId = new Map(playerUsers.map((row) => [row.id, row.username]));

  const players: FixturePlayer[] = PLAYERS.map((player) => {
    const userId = expect(userIdByName.get(player.displayName), player.displayName);
    return {
      key: player.key,
      username: expect(usernameByUserId.get(userId), `username de ${player.displayName}`),
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber,
      membershipId: expect(membershipIdByUserId.get(userId), `adhésion de ${player.displayName}`),
    };
  });

  return {
    runId,
    password: PASSWORD,
    team,
    coach: {
      username: coachUsername,
      displayName: COACH_DISPLAY_NAME,
      membershipId: coachMember.id,
    },
    players,
    admin: { username: adminUsername, displayName: ADMIN_DISPLAY_NAME },
  };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function expect<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Fixture incomplete: ${what} manquant.`);
  return value;
}

/** `process.exit` can truncate a piped stdout; waiting for the flush cannot. */
function write(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(text, (error) => (error ? reject(error) : resolve()));
  });
}

main()
  .then(async () => {
    await sql.end({ timeout: 5 });
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
