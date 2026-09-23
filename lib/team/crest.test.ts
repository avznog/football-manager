import { describe, expect, it } from "vitest";

import { CREST_MAX_CHARS, CREST_MAX_SIDE, crestFits, fitWithin } from "./crest";
import { crestFieldSchema, updateTeamSchema } from "./validation";

describe("fitWithin", () => {
  it("shrinks a phone photograph to the box, keeping its shape", () => {
    // A 4032×3024 iPhone shot: the long side lands on the ceiling, the short one follows.
    expect(fitWithin(4032, 3024)).toEqual({ width: 96, height: 72 });
  });

  it("works the same way in portrait", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 72, height: 96 });
  });

  it("leaves a crest that already fits alone rather than blowing it up", () => {
    // Enlarging 40 px of artwork to 96 only stores the blur.
    expect(fitWithin(40, 40)).toEqual({ width: 40, height: 40 });
  });

  it("never rounds a very wide banner down to nothing", () => {
    // 2000×3 would scale to 0.144 px of height, and a zero-height canvas throws.
    expect(fitWithin(2000, 3)).toEqual({ width: CREST_MAX_SIDE, height: 1 });
  });

  it("answers zero for a size that makes no sense, so the caller can refuse", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(Number.NaN, Number.NaN)).toEqual({ width: 0, height: 0 });
  });
});

describe("the ceiling", () => {
  it("accepts a crest at the limit and refuses the character after it", () => {
    expect(crestFits("x".repeat(CREST_MAX_CHARS))).toBe(true);
    expect(crestFits("x".repeat(CREST_MAX_CHARS + 1))).toBe(false);
  });
});

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

describe("the crest field", () => {
  it("passes a re-encoded PNG through", () => {
    expect(crestFieldSchema.parse(PNG)).toBe(PNG);
  });

  it("accepts a JPEG, which is what a photograph falls back to", () => {
    expect(crestFieldSchema.parse("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toBe(
      "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    );
  });

  /**
   * The difference between "the coach did not touch the crest" and "the coach removed it". Renaming
   * the team must not cost it the crest, which is what a two-state field would do.
   */
  it("means « leave it alone » when empty, and « remove it » only when asked", () => {
    expect(crestFieldSchema.parse("")).toBeUndefined();
    expect(crestFieldSchema.parse("none")).toBeNull();
  });

  /**
   * The value is rendered as the `src` of an `<img>`. An SVG `data:` URL is the one shape of this
   * string that can carry markup, so it is refused here rather than considered downstream.
   */
  it("refuses anything that is not one of the two raster types", () => {
    expect(() => crestFieldSchema.parse("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toThrow();
    expect(() => crestFieldSchema.parse("https://exemple.fr/blason.png")).toThrow();
    expect(() => crestFieldSchema.parse("data:image/png;base64,<script>")).toThrow();
    expect(() => crestFieldSchema.parse("javascript:alert(1)")).toThrow();
  });

  it("refuses a crest too heavy to sit in a row that is read on every request", () => {
    const huge = `data:image/png;base64,${"A".repeat(CREST_MAX_CHARS)}`;
    expect(() => crestFieldSchema.parse(huge)).toThrow(/trop lourd/);
  });
});

describe("updateTeamSchema", () => {
  const base = {
    teamId: "6f1c2a84-5e0f-4a1e-9c6a-0f0a2b3c4d5e",
    name: "AS Dimanche",
    primaryColor: "#1f6feb",
    secondaryColor: "#ffffff",
  };

  it("keeps the crest when the form does not mention it", () => {
    const parsed = updateTeamSchema.parse({ ...base, crest: "" });
    // `undefined` is Drizzle's « do not touch this column ».
    expect(parsed.crest).toBeUndefined();
  });

  it("carries a new crest and a removal through to the update", () => {
    expect(updateTeamSchema.parse({ ...base, crest: PNG }).crest).toBe(PNG);
    expect(updateTeamSchema.parse({ ...base, crest: "none" }).crest).toBeNull();
  });
});
