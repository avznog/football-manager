import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { positionsSummaryFr, primaryCodeOf, secondaryCodesOf } from "@/lib/player/positions";
import type { SquadMember } from "@/lib/team/queries";

/**
 * One line of the squad list — one line for everybody, coach or not.
 *
 * A Server Component, and now a plain link: the whole row is the way to the member's profile, which
 * is where their number, their positions, their role and their removal from the squad all live.
 *
 * ## Why the controls are not here
 *
 * They were, and « Nommer coach » + « Retirer » took 200 px of a 326 px row at 390 px. The name
 * block was the only thing that could shrink, and it did, to nothing: first names read « Tho… »,
 * « Ya… », « Fa… », and the injured player's row showed a jersey number, a « blessé » badge and no
 * name at all. Wrapping fixed the truncation and cost a second line per player, so a coach with
 * fourteen players scrolled a list twice as long as everyone else's — for two buttons he uses twice
 * a season.
 *
 * Both controls act on exactly one member, so they moved to that member's page. The list is left to
 * what it is for: reading who is in the squad, with their number, their posts and their badges.
 */
export function MemberRow({ member }: { member: SquadMember }) {
  const primary = primaryCodeOf(member.positions);
  const secondary = secondaryCodesOf(member.positions);

  return (
    <li>
      <Link
        href={`/joueur/${member.membershipId}`}
        className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
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

        <span className="flex shrink-0 items-center gap-1.5">
          {member.role === "coach" ? <Badge variant="accent">coach</Badge> : null}
          {member.isInjured ? <Badge variant="danger">blessé</Badge> : null}
        </span>
      </Link>
    </li>
  );
}
