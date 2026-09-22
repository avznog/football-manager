import { describe, expect, it } from "vitest";

import {
  MIN_MARKER_DISTANCE,
  PITCH_MARGIN,
  PITCH_MAX,
  PLAY_LENGTH,
  PLAY_WIDTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  clampToPitch,
  fromClientPoint,
  isValidPitchPoint,
  pitchDistance,
  toPercentPoint,
  toSvgPoint,
} from "./geometry";

describe("toSvgPoint", () => {
  it("puts our own goal line at the bottom and the opponent's at the top", () => {
    expect(toSvgPoint({ x: 500, y: 0 })).toEqual({
      x: PITCH_MARGIN + 500,
      y: PITCH_MARGIN + PLAY_LENGTH,
    });
    expect(toSvgPoint({ x: 500, y: PITCH_MAX })).toEqual({
      x: PITCH_MARGIN + 500,
      y: PITCH_MARGIN,
    });
  });

  it("maps the touchlines to the edges of the playing area", () => {
    expect(toSvgPoint({ x: 0, y: 500 }).x).toBe(PITCH_MARGIN);
    expect(toSvgPoint({ x: PITCH_MAX, y: 500 }).x).toBe(PITCH_MARGIN + PLAY_WIDTH);
  });

  it("puts the halfway line in the middle", () => {
    expect(toSvgPoint({ x: 500, y: 500 })).toEqual({
      x: PITCH_MARGIN + 500,
      y: PITCH_MARGIN + PLAY_LENGTH / 2,
    });
  });
});

describe("toPercentPoint", () => {
  it("agrees with toSvgPoint", () => {
    const point = { x: 330, y: 820 };
    const svg = toSvgPoint(point);
    const percent = toPercentPoint(point);
    expect(percent.left).toBeCloseTo((svg.x / VIEW_WIDTH) * 100, 10);
    expect(percent.top).toBeCloseTo((svg.y / VIEW_HEIGHT) * 100, 10);
  });

  it("keeps the whole pitch inside the graphic, margin included", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
      { x: 1000, y: 0 },
    ]) {
      const { left, top } = toPercentPoint(point);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(100);
      expect(top).toBeGreaterThan(0);
      expect(top).toBeLessThan(100);
    }
  });

  it("centres the centre spot", () => {
    expect(toPercentPoint({ x: 500, y: 500 })).toEqual({ left: 50, top: 50 });
  });
});

describe("fromClientPoint", () => {
  const box = { left: 20, top: 100, width: VIEW_WIDTH, height: VIEW_HEIGHT };

  it("round-trips with toSvgPoint", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 500, y: 500 },
      { x: 170, y: 250 },
      { x: 1000, y: 1000 },
    ]) {
      const svg = toSvgPoint(point);
      expect(fromClientPoint({ x: box.left + svg.x, y: box.top + svg.y }, box)).toEqual(point);
    }
  });

  it("clamps a drop outside the touchline back onto the pitch", () => {
    expect(fromClientPoint({ x: -500, y: -500 }, box)).toEqual({ x: 0, y: 1000 });
    expect(fromClientPoint({ x: 99999, y: 99999 }, box)).toEqual({ x: 1000, y: 0 });
  });

  it("returns integers whatever the box size", () => {
    const small = { left: 0, top: 0, width: 327, height: 478.5 };
    const point = fromClientPoint({ x: 123.7, y: 219.4 }, small);
    expect(isValidPitchPoint(point)).toBe(true);
  });

  it("survives a zero-sized box", () => {
    expect(fromClientPoint({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("clampToPitch", () => {
  it("clamps and rounds", () => {
    expect(clampToPitch({ x: -3, y: 1200 })).toEqual({ x: 0, y: 1000 });
    expect(clampToPitch({ x: 499.6, y: 250.4 })).toEqual({ x: 500, y: 250 });
  });

  it("does not propagate NaN", () => {
    expect(clampToPitch({ x: Number.NaN, y: Number.NaN })).toEqual({ x: 0, y: 0 });
  });
});

describe("pitchDistance", () => {
  it("is symmetric and zero for identical points", () => {
    const a = { x: 200, y: 300 };
    const b = { x: 700, y: 900 };
    expect(pitchDistance(a, a)).toBe(0);
    expect(pitchDistance(a, b)).toBeCloseTo(pitchDistance(b, a), 10);
  });

  it("weights the long axis by the pitch aspect ratio", () => {
    // 100 units of y cover 1.5 times more ground than 100 units of x.
    expect(pitchDistance({ x: 0, y: 0 }, { x: 0, y: 100 })).toBeCloseTo(150, 10);
    expect(pitchDistance({ x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(100, 10);
  });

  it("measures the diagonal of the whole pitch", () => {
    expect(pitchDistance({ x: 0, y: 0 }, { x: 1000, y: 1000 })).toBeCloseTo(
      Math.hypot(PLAY_WIDTH, PLAY_LENGTH),
      6,
    );
  });
});

describe("MIN_MARKER_DISTANCE", () => {
  it("is wide enough for a 48 px disc on a 320 px pitch", () => {
    const graphicWidth = 320;
    const unitsPerPixel = VIEW_WIDTH / graphicWidth;
    const discInUnits = 48 * unitsPerPixel;
    expect(MIN_MARKER_DISTANCE).toBeGreaterThan(discInUnits);
  });
});
