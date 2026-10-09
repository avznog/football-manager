import { describe, expect, it } from "vitest";

import {
  type PositionSelection,
  cyclePosition,
  nextPreference,
  preferenceLabelFr,
  primaryPosition,
  selectedPositions,
} from "./preferences";

describe("nextPreference", () => {
  it("cycles not wanted → secondary → primary → not wanted", () => {
    expect(nextPreference(undefined)).toBe("secondary");
    expect(nextPreference("secondary")).toBe("primary");
    expect(nextPreference("primary")).toBeUndefined();
  });
});

describe("cyclePosition", () => {
  it("adds, promotes then removes a position", () => {
    let selection: PositionSelection = {};
    selection = cyclePosition(selection, "AT");
    expect(selection).toEqual({ AT: "secondary" });
    selection = cyclePosition(selection, "AT");
    expect(selection).toEqual({ AT: "primary" });
    selection = cyclePosition(selection, "AT");
    expect(selection).toEqual({});
  });

  it("never mutates its input", () => {
    const selection: PositionSelection = { MC: "primary" };
    const next = cyclePosition(selection, "AT");
    expect(selection).toEqual({ MC: "primary" });
    expect(next).not.toBe(selection);
  });

  it("keeps at most one primary, demoting the previous one to secondary", () => {
    const selection: PositionSelection = { MC: "primary", AT: "secondary" };
    const next = cyclePosition(selection, "AT");
    expect(next).toEqual({ MC: "secondary", AT: "primary" });
    expect(primaryPosition(next)).toBe("AT");
  });

  it("allows several primaries only when explicitly asked to", () => {
    const selection: PositionSelection = { MC: "primary", AT: "secondary" };
    const next = cyclePosition(selection, "AT", { singlePrimary: false });
    expect(next).toEqual({ MC: "primary", AT: "primary" });
  });

  it("does not touch other positions when demoting to not wanted", () => {
    const selection: PositionSelection = { MC: "primary", AT: "secondary", DC: "secondary" };
    expect(cyclePosition(selection, "MC")).toEqual({ AT: "secondary", DC: "secondary" });
  });
});

describe("primaryPosition and selectedPositions", () => {
  it("reports no primary for an empty or secondary-only selection", () => {
    expect(primaryPosition({})).toBeUndefined();
    expect(primaryPosition({ AT: "secondary" })).toBeUndefined();
  });

  it("lists the primary first", () => {
    const selection: PositionSelection = { DC: "secondary", AT: "primary", MC: "secondary" };
    expect(selectedPositions(selection)[0]).toBe("AT");
    expect(selectedPositions(selection)).toHaveLength(3);
  });
});

describe("preferenceLabelFr", () => {
  it("is in French, for accessible labels", () => {
    expect(preferenceLabelFr("primary")).toBe("poste principal");
    expect(preferenceLabelFr("secondary")).toBe("poste secondaire");
    expect(preferenceLabelFr(undefined)).toBe("pas son poste");
  });
});
