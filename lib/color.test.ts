import { describe, expect, it } from "vitest";

import {
  areColorsIndistinguishable,
  contrastRatio,
  inkContrastOn,
  parseHexColor,
  readableInkOn,
  relativeLuminance,
  toHexColor,
  withAlpha,
} from "./color";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

describe("parseHexColor", () => {
  it("parses long and short form, with or without the hash", () => {
    expect(parseHexColor("#1f6feb")).toEqual({ r: 31, g: 111, b: 235 });
    expect(parseHexColor("1f6feb")).toEqual({ r: 31, g: 111, b: 235 });
    expect(parseHexColor("#FFF")).toEqual(WHITE);
    expect(parseHexColor("  #0a0  ")).toEqual({ r: 0, g: 170, b: 0 });
  });

  it("rejects anything else — the column is free text", () => {
    for (const value of ["", "#", "red", "#12345", "#1234567", "rgb(1,2,3)", "#12345g"]) {
      expect(parseHexColor(value)).toBeNull();
    }
  });

  it("round-trips through toHexColor", () => {
    expect(toHexColor({ r: 31, g: 111, b: 235 })).toBe("#1f6feb");
    expect(toHexColor(BLACK)).toBe("#000000");
    expect(toHexColor(WHITE)).toBe("#ffffff");
  });
});

describe("relativeLuminance", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 10);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
    // Mid grey #808080 — the classic worked example.
    expect(relativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(0.2158, 3);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 6);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 10);
  });
});

describe("readableInkOn", () => {
  it("puts dark text on a light kit", () => {
    // Yellow, white, sky blue, lime: the shirts that break naive white-text discs.
    for (const kit of ["#ffe100", "#ffffff", "#7dd3fc", "#a3e635", "#f5d0a9"]) {
      expect(readableInkOn(kit)).toBe("dark");
    }
  });

  it("puts light text on a dark kit", () => {
    // Navy, maroon, forest green, the default team colour from the schema.
    for (const kit of ["#0b1f45", "#7f1d1d", "#14532d", "#1f6feb", "#000000"]) {
      expect(readableInkOn(kit)).toBe("light");
    }
  });

  it("falls back to light ink for unparseable colours", () => {
    expect(readableInkOn("bleu marine")).toBe("light");
  });

  it("flips well before the naive luminance > 0.5 rule", () => {
    // Pure red: luminance 0.2126, so `> 0.5` would keep white text at 4.0:1.
    expect(readableInkOn("#ff0000")).toBe("dark");
  });

  it("guarantees at least 4.5:1 for every possible kit colour", () => {
    // Sweep the sRGB cube coarsely, including the worst case around luminance 0.179.
    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 15) {
          expect(inkContrastOn({ r, g, b })).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe("withAlpha", () => {
  it("produces a modern rgb() string for ghost discs", () => {
    expect(withAlpha("#1f6feb", 0.35)).toBe("rgb(31 111 235 / 0.35)");
  });

  it("clamps the alpha and gives up on bad input", () => {
    expect(withAlpha("#000", 5)).toBe("rgb(0 0 0 / 1)");
    expect(withAlpha("#000", -1)).toBe("rgb(0 0 0 / 0)");
    expect(withAlpha("nope", 0.5)).toBeUndefined();
  });
});

describe("areColorsIndistinguishable", () => {
  it("catches white on white and keeps real kit pairs apart", () => {
    expect(areColorsIndistinguishable("#ffffff", "#fefefe")).toBe(true);
    expect(areColorsIndistinguishable("#1f6feb", "#ffffff")).toBe(false);
  });

  it("never flags unparseable input", () => {
    expect(areColorsIndistinguishable("nope", "#ffffff")).toBe(false);
  });
});
