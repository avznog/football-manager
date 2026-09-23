/**
 * The one rule about coaches: a team must always keep at least one.
 *
 * It lived in three places that had to agree — `setMemberRole` and `removeMember` each refused the
 * case with their own copy of the predicate, and `/equipe` counted coaches a third way so it could
 * avoid offering a button that does nothing. Now the profile page and both actions ask the same
 * function, and it is testable, which the copies inside two `void` Server Actions were not.
 *
 * Pure, and no database: the caller brings the ids of the team's **active** coaches. Who is active
 * is `leftAt is null`, which is the condition every caller already applies.
 */

/**
 * True when stripping this member of the coach role — by demotion or by removing them from the
 * squad — would leave the team with nobody in charge.
 *
 * A team with no coach at all answers `false`: there is nothing left to protect, and a bootstrapped
 * instance briefly looks like that. A member who is not a coach answers `false` too.
 */
export function wouldLeaveNoCoach(
  coachMemberIds: readonly string[],
  memberId: string,
): boolean {
  return coachMemberIds.length <= 1 && coachMemberIds[0] === memberId;
}
