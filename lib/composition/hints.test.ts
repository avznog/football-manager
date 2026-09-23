import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { benchHintFr, benchPlayerLabelFr, minuteFieldHintFr } from "./hints";

describe("benchHintFr", () => {
  it("counts the bench, because the strip only shows five of it", () => {
    expect(benchHintFr({ mode: "players", benchCount: 6, freeSlots: 3 })).toBe(
      "6 au banc, 3 postes libres. Appuie sur un joueur puis sur un poste.",
    );
  });

  it("stays singular for the last free slot", () => {
    expect(benchHintFr({ mode: "players", benchCount: 6, freeSlots: 1 })).toBe(
      "6 au banc, 1 poste libre. Appuie sur un joueur puis sur un poste.",
    );
  });

  it("does not offer a free slot when the seven are placed", () => {
    const hint = benchHintFr({ mode: "players", benchCount: 4, freeSlots: 0 });
    expect(hint).not.toContain("libre");
    expect(hint).toBe("4 au banc, tous les postes pris. Appuie sur un joueur puis sur un poste pour échanger.");
  });

  it("says nothing about placing anybody when the bench is empty", () => {
    expect(benchHintFr({ mode: "players", benchCount: 0, freeSlots: 0 })).toBe(
      "Les sept sont placés, le banc est vide.",
    );
    expect(benchHintFr({ mode: "players", benchCount: 0, freeSlots: 2 })).toBe(
      "Plus personne à placer, et il reste 2 postes libres.",
    );
  });

  it("sends the coach back to the players when the postes are what moves", () => {
    // The bench is disabled in `postes` mode, so an invitation to tap a player would be a lie.
    const hint = benchHintFr({ mode: "shape", benchCount: 6, freeSlots: 3 });
    expect(hint).toBe("Repasse en « Joueurs » pour placer quelqu’un.");
  });

  it("tutoies in every branch (decision 074)", () => {
    const hints = [
      benchHintFr({ mode: "shape", benchCount: 6, freeSlots: 3 }),
      benchHintFr({ mode: "players", benchCount: 6, freeSlots: 3 }),
      benchHintFr({ mode: "players", benchCount: 6, freeSlots: 0 }),
      benchHintFr({ mode: "players", benchCount: 0, freeSlots: 0 }),
      benchHintFr({ mode: "players", benchCount: 0, freeSlots: 2 }),
    ];
    for (const hint of hints) {
      expect(hint).not.toMatch(/\b(vous|votre|vos)\b/i);
    }
  });
});

describe("benchPlayerLabelFr", () => {
  it("names the squad role the strip only carries by its order", () => {
    expect(
      benchPlayerLabelFr({
        name: "Marc Dupont",
        jerseyNumber: 8,
        squadRole: "substitute",
        isInjured: false,
      }),
    ).toBe("Marc Dupont, numéro 8, remplaçant");
  });

  it("skips a number an amateur squad does not have", () => {
    expect(
      benchPlayerLabelFr({
        name: "Marc Dupont",
        jerseyNumber: null,
        squadRole: "starter",
        isInjured: true,
      }),
    ).toBe("Marc Dupont, titulaire, blessé");
  });

  it("says nothing about a role it does not know", () => {
    expect(
      benchPlayerLabelFr({
        name: "Marc Dupont",
        jerseyNumber: 4,
        squadRole: null,
        isInjured: false,
      }),
    ).toBe("Marc Dupont, numéro 4");
  });
});

describe("minuteFieldHintFr", () => {
  it("quotes the length of this match, not a standard one", () => {
    expect(minuteFieldHintFr(50)).toContain("50 minutes");
    expect(minuteFieldHintFr(60)).not.toContain("50");
  });
});

/**
 * The reason decision 097 exists: a tested function proves nothing about a screen that does not call
 * it. The editor used to print « Appuie sur un joueur puis sur un poste » unconditionally, so the
 * sentence is pinned to this module.
 */
describe("the editor asks for these sentences instead of writing them", () => {
  const editor = readFileSync(
    join(process.cwd(), "components", "composition", "composition-editor.tsx"),
    "utf8",
  );

  it("imports the hints", () => {
    expect(editor).toContain("benchHintFr");
    expect(editor).toContain("minuteFieldHintFr");
  });

  it("does not hard-code them", () => {
    expect(editor).not.toContain("Appuie sur un joueur puis sur un poste.");
    expect(editor).not.toContain("les minutes sont continues");
  });
});
