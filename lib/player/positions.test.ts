import { describe, expect, it } from "vitest";

import type { PositionSelection } from "@/lib/pitch/preferences";
import {
  fromSelection,
  positionsSignature,
  positionsSummaryFr,
  primaryCodeOf,
  secondaryCodesOf,
  selectionsEqual,
  sortPreferredPositions,
  toPositionRows,
  toSelection,
  type PreferredPosition,
} from "./positions";

const rows = (...entries: [string, "primary" | "secondary"][]): PreferredPosition[] =>
  entries.map(([code, preference]) => ({
    code: code as PreferredPosition["code"],
    preference,
  }));

describe("sortPreferredPositions", () => {
  it("puts the primary first, then the secondaries back to front", () => {
    const sorted = sortPreferredPositions(
      rows(["AT", "secondary"], ["MC", "primary"], ["DC", "secondary"]),
    );
    expect(sorted.map((row) => row.code)).toEqual(["MC", "DC", "AT"]);
  });

  it("does not mutate its input", () => {
    const input = rows(["AT", "secondary"], ["GB", "primary"]);
    sortPreferredPositions(input);
    expect(input.map((row) => row.code)).toEqual(["AT", "GB"]);
  });
});

describe("toSelection", () => {
  it("maps rows onto the picker's value", () => {
    expect(toSelection(rows(["MC", "primary"], ["MOC", "secondary"]))).toEqual({
      MC: "primary",
      MOC: "secondary",
    });
  });

  it("drops codes the reference data does not know", () => {
    expect(toSelection([{ code: "LIBERO", preference: "primary" }])).toEqual({});
  });

  it("demotes a second primary rather than showing two", () => {
    // A broken database invariant must not become a broken UI state.
    const selection = toSelection(rows(["GB", "primary"], ["DC", "primary"]));
    const primaries = Object.values(selection).filter((value) => value === "primary");
    expect(primaries).toHaveLength(1);
    // The earlier position in display order keeps the primary.
    expect(selection.GB).toBe("primary");
    expect(selection.DC).toBe("secondary");
  });
});

describe("fromSelection", () => {
  it("round-trips a selection", () => {
    const selection: PositionSelection = { AT: "secondary", MC: "primary" };
    expect(toSelection(fromSelection(selection))).toEqual(selection);
  });

  it("returns canonical order", () => {
    expect(fromSelection({ AT: "secondary", DC: "secondary", MC: "primary" })).toEqual(
      rows(["MC", "primary"], ["DC", "secondary"], ["AT", "secondary"]),
    );
  });
});

describe("toPositionRows", () => {
  it("keeps at most one primary", () => {
    const result = toPositionRows("MC", ["MOC", "AT"]);
    expect(result.filter((row) => row.preference === "primary")).toEqual(
      rows(["MC", "primary"]),
    );
    expect(secondaryCodesOf(result)).toEqual(["MOC", "AT"]);
  });

  it("counts a code posted twice once, as primary", () => {
    expect(toPositionRows("AT", ["AT", "MOC"])).toEqual(
      rows(["AT", "primary"], ["MOC", "secondary"]),
    );
    expect(toPositionRows("AT", ["AT"])).toEqual(rows(["AT", "primary"]));
    expect(primaryCodeOf(toPositionRows("AT", ["AT"]))).toBe("AT");
  });

  it("dedupes repeated secondaries", () => {
    expect(toPositionRows(null, ["DC", "DC", "DG"])).toEqual(
      rows(["DG", "secondary"], ["DC", "secondary"]),
    );
  });

  it("accepts no wish at all", () => {
    expect(toPositionRows(null, [])).toEqual([]);
  });
});

describe("positionsSignature and selectionsEqual", () => {
  it("ignores key order", () => {
    expect(selectionsEqual({ MC: "primary", AT: "secondary" }, { AT: "secondary", MC: "primary" })).toBe(
      true,
    );
  });

  it("separates a promotion from a demotion", () => {
    expect(selectionsEqual({ MC: "primary" }, { MC: "secondary" })).toBe(false);
    expect(selectionsEqual({ MC: "primary" }, {})).toBe(false);
  });

  it("is stable for the same wishes", () => {
    expect(positionsSignature(rows(["AT", "secondary"], ["MC", "primary"]))).toBe(
      positionsSignature(rows(["MC", "primary"], ["AT", "secondary"])),
    );
  });
});

describe("positionsSummaryFr", () => {
  it("names the primary and the secondaries", () => {
    expect(positionsSummaryFr(rows(["MC", "primary"], ["MOC", "secondary"]))).toBe(
      "Poste principal : Milieu central · poste secondaire : Milieu offensif central",
    );
  });

  it("uses the plural for several secondaries", () => {
    expect(positionsSummaryFr(rows(["MC", "primary"], ["MOC", "secondary"], ["AT", "secondary"]))).toBe(
      "Poste principal : Milieu central · postes secondaires : Milieu offensif central, Attaquant",
    );
  });

  it("capitalises the first part when there is no primary", () => {
    expect(positionsSummaryFr(rows(["AT", "secondary"]))).toBe("Poste secondaire : Attaquant");
  });

  it("says so when nothing was chosen", () => {
    expect(positionsSummaryFr([])).toBe("Aucun poste préféré indiqué");
  });
});
