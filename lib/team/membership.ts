/**
 * What a member of a team **is**, in words, from the two columns that decide it.
 *
 * `team_members` carries the answer in two places on purpose: `role` says who administers the team,
 * `is_player` says who turns out on a Sunday. They are independent — a coach who plays is both, and
 * the founder of a team is `role = 'coach'` with `is_player = false` (`createTeam`) — so a label
 * derived from either column alone is wrong for somebody. `/joueur/[id]` already derived it from
 * both, inline, under a comment explaining why; this module is that comment made reusable, so the
 * screens cannot drift apart again (decision 085).
 */

import type { TeamRole } from "@/db/schema";

/** A badge, as the design system takes it: the French word and which colour it wears. */
export type MemberBadge = {
  labelFr: string;
  variant: "accent" | "neutral";
};

/**
 * Every badge that is true of one member, in the order the profile header prints them.
 *
 * Never one badge from a ternary on `role`. `/moi` did exactly that, and it produced the sentence
 * this function exists to make impossible: demote the founder of a team — `role = 'coach'`,
 * `is_player = false`, which is what `createTeam` inserts — and `/moi` badged them « joueur »
 * directly above its own « Tu fais partie de l'encadrement : pas de fiche joueur ». Two taps from
 * the state every new deployment starts in, and the screen contradicted itself inside 200 px.
 */
export function memberBadgesFr(role: TeamRole | null, isPlayer: boolean): MemberBadge[] {
  // `ActiveTeam.role` is null for a super admin pinned to a team he is not in (`getActiveTeam`), and
  // the old ternary called that person « joueur » — of a squad holding no row for him at all. He is
  // neither encadrement nor absent from the screen, so the badge says the one true thing.
  if (role === null) {
    return [{ labelFr: "non membre", variant: "neutral" }];
  }

  const badges: MemberBadge[] = [];

  if (role === "coach") {
    badges.push({ labelFr: "coach", variant: "accent" });
  }

  // Not « joueur » by elimination: a member who neither coaches nor plays is the encadrement, and
  // that is the word the rest of the app uses for them.
  badges.push(
    isPlayer
      ? { labelFr: "joueur", variant: "neutral" }
      : { labelFr: "encadrement", variant: "neutral" },
  );

  return badges;
}

/**
 * The heading of the « Mon profil de joueur » card on `/moi`.
 *
 * For a member of the encadrement that card holds one sentence saying they have no fiche joueur, so
 * the heading was naming a thing its own body denies — the same defect as « Fiche joueur » on
 * `/joueur/[id]`, on the one screen a coach opens about himself.
 */
export function myPlayerCardTitleFr(isPlayer: boolean): string {
  return isPlayer ? "Mon profil de joueur" : "Tu n’as pas de fiche joueur";
}

/**
 * And why not, which is not the same sentence for the two people who read it.
 *
 * It used to be « Tu fais partie de l'encadrement » unconditionally, which is the reason for a
 * non-playing coach and untrue of a super admin who is not in the team — the other reader `profile`
 * comes back null for. « pas de fiche joueur » also left the sentence, because the heading above it
 * now says exactly that and saying it twice in 200 px reads as two different facts.
 */
export function noPlayerProfileReasonFr(isMember: boolean): string {
  return isMember
    ? "Tu fais partie de l’encadrement : pas de postes ni de blessures à renseigner."
    : "Tu n’es pas membre de cette équipe : tu la consultes en tant qu’administrateur.";
}
