"use client";

import type { ReactNode } from "react";

import type { RemarkKind } from "@/lib/match/events";

/**
 * The icons on the action tiles of game mode, and on the remark tiles.
 *
 * Hand-rolled inline SVG, like `components/theme/theme-toggle.tsx`: there is no icon dependency in
 * this repository and there must not be one. Every one of them is a 24-unit grid stroked at 1.75
 * units, which leaves room for about four strokes before it turns to mud — so each drawing is a
 * ball, a box, an arrow, a shield, a star, and nothing more. They are read at 16 px, at arm's
 * length, outdoors.
 *
 * Two rules hold for all of them, and both matter:
 *
 * - `stroke="currentColor"` and no `fill`, no colour of their own. That is what makes them work in
 *   light and dark for free, and what lets a tile's `tone` tint its icon along with its label.
 * - `aria-hidden="true"`, so the accessible name of a tile stays its French label alone. The icon
 *   is a shortcut for the eye; it says nothing a screen reader needs.
 */

/**
 * The shared frame. Seventeen copies of the same seven attributes is seventeen chances to mistype
 * one, and the rendered element is identical to the ones in `theme-toggle.tsx`.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      {children}
    </svg>
  );
}

/** A ball, and an arrow leaving it. The one tile that is good news. */
export function GoalForIcon() {
  return (
    <Icon>
      <circle cx="9" cy="15" r="5.5" />
      <path d="M14.5 9.5 21 3m-5.5 0H21v5.5" />
    </Icon>
  );
}

/** A goal, and something arriving in it. The mirror of `GoalForIcon`, by direction. */
export function GoalAgainstIcon() {
  return (
    <Icon>
      <rect x="3" y="13.5" width="18" height="7.5" rx="1" />
      <path d="M12 2v8M8 6.5l4 4 4-4" />
    </Icon>
  );
}

/** Two arrows, one each way: who goes out, who comes in. */
export function SubstitutionIcon() {
  return (
    <Icon>
      <path d="M3 8h14m-3.5-3.5L17 8l-3.5 3.5" />
      <path d="M21 16H7m3.5-3.5L7 16l3.5 3.5" />
    </Icon>
  );
}

/** A speech bubble: the only tile that records something said rather than something played. */
export function CommentIcon() {
  return (
    <Icon>
      <path d="M20 4H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 16h3v4.5L12.5 16H20a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 20 4Z" />
    </Icon>
  );
}

/** A ball, and an arrow turning back on us. */
export function OwnGoalIcon() {
  return (
    <Icon>
      <rect x="3" y="14.5" width="18" height="6.5" rx="1" />
      <path d="M7 11.5V8a5 5 0 0 1 10 0v3.5" />
      <path d="M13 8 17 12l4-4" />
    </Icon>
  );
}

/** A ball and a tick. */
export function PenaltyScoredIcon() {
  return (
    <Icon>
      <circle cx="7" cy="17" r="4.5" />
      <path d="M12 10.5 15.5 14 22 5.5" />
    </Icon>
  );
}

/** A ball and a cross. The same ball as `PenaltyScoredIcon`, the opposite verdict. */
export function PenaltyMissedIcon() {
  return (
    <Icon>
      <circle cx="7" cy="17" r="4.5" />
      <path d="M13.5 5.5 22 14M22 5.5 13.5 14" />
    </Icon>
  );
}

/** A medical cross. */
export function InjuryIcon() {
  return (
    <Icon>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Icon>
  );
}

/** Three dots: more of them, one tap further. */
export function MoreIcon() {
  return (
    <Icon>
      <path d="M6 12h.01M12 12h.01M18 12h.01" />
    </Icon>
  );
}

/**
 * A flag: something worth noting about one player. Deliberately not the star of « beau geste » —
 * the tile that opens the remarks must not wear the drawing of one of the six inside it, or the
 * grid says « beau geste » twice and means two different things.
 */
export function RemarkIcon() {
  return (
    <Icon>
      <path d="M6 21.5V3m0 1.5 12 3.5-12 3.5" />
    </Icon>
  );
}

/**
 * The ten tiles of the two ACTION menus, keyed as the menu keys them.
 *
 * Here so that the game-mode screen wires one icon per tile with `icon: ACTION_ICONS.GOAL_FOR`
 * rather than importing ten components. The keys are the `MatchEventType`s the menu offers, plus
 * `MORE` for « Autre… », which records nothing.
 */
export const ACTION_ICONS = {
  GOAL_FOR: <GoalForIcon />,
  GOAL_AGAINST: <GoalAgainstIcon />,
  SUBSTITUTION: <SubstitutionIcon />,
  COMMENT: <CommentIcon />,
  REMARK: <RemarkIcon />,
  MORE: <MoreIcon />,
  OWN_GOAL: <OwnGoalIcon />,
  PENALTY_SCORED: <PenaltyScoredIcon />,
  PENALTY_MISSED: <PenaltyMissedIcon />,
  INJURY: <InjuryIcon />,
} as const satisfies Record<string, ReactNode>;

/* ------------------------------------------------------------------ remarks */

/**
 * The six remarks. These say nothing about the score; they are what the coach noticed about one
 * player, so the drawings are judgements rather than events: a shield, a bolt, a star on one side,
 * a broken arrow and a crossed-out ball on the other.
 */

/** « Bon retour » — a shield: he came back and defended. */
export function GoodTrackBackIcon() {
  return (
    <Icon>
      <path d="M12 2.5 20.5 5.5v6c0 5-3.6 8.2-8.5 10-4.9-1.8-8.5-5-8.5-10v-6Z" />
    </Icon>
  );
}

/** « Bel effort » — a bolt. */
export function GoodEffortIcon() {
  return (
    <Icon>
      <path d="M13.5 2.5 4.5 13.5h6l-1 8 9-11h-6Z" />
    </Icon>
  );
}

/** « Mauvaise passe » — an arrow that does not arrive. */
export function BadPassIcon() {
  return (
    <Icon>
      <path d="M3 12h3.5M10 12h4M17.5 12H21m-3-3 3 3-3 3" />
    </Icon>
  );
}

/** « Bon placement » — a pin: he was where he had to be. */
export function GoodPositioningIcon() {
  return (
    <Icon>
      <path d="M12 21.5s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </Icon>
  );
}

/** « Perte de balle » — a ball crossed out. */
export function LostBallIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </Icon>
  );
}

/** « Beau geste » — a star. */
export function NiceSkillIcon() {
  return (
    <Icon>
      <path d="M12 3l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.3-4.2 6-.9Z" />
    </Icon>
  );
}

/**
 * The six remarks, keyed by `RemarkKind`, so the remark sheet wires one icon per tile with
 * `icon: REMARK_ICONS[kind]`. Typed as a total record: adding a kind to `REMARK_KINDS` without
 * drawing it stops typechecking here.
 */
export const REMARK_ICONS: Record<RemarkKind, ReactNode> = {
  GOOD_TRACK_BACK: <GoodTrackBackIcon />,
  GOOD_EFFORT: <GoodEffortIcon />,
  BAD_PASS: <BadPassIcon />,
  GOOD_POSITIONING: <GoodPositioningIcon />,
  LOST_BALL: <LostBallIcon />,
  NICE_SKILL: <NiceSkillIcon />,
};
