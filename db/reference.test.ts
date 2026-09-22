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
  type PositionCode,
  DEFAULT_FORMATION_LABEL,
  formationByLabel,
  formationDistribution,
  formationLabelOf,
  isPositionCode,
  positionLabelFr,
} from "./reference";
import {
  MIN_MARKER_DISTANCE,
  isValidPitchPoint,
  pitchDistance,
} from "@/lib/pitch/geometry";

describe("positions", () => {
  it("is exactly the seven-a-side vocabulary, and nothing more", () => {
    expect(POSITIONS.map((position) => position.code)).toEqual([
      "GB",
      "DG",
      "DC",
      "DD",
      "MG",
      "MC",
      "MD",
      "MOC",
      "AG",
      "AT",
      "AD",
    ]);
    expect(POSITIONS).toHaveLength(POSITION_CODES.length);
  });

  it("has unique codes", () => {
    const codes = POSITIONS.map((position) => position.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has unique sort values", () => {
    const sorts = POSITIONS.map((position) => position.sort);
    expect(new Set(sorts).size).toBe(sorts.length);
  });

  it("orders the sort values from the goalkeeper forwards", () => {
    expect(POSITIONS.map((position) => position.sort)).toEqual(
      [...POSITIONS].map((_, index) => index + 1),
    );
    const lineRank = (code: PositionCode) => LINE_ORDER.indexOf(POSITION_BY_CODE[code].line);
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

  it("puts the left-sided positions on the left and mirrors them on the right", () => {
    const pairs: [PositionCode, PositionCode][] = [
      ["DG", "DD"],
      ["MG", "MD"],
      ["AG", "AD"],
    ];
    for (const [left, right] of pairs) {
      const l = POSITION_BY_CODE[left];
      const r = POSITION_BY_CODE[right];
      expect(l.defaultX).toBeLessThan(500);
      expect(r.defaultX).toBeGreaterThan(500);
      expect(l.defaultY).toBe(r.defaultY);
      // Mirrored about the centre line, to within a unit of rounding.
      expect(Math.abs(1000 - l.defaultX - r.defaultX)).toBeLessThanOrEqual(10);
    }
  });

  it("has a properly accented French label for every position", () => {
    for (const position of POSITIONS) {
      expect(position.labelFr.length).toBeGreaterThan(4);
      expect(position.labelFr[0]).toBe(position.labelFr[0].toUpperCase());
    }
    expect(positionLabelFr("MOC")).toBe("Milieu offensif central");
    expect(POSITION_BY_CODE.DG.labelFr).toBe("Défenseur gauche");
    expect(POSITION_BY_CODE.DC.labelFr).toBe("Défenseur central");
  });

  it("never lets two canonical positions overlap — the picker shows all eleven at once", () => {
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

  it("narrows unknown codes", () => {
    expect(isPositionCode("MOC")).toBe(true);
    expect(isPositionCode("CF")).toBe(false);
    expect(positionLabelFr("CF")).toBe("CF");
  });
});

describe("built-in formations", () => {
  it("covers the shapes a seven-a-side coach expects", () => {
    const labels = BUILTIN_FORMATIONS.map((formation) => formation.label);
    for (const expected of [
      "1-3-2-1",
      "1-2-3-1",
      "1-3-1-2",
      "1-2-2-2",
      "1-1-3-2",
      "1-3-3-0",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("has a unique label and a unique French name per template", () => {
    const labels = BUILTIN_FORMATIONS.map((formation) => formation.label);
    const names = BUILTIN_FORMATIONS.map((formation) => formation.name);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("exposes a default template", () => {
    expect(formationByLabel(DEFAULT_FORMATION_LABEL)).toBeDefined();
    expect(formationByLabel("4-4-2")).toBeUndefined();
  });

  it.each(BUILTIN_FORMATIONS.map((formation) => [formation.label, formation] as const))(
    "%s",
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
        const rank = (code: PositionCode) => LINE_ORDER.indexOf(POSITION_BY_CODE[code].line);
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
  it("counts the goalkeeper as the leading 1 and prints empty lines as 0", () => {
    expect(
      formationLabelOf([
        { positionCode: "GB" },
        { positionCode: "DG" },
        { positionCode: "DC" },
        { positionCode: "DD" },
        { positionCode: "MG" },
        { positionCode: "MOC" },
        { positionCode: "MD" },
      ]),
    ).toBe("1-3-3-0");
  });

  it("returns 0-0-0-0 for an empty formation", () => {
    expect(formationLabelOf([])).toBe("0-0-0-0");
  });
});
