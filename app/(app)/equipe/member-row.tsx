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
 */
export function MemberRow({
  member,
  teamId,
  canManage,
}: {
  member: SquadMember;
  teamId: string;
  canManage: boolean;
}) {
  const primary = primaryCodeOf(member.positions);
  const secondary = secondaryCodesOf(member.positions);

  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <Link
        href={`/joueur/${member.membershipId}`}
        className="-mx-2 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          {/* A team must always keep one coach; the action refuses to demote the last one. */}
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
