import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shirtNameSchema, updateShirtNameSchema } from "./validation";
import {
  shirtNameDisplay,
  shirtNameHintFr,
  shirtNameRowFr,
  shirtNameValueFr,
} from "./shirt";

const MEMBER = {
  teamId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
};

describe("shirtNameDisplay", () => {
  it("prints a flocage the way a shirt does", () => {
    expect(shirtNameDisplay("Momo")).toBe("MOMO");
    expect(shirtNameDisplay("el professor")).toBe("EL PROFESSOR");
  });

  it("uppercases accents, because a flocking machine does", () => {
    expect(shirtNameDisplay("Léo")).toBe("LÉO");
  });

  it("collapses every shape of « no flocage » to null", () => {
    // The normal case: most members will never have one, and every caller branches on null.
    expect(shirtNameDisplay(null)).toBeNull();
    expect(shirtNameDisplay(undefined)).toBeNull();
    expect(shirtNameDisplay("")).toBeNull();
    expect(shirtNameDisplay("   ")).toBeNull();
  });
});

describe("shirtNameValueFr", () => {
  it("names the empty case instead of drawing a dash", () => {
    expect(shirtNameValueFr(null)).toBe("aucun");
    expect(shirtNameValueFr("")).toBe("aucun");
  });

  it("never returns a parenthesis, a dash or an undefined", () => {
    for (const value of [null, undefined, "", "  ", "Momo"]) {
      const text = shirtNameValueFr(value);
      expect(text).not.toContain("—");
      expect(text).not.toContain("(");
      expect(text).not.toContain("undefined");
      expect(text.trim()).toBe(text);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("shows the flocage as it is printed", () => {
    expect(shirtNameValueFr("momo")).toBe("MOMO");
  });
});

describe("shirtNameRowFr", () => {
  it("gives a squad row nothing at all when there is no flocage", () => {
    // Returning "" would let the row render « @momo ·  · AG », which is the defect this shape avoids.
    expect(shirtNameRowFr(null)).toBeNull();
    expect(shirtNameRowFr("  ")).toBeNull();
  });

  it("says what the value is, so it does not read as another position code", () => {
    expect(shirtNameRowFr("Momo")).toBe("floqué MOMO");
  });
});

describe("shirtNameHintFr", () => {
  it("tutoies the player about his own shirt and never « votre »", () => {
    const hint = shirtNameHintFr(true, true);

    expect(hint).toContain("ton dos");
    expect(hint).not.toContain("votre");
    expect(hint).not.toContain("vous");
  });

  it("does not say « ton » about somebody else's shirt", () => {
    const hint = shirtNameHintFr(true, false);

    expect(hint).toContain("son dos");
    expect(hint).not.toContain("ton dos");
  });

  it("does not invite a member of the encadrement to invent a flocage", () => {
    const hint = shirtNameHintFr(false, false);

    expect(hint).toContain("encadrement");
    expect(hint).not.toContain("dos");
  });

  it("announces no ceiling, because there is none to announce", () => {
    // The limit was removed on the owner's instruction, so a hint stating a number of characters
    // would be the one thing on the screen that is untrue.
    const hint = shirtNameHintFr(true, true);

    expect(hint).not.toMatch(/\d/);
    expect(hint).toContain("majuscules");
  });
});

describe("shirtNameSchema", () => {
  it("accepts a flocage of any length: the ceiling was removed", () => {
    expect(shirtNameSchema.safeParse("A".repeat(12)).success).toBe(true);
    expect(shirtNameSchema.safeParse("A".repeat(13)).success).toBe(true);
    expect(shirtNameSchema.safeParse("A".repeat(200)).success).toBe(true);
  });

  it("still trims, which is what keeps « no flocage » a single value", () => {
    const parsed = shirtNameSchema.safeParse("  Momo  ");

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe("Momo");
  });

  it("stores what was typed: the uppercasing is a display choice, not a column", () => {
    const parsed = shirtNameSchema.safeParse("El Professor");

    expect(parsed.success && parsed.data).toBe("El Professor");
  });
});

describe("updateShirtNameSchema", () => {
  it("clears the flocage when the field comes back empty", () => {
    const parsed = updateShirtNameSchema.safeParse({ ...MEMBER, shirtName: "" });

    expect(parsed.success && parsed.data.shirtName).toBeNull();
  });

  it("clears it when the field holds nothing but spaces", () => {
    // Otherwise a stray space would be stored as a one-character flocage the check constraint
    // happily accepts, and every screen would print a blank where a name should be.
    const parsed = updateShirtNameSchema.safeParse({ ...MEMBER, shirtName: "   " });

    expect(parsed.success && parsed.data.shirtName).toBeNull();
  });

  it("keeps a real flocage untouched", () => {
    const parsed = updateShirtNameSchema.safeParse({ ...MEMBER, shirtName: " Momo " });

    expect(parsed.success && parsed.data.shirtName).toBe("Momo");
  });

  it("accepts a long flocage rather than rejecting the whole submission", () => {
    const parsed = updateShirtNameSchema.safeParse({
      ...MEMBER,
      shirtName: "LE PROFESSOR DE SAINT-OUEN",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.shirtName).toBe("LE PROFESSOR DE SAINT-OUEN");
  });
});

describe("the flocage has a floor and no ceiling", () => {
  /**
   * Two places used to agree on a maximum; now they have to agree that there is none, and that the
   * **minimum** survives. `shirtNameSchema` turning `"   "` into `null` and the check constraint
   * refusing `''` are the two halves of one invariant — « no flocage » is `null`, never an empty
   * string — and a schema that let `''` through would be a 500 on a save rather than a validation
   * error. This is the cheapest thing that notices either half drifting, in the spirit of
   * `lib/composition/copy.test.ts`.
   */
  it("keeps db/schema.ts's check as a lower bound only", () => {
    const schema = readFileSync(join(process.cwd(), "db/schema.ts"), "utf8");
    const check = /team_members_shirt_name_length[\s\S]{0,240}?char_length\([^)]*\) (\S+) (\d+)/.exec(
      schema,
    );

    expect(check).not.toBeNull();
    expect(check?.[1]).toBe(">=");
    expect(Number(check?.[2])).toBe(1);
    expect(schema).not.toContain("between 1 and 12");
  });

  it("never produces the empty string the check rejects", () => {
    for (const typed of ["", " ", "   ", "\t\n"]) {
      const parsed = updateShirtNameSchema.safeParse({ ...MEMBER, shirtName: typed });
      expect(parsed.success && parsed.data.shirtName).toBeNull();
    }
  });
});
