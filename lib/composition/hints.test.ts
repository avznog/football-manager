import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MINUTE_MAX,
  benchDropHintFr,
  benchHintFr,
  benchPlayerLabelFr,
  minuteFieldErrorFr,
  minuteFieldHintFr,
  parseMinute,
} from "./hints";

describe("benchHintFr", () => {
  it("counts the bench, because the strip only shows five of it", () => {
    expect(benchHintFr({ benchCount: 6, freeSlots: 3 })).toBe(
      "6 au banc, 3 postes libres. Appuie sur un joueur puis sur un poste.",
    );
  });

  it("stays singular for the last free slot", () => {
    expect(benchHintFr({ benchCount: 6, freeSlots: 1 })).toBe(
      "6 au banc, 1 poste libre. Appuie sur un joueur puis sur un poste.",
    );
  });

  it("does not offer a free slot when the seven are placed", () => {
    const hint = benchHintFr({ benchCount: 4, freeSlots: 0 });
    expect(hint).not.toContain("libre");
    expect(hint).toBe("4 au banc, tous les postes pris. Appuie sur un joueur puis sur un poste pour échanger.");
  });

  it("says nothing about placing anybody when the bench is empty", () => {
    expect(benchHintFr({ benchCount: 0, freeSlots: 0 })).toBe(
      "Les sept sont placés, le banc est vide.",
    );
    expect(benchHintFr({ benchCount: 0, freeSlots: 2 })).toBe(
      "Plus personne à placer, et il reste 2 postes libres.",
    );
  });

  it("tutoies in every branch (decision 074)", () => {
    const hints = [
      benchHintFr({ benchCount: 6, freeSlots: 3 }),
      benchHintFr({ benchCount: 6, freeSlots: 0 }),
      benchHintFr({ benchCount: 0, freeSlots: 0 }),
      benchHintFr({ benchCount: 0, freeSlots: 2 }),
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

describe("benchDropHintFr", () => {
  it("names the player, because the disc under the finger is clipped away", () => {
    expect(benchDropHintFr({ name: "Momo", fromPitch: true })).toBe(
      "Relâche ici : Momo retourne sur le banc.",
    );
  });

  /**
   * The defect: `BenchDisc` starts its drag as a `player` too, so a bench disc nudged a few pixels
   * inside the strip lit the dock up and promised « Momo retourne sur le banc » — about a player who
   * is on it, and against the editor's own announcement, which says « Momo reste sur le banc ». Both
   * the ring and the sentence hang off this `null`.
   */
  it("promises nothing about a disc that was already on the bench", () => {
    expect(benchDropHintFr({ name: "Momo", fromPitch: false })).toBeNull();
  });

  it("tutoies (decision 074)", () => {
    expect(benchDropHintFr({ name: "Momo", fromPitch: true })).not.toMatch(
      /\b(vous|votre|vos)\b/i,
    );
  });
});

describe("parseMinute", () => {
  it("reads what the coach typed", () => {
    expect(parseMinute("0")).toBe(0);
    expect(parseMinute("30")).toBe(30);
  });

  it("is null for an empty field, not zero", () => {
    // The defect this function exists for: coercing `""` to 0 made the field snap back on every
    // keystroke, so reaching 10 meant typing `010` and deleting from the left.
    expect(parseMinute("")).toBeNull();
    expect(parseMinute("   ")).toBeNull();
  });

  it("is null for anything that is not a whole minute", () => {
    expect(parseMinute("abc")).toBeNull();
    expect(parseMinute("12,5")).toBeNull();
    expect(parseMinute("12.5")).toBeNull();
  });

  /**
   * The two forms `Number` reads and a minute field cannot mean. `type="number"` accepts `1e2` — it is
   * a valid floating-point literal in HTML — and `Number("1e2")` is an integer 100, so the field read
   * « 1e2 » under a card reading « à partir de la 100ᵉ minute ». `0x10` is the same failure via the
   * keyboard, at 16.
   */
  it("is null for the exponent and hex forms Number would happily read", () => {
    expect(parseMinute("1e2")).toBeNull();
    expect(parseMinute("0x10")).toBeNull();
  });
});

describe("minuteFieldErrorFr", () => {
  it("says nothing about a minute inside the match", () => {
    expect(minuteFieldErrorFr("0")).toBeNull();
    expect(minuteFieldErrorFr("30")).toBeNull();
    expect(minuteFieldErrorFr(String(MINUTE_MAX))).toBeNull();
  });

  it("asks for a minute rather than substituting one", () => {
    expect(minuteFieldErrorFr("")).toBe(
      "Indique la minute à partir de laquelle cette composition s’applique.",
    );
  });

  it("refuses a minute outside the match, in the server's own words", () => {
    expect(minuteFieldErrorFr(String(MINUTE_MAX + 1))).toBe("Cette minute est en dehors du match.");
    expect(minuteFieldErrorFr("-1")).toBe("Cette minute est en dehors du match.");
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
    expect(editor).toContain("benchDropHintFr");
    expect(editor).toContain("minuteFieldErrorFr");
  });

  it("does not hard-code them", () => {
    expect(editor).not.toContain("Appuie sur un joueur puis sur un poste.");
    expect(editor).not.toContain("les minutes sont continues");
    expect(editor).not.toContain("Relâche ici");
  });

  /**
   * Not a sentence, but the same failure mode, and the cheapest place to pin it: the dock is
   * *positioned* against the tab bar, and it used to be positioned with its own copy of the bar's
   * height — `4.5rem`, where the bar is `3.5rem`, so 16 px of scrolling turf showed through between
   * the two. The height is one token now (`--tabbar-h` in `app/globals.css`) and a second literal
   * here would be the bug growing back.
   */
  it("offsets its dock by the tab bar token, never by a literal", () => {
    expect(editor).toContain("bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))]");
    expect(editor).not.toContain("bottom-[calc(4.5rem");
  });
});
