/**
 * The turf pitch itself: green with mowing stripes and white markings (decision 014).
 *
 * A **Server Component** — no hooks, no state, no event handlers. Everything interactive lives
 * in a client component layered on top through `children`.
 *
 * Children are positioned in the 0..1000 pitch coordinate space with `PitchPoint`; see
 * `lib/pitch/geometry.ts` for the coordinate system and `components/pitch/README.md` for the API.
 */

import type { CSSProperties, ReactNode } from "react";

import {
  METER,
  PITCH_MARGIN,
  PLAY_LENGTH,
  PLAY_WIDTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type PitchPoint as PitchCoordinates,
  toPercentPoint,
} from "@/lib/pitch/geometry";
import { cn } from "@/components/ui/cn";

/* -------------------------------------------------------------------------- */
/* Markings, in SVG units (1 m = METER = 25 units)                            */
/* -------------------------------------------------------------------------- */

const LEFT = PITCH_MARGIN;
const RIGHT = PITCH_MARGIN + PLAY_WIDTH;
/** The opponent's goal line: we always attack upwards. */
const TOP = PITCH_MARGIN;
/** Our own goal line. */
const BOTTOM = PITCH_MARGIN + PLAY_LENGTH;
const CENTRE_X = PITCH_MARGIN + PLAY_WIDTH / 2;
const HALFWAY_Y = PITCH_MARGIN + PLAY_LENGTH / 2;

/** 20 cm — a shade wider than a real marking, so the lines survive a 320 px screen. */
const LINE_WIDTH = 5;
const CENTRE_CIRCLE_RADIUS = 6 * METER;
const SPOT_RADIUS = 7;
const PENALTY_AREA_WIDTH = 24 * METER;
const PENALTY_AREA_DEPTH = 8 * METER;
const GOAL_AREA_WIDTH = 10 * METER;
const GOAL_AREA_DEPTH = 3.5 * METER;
const PENALTY_SPOT_DEPTH = 7 * METER;
const CORNER_RADIUS = METER;
/** A seven-a-side goal is 6 m wide. Its depth is drawn into the surrounding margin. */
const GOAL_WIDTH = 6 * METER;
const GOAL_DEPTH = 1.5 * METER;

const PENALTY_AREA_X = CENTRE_X - PENALTY_AREA_WIDTH / 2;
const GOAL_AREA_X = CENTRE_X - GOAL_AREA_WIDTH / 2;
const GOAL_X = CENTRE_X - GOAL_WIDTH / 2;

/** Quarter circles at the four corners, all drawn inwards. */
const CORNER_ARCS = [
  `M ${LEFT + CORNER_RADIUS} ${TOP} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 1 ${LEFT} ${TOP + CORNER_RADIUS}`,
  `M ${RIGHT} ${TOP + CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 1 ${RIGHT - CORNER_RADIUS} ${TOP}`,
  `M ${RIGHT - CORNER_RADIUS} ${BOTTOM} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 1 ${RIGHT} ${BOTTOM - CORNER_RADIUS}`,
  `M ${LEFT} ${BOTTOM - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 1 ${LEFT + CORNER_RADIUS} ${BOTTOM}`,
];

/* -------------------------------------------------------------------------- */
/* PitchPoint                                                                 */
/* -------------------------------------------------------------------------- */

export type PitchPointProps = {
  /** 0 = left touchline, 1000 = right touchline. */
  x: number;
  /** 0 = our own goal line, 1000 = the opponent's goal line. */
  y: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Absolutely positions its children on the pitch, centred on `(x, y)` in the 0..1000 space.
 *
 * Pointer events are re-enabled here (the overlay itself lets them through), so a wrapped
 * `<button>` or a drag handle works while the turf below stays clickable.
 */
export function PitchPoint({ x, y, children, className, style }: PitchPointProps) {
  const { left, top } = toPercentPoint({ x, y });
  return (
    <div
      className={cn("pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2", className)}
      style={{ left: `${left}%`, top: `${top}%`, ...style }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pitch                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How big the pitch may get **on a desktop** (decision 227). The pitch is drawn to a fixed portrait
 * ratio, so its width decides its height: left to `w-full` in a 720 px column it was 1053 px tall,
 * a screen and a half, while the strip of compositions drew the same pitch at 398 px. Each value
 * only adds `md:` classes, so a phone renders exactly as before.
 *
 * - `hero` — the one pitch the screen is about (the équipe type): as large as the window allows
 *   *by height*, so it is never taller than the viewport minus the header and page title above it.
 * - `card` — a pitch inside a card (positions, compositions): capped at 24rem, 384 × 562.
 * - `thumb` — a small pitch among others (sheets, strips): capped at 20rem.
 *
 * Omitted, nothing is added: the caller sizes it, as before.
 */
export type PitchFit = "hero" | "card" | "thumb";

const FIT_CLASSES: Readonly<Record<PitchFit, string>> = {
  // 0.684 is the drawing's width/height (1080/1580); 13rem is the sticky header and the page's own
  // heading above the pitch, so width × (1/0.684) never exceeds what is left of the window.
  hero: "md:mx-auto md:max-w-[min(100%,calc((100dvh-13rem)*0.684))]",
  card: "md:mx-auto md:max-w-sm",
  thumb: "md:mx-auto md:max-w-xs",
};

export type PitchProps = {
  /** Markers to draw on the turf, positioned with `PitchPoint`. */
  children?: ReactNode;
  /** Desktop size class; see `PitchFit`. No effect below `md`. */
  fit?: PitchFit;
  /** Applied to the outer box. The aspect ratio is fixed, so only set width/margins here. */
  className?: string;
  /**
   * Number of mowing bands. Even numbers look wrong on a real pitch (the two halves end up
   * mown differently), so the default is odd-friendly: 10 bands over the full graphic.
   */
  stripes?: number;
  /**
   * French accessible name. Omit it — the default — when the pitch is decorative scaffolding
   * and the markers around it already carry the meaning; the graphic is then hidden from
   * assistive technology.
   */
  label?: string;
};

export function Pitch({ children, className, stripes = 10, label, fit }: PitchProps) {
  const bandHeight = VIEW_HEIGHT / stripes;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-border bg-turf select-none",
        fit ? FIT_CLASSES[fit] : undefined,
        className,
      )}
      style={{ aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}` }}
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        focusable="false"
      >
        {/* Turf and mowing stripes */}
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} className="fill-turf" />
        {Array.from({ length: stripes }, (_, index) =>
          index % 2 === 1 ? (
            <rect
              key={index}
              x={0}
              y={index * bandHeight}
              width={VIEW_WIDTH}
              height={bandHeight}
              className="fill-turf-stripe"
            />
          ) : null,
        )}

        {/* Markings */}
        <g
          className="stroke-line"
          fill="none"
          strokeWidth={LINE_WIDTH}
          strokeLinecap="round"
          opacity={0.9}
        >
          {/* Touchlines and goal lines */}
          <rect x={LEFT} y={TOP} width={PLAY_WIDTH} height={PLAY_LENGTH} />

          {/* Halfway line, centre circle and centre spot */}
          <line x1={LEFT} y1={HALFWAY_Y} x2={RIGHT} y2={HALFWAY_Y} />
          <circle cx={CENTRE_X} cy={HALFWAY_Y} r={CENTRE_CIRCLE_RADIUS} />
          <circle cx={CENTRE_X} cy={HALFWAY_Y} r={SPOT_RADIUS} className="fill-line stroke-none" />

          {/* Our penalty area and goal area (bottom) */}
          <rect
            x={PENALTY_AREA_X}
            y={BOTTOM - PENALTY_AREA_DEPTH}
            width={PENALTY_AREA_WIDTH}
            height={PENALTY_AREA_DEPTH}
          />
          <rect
            x={GOAL_AREA_X}
            y={BOTTOM - GOAL_AREA_DEPTH}
            width={GOAL_AREA_WIDTH}
            height={GOAL_AREA_DEPTH}
          />
          <circle
            cx={CENTRE_X}
            cy={BOTTOM - PENALTY_SPOT_DEPTH}
            r={SPOT_RADIUS}
            className="fill-line stroke-none"
          />

          {/* The opponent's penalty area and goal area (top) */}
          <rect
            x={PENALTY_AREA_X}
            y={TOP}
            width={PENALTY_AREA_WIDTH}
            height={PENALTY_AREA_DEPTH}
          />
          <rect x={GOAL_AREA_X} y={TOP} width={GOAL_AREA_WIDTH} height={GOAL_AREA_DEPTH} />
          <circle
            cx={CENTRE_X}
            cy={TOP + PENALTY_SPOT_DEPTH}
            r={SPOT_RADIUS}
            className="fill-line stroke-none"
          />

          {/* Corner arcs */}
          {CORNER_ARCS.map((path) => (
            <path key={path} d={path} />
          ))}
        </g>

        {/* Goals, drawn outside the goal lines into the surrounding turf */}
        <g className="stroke-line" fill="none" strokeWidth={LINE_WIDTH} opacity={0.95}>
          <Goal y={BOTTOM} depth={GOAL_DEPTH} />
          <Goal y={TOP - GOAL_DEPTH} depth={GOAL_DEPTH} />
        </g>
      </svg>

      {/* Marker layer: same box as the graphic, so percentages land on the markings. */}
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}

/** One goal: frame plus a hint of netting. */
function Goal({ y, depth }: { y: number; depth: number }) {
  const netColumns = 5;
  const step = GOAL_WIDTH / netColumns;
  return (
    <g>
      <rect x={GOAL_X} y={y} width={GOAL_WIDTH} height={depth} />
      <g strokeWidth={LINE_WIDTH / 2} opacity={0.55}>
        {Array.from({ length: netColumns - 1 }, (_, index) => {
          const x = GOAL_X + step * (index + 1);
          return <line key={x} x1={x} y1={y} x2={x} y2={y + depth} />;
        })}
        <line x1={GOAL_X} y1={y + depth / 2} x2={GOAL_X + GOAL_WIDTH} y2={y + depth / 2} />
      </g>
    </g>
  );
}

/** Re-exported so callers can type their own coordinates without reaching into `lib/`. */
export type { PitchCoordinates };
