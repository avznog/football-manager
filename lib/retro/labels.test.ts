import { describe, expect, it } from "vitest";

import { RETRO_NO_FACTS_FR, retroChangesEmptyFr } from "./labels";

describe("retroChangesEmptyFr", () => {
  it("does not claim any titulaire when none has been chosen", () => {
    const text = retroChangesEmptyFr(0);

    expect(text).toContain("Aucun changement");
    expect(text).toContain("composition de départ est vide");
    expect(text).not.toContain("titulaires");
    expect(text).not.toContain("ont fini le match");
  });

  it("says what to do next when the sheet is empty, instead of describing a match", () => {
    expect(retroChangesEmptyFr(0)).toContain("personne à remplacer");
  });

  it("never claims seven titulaires when fewer are filled in", () => {
    expect(retroChangesEmptyFr(3)).toContain("les 3 titulaires");
    expect(retroChangesEmptyFr(3)).not.toContain("sept");
  });

  it("agrees in number for a single titulaire", () => {
    const text = retroChangesEmptyFr(1);

    expect(text).toContain("le titulaire choisi");
    expect(text).not.toContain("titulaires");
  });

  it("counts the seven of a full sheet", () => {
    expect(retroChangesEmptyFr(7)).toBe(
      "Aucun changement : les 7 titulaires choisis ci-dessus ont fini le match.",
    );
  });

  it("treats a negative count like an empty sheet rather than printing it", () => {
    expect(retroChangesEmptyFr(-1)).toBe(retroChangesEmptyFr(0));
  });

  it("points at the composition card above, which is where the number comes from", () => {
    expect(retroChangesEmptyFr(7)).toContain("ci-dessus");
  });
});

describe("RETRO_NO_FACTS_FR", () => {
  it("writes its scoreline the way every other screen does (decisions 061 and 064)", () => {
    expect(RETRO_NO_FACTS_FR).toContain("0 – 0");
    expect(RETRO_NO_FACTS_FR).not.toContain("0-0");
  });

  it("does not name a card, a thing this app never records", () => {
    expect(RETRO_NO_FACTS_FR).not.toContain("carton");
  });

  it("says the empty sheet is a legitimate state, not a missing step", () => {
    expect(RETRO_NO_FACTS_FR).toContain("ça existe");
  });
});
