import { describe, expect, it } from "vitest";

import { abbreviateName } from "./names";

describe("abbreviateName", () => {
  it("leaves a short name alone", () => {
    expect(abbreviateName("Karim Benali")).toBe("Karim Benali");
    expect(abbreviateName("Théo")).toBe("Théo");
  });

  it("abbreviates the given name before touching the surname", () => {
    expect(abbreviateName("Alexandre Lemoine")).toBe("A. Lemoine");
    expect(abbreviateName("Jean-Baptiste Dupont")).toBe("J.-B. Dupont");
  });

  it("abbreviates every given name", () => {
    expect(abbreviateName("Jean Pierre Marie Durand", 16)).toBe("J. P. M. Durand");
  });

  it("truncates only when abbreviating is not enough", () => {
    const result = abbreviateName("Jean-Baptiste Vandenberghelaan", 14);
    expect(result).toBe("J.-B. Vandenb…");
    expect(result.length).toBe(14);
  });

  it("truncates a single very long word", () => {
    expect(abbreviateName("Vandenberghelaan", 10)).toBe("Vandenber…");
  });

  it("never exceeds the requested length", () => {
    const names = [
      "Karim Benali",
      "Jean-Baptiste Dupont",
      "Pierre-Alexandre de la Fontaine",
      "Mohammed-Amine El Amrani",
      "X",
    ];
    for (const name of names) {
      for (const max of [1, 2, 6, 10, 14, 20]) {
        expect(abbreviateName(name, max).length).toBeLessThanOrEqual(max);
      }
    }
  });

  it("normalises whitespace", () => {
    expect(abbreviateName("  Karim   Benali  ")).toBe("Karim Benali");
    expect(abbreviateName("   ")).toBe("");
    expect(abbreviateName("")).toBe("");
  });

  it("upper-cases the initials it produces", () => {
    expect(abbreviateName("jean-baptiste Dupont")).toBe("J.-B. Dupont");
  });
});
