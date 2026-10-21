import { describe, expect, it } from "vitest";

import {
  addableSupporters,
  mayAddSupporter,
  mayRemoveSupporter,
  type SupporterCandidate,
} from "./supporters";

const candidate = (over: Partial<SupporterCandidate> = {}): SupporterCandidate => ({
  memberId: "m1",
  name: "Léo C",
  squadRole: null,
  playedMatch: false,
  ...over,
});

describe("mayAddSupporter", () => {
  it("names a man the sheet never mentioned and who did not play", () => {
    expect(mayAddSupporter(candidate())).toBe(true);
  });

  it("refuses somebody already on the sheet, whatever the role", () => {
    for (const role of ["starter", "substitute", "supporter"] as const) {
      const refusal = mayAddSupporter(candidate({ squadRole: role }));
      expect(refusal).not.toBe(true);
      expect(refusal).toEqual({ errorFr: "Léo C est déjà sur la feuille de ce match." });
    }
  });

  it("refuses somebody who played — the point of the feature is the man who did not", () => {
    const refusal = mayAddSupporter(candidate({ playedMatch: true }));
    expect(refusal).not.toBe(true);
    expect((refusal as { errorFr: string }).errorFr).toContain("a joué ce match");
  });

  /**
   * He is off the sheet and has a minute, which is the man who came on in game mode without ever
   * being planned. He already rates by having played (decision 159), and the sheet must not start
   * saying he watched.
   */
  it("refuses the unplanned substitute who came on in game mode", () => {
    expect(mayAddSupporter(candidate({ squadRole: null, playedMatch: true }))).not.toBe(true);
  });

  it("puts the name in the refusal, because the list is per man", () => {
    const refusal = mayAddSupporter(candidate({ name: "Pierre", squadRole: "starter" }));
    expect((refusal as { errorFr: string }).errorFr.startsWith("Pierre ")).toBe(true);
  });
});

describe("mayRemoveSupporter", () => {
  it("takes a supporter back off when he has not voted", () => {
    expect(mayRemoveSupporter({ name: "Léo C", squadRole: "supporter" }, false)).toBe(true);
  });

  it("refuses once he has submitted notes, rather than destroying them", () => {
    const refusal = mayRemoveSupporter({ name: "Léo C", squadRole: "supporter" }, true);
    expect(refusal).not.toBe(true);
    expect((refusal as { errorFr: string }).errorFr).toContain("déjà donné ses notes");
  });

  it("refuses a titulaire or a remplaçant: that is the composition's business", () => {
    for (const role of ["starter", "substitute"] as const) {
      expect(mayRemoveSupporter({ name: "Léo C", squadRole: role }, false)).not.toBe(true);
    }
  });

  it("refuses somebody the sheet does not mention", () => {
    expect(mayRemoveSupporter({ name: "Léo C", squadRole: null }, false)).not.toBe(true);
  });

  /** The order of the two refusals matters: a non-supporter is told that, not told about notes. */
  it("reports the wrong role before it reports the notes", () => {
    const refusal = mayRemoveSupporter({ name: "Léo C", squadRole: "starter" }, true);
    expect((refusal as { errorFr: string }).errorFr).toContain("n’est pas supporter");
  });
});

describe("addableSupporters", () => {
  it("offers exactly who the action would accept, in the order given", () => {
    const squad: SupporterCandidate[] = [
      candidate({ memberId: "a", name: "Léo C" }),
      candidate({ memberId: "b", name: "Lucas", squadRole: "starter" }),
      candidate({ memberId: "c", name: "Rémi", playedMatch: true }),
      candidate({ memberId: "d", name: "Thomas" }),
      candidate({ memberId: "e", name: "Maxime", squadRole: "supporter" }),
    ];
    expect(addableSupporters(squad).map((c) => c.name)).toEqual(["Léo C", "Thomas"]);
  });

  it("offers nobody when the whole squad is on the sheet or played", () => {
    expect(
      addableSupporters([
        candidate({ squadRole: "starter" }),
        candidate({ playedMatch: true }),
      ]),
    ).toEqual([]);
  });

  it("offers nothing from an empty squad rather than throwing", () => {
    expect(addableSupporters([])).toEqual([]);
  });
});
