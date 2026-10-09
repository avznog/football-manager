/**
 * The invariants `docs/DATA_MODEL.md` states but the schema cannot express: "exactly 7 slots per
 * formation, exactly one of them GB", coordinates in range, and the visual rule that decides
 * whether the pitch is readable at all — two discs must never overlap.
 */

import { describe, expect, it } from "vitest";

import {
  BUILTIN_FORMATIONS,
  FORMATION_SLOT_COUNT,
  LINE_ORDER,
  POSITIONS,
  POSITION_BY_CODE,
  POSITION_CODES,
  THE_FORMATION,
  type PositionCode,
  type PositionDefinition,
  DEFAULT_FORMATION_LABEL,
  formationByLabel,
  formationDistribution,
  formationLabelOf,
  isPositionCode,
  atPositionFr,
  positionLabelFr,
  positionRankOf,
} from "./reference";
import {
  MIN_MARKER_DISTANCE,
  isValidPitchPoint,
  pitchDistance,
} from "@/lib/pitch/geometry";

/**
 * `POSITION_BY_CODE` is honestly typed `Partial<Record<…>>`, so a test that wants a definition has
 * to assert it is there. That assertion is the point rather than a formality: it is what the
 * « every code has a definition » test below proves for the whole vocabulary.
 */
function definitionOf(code: PositionCode): PositionDefinition {
  const definition = POSITION_BY_CODE[code];
  expect(definition, `${code} has no definition`).toBeDefined();
  return definition as PositionDefinition;
}

describe("positions", () => {
  it("is exactly the five posts the owner named, and nothing more (decision 157)", () => {
    // Typed out on purpose: this list is the specification, not a mirror of it.
    expect(POSITIONS.map((position) => position.code)).toEqual(["GB", "DC", "MC", "AIL", "AT"]);
    expect(POSITIONS).toHaveLength(POSITION_CODES.length);
  });

  it("has unique codes", () => {
    const codes = POSITIONS.map((position) => position.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("orders the sort values from the goalkeeper forwards", () => {
    expect(POSITIONS.map((position) => position.sort)).toEqual(
      [...POSITIONS].map((_, index) => index + 1),
    );
    const lineRank = (code: PositionCode) => LINE_ORDER.indexOf(definitionOf(code).line);
    for (let i = 1; i < POSITIONS.length; i += 1) {
      expect(lineRank(POSITIONS[i].code)).toBeGreaterThanOrEqual(lineRank(POSITIONS[i - 1].code));
    }
  });

  it("has integer coordinates inside the pitch", () => {
    for (const position of POSITIONS) {
      expect(
        isValidPitchPoint({ x: position.defaultX, y: position.defaultY }),
        `${position.code} is off the pitch`,
      ).toBe(true);
    }
  });

  it("has exactly one goalkeeper, near our own goal line", () => {
    const keepers = POSITIONS.filter((position) => position.line === "GB");
    expect(keepers).toHaveLength(1);
    expect(keepers[0].code).toBe("GB");
    expect(keepers[0].defaultY).toBeLessThan(150);
    expect(keepers[0].defaultX).toBe(500);
  });

  it("places every line in front of the previous one", () => {
    const meanY = (line: string) => {
      const group = POSITIONS.filter((position) => position.line === line);
      return group.reduce((total, position) => total + position.defaultY, 0) / group.length;
    };
    expect(meanY("GB")).toBeLessThan(meanY("DEF"));
    expect(meanY("DEF")).toBeLessThan(meanY("MIL"));
    expect(meanY("MIL")).toBeLessThan(meanY("ATT"));
  });

  it("puts the winger on the midfield line, beside the centre midfielder", () => {
    // `MIL` and not `ATT`: the formation draws its two `AIL` slots on the midfield line, and the line
    // is what makes its label read `1-2-3-1` (three in midfield) rather than `1-2-1-3`.
    expect(definitionOf("AIL").line).toBe("MIL");
    expect(definitionOf("AIL").defaultX).toBeLessThan(500);
    expect(Math.abs(definitionOf("AIL").defaultY - definitionOf("MC").defaultY)).toBeLessThan(100);
  });

  it("has a properly accented French label for every position", () => {
    for (const position of POSITIONS) {
      expect(position.labelFr.length).toBeGreaterThan(4);
      expect(position.labelFr[0]).toBe(position.labelFr[0].toUpperCase());
    }
    expect(positionLabelFr("AIL")).toBe("Ailier");
    expect(positionLabelFr("DC")).toBe("Défenseur central");
  });

  it("never lets two canonical positions overlap — the five are one layout", () => {
    for (let i = 0; i < POSITIONS.length; i += 1) {
      for (let j = i + 1; j < POSITIONS.length; j += 1) {
        const a = POSITIONS[i];
        const b = POSITIONS[j];
        const distance = pitchDistance(
          { x: a.defaultX, y: a.defaultY },
          { x: b.defaultX, y: b.defaultY },
        );
        expect(
          distance,
          `${a.code} and ${b.code} are only ${Math.round(distance)} units apart`,
        ).toBeGreaterThanOrEqual(MIN_MARKER_DISTANCE);
      }
    }
  });

  it("narrows unknown codes, the retired ones included", () => {
    expect(isPositionCode("AIL")).toBe(true);
    expect(isPositionCode("CF")).toBe(false);
    expect(positionLabelFr("CF")).toBe("CF");
    // Retired by decision 157: `positions` keeps their rows, the vocabulary does not.
    for (const retired of ["DG", "DD", "MG", "MD", "MOC", "AG", "AD"]) {
      expect(isPositionCode(retired), retired).toBe(false);
      expect(positionLabelFr(retired)).toBe(retired);
    }
  });

  it("has a definition for every code in the vocabulary", () => {
    // Asserted rather than assumed: `POSITION_BY_CODE` used to claim this through a cast.
    for (const code of POSITION_CODES) {
      expect(POSITION_BY_CODE[code], `${code} has no definition`).toBeDefined();
      expect(POSITION_BY_CODE[code]?.code).toBe(code);
    }
    expect(Object.keys(POSITION_BY_CODE)).toHaveLength(POSITION_CODES.length);
  });

  it("offers every position as a wish, because the formation fields every one of them", () => {
    // Decision 158: there is no narrower « preferred » list any more. What made a narrower list
    // necessary was a vocabulary larger than any one shape; with five codes, every one is a slot of
    // the one formation, so asking a player for any of them is a question with an answer.
    const fielded = new Set(THE_FORMATION.slots.map((slot) => slot.positionCode));
    expect([...fielded].sort()).toEqual([...POSITION_CODES].sort());
  });
});

describe("positionRankOf", () => {
  it("returns the display rank of a known code", () => {
    expect(positionRankOf("GB")).toBe(1);
    expect(positionRankOf("AT")).toBe(POSITION_CODES.length);
  });

  it("sorts an unknown code after every known one", () => {
    for (const code of POSITION_CODES) {
      expect(positionRankOf("LIBERO")).toBeGreaterThan(positionRankOf(code));
    }
  });

  it("gives two unknown codes the same finite rank, so a comparator stays deterministic", () => {
    // Not `Infinity`: `Infinity - Infinity` is `NaN` and a `NaN` comparator orders arbitrarily.
    expect(positionRankOf("LIBERO")).toBe(positionRankOf("TRQ"));
    expect(positionRankOf("LIBERO") - positionRankOf("TRQ")).toBe(0);
    expect(Number.isFinite(positionRankOf("LIBERO"))).toBe(true);
  });
});

describe("the formation", () => {
  it("is one, the 1-2-3-1, and it is the default (decision 157)", () => {
    expect(BUILTIN_FORMATIONS).toHaveLength(1);
    expect(DEFAULT_FORMATION_LABEL).toBe("1-2-3-1");
    expect(THE_FORMATION.label).toBe(DEFAULT_FORMATION_LABEL);
    expect(formationByLabel(DEFAULT_FORMATION_LABEL)).toBe(THE_FORMATION);
    // The retired shapes are rows in the database, not templates here.
    expect(formationByLabel("1-3-2-1")).toBeUndefined();
    expect(formationByLabel("4-4-2")).toBeUndefined();
  });

  it("is the owner's shape: a keeper, two centre-backs, a winger either side of the centre, a striker", () => {
    const ordered = [...THE_FORMATION.slots].sort((a, b) => a.sort - b.sort);
    expect(ordered.map((slot) => slot.positionCode)).toEqual([
      "GB",
      "DC",
      "DC",
      "AIL",
      "MC",
      "AIL",
      "AT",
    ]);
  });

  it("keeps the four coordinates `scripts/import-radarlocal.mts` finds slots by", () => {
    // The import resolves the two centre-backs and the two wingers by `x`, because their codes are
    // shared. Moving one of these breaks it, so moving one has to be done here on purpose.
    const xOf = (code: PositionCode) =>
      THE_FORMATION.slots
        .filter((slot) => slot.positionCode === code)
        .map((slot) => slot.x)
        .sort((a, b) => a - b);
    expect(xOf("DC")).toEqual([330, 670]);
    expect(xOf("AIL")).toEqual([160, 840]);
  });

  it.each(BUILTIN_FORMATIONS.map((formation) => [formation.label, formation] as const))(
    "%s holds every invariant",
    (label, formation) => {
      // Exactly seven slots.
      expect(formation.slots).toHaveLength(FORMATION_SLOT_COUNT);

      // Exactly one goalkeeper.
      const keepers = formation.slots.filter((slot) => slot.positionCode === "GB");
      expect(keepers).toHaveLength(1);
      expect(keepers[0].y).toBeLessThan(150);

      // Every position code exists in the vocabulary.
      for (const slot of formation.slots) {
        expect(isPositionCode(slot.positionCode)).toBe(true);
        expect(POSITION_BY_CODE[slot.positionCode]).toBeDefined();
      }

      // Integer coordinates, inside the pitch.
      for (const slot of formation.slots) {
        expect(
          isValidPitchPoint({ x: slot.x, y: slot.y }),
          `${label}: ${slot.positionCode} is off the pitch`,
        ).toBe(true);
      }

      // Unique sort values, 1..7.
      const sorts = formation.slots.map((slot) => slot.sort).sort((a, b) => a - b);
      expect(sorts).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // The label matches the real distribution across lines, goalkeeper included.
      expect(formationLabelOf(formation.slots)).toBe(label);
      const parts = label.split("-").map(Number);
      expect(parts).toHaveLength(LINE_ORDER.length);
      expect(parts[0]).toBe(1);
      expect(parts.reduce((total, count) => total + count, 0)).toBe(FORMATION_SLOT_COUNT);
      const distribution = formationDistribution(formation.slots);
      expect(LINE_ORDER.map((line) => distribution[line])).toEqual(parts);

      // Sort order follows the pitch: the goalkeeper first, then back to front.
      const ordered = [...formation.slots].sort((a, b) => a.sort - b.sort);
      expect(ordered[0].positionCode).toBe("GB");
      for (let i = 1; i < ordered.length; i += 1) {
        const rank = (code: PositionCode) => LINE_ORDER.indexOf(definitionOf(code).line);
        expect(rank(ordered[i].positionCode)).toBeGreaterThanOrEqual(
          rank(ordered[i - 1].positionCode),
        );
      }

      // Left-to-right symmetry: the shape mirrors about x = 500.
      const xs = [...formation.slots].sort((a, b) => a.y - b.y || a.x - b.x);
      const byLine = new Map<number, number[]>();
      for (const slot of xs) {
        const band = Math.round(slot.y / 100);
        byLine.set(band, [...(byLine.get(band) ?? []), slot.x]);
      }
      for (const [, line] of byLine) {
        const mirrored = line.map((x) => 1000 - x).sort((a, b) => a - b);
        const sorted = [...line].sort((a, b) => a - b);
        mirrored.forEach((value, index) => {
          expect(Math.abs(value - sorted[index])).toBeLessThanOrEqual(20);
        });
      }

      // The "discs must not overlap" rule: no two slots closer than MIN_MARKER_DISTANCE.
      for (let i = 0; i < formation.slots.length; i += 1) {
        for (let j = i + 1; j < formation.slots.length; j += 1) {
          const a = formation.slots[i];
          const b = formation.slots[j];
          const distance = pitchDistance(a, b);
          expect(
            distance,
            `${label}: ${a.positionCode}(${a.x},${a.y}) and ${b.positionCode}(${b.x},${b.y}) are only ${Math.round(distance)} units apart`,
          ).toBeGreaterThanOrEqual(MIN_MARKER_DISTANCE);
        }
      }

      // A French name and description, per decision 012.
      expect(formation.name).toContain(label);
      expect(formation.descriptionFr.length).toBeGreaterThan(20);
    },
  );
});

describe("formationLabelOf", () => {
  it("counts the goalkeeper as the leading 1 and the wingers in midfield", () => {
    expect(
      formationLabelOf([
        { positionCode: "GB" },
        { positionCode: "DC" },
        { positionCode: "DC" },
        { positionCode: "AIL" },
        { positionCode: "MC" },
        { positionCode: "AIL" },
        { positionCode: "AT" },
      ]),
    ).toBe("1-2-3-1");
  });

  it("prints an empty line as 0", () => {
    expect(
      formationLabelOf([{ positionCode: "GB" }, { positionCode: "DC" }, { positionCode: "MC" }]),
    ).toBe("1-1-1-0");
  });

  it("returns 0-0-0-0 for an empty formation", () => {
    expect(formationLabelOf([])).toBe("0-0-0-0");
  });
});

describe("atPositionFr", () => {
  it("elides « de » before the two positions that start with a vowel", () => {
    expect(atPositionFr("AT")).toBe("au poste d’attaquant");
    expect(atPositionFr("AIL")).toBe("au poste d’ailier");
  });

  it("keeps « de » everywhere else, in lower case", () => {
    expect(atPositionFr("GB")).toBe("au poste de gardien de but");
    expect(atPositionFr("DC")).toBe("au poste de défenseur central");
    expect(atPositionFr("MC")).toBe("au poste de milieu central");
  });

  it("falls back to an unknown code rather than inventing a name", () => {
    expect(atPositionFr("XX")).toBe("au poste de xx");
  });
});
