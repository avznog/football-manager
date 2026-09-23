import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shirtNameSchema, updateShirtNameSchema } from "./validation";
import {
  SHIRT_NAME_MAX_CHARS,
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

  it("states the real limit rather than a number of its own", () => {
    expect(shirtNameHintFr(true, true)).toContain(`${SHIRT_NAME_MAX_CHARS} caractères`);
  });
});

describe("shirtNameSchema", () => {
  it("accepts a flocage exactly as long as a shirt back holds", () => {
    const twelve = "A".repeat(SHIRT_NAME_MAX_CHARS);

    expect(shirtNameSchema.safeParse(twelve).success).toBe(true);
  });

  it("refuses one character more", () => {
    const thirteen = "A".repeat(SHIRT_NAME_MAX_CHARS + 1);
    const parsed = shirtNameSchema.safeParse(thirteen);

    expect(parsed.success).toBe(false);
  });

  it("trims before measuring, so padding never spends the budget", () => {
    const padded = `  ${"A".repeat(SHIRT_NAME_MAX_CHARS)}  `;
    const parsed = shirtNameSchema.safeParse(padded);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe("A".repeat(SHIRT_NAME_MAX_CHARS));
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

  it("refuses a flocage longer than a shirt back with a French message", () => {
    const parsed = updateShirtNameSchema.safeParse({
      ...MEMBER,
      shirtName: "A".repeat(SHIRT_NAME_MAX_CHARS + 1),
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toContain("caractères");
  });
});

describe("the length limit is one number", () => {
  /**
   * Three places enforce it — the constant, the Zod schema and the database — and a form that
   * accepts what the column rejects is a 500 on a save, not a validation error. This is the cheapest
   * thing that notices them drifting, in the spirit of `lib/composition/copy.test.ts`.
   */
  it("is the same in db/schema.ts as in SHIRT_NAME_MAX_CHARS", () => {
    const schema = readFileSync(join(process.cwd(), "db/schema.ts"), "utf8");
    const check = /team_members_shirt_name_length[\s\S]{0,240}?between 1 and (\d+)/.exec(schema);

    expect(check).not.toBeNull();
    expect(Number(check?.[1])).toBe(SHIRT_NAME_MAX_CHARS);
  });
});
