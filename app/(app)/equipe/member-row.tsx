import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { positionsSummaryFr, primaryCodeOf, secondaryCodesOf } from "@/lib/player/positions";
import { removeMember, setMemberRole } from "@/lib/team/actions";
import type { SquadMember } from "@/lib/team/queries";

/**
 * One line of the squad list.
 *
 * A Server Component: the coach's controls are plain forms bound to Server Actions, so the
 * page works with no JavaScript at all — which matters on a phone with one bar of signal at
 * the side of a pitch.
 *
 * The name block is the link to the profile. The two coach forms stay **outside** it: a form
 * inside an anchor is invalid HTML, and a button inside a link is a trap for both a mouse and a
 * screen reader.
 *
 * ## Why it wraps
 *
 * « Nommer coach » + « Retirer » are 200 px of a 326 px row at 390 px, and the name block was the
 * only thing that could shrink. It did, to nothing: first names read « Tho… », « Ya… », « Fa… », and
 * the one injured player's row showed a jersey number, a « blessé » badge and **no name at all**.
 * So the row wraps and the name keeps `basis-44` — for a coach the controls drop onto a second
 * line, for everyone else the row is unchanged and stays one line.
 */
export function MemberRow({
  member,
  teamId,
  canManage,
  isLastCoach = false,
}: {
  member: SquadMember;
  teamId: string;
  canManage: boolean;
  /**
   * This member is the team's only remaining coach. `setMemberRole` and `removeMember` both refuse
   * that case — by returning, since they are plain `void` form actions so the screen works with no
   * JavaScript. A button that silently does nothing is worse than no button, so the row explains
   * itself instead of offering two taps that cannot succeed.
   */
  isLastCoach?: boolean;
}) {
  const primary = primaryCodeOf(member.positions);
  const secondary = secondaryCodesOf(member.positions);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
      <Link
        href={`/joueur/${member.membershipId}`}
        className="-mx-2 flex min-h-11 min-w-0 flex-1 basis-44 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Avatar name={member.displayName} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">
            {member.jerseyNumber !== null ? (
              <span className="mr-1.5 font-mono text-sm text-ink-subtle tabular-nums">
                {member.jerseyNumber}
              </span>
            ) : null}
            {member.displayName}
          </p>
          <p className="truncate text-xs text-ink-subtle">
            @{member.username}
            {member.positions.length > 0 ? (
              <>
                {" · "}
                {/* The codes are what fits on a phone row; the sentence is for screen readers. */}
                <span className="sr-only">{positionsSummaryFr(member.positions)}</span>
                {primary ? (
                  <span aria-hidden className="font-semibold text-ink-muted">
                    {primary}
                  </span>
                ) : null}
                {secondary.length > 0 ? (
                  <span aria-hidden>
                    {primary ? " " : ""}
                    {secondary.join(" ")}
                  </span>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        {member.role === "coach" ? <Badge variant="accent">coach</Badge> : null}
        {member.isInjured ? <Badge variant="danger">blessé</Badge> : null}
      </div>

      {canManage && isLastCoach ? (
        /* `w-full` puts it on its own line: at 390 px the sentence is wider than what is left of
           the row once the avatar, the name and the « coach » badge have had their share, and
           inline it overflowed the row's padding to within 4 px of the card border. */
        <p className="w-full text-xs text-ink-subtle">
          seul coach&nbsp;: nomme quelqu’un d’autre d’abord
        </p>
      ) : canManage ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* A team must always keep one coach; both actions refuse it on the server too. */}
          <form action={setMemberRole}>
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="memberId" value={member.membershipId} />
            <input
              type="hidden"
              name="role"
              value={member.role === "coach" ? "player" : "coach"}
            />
            <Button type="submit" variant="ghost" size="sm">
              {member.role === "coach" ? "Retirer coach" : "Nommer coach"}
            </Button>
          </form>

          <form action={removeMember}>
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="memberId" value={member.membershipId} />
            <Button type="submit" variant="ghost" size="sm" aria-label={`Retirer ${member.displayName} de l’effectif`}>
              Retirer
            </Button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
