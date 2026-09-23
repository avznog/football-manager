/**
 * What one end-to-end run gets to work with.
 *
 * `e2e/fixtures/seed.ts` prints this as JSON on stdout and `e2e/fixtures/provision.ts` parses it,
 * so this file is the contract between the two. It is deliberately *only* identity and identifiers:
 * everything else the scenario needs — a match, a squad, compositions, events, ratings — is created
 * by the spec through the real UI, which is the point.
 */

/** How the spec refers to its players, by the role they play in the scenario. */
export type FixturePlayerKey =
  | "gk"
  | "lb"
  | "cb"
  | "rb"
  | "cm1"
  /** Replaced at the 30th minute by `sub`. */
  | "cm2"
  /** Scores, and is voted man of the match. */
  | "st"
  /** On the bench; comes on at the 30th minute. */
  | "sub";

export type FixturePlayer = {
  key: FixturePlayerKey;
  /** Login, `e2e-<runId>-pN`. */
  username: string;
  /** Shown everywhere in the UI, and therefore what most selectors key on. */
  displayName: string;
  jerseyNumber: number;
  /** `team_members.id` — what the squad sheet and the rating pad build their input ids from. */
  membershipId: string;
};

export type Fixture = {
  /** Short, unique per run. Every row this fixture creates is named after it. */
  runId: string;
  /** The same password for everybody: this is throwaway local data, not a secret. */
  password: string;
  team: { id: string; name: string; slug: string };
  coach: { username: string; displayName: string; membershipId: string };
  players: FixturePlayer[];
  /**
   * A super admin **in no team at all**, for the first-run scenario: the state a freshly deployed
   * instance is in after `npm run db:bootstrap` (decision 052). It needs no empty database — only an
   * account with no membership, which is exactly what this is.
   */
  admin: { username: string; displayName: string };
};
