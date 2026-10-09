/**
 * A saved composition, drawn and not editable.
 *
 * Used wherever a composition is only being looked at: the match page's summary, the list of
 * compositions, and later a recap. A **Server Component** — no client JavaScript at all, which is
 * the whole reason the editor and this are two files rather than one with a `readOnly` prop.
 *
 * A composition that has not been confirmed in game mode is drawn with **ghost** discs (decision
 * 006): the coach must be able to tell "what I plan to do" from "what happened" at a glance, and on
 * a phone screen in the sun a dashed, translucent disc says that better than any caption.
 */

import { PitchLayout, type KitColors, type PitchSlot } from "@/components/pitch";
import type { DiscSize } from "@/components/pitch";
import type { SquadRole } from "@/db/schema";
import type { SlotAssignment } from "@/lib/match/lineup";

export type LineupPitchMember = {
  membershipId: string;
  name: string;
  jerseyNumber: number | null;
  squadRole: SquadRole | null;
  isInjured: boolean;
};

export type LineupPitchProps = {
  /** The formation's slots, as `lib/formation/queries.ts` returns them. */
  slots: readonly { id: string; positionCode: string; x: number; y: number }[];
  assignments: readonly SlotAssignment[];
  members: readonly LineupPitchMember[];
  kit: KitColors;
  size?: DiscSize;
  /** False once game mode has confirmed the composition — it is then a fact, not a plan. */
  planned?: boolean;
  /** French accessible name, e.g. « Composition de départ, 1-2-3-1 ». */
  label?: string;
  className?: string;
};

export function LineupPitch({
  slots,
  assignments,
  members,
  kit,
  size = "md",
  planned = true,
  label,
  className,
}: LineupPitchProps) {
  const byId = new Map(members.map((member) => [member.membershipId, member]));
  const memberInSlot = new Map(
    assignments.map((assignment) => [assignment.slotId, assignment.memberId]),
  );

  const pitchSlots: PitchSlot[] = slots.map((slot) => {
    const memberId = memberInSlot.get(slot.id);
    const member = memberId ? byId.get(memberId) : undefined;

    return {
      id: slot.id,
      x: slot.x,
      y: slot.y,
      positionCode: slot.positionCode,
      player:
        memberId === undefined
          ? null
          : {
              id: memberId,
              name: member?.name ?? "Joueur inconnu",
              jerseyNumber: member?.jerseyNumber ?? null,
              // An unavailable disc is a warning, and it wins over the ghost: a plan that fields
              // somebody who is no longer on the sheet has to look wrong.
              variant: isProblem(member) ? "unavailable" : planned ? "ghost" : "normal",
              statusLabel: statusLabelOf(member),
            },
    };
  });

  return (
    <PitchLayout
      slots={pitchSlots}
      kit={kit}
      size={size}
      pitchLabel={label}
      className={className}
    />
  );
}

function isProblem(member: LineupPitchMember | undefined): boolean {
  return member === undefined || member.squadRole === null || member.squadRole === "supporter";
}

function statusLabelOf(member: LineupPitchMember | undefined): string | undefined {
  if (member === undefined) return "hors effectif";
  if (member.squadRole === null) return "non sélectionné";
  if (member.squadRole === "supporter") return "supporter";
  if (member.isInjured) return "blessé";
  return undefined;
}
